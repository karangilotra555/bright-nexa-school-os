'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('School staff email and assigned role appear as readable profile details',()=>{
 const dom=new JSDOM(read('teacher-access.html'));
 try{
  const doc=dom.window.document;
  for(const id of ['accountEmailDisplay','accountRoleDisplay']){
   assert.ok(doc.querySelector(`dl dd#${id}`),`${id} must be a display value`);
  }
  assert.ok(doc.querySelector('input#accountNameInput'));
 }finally{dom.window.close();}
});
test('Teacher phone layout keeps daily tabs and logout while moving account actions out of the workspace header',()=>{
 const html=read('teacher-access.html'),script=read('teacher-access.js');
 const dom=new JSDOM(html);
 const doc=dom.window.document;
 const display=id=>dom.window.getComputedStyle(doc.getElementById(id)).display;
 assert.match(script,/const teacherApp=me\.role==='teacher'&&isMobileAppContext\(\)/);
 assert.match(script,/classList\.toggle\('bn-teacher-app',teacherApp\)/);
 assert.match(html,/body\.bn-teacher-app\s+#portalPermissionNotice/);
 assert.match(html,/body\.bn-teacher-app\s+#staffSmartToolsLink/);
 assert.ok(doc.querySelector('[data-view="account"] #teacherSchoolAccount'));
 for(const tab of ['classes','timetable','attendance','homework','notices','account']){
  assert.ok(doc.querySelector(`[data-tab="${tab}"]`));
 }
 assert.ok(doc.querySelector('header #logout'));
 doc.getElementById('logout').classList.remove('hidden');
 assert.notEqual(display('staffSmartToolsLink'),'none');
 doc.body.classList.add('bn-teacher-app');
 for(const id of ['portalPermissionNotice','portalStats'])assert.equal(display(id),'none',id);
 assert.notEqual(display('logout'),'none');
 dom.window.close();
});
test('A verified teacher has no Parent Portal or school-wide Smart Tools links while office staff keep their links',()=>{
 const html=read('teacher-access.html'),src=read('teacher-access.js');
 const dom=new JSDOM(html,{url:'https://bright-nexa-school-os.onrender.com/teacher-access.html',runScripts:'outside-only'});
 try{
  const w=dom.window,doc=w.document;
  w.BNHomeworkFiles={create:()=>({})};
  w.eval(src.replace(/\}\)\(\);\s*$/,`window.showStaffMenu=role=>{me={role};applyNavigationVisibility();};})();`));
  const links=[...doc.querySelectorAll('header a[href="./parents.html"], header a[href="./smart-tools.html"], .portal-nav a[href="./parents.html"], .portal-nav a[href="./smart-tools.html"]')];
  assert.equal(links.length,4);
  w.showStaffMenu('teacher');
  for(const link of links)assert.ok(link.classList.contains('hidden'),link.textContent.trim());
  assert.equal(doc.querySelector('#mobileParentLogin').getAttribute('href'),'./parents.html');
  w.showStaffMenu('school_admin');
  for(const link of links)assert.ok(!link.classList.contains('hidden'),link.textContent.trim());
 }finally{dom.window.close();}
});
function portal(){
 const dom=new JSDOM(read('teacher-access.html'),{url:'https://bright-nexa-school-os.onrender.com/teacher-access.html',runScripts:'outside-only'});
 const w=dom.window;
 w.BNHomeworkFiles={create:()=>({})};
 w.BNStudentPhotos={create:()=>({validate(){},upload:async()=>({}),signedUrl:async()=>null})};
 w.eval(read('teacher-access.js'));
 return dom;
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn){
 for(let i=0;i<30;i++){if(fn())return;await wait(10);}
 assert.fail('Expected async reset request to finish');
}
test('public login and recovery have branding and hide extra pre-login navigation',()=>{
 const html=read('teacher-access.html'),script=read('teacher-access.js');
 assert.match(html,/id="publicAuthIntro"/);
 assert.match(html,/bright-nexa-official-logo\.jpg/);
 assert.match(html,/body:has\(#loginSection:not\(\.hidden\)\)>header\{display:none\}/);
 assert.match(html,/id="staffSmartToolsLink"/,'protected menu is preserved for logged-in staff');
 assert.match(html,/id="forgotFeedback"/);
 assert.match(html,/teacher-access\.js\?v=20261116-school-sync-v1/);
 assert.match(script,/const redirect=emailReturnUrl\(\);/);
 assert.match(script,/response\.status===429/);
 assert.match(script,/resetFeedback\(/);
 assert.equal(html,read('docs/teacher-access.html'));
 assert.equal(script,read('docs/teacher-access.js'));
});
test('forgot-password shows actionable 429 rate-limit error in the form and keeps email',async()=>{
 const dom=portal(),w=dom.window;
 try{
   let requested=0;
   w.fetch=async(url,opts)=>{
     if(!url.includes('/auth/v1/recover'))throw Error('Unexpected network operation');
     requested++;
     assert.match(url,/redirect_to=https%3A%2F%2Fbright-nexa-school-os\.onrender\.com%2Fteacher-access\.html/);
     assert.equal(JSON.parse(opts.body).email,'owner@example.com');
     return {ok:false,status:429,headers:{get:()=>null},json:async()=>({error_code:'over_email_send_rate_limit'})};
   };
   w.document.getElementById('forgotPasswordLink').click();
   const input=w.document.getElementById('forgotEmail');
   input.value='owner@example.com';
   w.document.getElementById('forgotPasswordForm').dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));
   await until(()=>!w.document.getElementById('sendResetEmail').disabled);
   const feedback=w.document.getElementById('forgotFeedback');
   assert.match(feedback.textContent,/Too many password reset requests/);
   assert.ok(feedback.classList.contains('error'));
   assert.ok(!feedback.classList.contains('hidden'));
   assert.equal(input.value,'owner@example.com','Keep email for a safe manual retry');
   assert.equal(requested,1);
   assert.ok(!w.document.getElementById('forgotPasswordForm').classList.contains('hidden'));
 }finally{dom.window.close();}
});
test('successful reset request reports acceptance on same screen, not claimed delivery',async()=>{
 const dom=portal(),w=dom.window;
 try{
   w.fetch=async()=>({ok:true,status:200,headers:{get:()=>null},json:async()=>({})});
   w.document.getElementById('forgotPasswordLink').click();
   w.document.getElementById('forgotEmail').value='owner@example.com';
   w.document.getElementById('forgotPasswordForm').dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));
   await until(()=>!w.document.getElementById('sendResetEmail').disabled);
   const message=w.document.getElementById('forgotFeedback').textContent;
   assert.match(message,/Request accepted/);
   assert.match(message,/If this email is registered/);
   assert.match(message,/Spam/);
   assert.equal(w.document.getElementById('forgotEmail').value,'owner@example.com');
   assert.ok(!w.document.getElementById('forgotPasswordForm').classList.contains('hidden'));
   w.document.getElementById('returnToLoginFromForgot').click();
   assert.ok(!w.document.getElementById('loginForm').classList.contains('hidden'));
 }finally{dom.window.close();}
});
test('password visibility button toggles only presentation and leaves content unchanged',()=>{
 const dom=portal(),w=dom.window;
 try{
   const password=w.document.getElementById('loginPassword');
   password.value='ExamplePass123';
   const button=w.document.getElementById('toggleLoginPassword');
   button.click();
   assert.equal(password.type,'text');
   assert.equal(password.value,'ExamplePass123');
   assert.equal(button.getAttribute('aria-pressed'),'true');
   button.click();
   assert.equal(password.type,'password');
 }finally{dom.window.close();}
});
