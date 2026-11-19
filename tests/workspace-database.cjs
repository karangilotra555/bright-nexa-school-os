/* Disposable PostgreSQL engine only; never connects to a hosted school. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fixture = `
create role anon; create role authenticated;
create schema auth; create schema school_private;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth,school_private to authenticated;
create table institutions(id uuid primary key,name text,status text default 'active');
create table school_users(id uuid primary key,institution_id uuid references institutions,auth_user_id uuid,role text,status text default 'active',unique(id,institution_id));
create function school_private.has_role(i uuid,roles text[]) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.school_users u join public.institutions s on s.id=u.institution_id where u.institution_id=i and u.auth_user_id=auth.uid() and u.status='active' and s.status in ('active','trial') and u.role=any(roles))$$;
create table school_classes(id uuid primary key default gen_random_uuid(),institution_id uuid references institutions,name text not null,section text not null,academic_year text not null,unique(institution_id,name,section,academic_year),unique(id,institution_id));
create table school_students(id uuid primary key default gen_random_uuid(),institution_id uuid references institutions,class_id uuid,admission_number text not null,name text not null,dob date,status text not null default 'active' check(status in ('active','transferred','graduated','archived')),created_at timestamptz default now(),updated_at timestamptz default now(),unique(institution_id,admission_number),unique(id,institution_id),unique(id,institution_id,class_id),foreign key(class_id,institution_id) references school_classes(id,institution_id));
create table school_student_profiles(student_id uuid primary key,institution_id uuid,guardian_name text,guardian_phone text,address_line text,alternate_contact_phone text,admission_on date,details jsonb not null default '{}',updated_at timestamptz default now(),foreign key(student_id,institution_id) references school_students(id,institution_id));
create table school_attendance(id uuid primary key default gen_random_uuid(),institution_id uuid,class_id uuid not null,student_id uuid not null,day date not null,status text check(status in ('present','absent','late','excused')),recorded_by uuid,updated_at timestamptz default now(),unique(student_id,day),foreign key(class_id,institution_id) references school_classes(id,institution_id),constraint school_attendance_student_tenant_class_fkey foreign key(student_id,institution_id,class_id) references school_students(id,institution_id,class_id));
create table school_homework(id uuid primary key default gen_random_uuid(),institution_id uuid,class_id uuid,subject text,title text,instructions text,due_on date,created_by uuid,created_at timestamptz default now(),foreign key(class_id,institution_id) references school_classes(id,institution_id));
create table school_notices(id uuid primary key default gen_random_uuid(),institution_id uuid,title text,body text,created_by uuid,created_at timestamptz default now());
create table school_fee_entries(id uuid primary key default gen_random_uuid(),institution_id uuid,student_id uuid,kind text check(kind in ('charge','payment')),amount_rupees bigint constraint school_fee_entries_amount_rupees_check check(amount_rupees>=1 and amount_rupees<=100000000),description text,reference text,created_by uuid,occurred_on date,created_at timestamptz default now(),foreign key(student_id,institution_id) references school_students(id,institution_id));
create view school_fee_balances with(security_invoker=true) as select institution_id,student_id,sum(case when kind='charge' then amount_rupees else -amount_rupees end) balance_rupees,count(*) entry_count from school_fee_entries group by institution_id,student_id;
grant select on all tables in schema public to authenticated;
grant insert,update on school_classes,school_students,school_attendance,school_homework to authenticated;
grant insert on school_notices,school_fee_entries,school_student_profiles to authenticated;
grant update(guardian_name,guardian_phone,address_line,alternate_contact_phone,admission_on,details,updated_at) on school_student_profiles to authenticated;
do $$declare t text;begin foreach t in array array['institutions','school_users','school_classes','school_students','school_student_profiles','school_attendance','school_homework','school_notices','school_fee_entries'] loop
 execute format('alter table %I enable row level security',t);
 if t='institutions' then execute 'create policy fixture on institutions for select to authenticated using (school_private.has_role(id,array[''school_admin'']))';
 elsif t='school_users' then execute 'create policy fixture on school_users for select to authenticated using (auth_user_id=auth.uid())';
 else execute format('create policy fixture on %I for all to authenticated using(school_private.has_role(institution_id,array[''school_admin''])) with check(school_private.has_role(institution_id,array[''school_admin'']))',t); end if;
end loop;end$$;
`;
(async () => {
 const db = new PGlite(); await db.exec(fixture);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261105200548_school_workspace_sync.sql'),'utf8'));
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261107131000_guard_first_workspace_import.sql'),'utf8'));
 const school='11111111-1111-1111-1111-111111111111', other='22222222-2222-2222-2222-222222222222';
 const admin='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', user='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
 await db.exec(`insert into institutions values('${school}','Test School','active'),('${other}','Other School','active'); insert into school_users values('${user}','${school}','${admin}','school_admin','active'); set role authenticated; select set_config('request.jwt.claim.sub','${admin}',false)`);
 const pull=async()=> (await db.query('select school_workspace_pull($1) result',[school])).rows[0].result;
 const snapshot={institution:{institution:{id:'local-school',name:'Test School'},settings:{preserve:true}},students:[{id:'s1',custom:'preserved'}],operations:{classes:[{id:'c1',academicStream:'Science'}],attendance:[{id:'a1',remark:'preserved'}],homework:[],marks:[{id:'mark1'}]}};
 const projection={classes:[{localId:'c1',name:'6',section:'A',academicYear:'2026'}],students:[{localId:'s1',admissionNumber:'A1',name:'Student One',classLocalId:'c1',status:'active',profile:{details:{custom:'preserved'}}}],attendance:[{localId:'a1',studentLocalId:'s1',classLocalId:'c1',day:'2026-11-01',status:'present'}],homework:[{localId:'h1',classLocalId:'c1',subject:'Math',title:'Homework',instructions:'Practice',dueOn:'2026-11-09'}],notices:[{localId:'n1',title:'Notice',body:'Hello families'}],fees:[{localId:'f1',studentLocalId:'s1',kind:'charge',amountRupees:100.25,description:'Tuition'}]};
 const push=async(revision,p=projection)=>(await db.query('select school_workspace_push($1,$2,$3,$4) result',[school,revision,snapshot,p])).rows[0].result;

 // A NULL workspace is not an empty school. An existing relational roster
 // must never be overwritten by unrelated local samples during first import.
 // Use a second, disposable school; no real Supabase records are involved.
 const existingSchool='33333333-3333-3333-3333-333333333333';
 await db.exec(`reset role;
   insert into institutions values('${existingSchool}','Existing Cloud School','active');
   insert into school_users values('44444444-4444-4444-4444-444444444444','${existingSchool}','${admin}','school_admin','active');
   insert into school_classes(institution_id,name,section,academic_year) values('${existingSchool}','9','A','2026');
   insert into school_students(institution_id,admission_number,name) values('${existingSchool}','PREEXISTING-1','Original Student');
   set role authenticated;`);
 await assert.rejects(
   db.query('select school_workspace_push($1,$2,$3,$4) result',[existingSchool,0,snapshot,projection]),
   /existing cloud records|Reconcile before importing/i,
   'first import must fail closed when the school already has relational records'
 );
 const existing=(await db.query('select name from school_students where institution_id=$1 and admission_number=$2',[existingSchool,'PREEXISTING-1'])).rows[0];
 assert.equal(existing.name,'Original Student','a rejected upload must not change existing students');
 assert.equal(Number((await db.query('select count(*) n from school_workspace_links where institution_id=$1',[existingSchool])).rows[0].n),0);
 // Clean up only the isolated test school's fixture so unrelated assertions
 // continue to count the main test school alone.
 await db.exec(`reset role;
   delete from school_students where institution_id='${existingSchool}';
   delete from school_classes where institution_id='${existingSchool}';
   delete from school_users where institution_id='${existingSchool}';
   delete from institutions where id='${existingSchool}';
   set role authenticated;`);

 assert.equal((await pull()).snapshot,null);
 projection.students[0].profile.details.name='stale profile name'; projection.students[0].profile.details.id='stale profile id';
 let result=await push(0); assert.ok(result.revision>0); assert.equal(result.snapshot.students[0].id,'s1'); assert.equal(result.snapshot.students[0].name,'Student One'); assert.equal(result.snapshot.students[0].custom,'preserved'); assert.equal(result.snapshot.operations.marks[0].id,'mark1');
 assert.equal(result.snapshot.students[0].status,'Active');
 await assert.rejects(push(0),/revision conflict/);
 await assert.rejects(db.query('select school_workspace_pull($1)',[other]),/administrator required/);
 let count=(await db.query('select count(*) n from school_students')).rows[0].n; assert.equal(Number(count),1);
 result=await push(result.revision); assert.equal(Number((await db.query('select count(*) n from school_fee_entries')).rows[0].n),1,'idempotent fees');
 await assert.rejects(push(result.revision,{...projection,homework:[]}),/Cloud-linked records cannot be removed/);
 assert.equal((await pull()).revision,result.revision,'failed removal is atomic');
 snapshot.institution.institution.name='Renamed School'; result=await push(result.revision);
 assert.equal(result.school.name,'Renamed School'); assert.equal(result.snapshot.institution.institution.name,'Renamed School');
 projection.fees[0].amountRupees=80.10; result=await push(result.revision);
 assert.equal(Number((await db.query('select balance_rupees from school_fee_balances')).rows[0].balance_rupees),80.1);
 assert.equal(Number((await db.query('select count(*) n from school_fee_entries')).rows[0].n),2,'append correction');
 // Direct portal write invalidates the old revision and overlays source columns.
 const previous=result.revision;
 // Give this isolated fixture teacher only attendance access. It still cannot read workspaces.
 const teacher='dddddddd-dddd-dddd-dddd-dddddddddddd';
 await db.exec(`reset role; insert into school_users values('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','${school}','${teacher}','teacher','active'); create policy fixture_teacher_attendance on school_attendance for all to authenticated using(school_private.has_role(institution_id,array['teacher'])) with check(school_private.has_role(institution_id,array['teacher'])); set role authenticated; select set_config('request.jwt.claim.sub','${teacher}',false); update school_attendance set status='absent'`);
 assert.equal((await db.query('select * from school_workspaces')).rows.length,0,'teacher cannot see full snapshot');
 await assert.rejects(pull(),/administrator required/);
 await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false); update school_homework set instructions='Portal update'; update school_students set name='Portal name'; update school_student_profiles set details=details||'{"roll_number":"42","father_name":"Portal Father"}'`);
 await assert.rejects(push(previous),/revision conflict/); result=await pull();
 assert.equal(result.snapshot.students[0].name,'Portal name'); assert.equal(result.snapshot.operations.attendance[0].status,'Absent'); assert.equal(result.snapshot.operations.attendance[0].remark,'preserved'); assert.equal(result.snapshot.operations.homework[0].description,'Portal update');
 assert.equal(result.snapshot.students[0].rollNumber,'42'); assert.equal(result.snapshot.students[0].fatherName,'Portal Father');
 projection.students[0].profile.details.rollNumber='43';
 // Transfer must not rewrite or reject historical attendance class.
 projection.classes.push({localId:'c2',name:'7',section:'A',academicYear:'2026'}); projection.students[0].classLocalId='c2';
 result=await push(result.revision); assert.equal(result.snapshot.students[0].className,'7'); assert.equal(result.snapshot.operations.attendance[0].className,'6');
 assert.equal(result.snapshot.students[0].rollNumber,'43'); assert.equal((await db.query('select details from school_student_profiles')).rows[0].details.roll_number,'43');
 projection.fees=[]; result=await push(result.revision); assert.equal(Number((await db.query('select balance_rupees from school_fee_balances')).rows[0].balance_rupees),0);
 // Existing classes/students reconcile by natural key; unrelated ledger is never doubled.
 await db.exec(`insert into school_classes(institution_id,name,section,academic_year) values('${school}','8','A','2026'); insert into school_students(institution_id,admission_number,name) values('${school}','A2','Existing Student')`);
 result=await pull(); projection.classes.push({localId:'c3',name:'8',section:'A',academicYear:'2026'}); projection.students.push({localId:'s2',admissionNumber:'A2',name:'Existing Student',status:'active',classLocalId:'c3'});
 result=await push(result.revision); assert.equal(Number((await db.query('select count(*) n from school_students')).rows[0].n),2); assert.equal(Number((await db.query('select count(*) n from school_classes')).rows[0].n),3);
 // A portal row can be edited immediately after pull, before its local mapping exists.
 const portalClass='12121212-1212-1212-1212-121212121212',portalStudent='13131313-1313-1313-1313-131313131313';
 const foreignClass='14141414-1414-1414-1414-141414141414',foreignStudent='15151515-1515-1515-1515-151515151515';
 await db.exec(`insert into school_classes(id,institution_id,name,section,academic_year) values('${portalClass}','${school}','9','B','2026'); insert into school_students(id,institution_id,class_id,admission_number,name) values('${portalStudent}','${school}','${portalClass}','PORTAL-OLD','Portal Student'); reset role; insert into school_classes(id,institution_id,name,section,academic_year) values('${foreignClass}','${other}','Foreign','A','2026'); insert into school_students(id,institution_id,class_id,admission_number,name) values('${foreignStudent}','${other}','${foreignClass}','FOREIGN','Foreign Student'); set role authenticated`);
 result=await pull();
 const pulledClass=result.snapshot.operations.classes.find(c=>c.id==='cloud:'+portalClass),pulledStudent=result.snapshot.students.find(s=>s.id==='cloud:'+portalStudent);
 assert.ok(pulledClass); assert.ok(pulledStudent);
 projection.classes.push({localId:pulledClass.id,name:'10',section:'C',academicYear:'2027'});
 projection.students.push({localId:pulledStudent.id,admissionNumber:'PORTAL-NEW',name:'Edited Portal Student',status:'active',classLocalId:pulledClass.id});
 // Cross-school cloud tokens must fail even if their new natural key matches an accessible row.
 const badClass=structuredClone(projection); badClass.classes.at(-1).localId='cloud:'+foreignClass; badClass.classes.at(-1).name='6'; badClass.classes.at(-1).section='A'; badClass.classes.at(-1).academicYear='2026';
 await assert.rejects(push(result.revision,badClass),/Unknown or inaccessible cloud class ID/);
 const badStudent=structuredClone(projection); badStudent.students.at(-1).localId='cloud:'+foreignStudent; badStudent.students.at(-1).admissionNumber='A1';
 await assert.rejects(push(result.revision,badStudent),/Unknown or inaccessible cloud student ID/);
 assert.equal((await pull()).revision,result.revision,'cloud token rejection is atomic');
 result=await push(result.revision);
 assert.equal(Number((await db.query('select count(*) n from school_classes')).rows[0].n),4,'renamed cloud class is adopted without duplication');
 assert.equal(Number((await db.query('select count(*) n from school_students')).rows[0].n),3,'changed admission number preserves cloud student identity');
 assert.deepEqual((await db.query('select id,name,section,academic_year from school_classes where id=$1',[portalClass])).rows[0],{id:portalClass,name:'10',section:'C',academic_year:'2027'});
 assert.equal((await db.query('select admission_number from school_students where id=$1',[portalStudent])).rows[0].admission_number,'PORTAL-NEW');
 assert.equal(result.snapshot.students.find(s=>s.admissionNumber==='PORTAL-NEW').id,pulledStudent.id);

 // Portal attendance edits must adopt its immutable ID even when the day changes.
 const portalAttendance='16161616-1616-1616-1616-161616161616';
 await db.query('insert into school_attendance(id,institution_id,class_id,student_id,day,status,recorded_by) values($1,$2,$3,$4,$5,$6,$7)',[portalAttendance,school,portalClass,portalStudent,'2026-11-02','present',user]);
 result=await pull();
 projection.attendance.push({localId:'cloud:'+portalAttendance,studentLocalId:pulledStudent.id,classLocalId:pulledClass.id,day:'2026-11-03',status:'absent'});
 for(const kind of ['attendance','homework','notices']){
  const bad=structuredClone(projection);bad[kind].push({...bad[kind][0],localId:'cloud:17171717-1717-1717-1717-171717171717'});
  await assert.rejects(push(result.revision,bad),new RegExp('Unknown or inaccessible cloud '+kind+' ID'));
  assert.equal((await pull()).revision,result.revision,'invalid cloud ID rejection is atomic');
 }
 result=await push(result.revision);
 assert.equal(Number((await db.query('select count(*) n from school_attendance')).rows[0].n),2,'changed attendance day preserves ID without duplication');
 assert.equal((await db.query('select day::text from school_attendance where id=$1',[portalAttendance])).rows[0].day,'2026-11-03');
 // A real ERP push commits draft marks, then explicit publish copies only this pupil's exam.
 const pupil=(await db.query("select cloud_id from school_workspace_links where entity='students' and local_id='s1'")).rows[0].cloud_id;
 const parent='12121212-1212-1212-1212-121212121212';
 await db.exec(`reset role;
 create function school_private.parent_of(s uuid,i uuid) returns boolean language sql stable as
 $$select auth.uid()='${parent}'::uuid and s='${pupil}'::uuid and i='${school}'::uuid$$;
 create function school_private.staff_module_enabled(i uuid,m text) returns boolean language sql stable as
 $$select i='${school}'::uuid and m='profiles'$$;
 create function school_private.teacher_can(i uuid,c uuid,a text,s text) returns boolean language sql stable as
 $$select auth.uid()='${teacher}'::uuid and i='${school}'::uuid and c is not null and a='marks.write' and s='Math'$$;`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261108021000_publish_student_marksheets.sql'),'utf8'));
 await db.exec('set role authenticated');
 snapshot.operations.exams=[{id:'exam1',name:'Term 1',startDate:'2026-11-04'}];
 snapshot.operations.marks=[
  {examId:'exam1',studentId:'s1',subject:'Math',obtainedMarks:74,maximumMarks:100},
  {examId:'exam1',studentId:'s1',subject:'English',obtainedMarks:80,maximumMarks:100},
  {examId:'exam1',studentId:'s2',subject:'Math',obtainedMarks:42,maximumMarks:100}
 ];
 result=await push(result.revision);
 const as=async uid=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);
 const published=async(student=pupil,tenant=school)=>
  (await db.query('select bn_school_published_marksheets($1,$2) result',[tenant,student])).rows[0].result;
 const publish=async()=>db.query('select bn_publish_school_marksheet($1,$2,$3)',[school,pupil,'exam1']);
 await as(parent);
 assert.deepEqual(await published(),[],'draft marks are private');
 await assert.rejects(publish(),/administrator required/);
 await as(admin);
 await publish();
 await as(parent);
 assert.deepEqual((await published())[0].subjects.map(s=>s.obtained),[80,74]);
 assert.deepEqual(await published(portalStudent),[]);
 assert.deepEqual(await published(pupil,other),[]);
 await as(teacher);
 assert.deepEqual((await published())[0].subjects.map(s=>s.subject),['Math']);
 await assert.rejects(db.query('select * from school_published_marksheets'),/permission denied/);
 await as(admin);
 snapshot.operations.marks[0].obtainedMarks=95;
 result=await push(result.revision);
 assert.equal((await published())[0].subjects[1].obtained,74,'editing draft does not silently republish');
 await publish();
 assert.equal((await published())[0].subjects[1].obtained,95);
 const feeFixture=path.join(__dirname,'../supabase/migrations/20261108124000_isolate_accountant_ledger_from_erp_sync.sql');
 await db.exec('reset role');
 await db.exec(fs.readFileSync(feeFixture,'utf8'));
 await db.exec('set role authenticated');
 projection.fees.push({localId:'f1',studentLocalId:'s1',kind:'charge',amountRupees:80.10,description:'Tuition'});
 result=await push(result.revision);
 const existingFeeCount=Number((await db.query('select count(*) n from school_fee_entries')).rows[0].n);
 await db.query(`insert into school_fee_entries(institution_id,student_id,kind,amount_rupees,description,reference,created_by) values ('${school}',$1,'payment',5,'Accountant payment','accountant-fixture','${user}')`,[pupil]);
 result=await pull();
 assert.equal(result.snapshot.operations.externalFeeLedger[0].amountRupees,5);
 assert.equal(result.snapshot.operations.externalFeeLedger[0].studentId,'s1');
 assert.equal(result.snapshot.operations.externalFeeLedger[0].kind,'payment');
 snapshot.operations.externalFeeLedger=[{reference:'forged client data'}];
 snapshot.institution.institution.name='Admin saved after accountant payment';
 result=await push(result.revision);
 assert.equal(result.school.name,'Admin saved after accountant payment');
 assert.equal(result.snapshot.operations.externalFeeLedger[0].reference,'accountant-fixture');
 assert.equal(Number((await db.query('select count(*) n from school_fee_entries')).rows[0].n),existingFeeCount+1,'refresh and unrelated save must not duplicate ledger payment');
 assert.equal(Number((await db.query("select balance_rupees from school_fee_balances where student_id=$1",[pupil])).rows[0].balance_rupees),75.1);
 projection.fees[0].amountRupees=81.10;
 await assert.rejects(push(result.revision),/Accountant ledger.*Fees & Payments/);
 assert.equal(Number((await db.query('select revision from school_workspaces')).rows[0].revision),result.revision,'unsafe ledger edit is atomic');
 // Test the latest workspace functions against real Postgres constraints.
 await db.exec('reset role');
 await db.exec('create table school_teacher_assignments(institution_id uuid,class_id uuid,school_user_id uuid,subject text,active boolean,can_enter_marks boolean)');
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261115092000_teacher_assigned_exam_marks.sql'),'utf8'));
 for(const name of [
  '20261111092219_avoid_rewriting_unchanged_school_profiles_workspace_links.sql',
  '20261113035818_page5_reduce_workspace_pull_jsonb_rebuilds.sql',
  ...fs.readdirSync(path.join(__dirname,'../supabase/migrations')).filter(name=>name.endsWith('_workspace_academic_streams.sql')),
  '20261119152000_preserve_unchanged_workspace_attendance.sql'
 ]) await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',name),'utf8'));
 await db.exec('set role authenticated');
 result=await pull();
 projection.fees[0].amountRupees=80.10;
 projection.classes.push(
  {localId:'science',name:'11',section:'A',academicYear:'2026',academicStream:'Science'},
  {localId:'commerce',name:'11',section:'A',academicYear:'2026',academicStream:'Commerce'}
 );
 projection.students.push(
  {localId:'science-student',admissionNumber:'SCI',name:'Science Student',classLocalId:'science',profile:{details:{academicStream:'Science'}}},
  {localId:'commerce-student',admissionNumber:'COM',name:'Commerce Student',classLocalId:'commerce',profile:{details:{academicStream:'Commerce'}}}
 );
 result=await push(result.revision);
 const streamLinks=async()=>(await db.query("select admission_number,class_id::text from school_students where admission_number in ('SCI','COM') order by admission_number")).rows;
 const originalLinks=await streamLinks();
 assert.equal(new Set(originalLinks.map(s=>s.class_id)).size,2);
 assert.deepEqual(result.snapshot.operations.classes.filter(c=>c.name==='11').map(c=>c.academicStream).sort(),['Commerce','Science']);
 // A client using the old payload shape must retain the cloud stream on a linked row.
 delete projection.classes.at(-1).academicStream;
 result=await push(result.revision);
 assert.deepEqual(await streamLinks(),originalLinks);
 assert.equal(result.snapshot.students.find(s=>s.admissionNumber==='COM').academicStream,'Commerce');
 const wrongStream=structuredClone(projection);
 wrongStream.students.at(-1).classLocalId='science';
 await assert.rejects(push(result.revision,wrongStream),/academic stream/i);
 assert.equal((await pull()).revision,result.revision);
 // Exercise the deployed marks read permissions and draft writes against the separated classes.
 const scienceId=originalLinks.find(row=>row.admission_number==='SCI').class_id;
 const commerceId=originalLinks.find(row=>row.admission_number==='COM').class_id;
 const ids=(await db.query("select admission_number,id from school_students where admission_number in ('SCI','COM')")).rows;
 const scienceStudent=ids.find(row=>row.admission_number==='SCI').id;
 const commerceStudent=ids.find(row=>row.admission_number==='COM').id;
 projection.students.push({localId:'science-two',admissionNumber:'SCI2',name:'Second Science Student',classLocalId:'science',profile:{details:{academicStream:'Science'}}});
 snapshot.operations.exams.push({id:'term-11',name:'Term 11',className:'11',section:'A',academicYear:'2026',academicStream:'Science',subjects:[{name:'Math',maximumMarks:100}]});
 result=await push(result.revision);
 const otherScienceStudent=(await db.query("select id from school_students where admission_number='SCI2'")).rows[0].id;
 await db.exec(`reset role;
 create or replace function school_private.teacher_can(i uuid,c uuid,a text,s text) returns boolean language sql stable as
 $$select auth.uid()='${teacher}'::uuid and i='${school}'::uuid and c='${scienceId}'::uuid and a='marks.write' and s='Math'$$;`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261116072400_teacher_batch_exam_marks.sql'),'utf8'));
 // PGlite lacks pgcrypto here. Use deterministic fixture functions to exercise
 // the SQL scoping, cardinality and response shape. Hosted crypto is unchanged.
 await db.exec(`create schema extensions;
 create function extensions.gen_random_bytes(integer) returns bytea language sql as $$select decode(repeat('c1',$1),'hex')$$;
 create function extensions.digest(bytea,text) returns bytea language sql as $$select sha256($1)$$;
 create function extensions.hmac(bytea,bytea,text) returns bytea language sql as $$select sha256($1||$2)$$;`);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261115085000_sign_supabase_student_id_cards.sql'),'utf8'));
 for(const filename of fs.readdirSync(path.join(__dirname,'../supabase/migrations')).filter(name=>name.endsWith('_clear_teacher_marks_and_verify_stream.sql')))
  await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',filename),'utf8'));
 await db.exec('set role authenticated');
 await as(teacher);
 const examRoster=async classId=>(await db.query("select student_id from bn_teacher_exam_marks($1,$2) where exam_id='term-11' order by student_id",[school,classId])).rows.map(row=>row.student_id);
 assert.deepEqual(await examRoster(scienceId),[scienceStudent,otherScienceStudent].sort());
 assert.deepEqual(await examRoster(commerceId),[]);
 const batch=async (classId,marks)=>(await db.query("select bn_teacher_save_exam_marks_batch($1,$2,'term-11','Math',$3::jsonb) result",[school,classId,JSON.stringify(marks)])).rows[0].result;
 const one={student_id:scienceStudent,obtained:61,expected:null};
 const two={student_id:otherScienceStudent,obtained:79,expected:null};
 const outside={student_id:commerceStudent,obtained:88,expected:null};
 await assert.rejects(batch(commerceId,[outside]),/active class and subject assignment/);
 await assert.rejects(batch(scienceId,[one,one]),/duplicate mark entries/);
 const outcomes=Object.fromEntries((await batch(scienceId,[one,two,outside])).map(row=>[row.student_id,row]));
 assert.equal(outcomes[scienceStudent].obtained,61);
 assert.equal(outcomes[otherScienceStudent].obtained,79);
 assert.match(outcomes[commerceStudent].error,/unavailable/);
 const [stale]=await batch(scienceId,[{...one,obtained:90}]);
 assert.match(stale.error,/changed/);
 const [retry]=await batch(scienceId,[one]);
 assert.equal(retry.obtained,61);
 await as(admin);
 const afterBatch=await pull();
 assert.equal(afterBatch.revision,result.revision+1,'only one workspace write for two marks, with idempotent retry');
 assert.deepEqual(afterBatch.snapshot.operations.marks.filter(m=>m.examId==='term-11').map(m=>m.obtainedMarks).sort(),[61,79]);
 // An admin payload captured before the teacher save must fail atomically.
 const cards=(await db.query('select * from bn_issue_student_card_signatures($1)',[school])).rows;
 const scienceCard=cards.find(card=>card.admission_number==='SCI');
 const verify=async admission=>(await db.query('select bn_verify_student_card($1,$2,$3) result',[school,admission,scienceCard.signature])).rows[0].result;
 assert.equal((await verify('SCI')).student.academicStream,'Science');
 assert.equal((await verify('COM')).verified,false);
 // A legacy database with duplicate admission numbers must still verify
 // only the student whose immutable ID matches the QR signature.
 await db.exec('reset role');
 await db.exec('alter table school_students drop constraint school_students_institution_id_admission_number_key');
 await db.query("insert into school_students(institution_id,class_id,admission_number,name) values($1,$2,'SCI','Legacy duplicate')",[school,commerceId]);
 await db.exec('set role authenticated');
 assert.equal((await verify('SCI')).student.name,'Science Student');

 await assert.rejects(push(result.revision),/revision conflict/i);
 assert.deepEqual((await pull()).snapshot.operations.marks.filter(m=>m.examId==='term-11').map(m=>m.obtainedMarks).sort(),[61,79]);
 const beforeClear=await pull();
 await as(teacher);
 await assert.rejects(batch(scienceId,[{student_id:scienceStudent,expected:61}]),/invalid or duplicate/i);
 const [staleClear]=await batch(scienceId,[{student_id:scienceStudent,expected:60,obtained:null}]);
 assert.match(staleClear.error,/changed/);
 const [cleared]=await batch(scienceId,[{student_id:scienceStudent,expected:61,obtained:null}]);
 assert.equal(cleared.error,null);
 assert.equal(cleared.obtained,null);
 const [clearedAgain]=await batch(scienceId,[{student_id:scienceStudent,expected:61,obtained:null}]);
 assert.equal(clearedAgain.error,null);
 const [zero]=await batch(scienceId,[{student_id:scienceStudent,expected:null,obtained:0}]);
 assert.equal(zero.obtained,0);
 await as(admin);
 const afterClears=await pull();
 assert.equal(afterClears.revision,beforeClear.revision+2);
 assert.deepEqual(afterClears.snapshot.operations.marks.filter(m=>m.examId==='term-11').map(m=>m.obtainedMarks).sort(),[0,79]);

 // Exercise both portal writers against the same workspace revision and attendance record.
 await db.exec('reset role');
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261119151000_class_attendance_compare_and_save.sql'),'utf8'));
 await db.exec('set role authenticated');
 await as(teacher);
 const teacherMembership='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
 const attendanceDay='2026-11-04';
 await db.query('select bn_save_class_attendance($1,$2,$3,$4,$5)',[school,scienceId,attendanceDay,teacherMembership,
  JSON.stringify([{student_id:scienceStudent,status:'absent',expected:null}])]);
 await as(admin);
 await assert.rejects(push(afterClears.revision),/revision conflict/i,
  'an ERP revision captured before the Teacher App save must fail closed');
 const afterTeacher=await pull();
 const mark=async()=>(await db.query('select id,status,recorded_by,updated_at::text from school_attendance where student_id=$1 and day=$2',[scienceStudent,attendanceDay])).rows[0];
 const savedByTeacher=await mark();
 assert.equal(savedByTeacher.recorded_by,teacherMembership);
 const attendanceEdit={localId:'cloud:'+savedByTeacher.id,studentLocalId:'science-student',classLocalId:'science',day:attendanceDay,status:'absent'};
 projection.attendance.push(attendanceEdit);
 snapshot.institution.institution.name='Updated after teacher attendance';
 const unrelatedSave=await push(afterTeacher.revision);
 assert.equal(unrelatedSave.school.name,'Updated after teacher attendance');
 assert.deepEqual(await mark(),savedByTeacher,'an unrelated ERP save must preserve the attendance recorder and time');
 attendanceEdit.status='excused';
 await push(unrelatedSave.revision);
 assert.equal((await mark()).status,'excused','an intentional ERP attendance correction still saves');
 assert.equal((await mark()).recorded_by,user);
 await as(teacher);
 await assert.rejects(
  db.query('select bn_save_class_attendance($1,$2,$3,$4,$5)',[school,scienceId,attendanceDay,teacherMembership,
   JSON.stringify([{student_id:scienceStudent,status:'late',expected:'absent'}])]),
  error=>error.code==='PT409','a stale Teacher App correction must preserve the newer ERP mark'
 );
 assert.equal((await mark()).status,'excused');

 await db.exec("select set_config('request.jwt.claim.sub','cccccccc-cccc-cccc-cccc-cccccccccccc',false)");
 await assert.rejects(pull(),/administrator required/); assert.equal((await db.query('select * from school_workspaces')).rows.length,0);
 await db.close(); console.log('workspace database: migration and behavioral assertions passed (isolated PGlite fixture)');
})().catch(e=>{console.error(e);process.exitCode=1});
