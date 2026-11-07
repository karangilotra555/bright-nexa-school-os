'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const I='11111111-1111-1111-1111-111111111111';
const S='22222222-2222-2222-2222-222222222222';
const OTHER='33333333-3333-3333-3333-333333333333';
const ADMIN='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PARENT='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const photo=I+'/'+S+'/44444444-4444-4444-4444-444444444444.jpg';
test('private photo policies permit linked parent but prevent other child/school access',async()=>{
 const db=new PGlite();
 try{
  await db.exec([
   'create role anon;create role authenticated;create schema auth;create schema school_private;create schema storage;',
   "create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;",
   'create table public.institutions(id uuid primary key,status text);',
   'create table public.school_users(id uuid primary key,institution_id uuid,auth_user_id uuid,role text,status text);',
   'create table public.school_students(id uuid primary key,institution_id uuid,status text);',
   'create table public.school_student_profiles(student_id uuid primary key,institution_id uuid,details jsonb default \'{}\'::jsonb,updated_at timestamptz default now());',
   'create table public.school_guardians(id uuid primary key,institution_id uuid,auth_user_id uuid,status text);',
   'create table public.school_guardian_students(institution_id uuid,guardian_id uuid,student_id uuid);',
   'create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);',
   'create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,unique(bucket_id,name));',
   "create function school_private.has_role(i uuid,roles text[]) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.school_users u where u.institution_id=i and u.auth_user_id=auth.uid() and u.status='active' and u.role=any(roles))$$;",
   "create function school_private.parent_of(s uuid,i uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.school_guardians g join public.school_guardian_students l on l.guardian_id=g.id and l.institution_id=g.institution_id where g.auth_user_id=auth.uid() and g.institution_id=i and g.status='active' and l.student_id=s)$$;",
   'alter table storage.objects enable row level security;',
   'grant usage on schema auth,school_private,storage to authenticated;',
   'grant select,insert on storage.objects to authenticated;',
   'grant select on public.school_student_profiles to authenticated;'
  ].join('\n'));
  await db.exec(read('supabase/migrations/20261107160800_student_photo_storage.sql'));
  await db.exec([
   "insert into public.institutions values('"+I+"','active');",
   "insert into public.school_users values('55555555-5555-5555-5555-555555555555','"+I+"','"+ADMIN+"','school_admin','active');",
   "insert into public.school_students values('"+S+"','"+I+"','active'),('"+OTHER+"','"+I+"','active');",
   "insert into public.school_guardians values('66666666-6666-6666-6666-666666666666','"+I+"','"+PARENT+"','active');",
   "insert into public.school_guardian_students values('"+I+"','66666666-6666-6666-6666-666666666666','"+S+"');"
  ].join('\n'));
  await db.exec("set role authenticated;select set_config('request.jwt.claim.sub','"+PARENT+"',false)");
  await assert.rejects(db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['school-student-photos',photo]),/row-level security|permission denied/i);
  await db.exec("select set_config('request.jwt.claim.sub','"+ADMIN+"',false)");
  await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['school-student-photos',photo]);
  await assert.rejects(db.query('insert into storage.objects(bucket_id,name) values($1,$2)',['school-student-photos','99999999-9999-9999-9999-999999999999/'+OTHER+'/44444444-4444-4444-4444-444444444444.jpg']),/row-level security|permission denied|duplicate key/i);
  await db.query('select public.bn_student_photo_save($1,$2)',[S,photo]);
  const saved=(await db.query('select details from public.school_student_profiles where student_id=$1',[S])).rows[0].details;
  assert.equal(saved.student_photo_path,photo);
  await assert.rejects(db.query('select public.bn_student_photo_save($1,$2)',[OTHER,photo]),/does not belong/i);
  await db.exec("select set_config('request.jwt.claim.sub','"+PARENT+"',false)");
  assert.equal((await db.query('select name from storage.objects')).rows.length,1);
  await assert.rejects(db.query('select * from public.bn_photo_path_ids($1)',[photo]),/permission denied/i);
  await db.exec("select set_config('request.jwt.claim.sub','',false)");
  assert.equal((await db.query('select name from storage.objects')).rows.length,0);
 }finally{await db.close();}
});
test('staff profile photo and parent photo link use private Supabase Storage',()=>{
 const script=read('teacher-access.js'),profile=read('school-student-profile.js'),client=read('parents-cloud.js');
 assert.equal(script,read('docs/teacher-access.js'));
 assert.ok(script.includes('studentPhotoUpload'));
 assert.ok(script.includes('bn_student_photo_save'));
 assert.ok(script.includes('school-student-photos'));
 assert.ok(script.includes("crypto.randomUUID()"));
 assert.ok(client.includes('/storage/v1/object/sign/school-student-photos/'));
 assert.ok(client.includes('expiresIn:300'));
 assert.ok(profile.includes('student.photoUrl'));
 assert.doesNotMatch(script,/service_role|sb_secret_/i);
});
