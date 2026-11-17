'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const school=id(1),other=id(2),principal=id(3),teacher=id(4),outside=id(5),s1=id(6),s2=id(7),n1=id(8);
const day='2026-11-18';

test('Leadership DB aggregates verified marks, limits fee access and publishes idempotent notices',async()=>{
 const db=new PGlite();
 const sql=(q,p=[])=>db.query(q,p);
 const as=async who=>{
  await db.exec('reset role; set role authenticated');
  await sql("select set_config('request.jwt.claim.sub',$1,false)",[who]);
 };
 const rpc=async(name,...args)=>(await sql('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') result',args)).rows[0].result;
 try{
  await db.exec([
   'create role anon; create role authenticated; create schema auth; create schema school_private;',
   "create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;",
   'create table public.school_users(id uuid primary key,institution_id uuid,auth_user_id uuid,role text,status text,display_name text);',
   "create function school_private.has_role(s uuid,roles text[]) returns boolean language sql stable as $$select exists(select 1 from public.school_users u where u.institution_id=s and u.auth_user_id=auth.uid() and u.status='active' and u.role=any(roles))$$;",
   'create table public.school_students(id uuid primary key,institution_id uuid,status text);',
   'create table public.school_attendance(id uuid primary key,institution_id uuid,student_id uuid,day date,status text);',
   'create table public.school_staff_profiles(institution_id uuid,school_user_id uuid,notes text);',
   'create table public.school_workspaces(institution_id uuid primary key,snapshot jsonb);',
   'create table public.school_teacher_leave_requests(institution_id uuid,teacher_id uuid,status text,starts_on date,ends_on date);',
   'create table public.school_fee_entries(id uuid primary key,institution_id uuid,occurred_on date,kind text,amount_rupees numeric(14,2),payment_method text);',
   'create table public.school_notices(id uuid primary key,institution_id uuid,title text,body text,created_by uuid);',
   'create table public.school_audit_events(institution_id uuid,actor_id uuid,action text,entity text,entity_id uuid);',
   'create table public.fixture_lessons(institution_id uuid,day date,teacher_id uuid);',
   "create function school_private.bn_effective_teacher_day(s uuid,d date) returns table(teacher_id uuid) language sql stable as $$select f.teacher_id from public.fixture_lessons f where f.institution_id=s and f.day=d$$;"
  ].join('\n'));
  await sql("insert into school_users values($1,$2,$3,'principal','active','Principal')",[principal,school,principal]);
  await sql("insert into school_users values($1,$2,$3,'teacher','active','Teacher')",[teacher,school,teacher]);
  await sql("insert into school_users values($1,$2,$3,'principal','active','Other principal')",[outside,other,outside]);
  await sql("insert into school_students values($1,$2,'active'),($3,$2,'active')",[s1,school,s2]);
  await sql("insert into school_attendance values($1,$2,$3,$4,'present'),($5,$2,$6,$4,'absent')",[id(14),school,s1,day,id(15),s2]);
  await sql("insert into school_staff_profiles values($1,$2,'ERP faculty ref: faculty-1')",[school,teacher]);
  await sql("insert into school_workspaces values($1,$2::jsonb)",[school,JSON.stringify({operations:{staffAttendance:[{staffId:'faculty-1',staffType:'Teaching',date:day,status:'Present'}]}})]);
  await sql("insert into school_teacher_leave_requests values($1,$2,'approved',$3,$3)",[school,teacher,day]);
  await sql("insert into fixture_lessons values($1,$2,$3),($1,$2,null)",[school,day,teacher]);
  await sql("insert into school_fee_entries values ($1,$2,$3,'payment',1000,'cash'),($4,$2,$3,'payment',1500,'upi'),($5,$2,$3,'payment',500,null),($6,$2,$3,'charge',900,null)",[id(9),school,day,id(10),id(11),id(12)]);
  await db.exec(fs.readFileSync('supabase/migrations/20261118100000_leadership_pulse_notice_finance.sql','utf8'));
  await as(principal);
  const pulse=await rpc('bn_leadership_school_pulse',school,day);
  assert.equal(pulse.students,2);
  assert.equal(pulse.students_marked,2);
  assert.equal(pulse.students_present,1);
  assert.equal(Number(pulse.student_percent),50);
  assert.equal(pulse.teachers_present,1);
  assert.equal(pulse.uncovered_periods,1);
  assert.equal(pulse.teachers_on_leave,1);
  const fee=await rpc('bn_leadership_fee_snapshot',school,day);
  assert.equal(Number(fee.total),3000);
  assert.equal(Number(fee.cash),1000);
  assert.equal(Number(fee.online),1500);
  assert.equal(Number(fee.unclassified),500);
  assert.equal(fee.receipt_count,3);
  const title='Emergency school closure',body='School will close earlier today due to severe rainfall.';
  assert.equal(await rpc('bn_leadership_publish_urgent_notice',school,n1,title,body),n1);
  assert.equal(await rpc('bn_leadership_publish_urgent_notice',school,n1,title,body),n1);
  assert.equal(Number((await sql('select count(*) n from school_notices')).rows[0].n),1);
  assert.equal(Number((await sql('select count(*) n from school_audit_events')).rows[0].n),1);
  await assert.rejects(rpc('bn_leadership_publish_urgent_notice',school,n1,title,'A different official message that is not the same.'),/conflict/i);
  await assert.rejects(rpc('bn_leadership_fee_snapshot',other,day),/Owner or Principal/);
  await as(teacher);
  await assert.rejects(rpc('bn_leadership_school_pulse',school,day),/Owner or Principal/);
  await assert.rejects(rpc('bn_leadership_publish_urgent_notice',school,id(13),title,body),/Owner or Principal/);
  await as(outside);
  await assert.rejects(rpc('bn_leadership_fee_snapshot',school,day),/Owner or Principal/);
  await as(principal);
  await sql('delete from school_attendance where id=$1',[id(15)]);
  const incomplete=await rpc('bn_leadership_school_pulse',school,day);
  assert.equal(incomplete.students_marked,1);
  assert.equal(incomplete.student_percent,null,'Partial attendance must not be misreported as a school-wide percentage');
 }finally{await db.close();}
});
