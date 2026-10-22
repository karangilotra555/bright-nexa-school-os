'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const portalUrl='https://bright-nexa-school-os.onrender.com/teacher-access.html';

test('teacher portal has cloud login, admin rights and school-class controls',()=>{
 const html=read('teacher-access.html'),js=read('teacher-access.js');
 assert.match(html,/id="loginForm"/);
 assert.match(html,/id="assignmentForm"/);
 assert.match(html,/id="inviteForm"/);
 assert.match(html,/id="attendanceClass"/);
 assert.match(html,/id="homeworkForm"/);
 assert.match(js,/school_teacher_assignments/);
 assert.match(js,/school_attendance/);
 assert.match(js,/school_homework/);
 assert.match(js,/school-invite-staff/);
 assert.match(js,/Authorization/);
 assert.match(js,/sessionStorage/);
 assert.doesNotMatch(js,/SUPABASE_SERVICE_ROLE_KEY|sb_secret_/);
 assert.doesNotThrow(()=>new Function(js));
});
test('GitHub Pages mirrors teacher login site',()=>{
 assert.equal(read('teacher-access.html'),read('docs/teacher-access.html'));
 assert.equal(read('teacher-access.js'),read('docs/teacher-access.js'));
});
test('School OS navigation opens actual cloud teacher portal',()=>{
 for(const file of ['parents-download-menu.js','docs/parents-download-menu.js']){
  const s=read(file);
  assert.ok(s.includes(portalUrl));
  assert.match(s,/bn-teacher-access-nav/);
  assert.match(s,/bn-teacher-access-top/);
  assert.doesNotThrow(()=>new Function(s));
 }
});
test('Supabase Edge only redirects and Render is the actual HTML host',()=>{
 const edge=read('supabase/functions/school-teacher-app/index.ts');
 assert.match(edge,/302/);
 assert.ok(edge.includes(portalUrl));
 assert.doesNotMatch(edge,/SUPABASE_SERVICE_ROLE_KEY|<!doctype html>/i);
 for(const name of ['teacher-access.html','docs/teacher-access.html']){
   const html=read(name);
   assert.match(html,/style-src 'self' 'unsafe-inline'/);
   assert.match(html,/teacher-access\.js/);
 }
});
test('staff invitation function verifies actual Auth identity and admin membership',()=>{
 const fn=read('supabase/functions/school-invite-staff/index.ts');
 assert.match(fn,/auth\.getUser\(match\[1\]\)/);
 assert.match(fn,/\.eq\("role", "school_admin"\)/);
 assert.match(fn,/\.eq\("status", "active"\)/);
 assert.match(fn,/inviteUserByEmail/);
 assert.match(fn,/redirectTo/);
 assert.doesNotMatch(fn, /serviceKey\s*=\s*["']eyJ/);
});
