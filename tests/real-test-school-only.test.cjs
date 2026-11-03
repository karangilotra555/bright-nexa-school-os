'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('legacy fake school logins and dashboard entry are retired, storage untouched',()=>{
 for(const [root,mirror] of [['index.html','docs/index.html'],
   ['teacher-access.html','docs/teacher-access.html'],['school-demo.html','docs/school-demo.html'],
   ['school-preview.html','docs/school-preview.html'],['teacher-access.js','docs/teacher-access.js']]){
   assert.equal(read(root),read(mirror));
 }
 const login=read('teacher-access.js');
 assert.doesNotMatch(login,/id==='demo'|window\.location\.assign\('\.\/school-demo\.html'\)/);
 assert.match(login,/token\?grant_type=password/);
 assert.match(login,/rpc\/register_first_school/);
 for(const p of ['index.html','teacher-access.html']){
   const html=read(p);
   assert.doesNotMatch(html,/id="ownerDemoLink"|ID <code>demo<\/code>|Separate sample mode:/);
   assert.match(html,/Create School \(New Owner\)/);
   assert.match(html,/cloudOperationsLink/);
 }
 const legacy=read('school-demo.html');
 assert.match(legacy,/Legacy browser-only demo retired/);
 assert.doesNotMatch(legacy,/index-brightnexa|demo-qa-fixes|localStorage\.clear|indexedDB\.deleteDatabase/);
 assert.match(legacy,/not been deleted/);
});
test('real school staff data stored in RLS Supabase, no local fake data',()=>{
 const html=read('school-operations.html');
 const js=read('real-school-staff.js');
 assert.equal(html,read('docs/school-operations.html'));
 assert.equal(js,read('docs/real-school-staff.js'));
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.match(html,/real-school-staff\.js/);
 for(const id of ['staffProfileForm','staffProfileUser','staffEmploymentType','staffContractFields',
  'staffPartTimeFields','staffVisitingFields','staffDirectoryRows','staffAttendanceForm',
  'staffAttendanceMember','staffAttendanceStatus','attendanceReportSection','reportMonth',
  'studentReportRows','staffReportRows'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(js,/school_staff_profiles/);
 assert.match(js,/school_staff_attendance/);
 assert.match(js,/school_students/);
 assert.match(js,/school_attendance/);
 assert.match(js,/school_teacher_assignments/);
 assert.match(js,/status==='active'/);
 assert.match(js,/Not marked/);
 assert.doesNotMatch(js,/localStorage|service_role|sb_secret_|fakeSchool|Math\.random/);
});
test('staff RLS tables enforce tenant identity and role, never public browser-wide access',()=>{
 const sql=read('supabase/migrations/20261103171947_real_test_school_staff_profiles_and_attendance.sql');
 for(const table of ['school_staff_profiles','school_staff_attendance']){
  assert.match(sql,new RegExp('CREATE TABLE public\\.'+table));
  assert.match(sql,new RegExp('ALTER TABLE public\\.'+table+' ENABLE ROW LEVEL SECURITY'));
  assert.match(sql,new RegExp('ALTER TABLE public\\.'+table+' FORCE ROW LEVEL SECURITY'));
  assert.match(sql,new RegExp('REVOKE ALL ON public\\.'+table+' FROM PUBLIC, anon, authenticated'));
 }
 assert.match(sql,/FOREIGN KEY \(recorded_by,institution_id\)/);
 assert.match(sql,/FOREIGN KEY \(school_user_id,institution_id\)/);
 assert.match(sql,/school_private\.has_role/);
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/UNIQUE \(school_user_id,day\)/);
 assert.doesNotMatch(sql,/GRANT .* TO anon/);
});
