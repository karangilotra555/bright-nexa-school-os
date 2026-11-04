'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('main owner login loads access guard before the staff login controller',()=>{
 const root=read('index.html'),live=read('docs/index.html');
 assert.equal(root,live);
 for(const html of [root,live]){
  const first=html.indexOf('<script src="./school-access-guard.js?');
  const second=html.indexOf('<script src="./teacher-access.js?');
  assert.ok(first!==-1&&second!==-1&&first<second,'guard must load before teacher-access.js');
  assert.match(html,/id="loginForm"/);
  assert.match(html,/id="loginEmail"/);
  assert.match(html,/id="loginPassword"/);
  assert.ok(!html.includes('Try demo'));
  assert.ok(!html.includes('ownerDemoLink'));
 }
});

test('owner alias remains mapped to existing verified Supabase email and unchanged password flow',()=>{
 const script=read('docs/teacher-access.js');
 assert.ok(script.includes("const guard=window.BrightNexaAccessGuard;"));
 assert.ok(script.includes("id.toLowerCase()==='yrskaran'?'yrskaran@gmail.com':id"));
 assert.ok(script.includes("authRequest('token?grant_type=password',{email:loginEmail,password})"));
 assert.ok(script.includes("saveSession(tokens);await load()"));
 assert.ok(script.includes("status==='active'"));
 assert.doesNotThrow(()=>new vm.Script(script));
 const g=read('docs/school-access-guard.js');
 assert.ok(g.includes('BrightNexaAccessGuard'));
 assert.doesNotThrow(()=>new vm.Script(g));
 assert.equal(g,read('school-access-guard.js'));
});
