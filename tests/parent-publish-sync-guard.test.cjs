'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('all three served entrypoints load the synced cloud guard before controller and React app',()=>{
 for(const prefix of ['','docs/','app-extracted/dist/']){
   const html=read(prefix+'index.html');
   const guard=html.indexOf('school-online-guard.js?v=20261111-nonblocking-v1');
   const controller=html.indexOf('school-workspace-controller.js?v=20261111-raw-readback-v1');
   const entry=html.indexOf('school-erp-entry.js?v=20261111-portrait-compact-v1');
   assert.ok(guard>0&&controller>guard&&entry>controller, prefix+' order');
   assert.match(html,/CACHE_VERSION = '20261109-signout-v6'/);
   const sw=read(prefix+'sw.js');
   assert.match(sw,/school-online-guard.js\?v=20261111-nonblocking-v1/);
   assert.match(sw,/school-erp-entry.js\?v=20261111-portrait-compact-v1/);
   assert.match(sw,/school-workspace-controller.js\?v=20261111-raw-readback-v1/);
 }
});
test('source, web, docs, packaged app all contain verified-school auto connection and explicit error notification',()=>{
 const src=read('app-extracted/src/BrightNexaApp.jsx');
 const bundles=['assets/index-brightnexa-v2.js','docs/assets/index-brightnexa-v2.js','app-extracted/dist/assets/index-brightnexa-v2.js'];
 for(const js of [src,...bundles.map(read)]){
   assert.match(js,/selectedSchool/);
   assert.match(js,/institutionId/);
   assert.match(js,/controller\.openSchool\(selectedSchool\.id\)/);
   assert.match(js,/BNWorkspaceOnlineGuard\?\.update/);
   assert.doesNotMatch(js,/catch\s*\(_\d*\)\s*\{\s*\}\s*\)\.catch\(\(error\)/);
 }
 assert.equal(read(bundles[0]),read(bundles[1]));
 assert.equal(read(bundles[0]),read(bundles[2]));
});
test('cloud statuses include an actual binding flag and cannot hide sync errors',()=>{
 for(const prefix of ['','docs/','app-extracted/dist/']){
   const src=read(prefix+'school-workspace-controller.js');
   assert.match(src,/binding:!!binding/);
   assert.match(src,/BNWorkspaceOnlineGuard\.update\(s,error\)/);
 }
});
test('guard is only active for Supabase-verified ERP login, not ordinary student sessions',()=>{
 const sandbox={window:{sessionStorage:{getItem:()=>JSON.stringify({cloudVerified:true})}},module:{exports:{}}};
 vm.runInNewContext(read('school-online-guard.js'),sandbox);
 assert.equal(sandbox.module.exports.active(),true);
 sandbox.window.sessionStorage.getItem=()=>JSON.stringify({cloudVerified:false});
 assert.equal(sandbox.module.exports.active(),false);
 sandbox.window.sessionStorage.getItem=()=>null;
 assert.equal(sandbox.module.exports.active(),false);
});
test('existing student credentials require published admission and school-registered mobile, never manually install demo password',()=>{
 const source=read('supabase/functions/school-student-login/index.ts');
 assert.match(source,/eq\('admission_number',admission\)/);
 assert.match(source,/select\('guardian_phone'\)/);
 assert.match(source,/phone!==mobile\(password\)/);
 assert.doesNotMatch(source,/password\s*===\s*['\"]\d{7,}/);
});

test('empty optional guardian fields produce SQL NULL rather than invalid blank names and mobiles',()=>{
 const cloud=require('../school-workspace-cloud.js');
 const snapshot={
   institution:{institution:{id:'test-school',name:'School',session:'2026-2027'}},
   operations:{classes:[{id:'class1',name:'Class 1',section:'A',academicYear:'2026-2027'}]},
   students:[
    {id:'s1',admissionNumber:'TEST-001',name:'First Student',classId:'class1',status:'Active',parentMobile:''},
    {id:'s2',admissionNumber:'TEST-002',name:'Second Student',classId:'class1',status:'Active',
      guardianName:'Guardian Name',parentMobile:'9000000000'}
   ]
 };
 const p=cloud.buildProjection(snapshot);
 assert.equal(p.students.length,2);
 assert.equal(p.students[0].profile.guardian_name,null);
 assert.equal(p.students[0].profile.guardian_phone,null);
 assert.equal(p.students[0].profile.address_line,null);
 assert.equal(p.students[1].profile.guardian_name,'Guardian Name');
 assert.equal(p.students[1].profile.guardian_phone,'9000000000');
 assert.equal(read('school-workspace-cloud.js'),read('docs/school-workspace-cloud.js'));
 assert.equal(read('school-workspace-cloud.js'),read('app-extracted/dist/school-workspace-cloud.js'));
});
test('PWA precaches new school cloud adapter and no longer serves 20261106 revision',()=>{
 for(const prefix of ['','docs/','app-extracted/dist/']){
  const html=read(prefix+'index.html');
  const sw=read(prefix+'sw.js');
  assert.match(html,/school-workspace-cloud\.js\?v=20261111-raw-readback-v1/);
  assert.match(sw,/school-workspace-cloud\.js\?v=20261111-raw-readback-v1/);
  assert.match(sw,/school-online-guard\.js\?v=20261111-nonblocking-v1/);
 }
});
