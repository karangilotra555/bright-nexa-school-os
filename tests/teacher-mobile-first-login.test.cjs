'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
test('Teacher first login uses admin-provisioned mobile credential and requires private replacement',()=>{
 const server=read('supabase/functions/school-invite-staff/index.ts');
 assert.match(server,/role==="teacher"&&facultyProfile/);
 assert.match(server,/password:facultyProfile\.mobile!/);
 assert.match(server,/email_confirm:true/);
 assert.match(server,/bn_teacher_mobile_pending:true/);
 assert.match(server,/action==="initial_mobile_password"/);
 assert.match(server,/action==="complete_teacher_mobile_password"/);
 assert.match(server,/user\.last_sign_in_at\|\|user\.email_confirmed_at/);
 assert.match(server,/Active Teacher App membership required/);
 assert.match(server,/Choose a new password different from your mobile number/);
 assert.match(server,/bn_teacher_mobile_pending:false/);
 assert.match(server,/signOut\(match\[1\],"global"\)/);
});
test('Teacher mobile first-login UI is single gate before data load',()=>{
 const script=read('teacher-access.js'),html=read('teacher-access.html');
 assert.equal(script,read('docs/teacher-access.js'));
 assert.equal(html,read('docs/teacher-access.html'));
 assert.doesNotThrow(()=>new Function(script));
 for(const marker of ['id="teacherFirstPasswordPanel"','id="teacherFirstPasswordForm"','id="teacherFirstNewPassword"','id="teacherFirstConfirmPassword"'])
   assert.ok(html.includes(marker),marker);
 assert.match(script,/if\(identity\.app_metadata\?\.bn_teacher_mobile_pending===true\)/);
 assert.match(script,/showAuthView\('teacher-first-password'\)/);
 assert.match(script,/action:'complete_teacher_mobile_password'/);
 assert.match(script,/action:'initial_mobile_password'/);
});
test('Student and Parent retain a single shared admission login',()=>{
 assert.match(read('parents.html'),/Student & Parent Login/);
 assert.match(read('parents.html'),/Student admission number/);
 assert.match(read('parents.html'),/10-digit registered guardian mobile number as password/);
 assert.match(read('student-portal.html'),/Shared Student & Parent Portal Redirect/);
 assert.match(read('supabase/functions/school-student-login/index.ts'),/guardian_phone/);
});
