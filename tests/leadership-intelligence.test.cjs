'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');

const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const school=id(1), outside=id(2), admin=id(3), teacher=id(4), student1=id(5), student2=id(6), student3=id(7);
const classA=id(8), classB=id(9);

test('leadership intelligence SQL functions calculate at-risk students, class attendance trends, and fee follow-ups', async()=>{
  const db=new PGlite();
  try{
    const sql=(q,values)=>db.query(q,values);
    const rpc=async(name,...args)=>(await sql(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
    const role=async(which,user='')=>{
      await db.exec(`reset role; set role ${which}`);
      await sql("select set_config('request.jwt.claim.sub',$1,false)",[user]);
    };

    await db.exec(`
      create schema auth; create schema school_private;
      create role anon; create role authenticated; create role service_role;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
      create table public.institutions(id uuid primary key,name text,status text default 'active');
      create table public.school_users(id uuid primary key, institution_id uuid references public.institutions(id), auth_user_id uuid, role text, status text default 'active', display_name text);
      create function school_private.has_role(s uuid,roles text[]) returns boolean language sql stable security definer set search_path='' as $$
        select exists(select 1 from public.school_users u where u.institution_id=s and u.auth_user_id=auth.uid() and u.status='active' and u.role=any(roles)) $$;
      create table public.school_classes(id uuid primary key, institution_id uuid references public.institutions(id), name text not null, section text not null, academic_year text not null, unique(institution_id,name,section,academic_year));
      create table public.school_students(id uuid primary key, institution_id uuid references public.institutions(id), class_id uuid references public.school_classes(id), admission_number text not null, name text not null, status text not null default 'active');
      create table public.school_student_profiles(student_id uuid primary key references public.school_students(id), institution_id uuid, guardian_name text, guardian_phone text);
      create table public.school_attendance(id uuid primary key default gen_random_uuid(), institution_id uuid references public.institutions(id), class_id uuid references public.school_classes(id), student_id uuid references public.school_students(id), day date not null, status text check(status in ('present','absent','late','excused')), unique(student_id,day));
      create table public.school_fee_entries(id uuid primary key default gen_random_uuid(), institution_id uuid references public.institutions(id), student_id uuid references public.school_students(id), kind text check(kind in ('charge','payment')), amount_rupees bigint, description text, occurred_on date);
      create view public.school_fee_balances with(security_invoker=true) as
        select institution_id,student_id,sum(case when kind='charge' then amount_rupees else -amount_rupees end) as balance_rupees
        from public.school_fee_entries group by institution_id,student_id;
    `);

    await sql("insert into institutions values ($1,'Bright Academy','active'),($2,'Other School','active')",[school,outside]);
    await sql("insert into school_users values ($1,$3,$1,'school_admin','active','School Owner'),($2,$3,$2,'teacher','active','Teacher One')",[admin,teacher,school]);
    await sql("insert into school_classes values ($1,$3,'8','B','2026-27'),($2,$3,'10','A','2026-27')",[classA,classB,school]);
    await sql("insert into school_students values ($1,$4,$5,'ADM-101','Aman Gupta','active'),($2,$4,$5,'ADM-102','Pooja Verma','active'),($3,$4,$6,'ADM-201','Rahul Sharma','active')",[student1,student2,student3,school,classA,classB]);
    await sql("insert into school_student_profiles values ($1,$4,'Mr. Gupta','9876543210'),($2,$4,'Mrs. Verma','9876500000'),($3,$4,'Mr. Sharma','9812345678')",[student1,student2,student3,school]);

    // Student 1: 1 present out of 4 days = 25% attendance (At-risk < 75%)
    await sql(`insert into school_attendance(institution_id,class_id,student_id,day,status) values
      ($1,$3,$2,'2026-11-17','present'),
      ($1,$3,$2,'2026-11-18','absent'),
      ($1,$3,$2,'2026-11-19','absent'),
      ($1,$3,$2,'2026-11-20','absent')`,[school,student1,classA]);

    // Student 2: 4 present out of 4 days = 100%
    await sql(`insert into school_attendance(institution_id,class_id,student_id,day,status) values
      ($1,$3,$2,'2026-11-17','present'),
      ($1,$3,$2,'2026-11-18','present'),
      ($1,$3,$2,'2026-11-19','present'),
      ($1,$3,$2,'2026-11-20','present')`,[school,student2,classA]);

    // Fees: Student 1 has 5000 pending fee, Student 3 has 0
    await sql(`insert into school_fee_entries(institution_id,student_id,kind,amount_rupees,occurred_on) values
      ($1,$2,'charge',5000,'2026-11-01'),
      ($1,$3,'charge',2000,'2026-11-01'),
      ($1,$3,'payment',2000,'2026-11-05')`,[school,student1,student3]);

    // Run migration
    const migrationFile=path.join(__dirname,'../supabase/migrations/20261121100000_leadership_school_intelligence.sql');
    await db.exec(fs.readFileSync(migrationFile,'utf8'));

    // Check RBAC: Anonymous or teacher rejected
    await role('anon');
    await assert.rejects(rpc('bn_leadership_at_risk_students',school,75), /permission denied|Owner or Principal/i);

    await role('authenticated',teacher);
    await assert.rejects(rpc('bn_leadership_at_risk_students',school,75), /Owner or Principal required/i);

    // School admin can query
    await role('authenticated',admin);

    // 1. At-Risk Students
    const atRisk=await rpc('bn_leadership_at_risk_students',school,75);
    assert.equal(Array.isArray(atRisk),true);
    assert.equal(atRisk.length,1);
    assert.equal(atRisk[0].student_id,student1);
    assert.equal(atRisk[0].name,'Aman Gupta');
    assert.equal(atRisk[0].class_label,'8-B');
    assert.equal(atRisk[0].attendance_percent,25);
    assert.equal(atRisk[0].guardian_phone,'9876543210');
    assert.equal(atRisk[0].consecutive_absent,3);

    // 2. Class Attendance Trends
    const trends=await rpc('bn_leadership_class_attendance_summary',school);
    assert.equal(Array.isArray(trends),true);
    assert.equal(trends.length,2);
    const class8B=trends.find(t=>t.class_id===classA);
    assert.ok(class8B);
    assert.equal(class8B.class_label,'8-B');
    assert.equal(class8B.total_students,2);

    // 3. Fee Follow-ups
    const followUps=await rpc('bn_leadership_fee_followups',school);
    assert.equal(Array.isArray(followUps),true);
    assert.equal(followUps.length,1);
    assert.equal(followUps[0].student_id,student1);
    assert.equal(followUps[0].balance_rupees,5000);
    assert.equal(followUps[0].guardian_name,'Mr. Gupta');
    assert.equal(followUps[0].guardian_phone,'9876543210');

  }finally{
    await db.close();
  }
});

test('whatsapp-school-engine formats daily intelligence digest message correctly', () => {
  const engine = require('../whatsapp-school-engine.js');
  assert.equal(typeof engine.createDailyIntelligenceDigestMessage, 'function');
  const message = engine.createDailyIntelligenceDigestMessage({
    schoolName: 'Bright Academy',
    date: '2026-11-21',
    attendancePercent: 94.8,
    studentsPresent: 474,
    totalStudents: 500,
    feeTotal: 1840000,
    feeReceiptCount: 12,
    atRiskCount: 7,
    insights: [
      'Class 8-B attendance dropped from 95% to 78% this week',
      '3 fee follow-ups drafted, awaiting approval',
      'Timetable clash prevented for Monday P4'
    ],
    uncoveredPeriods: 0,
    scheduledPeriods: 48
  });

  assert.match(message, /Bright Academy • Daily School Intelligence Brief/);
  assert.match(message, /Attendance Today:\s*94\.8%/);
  assert.match(message, /Fee Collection:\s*₹18,40,000/);
  assert.match(message, /At-Risk Students:\s*7/);
  assert.match(message, /Class 8-B attendance dropped/);
  assert.match(message, /3 fee follow-ups drafted/);
  assert.match(message, /All 48 periods covered/);
});

test('leadership client and DOM render Live School Intelligence card and WhatsApp triggers', async () => {
  const { JSDOM } = require('jsdom');
  const { create } = require('../leadership-app.js');
  const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

  const testSchool = '00000000-0000-4000-8000-000000000001';
  const person = '00000000-0000-4000-8000-000000000002';
  const calls = [];
  const response = (data, headers = {}) => new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...headers }
  });

  const fetcher = async (url, request = {}) => {
    const p = new URL(url, 'https://school.example').pathname;
    calls.push({ path: p, body: request.body ? JSON.parse(request.body) : null });
    if (p === '/auth/v1/token') return response({ access_token: 'tok', refresh_token: 'ref', expires_in: 3600 });
    if (p === '/auth/v1/user') return response({ id: person });
    if (p === '/rest/v1/school_users' && url.includes('auth_user_id=')) {
      return response([{ id: person, institution_id: testSchool, auth_user_id: person, role: 'principal', status: 'active', display_name: 'Principal Sharma' }]);
    }
    if (p === '/rest/v1/institutions') return response([{ id: testSchool, name: 'Bright Academy', status: 'active' }]);
    if (p === '/rest/v1/school_users') return response([{ id: person }], { 'content-range': '0-0/7' });
    if (p === '/rest/v1/school_students') return response([{ id: 'student' }], { 'content-range': '0-0/30' });
    if (p === '/rest/v1/rpc/bn_list_teacher_leaves') return response([]);
    if (p === '/rest/v1/rpc/bn_leadership_school_pulse') {
      return response({ students: 50, teachers: 8, students_marked: 50, students_present: 45, student_percent: 90, teachers_marked: 8, teachers_present: 8, teachers_on_leave: 0, scheduled_periods: 32, uncovered_periods: 0, day: '2026-11-21' });
    }
    if (p === '/rest/v1/rpc/bn_leadership_fee_snapshot') {
      return response({ total: 1840000, cash: 1000000, online: 840000, unclassified: 0, receipt_count: 14, day: '2026-11-21' });
    }
    if (p === '/rest/v1/rpc/bn_leadership_at_risk_students') {
      return response([
        { student_id: 's1', admission_number: 'ADM-101', name: 'Aman Gupta', class_id: 'c1', class_label: '10-B', attendance_percent: 72, guardian_phone: '9876543210', guardian_name: 'Mr. Gupta', consecutive_absent: 3 }
      ]);
    }
    if (p === '/rest/v1/rpc/bn_leadership_class_attendance_summary') {
      return response([
        { class_id: 'c1', class_label: '8-B', total_students: 40, marked_students: 40, present_students: 31, attendance_percent: 77.5, trend_status: 'dropped', prev_attendance_percent: 95 }
      ]);
    }
    if (p === '/rest/v1/rpc/bn_leadership_fee_followups') {
      return response([
        { student_id: 's1', admission_number: 'ADM-101', name: 'Aman Gupta', class_label: '10-B', balance_rupees: 5000, guardian_phone: '9876543210', guardian_name: 'Mr. Gupta' }
      ]);
    }
    throw Error('Unexpected mock path: ' + p);
  };

  // 1. Client RPC methods test
  const client = create(fetcher, null);
  await client.login('leader@example.com', 'password');
  const atRisk = await client.atRiskStudents(75);
  assert.equal(atRisk.length, 1);
  assert.equal(atRisk[0].name, 'Aman Gupta');

  const classSummary = await client.classAttendanceSummary('2026-11-21');
  assert.equal(classSummary.length, 1);
  assert.equal(classSummary[0].trend_status, 'dropped');

  const followups = await client.feeFollowups();
  assert.equal(followups.length, 1);
  assert.equal(followups[0].balance_rupees, 5000);

  const intel = await client.intelligence('2026-11-21', 75);
  assert.equal(intel.atRisk.length, 1);
  assert.equal(intel.classSummary.length, 1);
  assert.equal(intel.followups.length, 1);

  // 2. DOM rendering and WhatsApp interactive workflow test
  const dom = new JSDOM(read('leadership.html'), {
    runScripts: 'outside-only',
    url: 'https://school.example/leadership.html?school=' + testSchool
  });
  try {
    const win = dom.window;
    win.fetch = fetcher;
    let copiedText = '';
    win.navigator.clipboard = {
      writeText: async text => { copiedText = text; }
    };
    let openedUrl = '';
    win.open = url => { openedUrl = url; return {}; };

    win.eval(read('whatsapp-school-engine.js'));
    win.eval(read('leadership-app.js'));
    win.dispatchEvent(new win.Event('DOMContentLoaded'));
    await new Promise(resolve => setTimeout(resolve, 25));

    win.document.getElementById('email').value = 'leader@example.com';
    win.document.getElementById('password').value = 'password';
    win.document.getElementById('loginForm').dispatchEvent(new win.Event('submit'));

    for (let i = 0; i < 40 && win.document.getElementById('metricStudents').textContent === '—'; i++) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }

    assert.equal(win.document.getElementById('intelAttendanceVal').textContent, '90%');
    assert.equal(win.document.getElementById('intelFeeVal').textContent, '₹18.4L');
    assert.equal(win.document.getElementById('intelAtRiskVal').textContent, '1');

    // Actionable alerts rendered in list
    const alerts = win.document.getElementById('intelAlertsList');
    assert.match(alerts.textContent, /Class 8-B attendance dropped from 95% to 77\.5%/);
    assert.match(alerts.textContent, /1 fee follow-up drafted, awaiting approval/);
    assert.match(alerts.textContent, /Timetable clash prevented for 2026-11-21/);

    // Query interactive filter: "Which students in 10-B have less than 80% attendance?"
    const queryInput = win.document.getElementById('intelQueryInput');
    queryInput.value = 'Which students in 10-B have less than 80% attendance?';
    win.document.getElementById('intelQueryBtn').dispatchEvent(new win.Event('click'));

    for (let i = 0; i < 40 && !win.document.getElementById('intelQueryItems').childElementCount; i++) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }

    assert.equal(win.document.getElementById('intelQueryResult').hidden, false);
    const queryItems = win.document.getElementById('intelQueryItems');
    assert.match(queryItems.textContent, /Aman Gupta \(ADM-101\)/);
    assert.match(queryItems.textContent, /Class 10-B · 72% attendance · 3 consecutive absents/);

    // Verify WhatsApp button with wa.me link
    const waPill = queryItems.querySelector('a.intel-wa-pill');
    assert.ok(waPill);
    assert.match(waPill.href, /^https:\/\/wa\.me\/919876543210\?text=/);
    assert.match(decodeURIComponent(waPill.href), /Attendance Notice/);
    assert.match(decodeURIComponent(waPill.href), /Aman Gupta/);

    // Send Daily Brief on WhatsApp button
    win.document.getElementById('shareWhatsAppDigestBtn').dispatchEvent(new win.Event('click'));
    for (let i = 0; i < 40 && !openedUrl; i++) {
      await new Promise(resolve => setTimeout(resolve, 25));
    }

    assert.match(copiedText, /Bright Academy • Daily School Intelligence Brief/);
    assert.match(copiedText, /Attendance Today:\s*90%/);
    assert.match(copiedText, /Fee Collection:\s*₹18,40,000/);
    assert.match(copiedText, /At-Risk Students:\s*1/);
    assert.match(openedUrl, /^https:\/\/wa\.me\/\?text=/);

    await new Promise(resolve => setTimeout(resolve, 50));
  } finally {
    dom.window.close();
  }
});


