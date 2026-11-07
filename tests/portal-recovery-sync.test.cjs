'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=pathName=>fs.readFileSync(path.join(__dirname,'..',pathName),'utf8');

test('Staff login supports password reset email and secure recovery callback',()=>{
 const html=read('teacher-access.html'),js=read('teacher-access.js');
 assert.equal(html,read('docs/teacher-access.html'),'Staff login must be identical on Render and Pages');
 assert.equal(js,read('docs/teacher-access.js'),'Staff login implementation must be mirrored');
 assert.match(html,/id="forgotPasswordLink"/);
 assert.match(html,/id="forgotPasswordForm"/);
 assert.match(html,/id="forgotEmail"[^>]+type="email"/);
 assert.match(js,/auth\\/v1\\/recover\\?redirect_to/);
 assert.match(js,/encodeURIComponent\\(redirect\\.href\\)/);
 assert.match(js,/recoveryMode=hash\\.get\\('type'\\)==='recovery'/);
 assert.match(js,/dropSession\\(\\);[\\s\\S]*?Password reset successfully/);
 assert.match(js,/If this email is registered/);
 assert.doesNotMatch(js,/console\\.(log|debug)\\([^\\n]*(password|token|secret)/i);
 assert.doesNotThrow(()=>new Function(js));
});

test('Parent portal has one Supabase-backed implementation on Render and Pages',()=>{
 const root=read('parents.html'),docs=read('docs/parents.html');
 assert.equal(root,docs,'Legacy SQLite DOB login must not be a second active parent portal');
 assert.equal(read('parents-cloud.js'),read('docs/parents-cloud.js'));
 assert.equal(read('school-attendance-calendar.js'),read('docs/school-attendance-calendar.js'));
 for(const file of ['school-student-profile.js','school-homework-files.js','school-mobile-details.css']){
   assert.ok(fs.existsSync(path.join(__dirname,'..',file)));
 }
 assert.match(root,/id="studentProfileSections"/);
 assert.match(root,/parents-cloud\\.js/);
 assert.match(root,/school-student-profile\\.js/);
 assert.match(root,/school-attendance-calendar\\.js/);
 assert.doesNotMatch(root,/fetch\\(['"]\\/api\\/auth\\/login/,'Parent login may not use legacy SQLite portal credentials');
 const client=require('../parents-cloud.js');
 assert.equal(typeof client.create,'function');
});

test('Teacher mobile attendance remains scoped to assigned classes',()=>{
 const code=read('teacher-access.js');
 assert.match(code,/writableClasses\\('can_take_attendance'\\)/);
 assert.match(code,/allAssignments\\.some\\(a=>a\\.school_user_id===me\\.id&&a\\.class_id===c\\.id&&a\\.active&&a\\[action\\]\\)/);
 assert.match(code,/if\\(selects\\.some\\(s=>!\\['present','absent','late','excused'\\]\\.includes\\(s\\.value\\)\\)\\)/);
 const sql=read('supabase/migrations/20261022_fix_teacher_rls_correlated_tenant_checks.sql');
 assert.match(sql,/teacher_can\\(/);
 assert.match(sql,/attendance\\.write/);
});
