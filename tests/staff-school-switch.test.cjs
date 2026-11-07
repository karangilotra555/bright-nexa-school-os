'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'teacher-access.html'),'utf8');
const script=fs.readFileSync(path.join(root,'teacher-access.js'),'utf8');
function screen(){
 const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://bright-nexa-school-os.onrender.com/teacher-access.html'});
 const w=dom.window;
 const session={access_token:'fixture-access',refresh_token:'fixture-refresh',expires_at:Math.floor(Date.now()/1000)+3600};
 w.sessionStorage.setItem('bn_school_staff_session_v1',JSON.stringify(session));
 w.BNHomeworkFiles={create:()=>({list:async()=>[],upload:async()=>[],links:()=>{}})};
 const calls=[];
 w.fetch=(url,options={})=>{calls.push({url:String(url),options});return Promise.resolve({ok:false,status:401,json:async()=>({error:'fixture denies network'})})};
 w.eval(script);
 return {w,calls,dispose:()=>w.close()};
}
test('staff login remains visible instead of silently loading a saved account',()=>{
 const f=screen();
 try{
  const el=id=>f.w.document.getElementById(id);
  assert.equal(f.calls.length,0,'Opening a saved session must not fetch school records');
  assert.equal(el('loginSection').classList.contains('hidden'),false);
  assert.equal(el('portalSection').classList.contains('hidden'),true);
  assert.equal(el('savedSessionPanel').classList.contains('hidden'),false);
  assert.ok(el('forgotPasswordLink'));
  assert.ok(el('continuePreviousSession'));
  assert.ok(el('differentSchoolLogin'));
  assert.ok(el('schoolPicker'));
  assert.ok(el('switchSchoolAccount'));
 }finally{f.dispose();}
});
test('switch account clears old session immediately and leaves editable login',async()=>{
 const f=screen();
 try{
  const el=id=>f.w.document.getElementById(id);
  el('loginEmail').value='old.school@example.com';
  el('loginPassword').value='dummy';
  el('differentSchoolLogin').click();
  assert.equal(f.w.sessionStorage.getItem('bn_school_staff_session_v1'),null);
  assert.equal(el('loginSection').classList.contains('hidden'),false);
  assert.equal(el('savedSessionPanel').classList.contains('hidden'),true);
  assert.equal(el('loginEmail').value,'');
  assert.equal(el('loginPassword').value,'');
  assert.equal(f.w.document.activeElement,el('loginEmail'));
 }finally{f.dispose();}
});
test('school picker requires an actual verified membership, never a typed school name',()=>{
 const code=script;
 assert.ok(code.includes("memberships.filter(x=>x.auth_user_id===identity.id&&x.status==='active')"));
 assert.ok(code.includes("permitted.some(x=>x.school.id===requestedSchoolId)"));
 assert.ok(code.includes("throw Error('This account is not authorized for that school.')"));
 assert.ok(code.includes("display('schoolPickerWrap',permitted.length>1)"));
 assert.ok(code.includes("sessionStorage.setItem(SELECTED_SCHOOL_KEY,school.id)"));
 assert.equal(script,fs.readFileSync(path.join(root,'docs/teacher-access.js'),'utf8'));
 assert.equal(html,fs.readFileSync(path.join(root,'docs/teacher-access.html'),'utf8'));
});
