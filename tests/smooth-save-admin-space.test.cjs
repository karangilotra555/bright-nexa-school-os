'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('staff admin opens useful classes rather than a duplicate empty dashboard',()=>{
 const js=read('teacher-access.js'),role=read('school-role-entry.js'),html=read('teacher-access.html');
 assert.equal(require('../school-role-entry.js').preferredView('school_admin'),'classes');
 assert.match(js,/display\('dashboardTab',false\)/);
 assert.match(js,/if\(t==='dashboard'\)btn\.classList\.add\('hidden'\)/);
 assert.match(js,/portalStats'\)\)\$\('portalStats'\)\.classList\.toggle\('hidden',isAdmin\(\)\)/);
 assert.match(js,/School Admin tools/);
 assert.match(html,/teacher-access\.js\?v=20261111-admin-space-v1/);
 assert.match(html,/school-role-entry\.js\?v=20261111-direct-admin-erp-v1/);
 assert.match(role,/school_admin:'classes'/);
});
test('ERP and staff now reference revisioned retry clients without deleting data',()=>{
 for(const prefix of ['','docs/','app-extracted/dist/']){
  const html=read(prefix+'index.html'),cloud=read(prefix+'school-workspace-cloud.js'),controller=read(prefix+'school-workspace-controller.js'),sw=read(prefix+'sw.js');
  assert.match(html,/school-workspace-controller\.js\?v=20261111-autoretry-v1/);
  assert.match(html,/school-workspace-cloud\.js\?v=20261111-autoretry-v1/);
  const crypto=require('node:crypto');
  for(const [url,contents] of [['school-workspace-controller.js?v=20261111-autoretry-v1',controller],['school-workspace-cloud.js?v=20261111-autoretry-v1',cloud]]){
   const hash=crypto.createHash('sha256').update(contents).digest('hex');
   assert.ok(sw.includes('"url":"'+url+'","revision":"'+hash+'"'),url+' not precached');
  }
 }
 for(const p of ['teacher-access.js','teacher-access.html','school-role-entry.js'])assert.equal(read(p),read('docs/'+p));
});
