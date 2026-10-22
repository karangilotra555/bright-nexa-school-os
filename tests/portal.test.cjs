const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function portal(fetchImpl = async () => { throw new Error('offline'); }) {
  const nodes = new Map();
  const element = id => { if (!nodes.has(id)) nodes.set(id, { id, style:{}, dataset:{}, value:'', textContent:'', innerHTML:'', className:'', hidden:false, disabled:false, classList:{add(){},remove(){},toggle(){}}, focus(){}, setAttribute(){},removeAttribute(){}, querySelectorAll(){return [];} }); return nodes.get(id); };
  const values = new Map([['bn_portal_token','old-token'], ['bright-nexa-school-os:students:v1', JSON.stringify([{name:'PRIVATE STUDENT',admissionNumber:'LIVE',dob:'01-01-2010'}])]]);
  const storage = {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
  const context = vm.createContext({document:{getElementById:element,querySelector:s=>element(s),querySelectorAll:()=>[]}, window:{location:{protocol:'https:',search:'',hash:'#/school-profile'},addEventListener(){}},sessionStorage:storage, localStorage:storage, fetch:fetchImpl, URLSearchParams, AbortSignal, console, setTimeout, clearTimeout});
  const html=fs.readFileSync('student-portal.html','utf8');
  const source=fs.existsSync('portal.js')?fs.readFileSync('portal.js','utf8'):[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
  vm.runInContext(source,context);
  return {context,element,values,run:s=>vm.runInContext(s,context)};
}
test('demo explanation remains visible after logout and login navigation',async()=>{
 const p=portal(async()=>({ok:true,headers:{get:()=> 'application/json'},json:async()=>({deploymentMode:'demo',institution:{name:'Sample School'}})}));
 await p.run('initPortal()');p.run('demoLogin();handleLogout();showLoginScreen()');
 assert.equal(p.element('loginForm').hidden,true);
 assert.equal(p.element('loginInfo').style.display,'block');
 assert.match(p.element('loginInfo').textContent,/not connected/);
});
test('demo cannot select a live student stored in the browser',async()=>{ const p=portal(); await p.run('initPortal()'); p.run('demoLogin()'); assert.match(p.element('dashStudentName').textContent,/DEMO/); assert.equal(p.values.has('bn_portal_token'),false); });
test('logout removes the session token and clears DOB',()=>{const p=portal();p.element('dobInput').value='01-01-2010';p.run('handleLogout()');assert.equal(p.values.has('bn_portal_token'),false);assert.equal(p.element('dobInput').value,'');});
test('API failure cannot authenticate a matching local record',async()=>{const p=portal();await p.run('initPortal()');p.element('admInput').value='LIVE';p.element('dobInput').value='01-01-2010';await p.run('handleLogin({preventDefault(){}})');assert.notEqual(p.element('dashboardView').style.display,'block');assert.equal(p.values.has('bn_portal_token'),false);assert.match(p.element('loginAlert').textContent,/unavailable/i);});
test('school profile deep link displays its own view',async()=>{const p=portal();await p.run('initPortal()');assert.equal(p.element('schoolProfileView').style.display,'block');});
test('missing blood group is never fabricated',()=>{const p=portal();p.run("loginStudent({name:'Test',admissionNumber:'TEST'})");assert.match(p.element('cardBlood').textContent,/not available/i);});
test('API rejection is displayed as text and never signs in',async()=>{const p=portal(async()=>({ok:false,status:401,headers:{get:()=> 'application/json'},json:async()=>({error:'<img src=x onerror=alert(1)>'})}));p.element('admInput').value='TEST';p.element('dobInput').value='01-01-2010';await p.run('handleLogin({preventDefault(){}})');assert.match(p.element('loginAlert').textContent,/<img/);assert.notEqual(p.element('dashboardView').style.display,'block');});
test('demo card cannot claim verified active enrollment',()=>{const p=portal();p.run('demoLogin()');assert.equal(p.element('cardStatus').textContent,'Demo — not an official credential');});
test('successful API login stores a token and shows only returned identity',async()=>{const p=portal(async()=>({ok:true,headers:{get:()=> 'application/json'},json:async()=>({token:'new-token',student:{name:'Returned Student',admissionNumber:'SERVER'}})}));p.element('admInput').value='SERVER';p.element('dobInput').value='01-01-2010';await p.run('handleLogin({preventDefault(){}})');assert.equal(p.values.get('bn_portal_token'),'new-token');assert.equal(p.element('dashStudentName').textContent,'RETURNED STUDENT');assert.equal(p.element('dobInput').value,'');});
test('published docs portal matches reviewed source',()=>{assert.equal(fs.readFileSync('docs/student-portal.html','utf8'),fs.readFileSync('student-portal.html','utf8'));assert.equal(fs.readFileSync('docs/portal.js','utf8'),fs.readFileSync('portal.js','utf8'));});
test('public school profile loads on static hosting without trusting local storage',async()=>{const p=portal(async url=>url==='/api/school-profile'?{ok:false,headers:{get:()=> 'text/plain'}}:{ok:true,headers:{get:()=> 'application/json'},json:async()=>({institution:{name:'Published School',session:'2026-27'}})});await p.run('loadSchoolProfile()');assert.equal(p.element('schoolName').textContent,'Published School');});
test('static demo mode hides credential form and explains unavailable login',async()=>{const p=portal(async url=>url==='/api/school-profile'?{ok:false,headers:{get:()=> 'text/plain'}}:{ok:true,headers:{get:()=> 'application/json'},json:async()=>({deploymentMode:'demo',institution:{name:'Published School'}})});await p.run('loadSchoolProfile()');assert.equal(p.element('loginForm').hidden,true);assert.match(p.element('loginInfo').textContent,/Real student login.*not connected/);});
