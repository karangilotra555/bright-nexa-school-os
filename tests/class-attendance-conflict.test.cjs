'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');

const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const [school,other,cls,otherClass,teacher,principal,owner,parent,otherTeacher,student,student2,otherStudent]=
  Array.from({length:12},(_,i)=>id(i+1));
const day='2026-11-05';

test('attendance CAS preserves the newer mark, rolls back a conflict and enforces existing RLS',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`
   create role anon; create role authenticated;
   create schema auth;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated;
   create table school_users(id uuid primary key,institution_id uuid,role text,class_id uuid);
   create table school_students(id uuid primary key,institution_id uuid,class_id uuid,status text);
   create table school_attendance(
     id uuid primary key default gen_random_uuid(),institution_id uuid not null,class_id uuid not null,
     student_id uuid not null references school_students(id),day date not null,status text not null,
     recorded_by uuid not null references school_users(id),updated_at timestamptz not null default now(),
     unique(student_id,day)
   );
   grant select on school_users,school_students to authenticated;
   grant select,insert,update on school_attendance to authenticated;
   alter table school_attendance enable row level security;
   create policy read_attendance on school_attendance for select to authenticated using (true);
   create function can_mark(mark public.school_attendance) returns boolean language sql stable as $$
     select exists(select 1 from public.school_users u where u.id=auth.uid() and u.institution_id=mark.institution_id
       and (u.role in ('school_admin','principal') or (u.role='teacher' and u.class_id=mark.class_id))) $$;
   create function own_attendance(mark public.school_attendance) returns boolean language sql stable as $$
     select mark.recorded_by=auth.uid() and exists(select 1 from public.school_students s where s.id=mark.student_id
       and s.institution_id=mark.institution_id and s.class_id=mark.class_id and s.status='active') $$;
   create policy insert_attendance on school_attendance for insert to authenticated
     with check (can_mark(school_attendance) and own_attendance(school_attendance));
   create policy update_attendance on school_attendance for update to authenticated
     using (can_mark(school_attendance)) with check (can_mark(school_attendance) and own_attendance(school_attendance));
   insert into school_users values ('${teacher}','${school}','teacher','${cls}'),
    ('${owner}','${school}','school_admin',null),('${principal}','${school}','principal',null),
    ('${parent}','${school}','parent',null),('${otherTeacher}','${other}','teacher','${otherClass}');
   insert into school_students values ('${student}','${school}','${cls}','active'),
    ('${student2}','${school}','${cls}','active'),('${otherStudent}','${other}','${otherClass}','active');
  `);
  await db.exec(fs.readFileSync('supabase/migrations/20261119151000_class_attendance_compare_and_save.sql','utf8'));
  const session=async(user)=>{
   await db.exec('reset role; set role authenticated');
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
  };
  const save=async(actor,marks,schoolId=school,classId=cls)=>(await db.query(
   'select bn_save_class_attendance($1,$2,$3,$4,$5) saved',[schoolId,classId,day,actor,JSON.stringify(marks)]
  )).rows[0].saved;
  const mark=(student_id,status,expected)=>({student_id,status,expected});
  const statuses=async()=>(await db.query('select student_id,status from school_attendance order by student_id')).rows;

  await session(teacher);
  assert.deepEqual(await save(teacher,[mark(student,'absent',null)]),[{student_id:student,status:'absent'}]);
  await session(principal);
  await save(principal,[mark(student,'present','absent'),mark(student2,'absent',null)]);
  await session(teacher);
  await assert.rejects(save(teacher,[mark(student,'late','absent')]),{code:'PT409'});
  await assert.rejects(save(teacher,[mark(student,'late','present'),mark(student2,'present',null)]),{code:'PT409'});
  assert.deepEqual(await statuses(),[{student_id:student,status:'present'},{student_id:student2,status:'absent'}]);
  await assert.rejects(save(teacher,[{student_id:student,status:'late'}]),{code:'22023'});
  await assert.rejects(save(teacher,[mark(student,'late','present'),mark(student,'excused','present')]),{code:'22023'});
  await assert.rejects(save(principal,[mark(student,'late','present')]),{code:'42501'});
  await assert.rejects(save(teacher,[mark(otherStudent,'late',null)],other,otherClass),{code:'42501'});
  await session(parent);
  await assert.rejects(save(parent,[mark(student,'late','present')]),{code:'PT409'});
  await session(owner);
  await save(owner,[mark(student,'late','present')]);
  assert.equal((await statuses())[0].status,'late');
  await db.exec('reset role; set role anon');
  await assert.rejects(save(owner,[mark(student,'excused','late')]),{code:'42501'});
 }finally{await db.close();}
});
