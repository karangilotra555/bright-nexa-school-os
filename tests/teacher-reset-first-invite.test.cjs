'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('forgot password guides first-time staff to admin invitation instead of promising email delivery',()=>{
  for(const file of ['teacher-access.html','docs/teacher-access.html']){
    const html=read(file);
    assert.match(html,/First-time Teacher\/Staff login\?/);
    assert.match(html,/Password reset cannot create a new account/);
    assert.match(html,/Create \/ Sync Teacher App Access/);
    assert.match(html,/index\.html\?openSchool=true&amp;tab=Teachers/);
    assert.match(html,/id="forgotFeedback"/);
    assert.match(html,/teacher-access\.js\?v=20261113-teacher-first-invite-v1/);
  }
  assert.equal(read('teacher-access.html'),read('docs/teacher-access.html'));
});
test('public recovery retains non-enumerating response and does not claim a reset email was delivered',()=>{
  for(const file of ['teacher-access.js','docs/teacher-access.js']){
    const src=read(file);
    assert.ok(src.includes("BASE+'/auth/v1/recover?redirect_to='"));
    assert.match(src,/Reset request accepted for eligible existing accounts; this does not confirm an email was sent or delivered/);
    assert.match(src,/First-time teachers and staff must be invited by their School Admin/);
    assert.match(src,/password recovery can work/);
  }
  assert.equal(read('teacher-access.js'),read('docs/teacher-access.js'));
});
