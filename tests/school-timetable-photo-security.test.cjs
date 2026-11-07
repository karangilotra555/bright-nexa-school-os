'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('timetable and photo migration: publish atomicity, double booking, parent isolation',async()=>{
 const db=new PGlite();
 try{
  await db.exec([
   "create role authenticated; create role anon;",
   "create schema auth; create schema school_private; create schema storage;",
   "create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;",
   "create table public.institutions(id uuid primary key,name text,status text);",
   "create table public.school_users(id uuid primary key,institution_id uuid,auth_user_id uuid,role text,status text,display_name text,email text,unique(id,institution_id));",
   "create table public.school_classes(id uuid primary key,institution_id uuid,name text,section text,academic_year text,unique(id,institution_id));",
   "create table public.school_students(id uuid primary key,institution_id uuid,class_id uuid,status text,unique(id,institution_id));",
   "create table public.school_student_profiles(student_id uuid primary key,institution_id uuid,details jsonb not null default '{}'::jsonb,updated_at timestamptz default now());",
   "create table public.school_teacher_assignments(id uuid primary key,institution_id uuid,class_id uuid,school_user_id uuid,assignment_type text,subject text,active boolean);",
   "create table public.school_guardians(id uuid primary key,institution_id uuid,auth_user_id uuid,status text);",
   "create table public.school_guardian_students(institution_id uuid,student_id uuid,guardian_id uuid);",
   "create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
   "create table storage.objects(bucket_id text,name text,primary key(bucket_id,name));",
   "alter table storage.objects enable row level security;",
   "grant usage on schema auth,storage,school_private to authenticated;",
   "grant select,insert on storage.objects to authenticated;",
   "grant select on public.school_students,public.school_student_profiles to authenticated;",
   "create function school_private.has_role(i uuid,roles text[]) returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and exists(select 1 from public.school_users u where u.institution_id=i and u.auth_user_id=auth.uid() and u.role=any(roles) and u.status='active')$$;",
   "create function school_private.parent_of(s uuid,i uuid) returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and exists(select 1 from public.school_guardians g join public.school_guardian_students l on l.guardian_id=g.id and l.institution_id=g.institution_id where g.auth_user_id=auth.uid() and g.status='active' and g.institution_id=i and l.student_id=s)$$;",
   "create function school_private.teacher_can(i uuid,c uuid,a text,s text) returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and exists(select 1 from public.school_users u join public.school_teacher_assignments t on t.school_user_id=u.id and t.institution_id=u.institution_id where u.institution_id=i and u.auth_user_id=auth.uid() and u.role='teacher' and u.status='active' and t.active and t.class_id=c and a='roster.read')$$;",
   "grant execute on function auth.uid() to authenticated;"
  ].join('\n'));
  await db.exec(read('supabase/migrations/20261107160000_bell_timetable_private_student_photos.sql'));
  const school='11111111-1111-1111-1111-111111111111',other='22222222-2222-2222-2222-222222222222';
  const classA='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',classB='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const admin='cccccccc-cccc-cccc-cccc-cccccccccccc',teacherAuth='dddddddd-dddd-dddd-dddd-dddddddddddd';
  const teacher='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',parent='ffffffff-ffff-ffff-ffff-ffffffffffff';
  const child='55555555-5555-5555-5555-555555555555',stranger='66666666-6666-6666-6666-666666666666';
  await db.query("insert into public.institutions values ($1,'School A','active'),($2,'School B','active')",[school,other]);
  await db.query("insert into public.school_classes values($1,$2,'6','A','2026'),($3,$2,'7','A','2026')",[classA,school,classB]);
  await db.query("insert into public.school_users values('99999999-9999-9999-9999-999999999999',$1,$2,'school_admin','active','Admin','admin@test.invalid'),($3,$1,$4,'teacher','active','Teacher A','secret@test.invalid')",[school,admin,teacher,teacherAuth]);
  await db.query("insert into public.school_students values($1,$2,$3,'active'),($4,$2,$5,'active')",[child,school,classA,stranger,classB]);
  await db.query("insert into public.school_teacher_assignments values('77777777-7777-7777-7777-777777777777',$1,$2,$3,'class_teacher','',true)",[school,classA,teacher]);
  await db.query("insert into public.school_guardians values('88888888-8888-8888-8888-888888888888',$1,$2,'active')",[school,parent]);
  await db.query("insert into public.school_guardian_students values($1,$2,'88888888-8888-8888-8888-888888888888')",[school,child]);
  await db.exec("set role authenticated;");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
  const slot=await db.query("insert into public.school_timetable_slots(institution_id,academic_year,weekday,slot_index,label,kind,starts_at,ends_at) values ($1,'2026',1,1,'Period 1','period','08:00','08:40') returning id",[school]);
  const slotId=slot.rows[0].id;
  await assert.rejects(db.query("insert into public.school_timetable_slots(institution_id,academic_year,weekday,slot_index,label,kind,starts_at,ends_at) values ($1,'2026',1,2,'Break','break','08:30','08:50')",[school]),/overlap/i);
  await db.query("insert into public.school_timetable_slots(institution_id,academic_year,weekday,slot_index,label,kind,starts_at,ends_at) values ($1,'2026',1,2,'Break','break','08:40','09:00')",[school]);
  await db.query("insert into public.school_timetable_drafts(institution_id,class_id,slot_id,academic_year,subject,teacher_user_id) values ($1,$2,$3,'2026','English',$4)",[school,classA,slotId,teacher]);
  const published=(await db.query("select public.bn_publish_class_timetable($1,$2,'2026') n",[school,classA])).rows[0].n;
  assert.equal(published,1);
  await assert.rejects(db.query("insert into public.school_timetable_drafts(institution_id,class_id,slot_id,academic_year,subject,teacher_user_id) values ($1,$2,$3,'2026','English',$4)",[school,classB,slotId,teacher]),/teacher|assigned/i);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[parent]);
  const my=(await db.query("select * from public.bn_portal_student_timetable($1,$2)",[school,child])).rows;
  assert.equal(my.length,2,'Breaks follow the published weekly timetable');
  assert.equal(my[0].subject,'English');assert.equal(my[0].teacher_name,'Teacher A');
  assert.equal(my[1].kind,'break');
  assert.equal((await db.query("select count(*) n from public.bn_portal_student_timetable($1,$2)",[school,stranger])).rows[0].n,0);
  await assert.rejects(db.query("select public.bn_publish_class_timetable($1,$2,'2026')",[school,classA]),/School admin required/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
  const photoPath=school+'/'+child+'/photo-12345678abc.webp';
  await db.query("insert into storage.objects(bucket_id,name) values('school-student-photos',$1)",[photoPath]);
  assert.equal((await db.query("select public.bn_save_student_photo($1,$2) p",[child,photoPath])).rows[0].p,photoPath);
  assert.equal((await db.query("select details->>'photo_path' p from public.school_student_profiles where student_id=$1",[child])).rows[0].p,photoPath);
  await assert.rejects(db.query("select public.bn_save_student_photo($1,$2)",[stranger,photoPath]),/valid, uploaded photo/);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[parent]);
  await assert.rejects(db.query("select public.bn_save_student_photo($1,$2)",[child,photoPath]),/School admin/);
  assert.equal((await db.query("select count(*) n from storage.objects")).rows[0].n,1);
  await db.exec('reset role;set role anon;');
  await assert.rejects(db.query("select * from public.bn_portal_student_timetable($1,$2)",[school,child]),/permission denied/i);
 }finally{await db.close();}
});
