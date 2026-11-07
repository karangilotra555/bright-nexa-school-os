'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');

test('guardian teacher RPC cannot disclose another child, school or staff email',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`
  create role anon;create role authenticated;
  create schema auth;create schema school_private;
  create function auth.uid() returns uuid language sql stable
    as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table public.school_classes(id uuid primary key,institution_id uuid);
  create table public.school_students(id uuid primary key,institution_id uuid,class_id uuid,status text);
  create table public.school_users(id uuid primary key,institution_id uuid,display_name text,email text,role text,status text);
  create table public.school_teacher_assignments(id uuid primary key,class_id uuid,institution_id uuid,
    school_user_id uuid,assignment_type text,subject text,active boolean);
  create table public.school_staff_profiles(id uuid primary key,school_user_id uuid,institution_id uuid,
    display_name text,contact_email text,contact_mobile text,updated_at timestamptz);
  create table public.school_guardians(id uuid primary key,institution_id uuid,auth_user_id uuid,status text);
  create table public.school_guardian_students(institution_id uuid,guardian_id uuid,student_id uuid);
  create function school_private.parent_of(s uuid,i uuid) returns boolean
   language sql stable security definer set search_path=''
   as $$select (select auth.uid()) is not null and exists(
    select 1 from public.school_guardians g
    join public.school_guardian_students l on l.guardian_id=g.id and l.institution_id=g.institution_id
    where g.auth_user_id=(select auth.uid()) and g.status='active'
    and g.institution_id=i and l.student_id=s)$$;
  grant usage on schema auth,school_private to authenticated;
  grant execute on function auth.uid() to authenticated;
  `);
  const migration=fs.readFileSync(path.join(__dirname,'..','supabase/migrations/20261107152500_student_parent_class_teachers.sql'),'utf8');
  await db.exec(migration);
  const school='11111111-1111-1111-1111-111111111111';
  const other='22222222-2222-2222-2222-222222222222';
  const child='33333333-3333-3333-3333-333333333333';
  const sibling='44444444-4444-4444-4444-444444444444';
  const parent='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  await db.exec(`
  insert into school_classes values('55555555-5555-5555-5555-555555555555','${school}'),
    ('66666666-6666-6666-6666-666666666666','${other}');
  insert into school_students values('${child}','${school}','55555555-5555-5555-5555-555555555555','active'),
    ('${sibling}','${school}','55555555-5555-5555-5555-555555555555','active'),
    ('77777777-7777-7777-7777-777777777777','${other}','66666666-6666-6666-6666-666666666666','active');
  insert into school_users values
    ('88888888-8888-8888-8888-888888888888','${school}','Class Teacher A','private@staff.test','teacher','active'),
    ('99999999-9999-9999-9999-999999999999','${other}','Other School Teacher','secret@staff.test','teacher','active');
  insert into school_teacher_assignments values
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','55555555-5555-5555-5555-555555555555','${school}',
      '88888888-8888-8888-8888-888888888888','class_teacher','',true),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc','66666666-6666-6666-6666-666666666666','${other}',
      '99999999-9999-9999-9999-999999999999','subject_teacher','Science',true);
  insert into school_guardians values('dddddddd-dddd-dddd-dddd-dddddddddddd','${school}','${parent}','active');
  insert into school_guardian_students values('${school}','dddddddd-dddd-dddd-dddd-dddddddddddd','${child}');
  set role authenticated;
  select set_config('request.jwt.claim.sub','${parent}',false);
  `);
  const query=async(i,s)=>(await db.query(
   'select * from public.bn_portal_class_teachers($1::uuid,$2::uuid)',[i,s])).rows;
  const own=await query(school,child);
  assert.equal(own.length,1);
  assert.equal(own[0].teacher_name,'Class Teacher A');
  assert.deepEqual(Object.keys(own[0]).sort(),['assignment_type','subject','teacher_name']);
  assert.equal(JSON.stringify(own).includes('private@staff.test'),false);
  assert.equal((await query(school,sibling)).length,0,'same class is not equivalent to parent authorization');
  assert.equal((await query(other,'77777777-7777-7777-7777-777777777777')).length,0,'cannot view other schools');
  await db.exec("select set_config('request.jwt.claim.sub','',false)");
  assert.equal((await query(school,child)).length,0,'missing JWT denies results');
  await db.exec('reset role;set role anon;');
  await assert.rejects(query(school,child),/permission denied/i);
 }finally{await db.close();}
});
