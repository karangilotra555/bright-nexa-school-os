'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('verified Supabase owner auto claims prepared TEST school; no bypass via email/phone alone',()=>{
 const js=read('teacher-access.js');
 assert.equal(js,read('docs/teacher-access.js'));
 assert.match(js,/rpc\/claim_prepared_test_school/);
 assert.match(js,/if\(claimed\)\{\s*await load\(\);\s*return;\s*\}/);
 assert.match(js,/auth\/v1\/user/);
 assert.match(js,/auth_user_id:eq\(identity\.id\)/);
 assert.doesNotMatch(js,/if\(id==='demo'|LOCAL_DEMO_KEY|school-demo\.html/);
 const sql=read('supabase/migrations/20261103174108_prepared_test_school_claim_and_staff_directory.sql');
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.claim_prepared_test_school/);
 assert.match(sql,/email_confirmed_at IS NOT NULL/);
 assert.match(sql,/c\.owner_email=v_email/);
 assert.match(sql,/c\.expires_at>now\(\)/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/SET search_path=''/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.claim_prepared_test_school\(\) FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.claim_prepared_test_school\(\) TO authenticated/);
});
test('staff directory includes uninvited teachers AND housekeeping, safely separate from login privileges',()=>{
 const html=read('docs/school-operations.html');
 const js=read('docs/real-school-staff.js');
 assert.equal(html,read('school-operations.html'));
 assert.equal(js,read('real-school-staff.js'));
 assert.doesNotThrow(()=>new vm.Script(js));
 for(const id of ['staffProfileUser','staffCategory','staffContactEmail','staffContactMobile','staffAttendanceMember','staffAttendanceDate','staffDirectoryRows','staffReportRows']){
  assert.ok(html.includes('id="'+id+'"'),id+' missing');
 }
 assert.match(html,/Housekeeping \(no school data login\)/);
 assert.match(js,/const directory=\(\)=>profiles/);
 assert.match(js,/school_staff_profiles/);
 assert.match(js,/school_staff_directory_attendance/);
 assert.match(js,/staff_profile_id/);
 assert.match(js,/school_teacher_assignments/);
 assert.match(js,/Directory only · invitation pending/);
 assert.match(js,/recorded_by:me\.id/);
 assert.match(js,/Not marked/);
 assert.doesNotMatch(js,/service_role|sb_secret_|localStorage\.setItem|Math\.random/);
});
test('private pending-owner and staff RLS; no anonymous directory or account bypass',()=>{
 const sql=read('supabase/migrations/20261103174108_prepared_test_school_claim_and_staff_directory.sql');
 for(const table of ['school_staff_directory_attendance','school_contact_profiles']){
  assert.match(sql,new RegExp('ALTER TABLE public\\.'+table+' ENABLE ROW LEVEL SECURITY'));
  assert.match(sql,new RegExp('ALTER TABLE public\\.'+table+' FORCE ROW LEVEL SECURITY'));
  assert.match(sql,new RegExp('REVOKE ALL ON public\\.'+table+' FROM PUBLIC'));
 }
 assert.match(sql,/REVOKE ALL ON school_private\.prepared_test_school_claims/);
 assert.match(sql,/FOREIGN KEY \(staff_profile_id,institution_id\)/);
 assert.match(sql,/school_private\.has_role/);
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/school_staff_profiles ALTER COLUMN school_user_id DROP NOT NULL/);
 assert.match(sql,/NEW\.role = 'teacher'/);
});
