'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('production cloud portal sources mirror published static files and parse',()=>{
 for(const p of ['index.html','teacher-access.js','parents-cloud.html','parents-cloud.js','school-operations.html','school-operations.js']){
   assert.equal(read(p),read('docs/'+p),'Static mirror differs: '+p);
 }
 for(const p of ['teacher-access.js','parents-cloud.js','school-operations.js']){
   assert.doesNotThrow(()=>new Function(read(p)),p+' syntax error');
   assert.doesNotMatch(read(p),/sb_secret_|SUPABASE_SERVICE_ROLE_KEY|postgres:\/\/|service_role.*eyJ/);
 }
 const school=read('index.html');
 assert.match(school,/parents-cloud\.html/);
 assert.match(school,/school-operations\.html/);
 assert.match(read('teacher-access.js'),/display\('cloudOperationsLink',\['school_admin','principal','accountant'\]/);
});

test('attendance never treats an unmarked student as automatically present',()=>{
 const code=read('teacher-access.js');
 assert.match(code,/blank=dom\('option','Not marked'\)/);
 assert.match(code,/blank\.value=''/);
 assert.match(code,/marked=selects\.filter\(s=>\['present','absent','late','excused'\]\.includes\(s\.value\)\)/);
 assert.match(code,/No attendance marked/);
 assert.match(code,/marked\.map\(s=>\(\{student_id/);
 assert.doesNotMatch(code,/\?\.status\|\|'present'/);
 assert.doesNotMatch(code,/records=selects\.map\(s=>\(\{student_id/);
 assert.match(code,/writableClasses\('can_take_attendance'\)/);
});

test('guardian DB migration is RLS-first, tenant aware and revocable',()=>{
 const sql=read('supabase/migrations/20261103122628_verified_guardian_fees_and_parent_cloud.sql');
 for(const table of ['school_guardians','school_guardian_students','school_fee_entries','school_notices','school_parent_leaves']){
   assert.match(sql,new RegExp('CREATE TABLE public\\.'+table+'\\b'));
   assert.match(sql,new RegExp('ALTER TABLE public\\.'+table+' ENABLE ROW LEVEL SECURITY'));
   assert.match(sql,new RegExp('ALTER TABLE public\\.'+table+' FORCE ROW LEVEL SECURITY'));
 }
 assert.match(sql,/FOREIGN KEY \(student_id,institution_id\)/);
 assert.match(sql,/FOREIGN KEY \(guardian_id,institution_id\)/);
 assert.match(sql,/FOREIGN KEY \(created_by,institution_id\)/);
 assert.match(sql,/CREATE POLICY school_parent_student_read/);
 assert.match(sql,/CREATE POLICY school_parent_attendance_read/);
 assert.match(sql,/CREATE POLICY school_parent_homework_read/);
 assert.match(sql,/school_private\.parent_of/);
 assert.match(sql,/p_student_id uuid,p_email text/);
 assert.match(sql,/email_confirmed_at IS NOT NULL/);
 assert.match(sql,/school_unlink_guardian/);
 assert.match(sql,/REVOKE ALL ON TABLE/);
 assert.match(sql,/REFERENCES auth\.users\(id\)/);
 assert.doesNotMatch(sql,/CREATE POLICY [^;]* ON public\.school_guardians FOR INSERT/);
 assert.doesNotMatch(sql,/CREATE POLICY [^;]* ON public\.school_fee_entries FOR UPDATE/);
 assert.doesNotMatch(sql,/CREATE POLICY [^;]* ON public\.school_fee_entries FOR DELETE/);
});

test('parents cannot sign in with DOB or access data without verified linking',()=>{
 const html=read('parents-cloud.html'),js=read('parents-cloud.js');
 assert.match(html,/type="email"/);
 assert.match(html,/autocomplete="current-password"/);
 assert.doesNotMatch(html,/student admission number|date of birth login is for internal testing/i);
 assert.match(js,/school_guardians/);
 assert.match(js,/school_guardian_students/);
 assert.match(js,/Awaiting school approval|awaiting school approval|School administrator approval/);
 assert.match(js,/parent_auth_user_id:user\.id/);
 assert.match(js,/school_fee_entries/);
 assert.match(js,/school_parent_leaves/);
 assert.doesNotMatch(js,/localStorage\.|dob.*token|service_role/i);
});

test('staff-only operations require role checks and make fee ledger append-only',()=>{
 const js=read('school-operations.js'),html=read('school-operations.html');
 assert.match(js,/\['school_admin','principal','accountant'\]/);
 assert.match(js,/school_link_guardian/);
 assert.match(js,/school_unlink_guardian/);
 assert.match(js,/school_fee_entries/);
 assert.match(js,/school_parent_leaves/);
 assert.match(js,/school_notices/);
 assert.doesNotMatch(js,/school_fee_entries',\{\},'DELETE'/);
 assert.match(html,/Append-only ledger/);
});
