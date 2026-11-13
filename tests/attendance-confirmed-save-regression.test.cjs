'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
function region(source,name,next){const a=source.indexOf('function '+name+'('),b=source.indexOf('function '+next+'(',a);assert.ok(a>0&&b>a,name+' region exists');return source.slice(a,b)}
test('student and staff attendance buttons await actual cloud confirmation',()=>{
 for(const file of ['app-extracted/src/BrightNexaApp.jsx','assets/index-brightnexa-v2.js']){
  const source=read(file);
  for(const [component,next] of [['Ur','Wr'],['Wr','Gr']]){
   const view=region(source,component,next);
   assert.match(view,/onClick:\s*async\s*\(\)\s*=>|onClick=\{async \(\) =>/);
   assert.match(view,/const result\s*=\s*await/);
   assert.match(view,/result\?\.status\s*!==\s*['\"]synced['\"]/);
   assert.match(view,/NOT confirmed in Supabase/);
   assert.match(view,/attendanceSaving/);
   assert.match(view,/attendanceSaveMessage/);
   assert.match(view,/setTimeout\(\(\) => [fd]\d?\(false\),\s*1800\)/);
   const saveAt=view.search(/const result\s*=\s*await/),ackAt=view.search(/result\?\.status\s*!==\s*['\"]synced['\"]/),successAt=view.indexOf('setTimeout(');
   assert.ok(saveAt>=0&&ackAt>saveAt&&successAt>ackAt,'no saved indication before cloud acknowledgment');
   assert.match(view,/\(?previous\)?\s*=>\s*previous\.(?:studentId|staffId)\s*===/);
  }
  const app=source.slice(source.indexOf('let j = (nextOpsArg'),source.indexOf('const Component2051'));
  for(const label of ['Student attendance','Teaching attendance','Non-Teaching attendance'])
    assert.ok(app.includes(label),label+' uses direct cloud save');
  assert.match(app,/cloud\.controller\.autosave\(nextSnapshot\)/);
  assert.match(app,/lastWorkspace\.current = JSON\.stringify\(nextSnapshot\)/);
 }
});
test('PWA bundles and Cloud Leave mapping are identical across root, docs and desktop package',()=>{
 for(const filename of ['school-workspace-cloud.js','school-owner-reports.js','index.html','sw.js']){
  assert.equal(read(filename),read('docs/'+filename));
  assert.equal(read(filename),read('app-extracted/dist/'+filename));
 }
 for(const file of ['assets/index-brightnexa-v2.js','docs/assets/index-brightnexa-v2.js','app-extracted/dist/assets/index-brightnexa-v2.js'])
  assert.equal(read(file),read('assets/index-brightnexa-v2.js'));
 const cloud=read('school-workspace-cloud.js');
 assert.match(cloud,/rawStatus==='leave'\?'excused'/);
 assert.match(cloud,/norm\(row\.status\)==='excused'\?\{\.\.\.row,status:'Leave'\}/);
 const html=read('index.html');
 assert.match(html,/school-workspace-cloud\.js\?v=[0-9]{8}-[a-z0-9-]+/,'cloud loader must remain versioned without assuming an obsolete release date');
 assert.match(html,/school-owner-reports\.js\?v=20261111-owner-reports-v2/);
});
