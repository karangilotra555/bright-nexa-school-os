'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('student category remains a native controlled select in all shipped copies',()=>{
 const source=read('app-extracted/src/BrightNexaApp.jsx');
 const category=source.split('label={`Category (Optional)`}')[1].split('label={`Previous School`}')[0];
 assert.match(source,/const Component94 = `select`;/);
 assert.match(category,/<Component94[\s\S]*value={i\.category \|\| ``}/);
 assert.doesNotMatch(category,/placeholder=/);
 for(const name of ['General','OBC','SC','ST','EWS','Other'])
  assert.ok(category.includes('<option value={`'+name+'`}>'),name+' choice absent');
 const root=read('assets/index-brightnexa-v2.js');
 for(const p of ['docs/assets/index-brightnexa-v2.js','app-extracted/dist/assets/index-brightnexa-v2.js'])
  assert.equal(read(p),root);
 assert.match(root,/const Component94 = `select`;/);
 assert.ok(root.includes('w.createElement(`option`, { value: `ST` }, `ST`)'));
});
test('new recovery code is mirrored and service-worker references updated',()=>{
 const controller=read('school-workspace-controller.js');
 for(const p of ['docs/school-workspace-controller.js','app-extracted/dist/school-workspace-controller.js'])
  assert.equal(read(p),controller);
 assert.match(controller,/bn-workspace-recovery-v1/);
 for(const prefix of ['','docs/','app-extracted/dist/']){
  assert.match(read(prefix+'index.html'),/school-workspace-controller\.js\?v=20261111-raw-readback-v1/);
  assert.match(read(prefix+'school-erp-entry.js'),/index-brightnexa-v2\.js\?v=20261111-teacher-modal-guard-v1/);
  const crypto=require('node:crypto');
  const sha=p=>crypto.createHash('sha256').update(read(prefix+p).replace(/\r\n/g,'\n')).digest('hex');
  assert.ok(read(prefix+'sw.js').includes('url:"assets/index-brightnexa-v2.js",revision:"'+sha('assets/index-brightnexa-v2.js')+'"'));
  assert.ok(read(prefix+'sw.js').includes('"url":"school-workspace-controller.js?v=20261111-raw-readback-v1","revision":"'+sha('school-workspace-controller.js')+'"'));
 }
});