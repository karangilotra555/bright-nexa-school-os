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
 await db.exec(`insert into school_fee_entries(institution_id,student_id,kind,amount_rupees,description,created_by) select '${school}',id,'charge',5,'External ledger','${user}' from school_students where admission_number='A2'`);
 await assert.rejects(pull(),/Fee reconciliation required/);
 result.revision=Number((await db.query('select revision from school_workspaces')).rows[0].revision); projection.fees.push({localId:'f2',studentLocalId:'s2',kind:'charge',amountRupees:50});
 await assert.rejects(push(result.revision),/Existing fee ledger requires reconciliation/);
 assert.equal(Number((await db.query('select revision from school_workspaces')).rows[0].revision),result.revision,'ledger rejection is atomic');
 await db.exec("select set_config('request.jwt.claim.sub','cccccccc-cccc-cccc-cccc-cccccccccccc',false)");
 await assert.rejects(pull(),/administrator required/); assert.equal((await db.query('select * from school_workspaces')).rows.length,0);
 await db.close(); console.log('workspace database: migration and behavioral assertions passed (isolated PGlite fixture)');
})().catch(e=>{console.error(e);process.exitCode=1});
