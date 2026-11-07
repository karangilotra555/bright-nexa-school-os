'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const S='11111111-1111-1111-1111-111111111111',C='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const T='44444444-4444-4444-4444-444444444444',A='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const P='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',ST='dddddddd-dddd-dddd-dddd-dddddddddddd';

test('timetable blocks overlapping periods and teacher double booking; protects unpublished schedules',async()=>{
 const db=new PGlite();
 try{
  const fixture=[
   'create role anon;create role authenticated;create schema auth;create schema school_private;',
   "create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;",
   'create table public.institutions(id uuid primary key,name text,status text);',
   'create table public.school_users(id uuid primary key,institution_id uuid,auth_user_id uuid,role text,status text,display_name text,unique(id,institution_id));',
   'create table public.school_classes(id uuid primary key,institution_id uuid,unique(id,institution_id));',
   'create table public.school_students(id uuid primary key,institution_id uuid,class_id uuid,status text);',
   'create table public.school_teacher_assignments(id uuid primary key,institution_id uuid,school_user_id uuid,class_id uuid,assignment_type text,subject text,active boolean);',
   'create table public.school_guardians(id uuid primary key,institution_id uuid,auth_user_id uuid,status text);',
   'create table public.school_guardian_students(institution_id uuid,guardian_id uuid,student_id uuid);',
   "create function school_private.has_role(i uuid,roles text[]) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.school_users u where u.institution_id=i and u.auth_user_id=auth.uid() and u.status='active' and u.role=any(roles))$$;",
   "create function school_private.parent_of(s uuid,i uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.school_guardians g join public.school_guardian_students l on l.guardian_id=g.id and l.institution_id=g.institution_id join public.school_students st on st.id=l.student_id and st.institution_id=l.institution_id where g.auth_user_id=auth.uid() and g.institution_id=i and g.status='active' and l.student_id=s and st.status='active')$$;",
   'grant usage on schema auth,school_private to authenticated;',
   'grant select on public.school_users,public.school_classes,public.school_students,public.school_teacher_assignments to authenticated;'
  ].join('\n');
  await db.exec(fixture);
  await db.exec(read('supabase/migrations/20261107160700_school_timetable.sql'));
  const add=[
   "insert into public.institutions values('"+S+"','Example School','active');",
   "insert into public.school_classes values('"+C+"','"+S+"'),('ffffffff-ffff-ffff-ffff-ffffffffffff','"+S+"');",
   "insert into public.school_users values('33333333-3333-3333-3333-333333333333','"+S+"','"+A+"','school_admin','active','Admin'),('"+T+"','"+S+"','cccccccc-cccc-cccc-cccc-cccccccccccc','teacher','active','Teacher One');",
   "insert into public.school_students values('"+ST+"','"+S+"','"+C+"','active');",
   "insert into public.school_teacher_assignments values('55555555-5555-5555-5555-555555555555','"+S+"','"+T+"','"+C+"','subject_teacher','Math',true),('66666666-6666-6666-6666-666666666666','"+S+"','"+T+"','ffffffff-ffff-ffff-ffff-ffffffffffff','class_teacher','',true);",
   "insert into public.school_guardians values('77777777-7777-7777-7777-777777777777','"+S+"','"+P+"','active');",
   "insert into public.school_guardian_students values('"+S+"','77777777-7777-7777-7777-777777777777','"+ST+"');"
  ];
  await db.exec(add.join('\n'));
  await db.exec("set role authenticated; select set_config('request.jwt.claim.sub','"+A+"',false)");
  const period=(await db.query('insert into public.school_timetable_periods(institution_id,weekday,period_no,starts_at,ends_at) values($1,1,1,$2,$3) returning id',[S,'08:30','09:10'])).rows[0].id;
  await assert.rejects(db.query('insert into public.school_timetable_periods(institution_id,weekday,period_no,starts_at,ends_at) values($1,1,2,$2,$3)',[S,'09:00','09:40']),/overlap/i);
  await assert.rejects(db.query('insert into public.school_timetable_slots(institution_id,class_id,period_id,subject,teacher_user_id) values($1,$2,$3,$4,$5)',[S,C,period,'Hindi',T]),/not assigned/i);
  await db.query('insert into public.school_timetable_slots(institution_id,class_id,period_id,subject,teacher_user_id) values($1,$2,$3,$4,$5)',[S,C,period,'Math',T]);
  await assert.rejects(db.query('insert into public.school_timetable_slots(institution_id,class_id,period_id,subject,teacher_user_id) values($1,$2,$3,$4,$5)',[S,'ffffffff-ffff-ffff-ffff-ffffffffffff',period,'Science',T]),/duplicate key/i);
  await assert.rejects(
   db.query('update public.school_timetable_periods set kind=$1 where id=$2',['break',period]),
   /Remove the existing lessons/i,'Cannot turn an occupied teaching period into break'
  );
  await db.query('insert into public.school_timetable_publications(institution_id,class_id,published) values($1,$2,true)',[S,C]);
  await db.exec("select set_config('request.jwt.claim.sub','"+P+"',false)");
  const published=(await db.query('select * from public.bn_portal_class_timetable($1,$2)',[S,ST])).rows;
  assert.equal(published.length,1);assert.equal(published[0].subject,'Math');assert.equal(published[0].teacher_name,'Teacher One');
  await db.exec("select set_config('request.jwt.claim.sub','"+A+"',false)");
  await db.query('update public.school_timetable_slots set room=$1 where class_id=$2',['Room 4',C]);
  assert.equal((await db.query('select published from public.school_timetable_publications where class_id=$1',[C])).rows[0].published,false);
  await db.query('update public.school_timetable_publications set published=true where class_id=$1',[C]);
  await db.query("update public.school_teacher_assignments set active=false where school_user_id=$1",[T]);
  assert.equal((await db.query('select published from public.school_timetable_publications where class_id=$1',[C])).rows[0].published,false,'Revoking a teacher assignment invalidates the published timetable');
  await db.exec("select set_config('request.jwt.claim.sub','"+P+"',false)");
  assert.equal((await db.query('select * from public.bn_portal_class_timetable($1,$2)',[S,ST])).rows.length,0);
 }finally{await db.close();}
});
test('timetable editor and parent displays reuse same mirrored code',()=>{
 const js=read('school-timetable.js'),html=read('school-timetable.html');
 assert.equal(js,read('docs/school-timetable.js'));
 assert.equal(html,read('docs/school-timetable.html'));
 assert.ok(html.includes('Weekly School Timetable'));
 assert.ok(js.includes('school_timetable_publications'));
 assert.ok(js.includes('school_teacher_assignments'));
 assert.doesNotThrow(()=>new Function(js));
 assert.equal(read('school-student-profile.js'),read('docs/school-student-profile.js'));
 assert.ok(read('school-student-profile.js').includes('bn-timetable'));
});
