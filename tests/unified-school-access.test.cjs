'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('one real school login from the public entry without a sample bypass',()=>{
 for(const file of ['index.html','docs/index.html','teacher-access.html','docs/teacher-access.html']){
  const html=read(file);
  assert.ok(html.includes('id="loginForm"'),file);
  assert.ok(html.includes('id="smartToolsCard" class="panel hidden"'),file);
  assert.ok(!html.includes('id="ownerDemoLink"'),file);
  assert.ok(!html.includes('Preview features (sample)'),file);
  assert.ok(!html.includes('href="./school-preview.html"'),file);
  assert.ok(!html.includes('href="./smart-tools.html" class="light"'),file);
  assert.ok(html.includes('teacher-access.js'),file);
 }
 assert.equal(read('index.html'),read('docs/index.html'));
 assert.equal(read('teacher-access.html'),read('docs/teacher-access.html'));
 assert.equal(read('teacher-access.js'),read('docs/teacher-access.js'));
});
test('teacher login does not expose fictional sample or owner preview route',()=>{
 const code=read('teacher-access.js'),login=read('teacher-access.html');
 const access=read('smart-tools-access.js'),smart=read('smart-tools.html');
 assert.ok(!code.includes('ownerDemoLink'));
 assert.ok(!login.includes('ownerDemoLink'));
 assert.ok(!login.includes('Try demo:'));
 assert.ok(!login.includes('ID <code>demo</code>'));
 assert.ok(!access.includes('DEMO_KEY'));
 assert.ok(!access.includes('SAMPLE MODE'));
 for(const s of ['sampleTimetable','sampleMarks','importSample','sampleErrors'])assert.ok(!smart.includes('id="'+s+'"'));
 assert.match(code,/token\\?grant_type=password/);
 assert.ok(!/SUPABASE_SERVICE_ROLE_KEY|sb_secret_/.test(code));
 assert.doesNotThrow(()=>new Function(code));
});
test('school owner self-registration is visible and can only provision through verified RPC',()=>{
 for(const file of ['index.html','docs/index.html','teacher-access.html','docs/teacher-access.html']){
   const html=read(file);
   for(const marker of ['toggleSchoolRegistration','registerSchoolForm','newSchoolForm','signupOwnerEmail','signupOwnerPassword','newSchoolName']){
     assert.ok(html.includes('id="'+marker+'"'),file+' missing '+marker);
   }
 }
 const script=read('teacher-access.js');
 assert.ok(script.includes('signup?redirect_to='));
 assert.ok(script.includes('rpc/register_first_school'));
 assert.ok(script.includes('PENDING_SCHOOL'));
 assert.ok(script.includes("display('registrationSection',true)"));
 assert.doesNotThrow(()=>new Function(script));
 const migration=read('supabase/migrations/20261023064331_verified_first_school_self_registration.sql');
 assert.ok(migration.includes('email_confirmed_at is not null'));
 assert.ok(migration.includes('pg_advisory_xact_lock'));
 assert.ok(migration.includes("values(v_school, v_actor, v_email, 'school_admin', 'active')"));
 assert.ok(migration.includes('revoke all on function public.register_first_school(text) from public, anon, authenticated'));
 assert.ok(migration.includes('grant execute on function public.register_first_school(text) to authenticated'));
});
test('retired demo opens owner workspace while preview returns to secure login',()=>{
 for(const p of ['school-demo.html','docs/school-demo.html']){
  const html=read(p);assert.ok(html.includes('real-owner-workspace.html'));assert.ok(!html.includes('index-brightnexa-v2.js'));
 }
 for(const p of ['school-preview.html','docs/school-preview.html']){
  const html=read(p);assert.ok(html.includes('./index.html'));assert.ok(!html.includes('index-brightnexa-v2.js'));
 }
 const login=read('teacher-access.js');
 assert.ok(login.includes("id.toLowerCase()==='yrskaran'"));
 assert.ok(login.includes('token?grant_type=password'));
 assert.ok(!login.includes("if(id==='demo' && password==='demo')"));
 for(const p of ['index.html','docs/index.html'])assert.ok(!read(p).includes('ID <code>demo</code> · Password <code>demo</code>'));
});
test('old service workers are cleaned up without erasing persisted school records',()=>{
 const code=read('entry-sw-reset.js');
 assert.ok(code.includes('getRegistrations'));
 assert.ok(code.includes('unregister()'));
 assert.ok(!code.includes('localStorage.clear'));
 assert.ok(!code.includes('indexedDB.deleteDatabase'));
 assert.doesNotThrow(()=>new Function(code));
 assert.equal(code,read('docs/entry-sw-reset.js'));
});
