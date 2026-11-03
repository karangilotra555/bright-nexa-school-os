'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('real owner home and same-domain module routing published from docs',()=>{
 const html=read('docs/school-operations.html');
 const js=read('docs/school-owner-dashboard-v1.js');
 assert.equal(html,read('school-operations.html'));
 assert.equal(js,read('school-owner-dashboard-v1.js'));
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.match(html,/school-owner-dashboard-v1\.js\?v=20261103-owner1/);
 assert.match(html,/id="opsMainNav"/);
 assert.match(html,/id="ownerDashboard" data-ops-panel="home"/);
 for(const id of ['ownerDashboardHeading','ownerStatClasses','ownerStatStudents','ownerStatTeachers','ownerStatHousekeeping'])
   assert.match(html,new RegExp('id="'+id+'"'));
 for(const [name,id] of [
  ['students','admissionsSection'],['staff','staffSection'],['attendance','attendanceReportSection'],
  ['fees','financeSection'],['parents','guardianSection'],['notices','noticeSection'],['leaves','leavesSection']]){
   assert.match(html,new RegExp('id="'+id+'" data-ops-panel="'+name+'"[^>]*ops-collapsed'));
   assert.match(html,new RegExp('data-ops-open="'+name+'"'));
 }
 assert.match(html,/\.ops-collapsed\{display:none!important\}/);
 assert.match(html,/href="\.\/index\.html\?view=roles"/);
 assert.match(html,/href="\.\/index\.html\?view=attendance"/);
 assert.match(html,/href="\.\/index\.html\?view=homework"/);
 assert.match(js,/loaded=admissionCount\.match\(\/of \(\\d\+\) loaded\//);
 assert.match(js,/row\.cells\[1\]\.textContent/);
 assert.match(js,/panel\.classList\.contains\('hidden'\)/);
 assert.doesNotMatch(js,/localStorage\.|service_role|sb_secret_|Math\.random/);
});
test('verified school admin login opens owner homepage except explicit roles and attendance routes',()=>{
 const js=read('teacher-access.js');
 assert.equal(js,read('docs/teacher-access.js'));
 assert.match(js,/window\.location\.replace\('\.\/school-operations\.html'\)/);
 assert.match(js,/const stayOnAccess=\['roles','attendance','homework','classes'\]\.includes\(requested\)/);
 assert.match(js,/requested==='roles'&&isAdmin\(\)\?'admin'/);
 assert.match(js,/requested==='attendance'&&canAcademic\(\)\?'attendance'/);
 assert.match(js,/requested==='homework'&&canAcademic\(\)\?'homework'/);
 assert.match(js,/rpc\/claim_prepared_test_school/);
 assert.doesNotMatch(js,/if\(id==='demo'/);
});
