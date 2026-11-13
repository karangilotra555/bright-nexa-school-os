'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('admin can see verified teacher and parent onboarding readiness rather than invented app success',()=>{
 const html=read('teacher-access.html'),s=read('teacher-access.js');
 assert.match(html,/id="mobileReadinessStatus"/);
 assert.match(html,/id="mobileReadinessPanel"/);
 assert.match(s,/async function renderMobileReadiness\(\)/);
 assert.match(s,/api\('school_student_profiles',query\(\{select:'student_id,guardian_phone,guardian_email'/);
 assert.match(s,/api\('school_guardian_students',query\(\{select:'student_id'/);
 assert.match(s,/No active teacher with class attendance\/homework rights/);
 assert.match(s,/if\(me\?\.institution_id!==schoolId\)return;/);
 assert.match(s,/renderAdmin\(\);await renderMobileReadiness\(\)/);
 assert.equal(html,read('docs/teacher-access.html'));
 assert.equal(s,read('docs/teacher-access.js'));
});
test('unactivated teacher cannot be assigned, and duplicate test admissions are blocked',()=>{
 const html=read('teacher-access.html'),s=read('teacher-access.js');
 assert.match(s,/s\.role==='teacher'&&s\.status==='active'/);
 assert.match(s,/whose Teacher App account is active/);
 assert.match(html,/id="studentForm" class="formgrid hidden" aria-hidden="true"/);
 assert.match(html,/Student records have one entry point/);
 assert.match(s,/This old test-student form is disabled to prevent duplicate records/);
 assert.match(html,/href="\.\/index\.html\?openSchool=true&amp;tab=Students"/);
});
test('student activation is not silently bypassed by creating fake guardian links',()=>{
 const s=read('supabase/functions/school-student-login/index.ts');
 assert.match(s,/if\(!pending\)await linkUser\(user,s\)/);
 assert.match(s,/links:pending\?\[\]:/);
 assert.match(s,/bn_password_pending:true/);
 assert.match(read('parents-cloud.js'),/action:'login'/);
});
