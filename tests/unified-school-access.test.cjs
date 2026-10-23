'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('one school login from the public entry, teacher alias and an admin-only sample',()=>{
 for(const file of ['index.html','docs/index.html','teacher-access.html','docs/teacher-access.html']){
  const html=read(file);
  assert.ok(html.includes('id="loginForm"'),file);
  assert.ok(html.includes('id="smartToolsCard" class="panel hidden"'),file);
  assert.ok(html.includes('id="ownerDemoLink" class="ghost hidden"'),file);
  assert.ok(!html.includes('Preview features (sample)'),file);
  assert.ok(!html.includes('href="./school-preview.html"'),file);
  assert.ok(!html.includes('href="./smart-tools.html" class="light"'),file);
  assert.ok(html.includes('teacher-access.js'),file);
 }
 assert.equal(read('index.html'),read('docs/index.html'));
 assert.equal(read('teacher-access.html'),read('docs/teacher-access.html'));
 assert.equal(read('teacher-access.js'),read('docs/teacher-access.js'));
});
test('teachers do not receive an owner sample dashboard from the shared login',()=>{
 const code=read('teacher-access.js');
 assert.ok(code.includes("display('ownerDemoLink',isAdmin())"));
 assert.ok(code.includes("display('ownerDemoLink',false)"));
 assert.ok(!/SUPABASE_SERVICE_ROLE_KEY|sb_secret_/.test(code));
 const sample=read('school-demo-gate.js');
 for(const marker of ['school_admin','school_users?','auth/v1/user','institutions?']){
  assert.ok(sample.includes(marker),'Required cloud authorisation: '+marker);
 }
 assert.ok(!/preview=|SUPABASE_SERVICE_ROLE_KEY|sb_secret_/.test(sample));
 assert.ok(sample.includes("sessionStorage.setItem('bright-nexa-school-os:demo-mode:v1','true')"),'Demo must be sandbox-isolated');
 assert.equal(sample,read('docs/school-demo-gate.js'));
 assert.equal(read('school-preview.html'),read('docs/school-preview.html'));
 assert.equal(read('school-demo.html'),read('docs/school-demo.html'));
 assert.doesNotThrow(()=>new Function(code));
 assert.doesNotThrow(()=>new Function(sample));
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
test('demo/demo enters only browser-isolated sample and never requests Supabase login',()=>{
  for(const path of ['index.html','docs/index.html','teacher-access.html','docs/teacher-access.html']){
    const html=read(path);
    assert.ok(html.includes('ID <code>demo</code> · Password <code>demo</code>'));
    assert.ok(html.includes('id="loginEmail"'));
    assert.ok(html.includes('minlength="4"'));
  }
  const login=read('teacher-access.js'),gate=read('school-demo-gate.js');
  assert.ok(login.includes("if(id==='demo' && password==='demo')"));
  assert.ok(login.includes("window.location.assign('./school-demo.html')"));
  assert.ok(gate.includes('const isLocalDemo=localDemoAccess()'));
  assert.ok(gate.includes("sessionStorage.setItem('bright-nexa-school-os:demo-mode:v1','true')"));
  assert.ok(gate.includes('if(!isLocalDemo && !await authorisedOwner())'));
  assert.ok(gate.includes('Exit demo'));
  assert.ok(gate.includes('MutationObserver'));
  assert.ok(gate.includes("script.src='./assets/index-brightnexa-v2.js"));
  assert.doesNotThrow(()=>new Function(login));
  assert.doesNotThrow(()=>new Function(gate));
  assert.equal(gate,read('docs/school-demo-gate.js'));
});
test('public feature preview is informational only and does not run the app',()=>{
 const html=read('school-preview.html');
 assert.ok(html.includes('READ-ONLY PRODUCT PREVIEW'));
 assert.ok(!/script src=|script type=|<button|<form/i.test(html));
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
