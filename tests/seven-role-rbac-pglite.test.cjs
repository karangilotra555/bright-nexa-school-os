'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const {fixture}=require('./workspace-database.cjs');

const read=rel=>fs.readFileSync(path.join(__dirname,'..',rel),'utf8');

test('TDD RED: seven-role RBAC migration exists in supabase/migrations and isolates all 7 roles end-to-end',async t=>{
 const migrationPath=path.join(__dirname,'../supabase/migrations/20261125000000_rbac_seven_role_hardening.sql');
 assert.ok(fs.existsSync(migrationPath),'Numbered seven-role RBAC migration must exist in supabase/migrations');

 const db=new PGlite();
 t.after(()=>db.close());
 await db.exec(fixture);
 await db.exec(`
  create schema if not exists storage;
  grant usage on schema storage to authenticated;
  create table auth.users(id uuid primary key,email text);
  create table public.school_teacher_assignments(
   id uuid primary key default gen_random_uuid(),
   institution_id uuid not null references public.institutions(id),
   school_user_id uuid not null,
   class_id uuid not null,
   assignment_type text not null,
   subject text not null default '',
   can_view_roster boolean not null default true,
   can_take_attendance boolean not null default false,
   can_assign_homework boolean not null default false,
   can_enter_marks boolean not null default false,
   active boolean not null default true,
   unique(school_user_id,class_id,subject)
  );
  create table public.school_guardians(
   id uuid primary key default gen_random_uuid(),
   institution_id uuid not null references public.institutions(id),
   auth_user_id uuid not null,
   email text,
   status text not null default 'active',
   unique(institution_id,auth_user_id)
  );
  create table public.school_guardian_students(
   institution_id uuid not null references public.institutions(id),
   guardian_id uuid not null references public.school_guardians(id),
   student_id uuid not null,
   relationship text not null default 'guardian',
   primary key(guardian_id,student_id)
  );
  create table public.school_staff_profiles(
   id uuid primary key default gen_random_uuid(),
   institution_id uuid not null references public.institutions(id),
   school_user_id uuid not null,
   staff_category text not null default 'teaching',
   display_name text not null default '',
   contact_email text not null default '',
   contact_mobile text,
   updated_at timestamptz not null default now(),
   unique(school_user_id,institution_id)
  );
  alter table public.school_users add column if not exists email text, add column if not exists display_name text;
  alter table public.school_users add constraint school_users_role_check check (role in ('school_admin','principal','teacher','accountant','receptionist','transport_staff'));
  alter table public.school_student_profiles add column if not exists guardian_email text, add column if not exists admission_login_alias text;
  alter table public.school_students add column if not exists father_name text;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(bucket_id text,name text,primary key(bucket_id,name));
  alter table storage.objects enable row level security;
  grant select,insert,delete on storage.objects to authenticated;
  grant select,delete on public.school_homework to authenticated;
  grant select,insert,update,delete on public.school_teacher_assignments to authenticated;
  alter table public.school_teacher_assignments enable row level security;
  alter table public.school_guardians enable row level security;
  alter table public.school_guardian_students enable row level security;
  create function school_private.parent_of(p_student uuid,p_school uuid) returns boolean language sql stable security definer set search_path='' as $$
   select auth.uid() is not null and exists(
    select 1 from public.school_guardians g join public.school_guardian_students l on l.guardian_id=g.id and l.institution_id=g.institution_id
    where g.institution_id=p_school and g.auth_user_id=auth.uid() and g.status='active' and l.student_id=p_student
   )
  $$;
  create function school_private.parent_in_school(p_school uuid) returns boolean language sql stable security definer set search_path='' as $$
   select auth.uid() is not null and exists(
    select 1 from public.school_guardians g where g.institution_id=p_school and g.auth_user_id=auth.uid() and g.status='active'
   )
  $$;
  create function school_private.teacher_can(p_school uuid,p_class uuid,p_perm text,p_subject text) returns boolean language sql stable security definer set search_path='' as $$
   select auth.uid() is not null and exists(
    select 1 from public.school_users u join public.school_teacher_assignments a on a.school_user_id=u.id and a.institution_id=u.institution_id
    where u.institution_id=p_school and u.auth_user_id=auth.uid() and u.role='teacher' and u.status='active' and a.active and a.class_id=p_class
   )
  $$;
  grant execute on function school_private.parent_of(uuid,uuid),school_private.parent_in_school(uuid),school_private.teacher_can(uuid,uuid,text,text) to authenticated;
  create policy school_parent_profile_read on public.school_student_profiles for select to authenticated using (school_private.parent_of(student_id,institution_id));
 `);
 await db.exec(read('supabase/migrations/20261105200548_school_workspace_sync.sql'));
 await db.exec(read('supabase/migrations/20261106113729_role_module_permissions_supabase_source_of_truth.sql'));
 await db.exec(read('supabase/migrations/20261106115342_principal_profile_read_for_cloud_role_matrix.sql'));
 await db.exec(read('supabase/migrations/20261106140122_librarian_role_library_inventory_rls.sql'));
 await db.exec(read('supabase/migrations/20261106144841_accountant_finance_only_student_profile_boundary.sql'));
 await db.exec(read('supabase/homework-private-files.sql'));
 await db.exec(read('supabase/migrations/20261120175741_owner_only_school_deletions.sql'));
 await db.exec(read('supabase/migrations/20261125000000_rbac_seven_role_hardening.sql'));

 const schoolA='10000000-0000-4000-8000-000000000001';
 const schoolB='20000000-0000-4000-8000-000000000002';
 const classA='30000000-0000-4000-8000-000000000001';
 const student1='40000000-0000-4000-8000-000000000001';
 const student2='40000000-0000-4000-8000-000000000002';
 const ownerA='50000000-0000-4000-8000-000000000001';
 const principalA='50000000-0000-4000-8000-000000000002';
 const accountantA='50000000-0000-4000-8000-000000000003';
 const librarianA='50000000-0000-4000-8000-000000000004';
 const teacherA='50000000-0000-4000-8000-000000000005';
 const parent1='50000000-0000-4000-8000-000000000006';
 const studentAuth1='50000000-0000-4000-8000-000000000007';
 const outsider='50000000-0000-4000-8000-000000000099';

 await db.query("insert into public.institutions values($1,'School A','active'),($2,'School B','active')",[schoolA,schoolB]);
 await db.query("insert into public.school_classes values($1,$2,'6','A','2026')",[classA,schoolA]);
 await db.query("insert into public.school_students(id,institution_id,class_id,admission_number,name,status) values($1,$3,$4,'A-01','Child One','active'),($2,$3,$4,'A-02','Child Two','active')",[student1,student2,schoolA,classA]);
 await db.query("insert into public.school_student_profiles(student_id,institution_id,guardian_name,guardian_phone) values($1,$3,'Guardian One','9876543210'),($2,$3,'Guardian Two','9876543211')",[student1,student2,schoolA]);
 for(const [id,role,school] of [
  [ownerA,'school_admin',schoolA],[principalA,'principal',schoolA],[accountantA,'accountant',schoolA],
  [librarianA,'librarian',schoolA],[teacherA,'teacher',schoolA],[outsider,'school_admin',schoolB]
 ]){
  await db.query("insert into public.school_users(id,institution_id,auth_user_id,role,status,email,display_name) values($1,$2,$1,$3,'active',$4,$3)",[id,school,role,role+'@school.test']);
 }
 const gParent='60000000-0000-4000-8000-000000000001',gStudent='60000000-0000-4000-8000-000000000002';
 await db.query("insert into public.school_guardians(id,institution_id,auth_user_id,email,status) values($1,$3,$5,'p@test','active'),($2,$4,$6,'s@test','active')",[gParent,gStudent,schoolA,schoolA,parent1,studentAuth1]);
 await db.query("insert into public.school_guardian_students(institution_id,guardian_id,student_id) values($1,$2,$3),($1,$4,$3)",[schoolA,gParent,student1,gStudent]);
 await db.query("insert into public.school_library_items(id,institution_id,accession_no,title) values('70000000-0000-4000-8000-000000000001',$1,'ACC-1','Science Book')",[schoolA]);
 await db.query("insert into public.school_role_module_permissions(institution_id,role,module_key,enabled) values($1,'accountant','profiles',false)",[schoolA]);
 await db.query("insert into public.school_homework(id,institution_id,class_id,subject,title,instructions,created_by) values('80000000-0000-4000-8000-000000000001',$1,$2,'Maths','HW1','Practice',$3)",[schoolA,classA,ownerA]);

 const signIn=async uid=>{
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
  await db.exec('set role authenticated');
 };

 // 1. Accountant: can call bn_finance_students & insert fee_entries, DENIED students/classes/profiles/attendance/homework/files/library
 await signIn(accountantA);
 assert.equal((await db.query('select count(*)::int n from public.bn_finance_students($1)',[schoolA])).rows[0].n,2);
 assert.equal((await db.query('select * from public.school_students')).rows.length,0);
 assert.equal((await db.query('select * from public.school_classes')).rows.length,0);
 assert.equal((await db.query('select * from public.school_student_profiles')).rows.length,0);
 assert.equal((await db.query('select * from public.school_attendance')).rows.length,0);
 assert.equal((await db.query('select * from public.school_homework')).rows.length,0);
 assert.equal((await db.query('select * from public.school_homework_files')).rows.length,0);
 assert.equal((await db.query('select * from public.school_library_items')).rows.length,0);
 assert.equal((await db.query('select * from public.school_library_loans')).rows.length,0);
 await db.query("insert into public.school_fee_entries(institution_id,student_id,kind,amount_rupees,description,reference,created_by) values($1,$2,'payment',500,'Tuition','RCPT-1',$3)",[schoolA,student1,accountantA]);
 // Fee ledger must remain append-only (no update/delete by accountant or anyone else)
 await assert.rejects(db.query("update public.school_fee_entries set amount_rupees=1 where institution_id=$1",[schoolA]));
 await assert.rejects(db.query("delete from public.school_fee_entries where institution_id=$1",[schoolA]));

 // 2. Principal: cannot write fees, cannot approve deletions on protected tables, cannot alter role permissions
 await signIn(principalA);
 assert.equal((await db.query('select * from public.bn_finance_students($1)',[schoolA])).rows.length,0);
 await assert.rejects(db.query("insert into public.school_fee_entries(institution_id,student_id,kind,amount_rupees,description,reference,created_by) values($1,$2,'payment',500,'Tuition','RCPT-P',$3)",[schoolA,student1,principalA]));
 assert.deepEqual((await db.query("update public.school_role_module_permissions set enabled=true where institution_id=$1 and role='accountant' returning role",[schoolA])).rows,[]);
 assert.equal((await db.query("select bool_or(enabled) e from public.school_role_module_permissions where institution_id=$1 and role='accountant'",[schoolA])).rows[0].e,false);
 await assert.rejects(db.query("insert into public.school_role_module_permissions(institution_id,role,module_key,enabled) values($1,'librarian','profiles',true) on conflict (institution_id,role,module_key) do update set enabled=true",[schoolA]));
 assert.deepEqual((await db.query("delete from public.school_homework where institution_id=$1 returning id",[schoolA])).rows,[]);
 assert.deepEqual((await db.query("delete from public.school_teacher_assignments where institution_id=$1 returning id",[schoolA])).rows,[]);

 // 3. Librarian: can issue book to active student, denied fees/profiles/homework/files
 await signIn(librarianA);
 assert.equal((await db.query('select * from public.school_student_profiles')).rows.length,0);
 assert.equal((await db.query('select * from public.school_homework')).rows.length,0);
 assert.equal((await db.query('select * from public.school_homework_files')).rows.length,0);
 assert.equal((await db.query('select * from public.bn_finance_students($1)',[schoolA])).rows.length,0);
 await assert.rejects(db.query("insert into public.school_fee_entries(institution_id,student_id,kind,amount_rupees,description,reference,created_by) values($1,$2,'payment',10,'X','R',$3)",[schoolA,student1,librarianA]));
 await db.query("insert into public.school_library_loans(institution_id,item_id,student_id,due_on,issued_by) values($1,'70000000-0000-4000-8000-000000000001',$2,current_date+7,$3)",[schoolA,student1,librarianA]);

 // 4. Unassigned teacher: denied attendance/homework writes; blocked from profiles/fees
 await signIn(teacherA);
 assert.equal((await db.query('select * from public.school_student_profiles')).rows.length,0);
 assert.equal((await db.query('select * from public.bn_finance_students($1)',[schoolA])).rows.length,0);
 await assert.rejects(db.query("insert into public.school_homework(institution_id,class_id,subject,title,instructions,created_by) values($1,$2,'Maths','Unauthorized','No',$3)",[schoolA,classA,teacherA]));
 await assert.rejects(db.query("insert into public.school_attendance(institution_id,class_id,student_id,day,status,recorded_by) values($1,$2,$3,current_date,'present',$4)",[schoolA,classA,student1,teacherA]));

 // 5 & 6. Parent & Student: linked student only; denied sibling/stranger student & admin RPCs
 for(const familyUid of [parent1,studentAuth1]){
  await signIn(familyUid);
  const profiles=(await db.query('select student_id from public.school_student_profiles')).rows;
  assert.deepEqual(profiles.map(r=>r.student_id),[student1]);
  assert.equal((await db.query('select * from public.bn_finance_students($1)',[schoolA])).rows.length,0);
 }

 // 7. Cross-tenant school_admin sees zero rows from School A
 await signIn(outsider);
 assert.equal((await db.query('select * from public.school_students where institution_id=$1',[schoolA])).rows.length,0);
 assert.equal((await db.query('select * from public.school_student_profiles where institution_id=$1',[schoolA])).rows.length,0);
 assert.equal((await db.query('select * from public.bn_finance_students($1)',[schoolA])).rows.length,0);
});
