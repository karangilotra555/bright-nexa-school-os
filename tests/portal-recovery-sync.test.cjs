'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('Staff login has email reset form and safe recovery handling',()=>{
 const html=read('teacher-access.html'),js=read('teacher-access.js');
 assert.equal(html,read('docs/teacher-access.html'));
 assert.equal(js,read('docs/teacher-access.js'));
 for(const id of ['forgotPasswordLink','forgotPasswordForm','forgotEmail','activationTitle']){
   assert.ok(html.includes('id="'+id+'"'),'Missing '+id);
 }
 assert.ok(js.includes("auth/v1/recover?redirect_to="));
 assert.ok(js.includes("encodeURIComponent(redirect.href)"));
 assert.ok(js.includes("recoveryMode=hash.get('type')==='recovery'"));
 assert.ok(js.includes("If this email is registered"));
 assert.ok(js.includes("Password reset successfully. Sign in with your new password."));
 assert.ok(!js.includes("SUPABASE_SERVICE_ROLE_KEY"));
 assert.doesNotThrow(()=>new Function(js));
});

test('Render and Pages serve the same Supabase-based student/parent portal',()=>{
 const html=read('parents.html');
 assert.equal(html,read('docs/parents.html'));
 assert.equal(read('parents-cloud.js'),read('docs/parents-cloud.js'));
 assert.equal(read('school-attendance-calendar.js'),read('docs/school-attendance-calendar.js'));
 for(const file of ['school-student-profile.js','school-homework-files.js','school-mobile-details.css']){
   assert.ok(fs.existsSync(path.join(__dirname,'..',file)),file);
 }
 assert.ok(html.includes('id="studentProfileSections"'));
 assert.ok(html.includes('parents-cloud.js'));
 assert.ok(html.includes('school-attendance-calendar.js'));
 assert.ok(!html.includes("fetch('/api/auth/login"),'Old SQLite parent login must be replaced');
 assert.equal(typeof require('../parents-cloud.js').create,'function');
});

test('Teacher app still gates attendance behind selected assignment',()=>{
 const js=read('teacher-access.js');
 assert.ok(js.includes("writableClasses('can_take_attendance')"));
 assert.ok(js.includes("allAssignments.some(a=>a.school_user_id===me.id&&a.class_id===c.id&&a.active&&a[action])"));
 assert.ok(js.includes("if(selects.some(s=>!['present','absent','late','excused'].includes(s.value)))"));
 const sql=read('supabase/migrations/20261022_fix_teacher_rls_correlated_tenant_checks.sql');
 assert.ok(sql.includes('teacher_can'));
 assert.ok(sql.includes('attendance.write'));
});
