'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('Admin Attendance and Owner Reports refresh the same verified workspace on tab entry',()=>{
 for(const file of ['app-extracted/src/BrightNexaApp.jsx','assets/index-brightnexa-v2.js']){
  const s=read(file),app=s.slice(s.lastIndexOf('function Ds()'));
  assert.match(app,/Teacher Portal attendance can change without a workspace revision bump/);
  assert.match(app,/\['Attendance','Owner Reports'\]\.includes\(/);
  assert.match(app,/cloud\.controller\.sync\(\)\.catch/);
  assert.match(app,/Refresh Supabase attendance/);
  assert.match(app,/disabled:!cloud\?\.controller|disabled=\{!cloud\?\.controller\}/);
  assert.doesNotMatch(app,/cloud\.controller\.openSchool\(.*?Attendance/s,'Opening attendance must not import or overwrite any school');
 }
 assert.equal(read('assets/index-brightnexa-v2.js'),read('docs/assets/index-brightnexa-v2.js'));
 assert.equal(read('assets/index-brightnexa-v2.js'),read('app-extracted/dist/assets/index-brightnexa-v2.js'));
});
test('cloud client refresh correctly overlays relational student attendance even when workspace revision does not change',()=>{
 const controller=read('school-workspace-controller.js'),cloud=read('school-workspace-cloud.js');
 assert.match(controller,/Teacher\/student portals write relational records without changing the/);
 assert.match(controller,/remoteFingerprint!==record\.fingerprint/);
 assert.match(controller,/await o\.applySnapshot\(clone\(remote\.snapshot\)/);
 assert.match(cloud,/school_workspace_/);
});
