const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const script=read('teacher-access.js');
const html=read('teacher-access.html');

test('staff registration sets a same-site confirmation redirect',()=>{
  assert.match(script,/authRequest\('signup\?redirect_to='\+encodeURIComponent\(emailReturnUrl\(\)\)/);
  assert.match(script,/resend\?redirect_to=/);
  assert.match(script,/type:'signup',email/);
  assert.match(script,/https:\/\/bright-nexa-school-os\.onrender\.com\/teacher-access\.html/);
  assert.doesNotMatch(script,/signup',\{email,password\}/);
});
test('email confirmation errors are presented as a dialog with resend',()=>{
  assert.match(script,/emailDialog\('unconfirmed'/);
  assert.match(script,/emailDialog\('pending',email\)/);
  assert.match(script,/emailDialog\('verified'/);
  assert.match(script,/emailDialog\('expired'/);
  for(const id of ['bnEmailDialog','bnEmailTitle','bnEmailDescription','bnEmailInput','bnEmailResend','bnEmailContinue','bnEmailFeedback']){
    assert.match(html,new RegExp('id="'+id+'"'));
  }
  assert.match(html,/aria-modal|<dialog\b/);
  assert.match(html,/Resend verification email/);
  assert.match(html,/bn-email-dialog::backdrop/);
});
test('hosted and GitHub Pages versions match and script parses',()=>{
  assert.equal(read('teacher-access.js'),read('docs/teacher-access.js'));
  assert.equal(read('teacher-access.html'),read('docs/teacher-access.html'));
  assert.doesNotThrow(()=>new vm.Script(script,{filename:'teacher-access.js'}));
});
