'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const {JSDOM}=require('jsdom');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
function make({revoke=async()=>({ok:true,status:204})}={}){
 const data=new Map([
  ['bn_school_staff_session_v1',JSON.stringify({access_token:'test-jwt'})],
  ['bn_school_staff_selected_school_v1','school-id'],
  ['bright-nexa-school-os:session:v2',JSON.stringify({cloudVerified:true,role:'OWNER'})],
  ['bn.workspace.v1.backup.1','saved local school backup'],
  ['bright-nexa-school-os:snapshot:v1','saved current school']
 ]);
 let onClick,allow=true,overlayCleared=false;
 const requests=[],redirects=[];
 const root={
  document:{addEventListener:(event,handler,capture)=>{if(event==='click'){assert.equal(capture,true);onClick=handler;}},
   getElementById:()=>({remove(){overlayCleared=true}})},
  sessionStorage:{getItem:key=>data.get(key)||null,removeItem:key=>data.delete(key)},
  location:{href:'https://bright-nexa-school-os.onrender.com/index.html?tab=Dashboard',
   replace:url=>redirects.push(url)},
  fetch:(url,opts)=>{requests.push({url,opts});return revoke();},
  setTimeout:()=>0,confirm:()=>allow
 };
 vm.runInNewContext(read('school-auth-signout.js'),{window:root,URL,Promise});
 return {root,data,requests,redirects,overlayCleared:()=>overlayCleared,click:(cls)=>{
  const calls=[];
  onClick({target:{closest:(selector)=>
    cls==='logout'&&selector.includes('#logout')?{id:'logout'}:null},
   preventDefault:()=>calls.push('prevent'),stopPropagation:()=>calls.push('stop'),
   stopImmediatePropagation:()=>calls.push('immediate')});
  return calls;
 },allow:x=>allow=x};
}
test('ERP logout clears BOTH cloud auth bridges but retains every local school backup',async()=>{
 const f=make();
 const result=await f.root.BNSchoolLogout.signOut();
 assert.equal(result,true);
 for(const key of ['bn_school_staff_session_v1','bn_school_staff_selected_school_v1','bright-nexa-school-os:session:v2']){
  assert.equal(f.data.has(key),false,key+' removed');
 }
 assert.equal(f.data.get('bn.workspace.v1.backup.1'),'saved local school backup');
 assert.equal(f.data.get('bright-nexa-school-os:snapshot:v1'),'saved current school');
 assert.equal(f.overlayCleared(),true);
 assert.equal(f.redirects[0],'https://bright-nexa-school-os.onrender.com/teacher-access.html?loggedOut=1');
 assert.equal(f.requests.length,1);
 assert.equal(f.requests[0].opts.method,'POST');
 assert.equal(f.requests[0].opts.headers.Authorization,'Bearer test-jwt');
 assert.match(f.requests[0].url,/\/auth\/v1\/logout\?scope=local$/);
 assert.equal(f.requests[0].opts.keepalive,true);
});
test('Profile avatar is non-destructive, explicit Logout signs out before React reload',async()=>{
 const profile=make();
 assert.deepEqual(profile.click('profile-avatar'),[]);
 assert.equal(profile.data.has('bn_school_staff_session_v1'),true);
 assert.equal(profile.redirects.length,0);
 const logout=make();
 assert.deepEqual(logout.click('logout'),['prevent','stop','immediate']);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(logout.data.has('bn_school_staff_session_v1'),false);
 assert.equal(logout.redirects.length,1);
});
test('Cancelled explicit logout does not change sessions',()=>{
 const f=make();f.allow(false);f.click('logout');
 assert.equal(f.data.has('bn_school_staff_session_v1'),true);
 assert.equal(f.redirects.length,0);
});
test('Staff Portal Log out works even when browser prompts are disabled',async()=>{
 const dom=new JSDOM('<button id="logout">Log out</button>',{url:'https://bright-nexa-school-os.onrender.com/teacher-access.html',runScripts:'outside-only'});
 const w=dom.window;
 try{
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
  w.confirm=()=>false;
  const redirects=[];
  const root={document:w.document,sessionStorage:w.sessionStorage,confirm:w.confirm,
   location:{href:w.location.href,replace:url=>redirects.push(url)}};
  w.sessionStorage.setItem('bn_school_staff_session_v1',JSON.stringify({access_token:'test-jwt'}));
  w.localStorage.setItem('bn.workspace.v1.backup.1','pending device copy');
  vm.runInNewContext(read('school-auth-signout.js'),{window:root,URL,Promise});
  w.document.getElementById('logout').click();
  const dialog=w.document.querySelector('dialog[open]');
  assert.ok(dialog,'Log out must show a visible in-page confirmation');
  dialog.querySelector('[value="cancel"]').click();
  assert.equal(dialog.open,false);
  assert.ok(w.sessionStorage.getItem('bn_school_staff_session_v1'));
  w.document.getElementById('logout').click();
  w.document.querySelector('dialog[open] button[type="submit"]').click();
  assert.equal(w.sessionStorage.getItem('bn_school_staff_session_v1'),null);
  assert.equal(w.localStorage.getItem('bn.workspace.v1.backup.1'),'pending device copy');
  assert.deepEqual(redirects,['https://bright-nexa-school-os.onrender.com/teacher-access.html?loggedOut=1']);
 }finally{w.close();}
});
test('ERP avatar delegates to the shared session sign-out flow',()=>{
 for(const file of ['app-extracted/src/BrightNexaApp.jsx','assets/index-brightnexa-v2.js']){
  const source=read(file),fallback=source.indexOf('Sign out from this device?');
  const avatar=source.slice(source.lastIndexOf('`profile-avatar`',fallback),fallback);
  assert.match(avatar,/BNSchoolLogout\.requestSignOut/);
 }
});
test('A hung revoke cannot delay navigation or leave the local session alive',async()=>{
 const f=make({revoke:()=>new Promise(()=>{})});
 const result=f.root.BNSchoolLogout.signOut();
 assert.equal(f.data.has('bn_school_staff_session_v1'),false);
 assert.equal(f.redirects.length,1);
 assert.equal(await result,true);
});
test('Sync conflict offers a working sign out action without deleting drafts',()=>{
 const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://bright-nexa-school-os.onrender.com',runScripts:'outside-only'});
 dom.window.sessionStorage.setItem('bright-nexa-school-os:session:v2',JSON.stringify({cloudVerified:true}));
 let calls=0;dom.window.BNSchoolLogout={signOut:()=>{calls++;}};
 dom.window.eval(read('school-online-guard.js'));
 dom.window.BNWorkspaceOnlineGuard.update('conflict',new Error('Saved copy differs'));
 const button=dom.window.document.querySelector('[data-role=signout]');
 assert.ok(button,'sign out action on conflict');
 button.click();assert.equal(calls,1);
 dom.window.close();
});
test('Live, published and PWA files use matching logout code and cache fingerprints',()=>{
 const script=read('school-auth-signout.js');
 for(const prefix of ['','docs/','app-extracted/dist/']){
  assert.equal(read(prefix+'school-auth-signout.js'),script);
  assert.match(read(prefix+'index.html'),/school-auth-signout\.js\?v=20261115-logout-v1/);
  assert.match(read(prefix+'index.html'),/CACHE_VERSION = '20261113-private-device-v1'/);
  assert.equal(read(prefix+'school-online-guard.js'),read('school-online-guard.js'));
  const sw=read(prefix+'sw.js');
  assert.doesNotThrow(()=>new vm.Script(sw));
  const sha=c=>crypto.createHash('sha256').update(c).digest('hex');
  assert.ok(sw.includes('"url":"school-auth-signout.js?v=20261115-logout-v1","revision":"'+sha(script)+'"'));
  assert.ok(sw.includes('"url":"index.html","revision":"'+sha(read(prefix+'index.html'))+'"'));
 }
 for(const prefix of ['', 'docs/'])assert.match(read(prefix+'teacher-access.html'),/school-auth-signout\.js\?v=20261117-mobile-login/);
});
