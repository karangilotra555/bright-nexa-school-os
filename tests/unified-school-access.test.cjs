'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('one school login from the public entry, dedicated teacher alias and private owner preview',()=>{
 for(const file of ['index.html','docs/index.html','teacher-access.html','docs/teacher-access.html']){
  const html=read(file);
  assert.match(html,/id="loginForm"/);
  assert.match(html,/school-preview\\.html/);
  assert.match(html,/id="ownerDemoLink" class="header-back hidden"/);
  assert.match(html,/teacher-access\\.js/);
 }
 assert.equal(read('index.html'),read('docs/index.html'));
 assert.equal(read('teacher-access.html'),read('docs/teacher-access.html'));
 assert.equal(read('teacher-access.js'),read('docs/teacher-access.js'));
});
test('only verified school admins are offered the old editable sample',()=>{
 const code=read('teacher-access.js');
 assert.match(code,/display\\('ownerDemoLink',isAdmin\\(\\)\\)/);
 assert.match(code,/display\\('ownerDemoLink',false\\)/);
 assert.doesNotMatch(code,/SUPABASE_SERVICE_ROLE_KEY|sb_secret_/);
 const sample=read('school-demo-gate.js');
 assert.match(sample,/school_admin/);
 assert.match(sample,/school_users\\?/);
 assert.match(sample,/auth\\/v1\\/user/);
 assert.match(sample,/institutions\\?/);
 assert.doesNotMatch(sample,/preview=|SUPABASE_SERVICE_ROLE_KEY|sb_secret_/);
 assert.equal(sample,read('docs/school-demo-gate.js'));
 assert.equal(read('school-preview.html'),read('docs/school-preview.html'));
 assert.equal(read('school-demo.html'),read('docs/school-demo.html'));
 assert.doesNotThrow(()=>new Function(code));
 assert.doesNotThrow(()=>new Function(sample));
});
test('public feature preview is informational only',()=>{
 const html=read('school-preview.html');
 assert.match(html,/READ-ONLY PRODUCT PREVIEW/);
 assert.doesNotMatch(html,/script src=|script type=|<button|<form/i);
});
