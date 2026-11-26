const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const [school, otherSchool, admin, teacher, cover, otherTeacher, cls, nextClass, firstSlot, nextSlot,
  leave, install, coverInstall] = Array.from({length:13}, (_, index) => uuid(index + 1));
const db = new PGlite();
const sql = (statement, params) => db.query(statement, params);
async function as(id) {
  await db.exec('reset role; set role authenticated');
  await sql("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
const call = async (fn, ...args) => (await sql('select public.' + fn + '(' + args.map((_,i)=>'$'+(i+1)).join(',') + ') result', args)).rows[0].result;
const timestamp = '2099-11-17 04:05:00+00';
const day = '2099-11-17';
const nextWeek = '2099-11-24';
const principal = uuid(14), accountant = uuid(15), otherClass = uuid(16);
test('approved partial emergency leave replans only affected periods and alerts active devices once', async () => {
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema school_private;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}')$$;
      create table auth.users(id uuid primary key,email_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz,raw_app_meta_data jsonb);
      insert into auth.users(id,email_confirmed_at) values('${teacher}',now()),('${cover}',now()),('${otherTeacher}',now());
      create table institutions(id uuid primary key,status text);
      create table school_users(id uuid primary key,institution_id uuid references institutions,auth_user_id uuid,role text,status text,display_name text,unique(id,institution_id));
      create function school_private.has_role(i uuid, roles text[]) returns boolean language sql stable as $$
       select exists(select 1 from public.school_users u where u.institution_id=i and u.auth_user_id=auth.uid() and u.status='active' and u.role=any(roles)) $$;
      create function school_private.parent_of(uuid,uuid) returns boolean language sql as $$select false$$;
      create function school_private.teacher_can(uuid,uuid,text,text) returns boolean language sql as $$select false$$;
      create table school_classes(id uuid primary key,institution_id uuid references institutions,name text,section text,academic_stream text,academic_year text,unique(id,institution_id));
      create table school_staff_profiles(institution_id uuid,school_user_id uuid,notes text);
      create table school_workspaces(institution_id uuid primary key,snapshot jsonb);
      create table school_students(id uuid primary key,institution_id uuid,class_id uuid);
      create table school_teacher_assignments(institution_id uuid,class_id uuid,school_user_id uuid,active boolean,assignment_type text,subject text);
      insert into institutions values('${school}','active'),('${otherSchool}','active');
      insert into school_users values('${admin}','${school}','${admin}','school_admin','active','Admin'),
       ('${teacher}','${school}','${teacher}','teacher','active','Monika'),
       ('${cover}','${school}','${cover}','teacher','active','Neha'),
       ('${principal}','${school}','${principal}','principal','active','Principal'),
       ('${accountant}','${school}','${accountant}','accountant','active','Accountant'),
       ('${otherTeacher}','${otherSchool}','${otherTeacher}','teacher','active','Other');
      insert into school_classes values('${cls}','${school}','LKG','A','','2099'),
       ('${nextClass}','${school}','UKG','B','','2099'),('${otherClass}','${otherSchool}','LKG','A','','2099');
      insert into school_teacher_assignments values
       ('${school}','${cls}','${teacher}',true,'subject_teacher','English'),
       ('${school}','${nextClass}','${teacher}',true,'subject_teacher','Science'),
       ('${school}','${nextClass}','${cover}',true,'subject_teacher','English');
    `);
    await db.exec(fs.readFileSync('supabase/migrations/20261107160000_bell_timetable_private_student_photos.sql','utf8').split('-- Parents see only')[0]+'COMMIT;');
    const migration = 'supabase/migrations/20261117100000_teacher_leave_notifications.sql';
    assert.ok(fs.existsSync(migration), 'teacher leave and notification migration is installed');
    await db.exec(fs.readFileSync(migration,'utf8'));
    await db.exec(fs.readFileSync('supabase/migrations/20261117100100_teacher_leave_attendance.sql','utf8'));
    await db.exec(fs.readFileSync('supabase/migrations/20261118102000_school_dated_timetable.sql','utf8'));
    await db.exec(`
      insert into school_staff_profiles values('${school}','${teacher}','ERP faculty ref: faculty-a');
      insert into school_workspaces values('${school}','{"operations":{"staffAttendance":[{"staffId":"faculty-a","staffType":"Teaching","date":"${day}","status":"Present"}]}}');
    `);
    await db.exec(`
      insert into school_timetable_slots(id,institution_id,academic_year,weekday,slot_index,label,kind,starts_at,ends_at) values
       ('${firstSlot}','${school}','2099',extract(dow from date '${day}'),1,'Period 1','period','09:00','09:35'),
       ('${nextSlot}','${school}','2099',extract(dow from date '${day}'),2,'Period 2','period','10:00','10:35');
      insert into school_timetable_published(institution_id,class_id,academic_year,slot_id,subject,teacher_user_id,room_number) values
       ('${school}','${cls}','2099','${firstSlot}','English','${teacher}','04'),
       ('${school}','${nextClass}','2099','${nextSlot}','Science','${teacher}','06');
    `);
    await as(teacher);
    await db.exec(`select set_config('request.jwt.claims','{"app_metadata":{"bn_teacher_mobile_pending":true}}',false)`);
    await assert.rejects(call('bn_teacher_day',school,day),/Active teacher required/);
    await db.exec("select set_config('request.jwt.claims','{}',false)");
    const request = await call('bn_request_teacher_leave', school, day, day, '08:00', '09:35', 'emergency', 'Urgent');
    await assert.rejects(call('bn_review_teacher_leave', school, request, 'approved'), /admin/i);
    await assert.rejects(call('bn_teacher_day', otherSchool, day), /teacher/i);
    assert.equal((await call('bn_teacher_day', school, day)).length, 2);
    const teacherBinding = await call('bn_enable_teacher_period_alerts',school,install,'teacher-token'.repeat(3));
    assert.match(teacherBinding,/^[a-f0-9-]+$/);
    await db.exec('reset role; set role service_role');
    const firstAlerts = await call('bn_claim_teacher_period_alerts',timestamp);
    assert.equal(firstAlerts.length,1);
    assert.equal(firstAlerts[0].title,'Your next class · 10:00 AM');
    assert.equal(firstAlerts[0].body,'UKG B · Science · Room 06');
    await call('bn_finish_teacher_period_alert',install,teacherBinding,'teacher-token'.repeat(3),firstAlerts[0].event_id,false);
    await as(admin);
    assert.equal((await call('bn_list_teacher_leaves',school)).find(x=>x.id===request)?.status,'pending');
    await call('bn_review_teacher_leave', school, request, 'approved');
    await as(teacher);
    await assert.rejects(call('bn_request_teacher_leave',school,day,day,null,null,'emergency','Full day'),/overlapping leave/);
    await as(admin);
    assert.deepEqual((await call('bn_list_teacher_leaves',school)).map(x=>[x.id,x.status]),[[request,'approved']]);
    const ledger = await call('bn_teacher_attendance_month',school,day);
    assert.equal(ledger.rows[0].faculty_id,'faculty-a');
    assert.equal(ledger.rows[0].marked_status,'Present');
    assert.equal(ledger.rows[0].units,0.3684);
    const plan = await call('bn_teacher_leave_cover_plan', school, request, day);
    assert.equal(plan.length, 1);
    assert.equal(plan[0].candidates[0].teacher_id, cover);
    await call('bn_publish_teacher_covers', school, request, day, JSON.stringify([{slot_id:firstSlot,class_id:cls,teacher_id:cover}]));
    const dated = await call('bn_school_dated_timetable', school, cls, day, nextWeek);
    assert.deepEqual(dated.map(x=>[x.day,x.class_id,x.slot_id,x.regular_id,x.teacher_id,x.is_cover,x.teacher_name]),[
      [day,cls,firstSlot,teacher,cover,true,'Neha'],[nextWeek,cls,firstSlot,teacher,teacher,false,'Monika']
    ]);
    assert.equal(dated[0].room_number,'04');
    assert.equal('reason' in dated[0] || 'leave_id' in dated[0],false);
    await db.exec('reset role');
    assert.equal((await sql('select teacher_user_id from public.school_timetable_published where class_id=$1',[cls])).rows[0].teacher_user_id,teacher);
    await as(admin);
    await assert.rejects(call('bn_school_dated_timetable',school,otherClass,day,day),/verified class/i);
    await assert.rejects(call('bn_school_dated_timetable',otherSchool,otherClass,day,day),/Owner or Principal/i);
    await assert.rejects(call('bn_school_dated_timetable',school,cls,day,'2099-12-18'),/31 days/i);
    await as(principal);
    assert.deepEqual(await call('bn_school_dated_timetable',school,cls,day,nextWeek),dated);
    await as(accountant);
    await assert.rejects(call('bn_school_dated_timetable',school,cls,day,day),/Owner or Principal/i);
    await db.exec('reset role; set role anon');
    await assert.rejects(call('bn_school_dated_timetable',school,cls,day,day),/permission denied/i);
    await as(cover);
    await assert.rejects(call('bn_school_dated_timetable',school,cls,day,day),/Owner or Principal/i);
    const coverDay = await call('bn_teacher_day', school, day);
    assert.equal(coverDay[0].room_number,'04');
    assert.equal(coverDay[0].is_cover,true);
    assert.deepEqual((await call('bn_teacher_attendance_month',school,day)).rows,[]);
    await call('bn_enable_teacher_period_alerts',school,coverInstall,'cover-token'.repeat(3));
    await as(teacher);
    assert.equal((await call('bn_teacher_day',school,day))[0].room_number,'06');
    assert.equal((await call('bn_teacher_attendance_month',school,day)).rows[0].status,'Approved partial leave');
    await assert.rejects(call('bn_claim_teacher_period_alerts',timestamp), /permission/);
    await db.exec('reset role; set role service_role');
    const claim = await call('bn_claim_teacher_period_alerts',timestamp);
    assert.equal(claim.length, 1);
    assert.equal(claim[0].title,'Teaching complete for today');
    assert.equal((await call('bn_claim_teacher_period_alerts',timestamp)).length,0);
    const confirmed = await call('bn_claim_teacher_period_alerts',new Date().toISOString());
    assert.ok(confirmed.some(alert=>alert.installation===coverInstall && alert.title.startsWith('Cover period added') &&
      alert.body==='LKG A · English · Room 04'));
    assert.ok(confirmed.some(alert=>alert.installation===install && alert.title==='Leave approved'));
    await as(admin);
    await call('bn_publish_teacher_covers', school, request, day, JSON.stringify([{slot_id:firstSlot,class_id:cls,teacher_id:null}]));
    const uncovered = await call('bn_school_dated_timetable',school,cls,day,day);
    assert.equal(uncovered[0].is_cover,false);
    assert.equal(uncovered[0].teacher_id,null);
    await as(cover);
    assert.deepEqual(await call('bn_teacher_day',school,day),[]);
  } finally {
    await db.close();
  }
});

test('payroll counts approved leave once and deducts only uncovered absence and excess leave', () => {
  const vm = require('node:vm');
  const text = fs.readFileSync('app-extracted/src/BrightNexaApp.jsx','utf8');
  const source = text.slice(text.indexOf('function qr(e, t, n, r'),text.indexOf('function Jr({ title:'));
  const payroll = vm.runInNewContext(source+'\nqr;', {ai:()=>25,ii:()=>null,ri:x=>x.name});
  const result = payroll({holidays:[],staffAttendance:[
    {staffId:'one',staffType:'Teaching',date:'2026-11-02',status:'Absent'},
    {staffId:'one',staffType:'Teaching',date:'2026-11-03',status:'Paid Leave'},
    {staffId:'one',staffType:'Teaching',date:'2026-11-04',status:'Absent'}
  ]}, [{id:'one',salary:25000,salaryFrequency:'Monthly',paidLeaveAllowedPerMonth:1}],
  'Teaching','2026-11',[
    {faculty_id:'one',date:'2026-11-02',approved_leave:true,units:1,full_day:true},
    {faculty_id:'one',date:'2026-11-03',approved_leave:true,units:1,full_day:true},
    {faculty_id:'one',date:'2026-11-04',approved_leave:true,units:0.5,full_day:false}
  ])[0];
  assert.equal(result.paidLeave,2.5);
  assert.equal(result.absent,0.5);
  assert.equal(result.net,23000);
  assert.equal(result.pending,22);
});

test('cover AI receives successive instructions and only returns eligible teacher references', async () => {
  const { createService } = require('../src/smart-tools/teacher-ai.cjs');
  let chosen = 't1';
  const history = ['English subject teacher ko do', 'Neha ma’am ko bas ek period dena'];
  const mock = async (location, options) => {
    const route = new URL(location).pathname;
    const body = options.body ? JSON.parse(options.body) : null;
    if (route==='/auth/v1/user') return Response.json({id:admin});
    if (route==='/rest/v1/school_users') return Response.json([{id:admin,auth_user_id:admin,institution_id:school,role:'school_admin',status:'active'}]);
    if (route==='/rest/v1/institutions') return Response.json([{id:school,status:'active'}]);
    if (route==='/rest/v1/rpc/bn_school_writable') return Response.json(true);
    if (route==='/rest/v1/rpc/bn_teacher_leave_cover_plan') {
      assert.deepEqual(body,{p_school:school,p_leave:leave,p_day:day});
      return Response.json([{slot_id:firstSlot,class_id:cls,class_name:'LKG A',subject:'English',starts_at:'09:00',ends_at:'09:35',candidates:[
        {teacher_id:cover,teacher_name:'Neha',subject_match:true,periods:2}
      ]}]);
    }
    assert.deepEqual(JSON.parse(body.contents[0].parts[0].text).instructions,history);
    return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({
      choices:[{period:'p1',teacher:chosen,reason:'English teacher with only two existing periods'}],
      summary:'One extra period for Neha',question:''
    })}]}}]});
  };
  const service = createService({ fetcher:mock, env:{GEMINI_API_KEY:'local-fixture'}, now:()=>0 });
  const input = {school,leave,day,instructions:history};
  const answer = await service.planTeacherCover(input,'fixture-access-token');
  assert.equal(answer.choices[0].teacher_id,cover);
  chosen = 't2';
  await assert.rejects(service.planTeacherCover(input,'fixture-access-token'),/unavailable cover/);
});

test('Teacher App can submit emergency partial leave and render personal attendance', async () => {
  const {JSDOM} = require('jsdom');
  const {window} = new JSDOM('<main id="duty"></main>',{runScripts:'outside-only'});
  const pane = window.document.getElementById('duty');
  window.eval(fs.readFileSync('school-teacher-duty.js','utf8'));
  const calls = [];
  let requests = [];
  const scoped = { admin:false, active:()=>true, rpc:async (name,body)=>{
    calls.push(name);
    if (name==='bn_list_teacher_leaves') return requests;
    if (name==='bn_teacher_attendance_month') return {linked:true,rows:[
      {date:day,status:'Approved partial leave',approved_leave:true,full_day:false,marked_status:'Present'}
    ]};
    assert.equal(name,'bn_request_teacher_leave');
    assert.equal(body.p_kind,'emergency');
    assert.equal(body.p_from,body.p_to);
    assert.equal(body.p_end,'11:00');
    requests=[{kind:body.p_kind,starts_on:body.p_from,starts_at:body.p_start,ends_at:body.p_end,reason:body.p_reason,status:'pending'}];
    return leave;
  }};
  await window.BNTeacherDuty.show(pane,scoped);
  const form = pane.querySelector('form');
  const [kind,duration] = form.querySelectorAll('select');
  kind.value='emergency';
  duration.value='partial';
  duration.dispatchEvent(new window.Event('change'));
  const [start,end] = form.querySelectorAll('input[type=time]');
  start.value='09:00';
  end.value='11:00';
  form.querySelector('textarea').value='Urgent appointment';
  form.requestSubmit();
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(pane.textContent,/Emergency leave sent for priority review/);
  assert.match(pane.textContent,/09:00–11:00 · pending/);
  const confirmation = pane.querySelector('dialog[open]');
  assert.ok(confirmation,'a confirmed request opens a popup');
  assert.match(confirmation.textContent,/Leave request sent/);
  assert.match(confirmation.textContent,/Awaiting approval/);
  confirmation.querySelector('button').click();
  assert.equal(pane.querySelector('dialog[open]'),null);
  await window.BNTeacherDuty.attendance(pane,scoped);
  assert.match(pane.textContent,/Approved partial leave · Present/);
  assert.deepEqual(calls,['bn_list_teacher_leaves','bn_request_teacher_leave','bn_list_teacher_leaves','bn_teacher_attendance_month']);
  window.close();
});

test('an overlapping full-day leave stays in the form and has no success popup',async t=>{
  const {JSDOM} = require('jsdom');
  const {window} = new JSDOM('<main id="duty"></main>',{runScripts:'outside-only'});
  t.after(()=>window.close());
  const pane = window.document.getElementById('duty');
  window.eval(fs.readFileSync('school-teacher-duty.js','utf8'));
  await window.BNTeacherDuty.show(pane,{admin:false,active:()=>true,rpc:async name=>{
    if(name==='bn_list_teacher_leaves')return [{kind:'planned',starts_on:day,ends_on:day,starts_at:'09:00',ends_at:'11:00',status:'approved'}];
    throw Error('An overlapping leave request already exists');
  }});
  const form=pane.querySelector('form'),reason=form.querySelector('textarea');
  reason.value='Family event';
  form.requestSubmit();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(pane.querySelector('dialog[open]'),null);
  assert.equal(reason.value,'Family event');
  assert.match(form.querySelector('[role="status"]')?.textContent||'',/Request not sent.*My requests/);
});

test('partial day leave requires start time earlier than end time',async t=>{
  const {JSDOM} = require('jsdom');
  const {window} = new JSDOM('<main id="duty"></main>',{runScripts:'outside-only'});
  t.after(()=>window.close());
  const pane = window.document.getElementById('duty');
  window.eval(fs.readFileSync('school-teacher-duty.js','utf8'));
  let requested=false;
  await window.BNTeacherDuty.show(pane,{admin:false,active:()=>true,rpc:async name=>{
    if(name==='bn_list_teacher_leaves')return [];
    if(name==='bn_request_teacher_leave'){requested=true;return 'req-id';}
    return null;
  }});
  const form=pane.querySelector('form');
  const length=form.querySelectorAll('select')[1];
  length.value='partial';
  length.dispatchEvent(new window.Event('change'));
  const times=form.querySelectorAll('input[type="time"]');
  times[0].value='14:00';
  times[1].value='11:00';
  form.querySelector('textarea').value='Doctor appointment';
  form.requestSubmit();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(requested,false,'Must not submit invalid partial times');
  assert.equal(pane.querySelector('dialog[open]'),null);
  assert.match(form.querySelector('[role="status"]')?.textContent||'',/Leave start time must be earlier than end time/i);
});

test('teacher can withdraw pending and future approved leaves, revoking covers and clearing attendance', async () => {
  const db = new PGlite();
  const sql = (statement, params) => db.query(statement, params);
  const as = async id => {
    await db.exec('reset role; set role authenticated');
    await sql("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  };
  const call = async (fn, ...args) => (await sql('select public.' + fn + '(' + args.map((_,i)=>'$'+(i+1)).join(',') + ') result', args)).rows[0].result;
  const futureDay = '2099-11-20';
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema school_private;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}')$$;
      create table auth.users(id uuid primary key,email_confirmed_at timestamptz,banned_until timestamptz,deleted_at timestamptz,raw_app_meta_data jsonb);
      insert into auth.users(id,email_confirmed_at) values('${teacher}',now()),('${cover}',now()),('${admin}',now()),('${otherTeacher}',now()),('${accountant}',now());
      create table institutions(id uuid primary key,status text);
      create table school_users(id uuid primary key,institution_id uuid references institutions,auth_user_id uuid,role text,status text,display_name text,unique(id,institution_id));
      create function school_private.has_role(i uuid, roles text[]) returns boolean language sql stable as $$
       select exists(select 1 from public.school_users u where u.institution_id=i and u.auth_user_id=auth.uid() and u.status='active' and u.role=any(roles)) $$;
      create function school_private.parent_of(uuid,uuid) returns boolean language sql as $$select false$$;
      create function school_private.teacher_can(uuid,uuid,text,text) returns boolean language sql as $$select false$$;
      create table school_classes(id uuid primary key,institution_id uuid references institutions,name text,section text,academic_stream text,academic_year text,unique(id,institution_id));
      create table school_staff_profiles(institution_id uuid,school_user_id uuid,notes text);
      create table school_workspaces(institution_id uuid primary key,snapshot jsonb);
      create table school_students(id uuid primary key,institution_id uuid,class_id uuid);
      create table school_teacher_assignments(institution_id uuid,class_id uuid,school_user_id uuid,active boolean,assignment_type text,subject text);
      insert into institutions values('${school}','active'),('${otherSchool}','active');
      insert into school_users values('${admin}','${school}','${admin}','school_admin','active','Admin'),
       ('${teacher}','${school}','${teacher}','teacher','active','Monika'),
       ('${cover}','${school}','${cover}','teacher','active','Neha'),
       ('${accountant}','${school}','${accountant}','accountant','active','Accountant'),
       ('${otherTeacher}','${otherSchool}','${otherTeacher}','teacher','active','Different school teacher');
      insert into school_classes values('${cls}','${school}','LKG','A','','2099');
      insert into school_teacher_assignments values
       ('${school}','${cls}','${teacher}',true,'subject_teacher','English'),
       ('${school}','${cls}','${cover}',true,'subject_teacher','English');
      insert into school_staff_profiles values('${school}','${teacher}','ERP faculty ref: faculty-a');
      insert into school_workspaces values('${school}','{"operations":{"staffAttendance":[{"staffId":"faculty-a","staffType":"Teaching","date":"${futureDay}","status":"Present"}]}}');
    `);
    await db.exec(fs.readFileSync('supabase/migrations/20261107160000_bell_timetable_private_student_photos.sql','utf8').split('-- Parents see only')[0]+'COMMIT;');
    await db.exec(fs.readFileSync('supabase/migrations/20261117100000_teacher_leave_notifications.sql','utf8'));
    await db.exec(fs.readFileSync('supabase/migrations/20261117100100_teacher_leave_attendance.sql','utf8'));
    await db.exec(fs.readFileSync('supabase/migrations/20261118093000_principal_leave_approvals.sql','utf8'));
    await db.exec(fs.readFileSync('supabase/migrations/20261118102000_school_dated_timetable.sql','utf8'));
    const withdrawalMigration = 'supabase/migrations/20261119160000_teacher_leave_withdrawal_and_cover_revocation.sql';
    await db.exec(fs.readFileSync(withdrawalMigration,'utf8'));
    await db.exec(fs.readFileSync('supabase/migrations/20261119181000_guard_teacher_leave_withdrawal.sql','utf8'));
    await db.exec(`
      insert into school_timetable_slots(id,institution_id,academic_year,weekday,slot_index,label,kind,starts_at,ends_at) values
       ('${firstSlot}','${school}','2099',extract(dow from date '${futureDay}'),1,'Period 1','period','09:00','09:35'),
       ('${nextSlot}','${school}','2098',extract(dow from date '${futureDay}'),1,'Old schedule','period','07:00','07:35');
      insert into school_timetable_published(institution_id,class_id,academic_year,slot_id,subject,teacher_user_id,room_number) values
       ('${school}','${cls}','2099','${firstSlot}','English','${teacher}','04');
    `);

    // 1. Pending leave withdrawal
    await as(teacher);
    const pendingReq = await call('bn_request_teacher_leave', school, futureDay, futureDay, null, null, 'planned', 'Pending test');
    assert.equal((await call('bn_list_teacher_leaves', school)).find(x=>x.id===pendingReq)?.status, 'pending');
    await call('bn_review_teacher_leave', school, pendingReq, 'cancelled');
    assert.equal((await call('bn_list_teacher_leaves', school)).find(x=>x.id===pendingReq)?.status, 'cancelled');

    // 2. Future approved leave withdrawal
    const req = await call('bn_request_teacher_leave', school, futureDay, futureDay, null, null, 'planned', 'Approved test');
    await as(admin);
    await call('bn_review_teacher_leave', school, req, 'approved');
    await call('bn_publish_teacher_covers', school, req, futureDay, JSON.stringify([{slot_id:firstSlot,class_id:cls,teacher_id:cover}]));

    let dated = await call('bn_school_dated_timetable', school, cls, futureDay, futureDay);
    assert.equal(dated[0].teacher_id, cover);
    assert.equal(dated[0].is_cover, true);

    let ledger = await call('bn_teacher_attendance_month', school, futureDay);
    assert.equal(ledger.rows[0].status, 'Approved leave');
    assert.equal(ledger.rows[0].units, 1);

    for (const unrelated of [accountant, otherTeacher, cover]) {
      await as(unrelated);
      await assert.rejects(call('bn_review_teacher_leave', school, req, 'cancelled'),
        {code:'42501'}, 'only school leadership or the requesting teacher may cancel');
    }
    await as(admin);
    assert.equal((await call('bn_school_dated_timetable', school, cls, futureDay, futureDay))[0].teacher_id, cover);
    await db.exec('reset role');
    const cutoff = await sql("select to_char(school_private.bn_teacher_leave_starts_at(l),'HH24:MI') as time from public.school_teacher_leave_requests l where id=$1",[req]);
    assert.equal(cutoff.rows[0].time,'09:00','historical bell schedules must not affect the withdrawal cutoff');
    await as(teacher);
    await call('bn_review_teacher_leave', school, req, 'cancelled');

    assert.equal((await call('bn_list_teacher_leaves', school)).find(x=>x.id===req)?.status, 'cancelled');

    await as(admin);
    dated = await call('bn_school_dated_timetable', school, cls, futureDay, futureDay);
    assert.equal(dated[0].teacher_id, teacher);
    assert.equal(dated[0].is_cover, false);

    ledger = await call('bn_teacher_attendance_month', school, futureDay);
    assert.equal(ledger.rows[0].status, 'Present');
    assert.equal(ledger.rows[0].approved_leave, false);

    await db.exec('reset role');
    await db.exec(`
      insert into public.school_teacher_leave_requests(id,institution_id,teacher_id,starts_on,ends_on,kind,status,reason)
      values('${uuid(99)}','${school}','${teacher}','2020-01-01','2020-01-01','planned','approved','Past leave');
    `);
    await as(teacher);
    await assert.rejects(
      call('bn_review_teacher_leave', school, uuid(99), 'cancelled'),
      /already started/i
    );
  } finally {
    await db.close();
  }
});

test('Teacher App allows withdrawing pending and future approved leave and reflects cancelled status', async t => {
  const {JSDOM} = require('jsdom');
  const {window} = new JSDOM('<main id="duty"></main>', {runScripts:'outside-only'});
  t.after(()=>window.close());
  const pane = window.document.getElementById('duty');
  window.eval(fs.readFileSync('school-teacher-duty.js','utf8'));

  let leaves = [
    {id:'l-pending',starts_on:'2099-12-01',ends_on:'2099-12-01',starts_at:null,ends_at:null,kind:'planned',status:'pending',reason:'Pending event'},
    {id:'l-approved',starts_on:'2099-12-05',ends_on:'2099-12-05',starts_at:null,ends_at:null,kind:'planned',status:'approved',can_cancel:true,reason:'Future wedding'}
  ];
  let cancelledId = null;

  window.confirm = () => true;

  await window.BNTeacherDuty.show(pane,{
    admin:false,
    active:()=>true,
    rpc:async(name,args)=>{
      if(name==='bn_list_teacher_leaves') return leaves;
      if(name==='bn_review_teacher_leave'){
        cancelledId = args.p_leave;
        leaves = leaves.map(l => l.id === args.p_leave ? {...l, status: 'cancelled'} : l);
        return null;
      }
      return null;
    }
  });

  const pendingCard = [...pane.querySelectorAll('.panel')].find(p => p.textContent.includes('Pending event'));
  assert.ok(pendingCard, 'pending card must exist');
  const withdrawPendingBtn = [...pendingCard.querySelectorAll('button')].find(b => b.textContent.includes('Withdraw request'));
  assert.ok(withdrawPendingBtn, 'Withdraw request button must exist for pending leave');

  const approvedCard = [...pane.querySelectorAll('.panel')].find(p => p.textContent.includes('Future wedding'));
  assert.ok(approvedCard, 'approved card must exist');
  const withdrawApprovedBtn = [...approvedCard.querySelectorAll('button')].find(b => b.textContent.includes('Withdraw leave'));
  assert.ok(withdrawApprovedBtn, 'Withdraw leave button must exist for future approved leave');

  withdrawApprovedBtn.click();
  await new Promise(resolve => setTimeout(resolve, 50));

  assert.equal(cancelledId, 'l-approved');
  assert.match(pane.textContent, /cancelled/);
});

