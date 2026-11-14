const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function portal(fetchImpl = async () => { throw new Error('offline'); }) {
  const nodes = new Map();
  const element = id => { if (!nodes.has(id)) nodes.set(id, { id, style:{}, dataset:{}, value:'', textContent:'', innerHTML:'', className:'', hidden:false, disabled:false, classList:{add(){},remove(){},toggle(){}}, focus(){}, setAttribute(){},removeAttribute(){}, querySelectorAll(){return [];} }); return nodes.get(id); };
  const values = new Map([['bn_portal_token','old-token'], ['bright-nexa-school-os:students:v1', JSON.stringify([{name:'PRIVATE STUDENT',admissionNumber:'LIVE',dob:'01-01-2010'}])]]);
  const storage = {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const context = vm.createContext({document:{getElementById:element,querySelector:s=>element(s),querySelectorAll:()=>[]}, window:{location:{protocol:'https:',search:'',hash:'#/school-profile',assign(url){this.assigned=url}},addEventListener(){}},sessionStorage:storage, localStorage:storage, fetch:fetchImpl, URLSearchParams, AbortSignal, console, setTimeout, clearTimeout});
  const html=fs.readFileSync('student-portal.html','utf8');
  const source=fs.existsSync('portal.js')?fs.readFileSync('portal.js','utf8'):[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
  vm.runInContext(source,context);
  return {context,element,values,run:s=>vm.runInContext(s,context)};
}
test('demo cannot select a live student stored in the browser',async()=>{ const p=portal(); await p.run('initPortal()'); p.run('demoLogin()'); assert.match(p.element('dashStudentName').textContent,/DEMO/); assert.equal(p.values.has('bn_portal_token'),false); });
test('logout removes the session token and clears DOB',()=>{const p=portal();p.element('dobInput').value='01-01-2010';p.run('handleLogout()');assert.equal(p.values.has('bn_portal_token'),false);assert.equal(p.element('dobInput').value,'');});
test('API failure cannot authenticate a matching local record',async()=>{const p=portal();await p.run('initPortal()');p.element('admInput').value='LIVE';p.element('dobInput').value='01-01-2010';await p.run('handleLogin({preventDefault(){}})');assert.notEqual(p.element('dashboardView').style.display,'block');assert.equal(p.values.has('bn_portal_token'),false);assert.equal(p.context.window.location.assigned,'./parents.html');});
test('school profile deep link displays its own view',async()=>{const p=portal();await p.run('initPortal()');assert.equal(p.element('schoolProfileView').style.display,'block');});
test('missing blood group is never fabricated',()=>{const p=portal();p.run("loginStudent({name:'Test',admissionNumber:'TEST'})");assert.match(p.element('cardBlood').textContent,/not available/i);});
test('API rejection is displayed as text and never signs in',async()=>{const p=portal(async()=>({ok:false,status:401,headers:{get:()=> 'application/json'},json:async()=>({error:'<img src=x onerror=alert(1)>'})}));await p.run("api('/api/verify').catch(error=>showLoginError(error.message))");assert.match(p.element('loginAlert').textContent,/<img/);assert.notEqual(p.element('dashboardView').style.display,'block');});

test('demo card cannot claim verified active enrollment',()=>{const p=portal();p.run('demoLogin()');assert.equal(p.element('cardStatus').textContent,'Demo — not an official credential');});
test('legacy login redirects to password portal without transmitting DOB or trusting an old token',async()=>{let calls=0;const p=portal(async()=>{calls++;throw Error('Legacy login must not be called')});p.element('admInput').value='SERVER';p.element('dobInput').value='01-01-2010';await p.run('handleLogin({preventDefault(){}})');assert.equal(calls,0);assert.equal(p.values.has('bn_portal_token'),false);assert.equal(p.context.window.location.assigned,'./parents.html');assert.equal(p.element('dobInput').value,'');});

test('published docs portal matches reviewed source',()=>{assert.equal(fs.readFileSync('docs/student-portal.html','utf8'),fs.readFileSync('student-portal.html','utf8'));assert.equal(fs.readFileSync('docs/portal.js','utf8'),fs.readFileSync('portal.js','utf8'));});
test('public school profile loads on static hosting without trusting local storage',async()=>{const p=portal(async url=>url==='/api/school-profile'?{ok:false,headers:{get:()=> 'text/plain'}}:{ok:true,headers:{get:()=> 'application/json'},json:async()=>({institution:{name:'Published School',session:'2026-27'}})});await p.run('loadSchoolProfile()');assert.equal(p.element('schoolName').textContent,'Published School');});
test('static demo mode hides credential form and explains unavailable login',async()=>{const p=portal(async url=>url==='/api/school-profile'?{ok:false,headers:{get:()=> 'text/plain'}}:{ok:true,headers:{get:()=> 'application/json'},json:async()=>({deploymentMode:'demo',institution:{name:'Published School'}})});await p.run('loadSchoolProfile()');assert.equal(p.element('loginForm').hidden,true);assert.match(p.element('loginInfo').textContent,/Real student login.*not connected/);});


test('packaged legacy portal delegates QR checks and login to maintained hosted routes',()=>{
 const src=require('fs').readFileSync(require('path').join(__dirname,'../app-extracted/dist/student-portal.html'),'utf8');
 const start=src.indexOf('function initPortal()'),end=src.indexOf('function showLoginFromVerification',start);
 const targets=[];const ctx={URL,window:{location:{search:'?action=verify&adm=PRIVATE&sig=valid',hash:'',replace:u=>targets.push(u)}}};
 require('vm').runInNewContext(src.slice(start,end)+';initPortal();',ctx);
 const url=new URL(targets[0]);assert.equal(url.origin,'https://bright-nexa-school-os-api.onrender.com');assert.equal(url.searchParams.get('sig'),'valid');assert.equal(url.pathname,'/student-portal.html');
});
