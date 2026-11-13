'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('all core browser entrypoints bound network failure and do not claim success on error',()=>{
 for(const p of ['school-workspace-cloud.js','school-erp-entry.js','teacher-access.js','parents-cloud.js','teacher-drafts-cloud.js']){
  const s=read(p);
  assert.match(s,/timedFetch|timedCloudFetch|requestTimeoutMs|const fetcher=async/,p+' missing bounded cloud request');
  assert.match(s,/timed out|timeout/i,p+' missing time-out feedback');
 }
 const t=read('teacher-access.js');
 assert.match(t,/method==='PATCH'\|\|method==='DELETE'/);
 assert.match(t,/result\.length===0/);
 assert.match(t,/Attendance verified in Supabase/);
 assert.match(t,/on_conflict=student_id%2Cday/);
 assert.match(t,/const expected=new Map\(records/);
 assert.match(t,/pendingHomeworkId/);
 assert.match(t,/if\(!published\)throw writeFailure/);
});
test('file and student photo uploads report ambiguous outcomes separately',()=>{
 const photo=read('school-student-photo-cloud.js'),files=read('school-homework-files.js');
 assert.match(photo,/previewWarning=true/);
 assert.match(photo,/return \{path,url,previewWarning\}/);
 assert.match(files,/method:'GET',headers:\{Range:'bytes=0-0'\}/);
 assert.match(files,/if\(missing\)await json/);
 assert.match(files,/Metadata was preserved for recovery/);
});
test('browser script versions use changed services in school and parent portals',()=>{
 const teacher=read('teacher-access.html'),parent=read('parents.html');
 for(const s of [teacher,parent]){
  assert.match(s,/school-homework-files\.js\?v=20261111-sync-audit-v1/);
  assert.match(s,/school-student-photo-cloud\.js\?v=20261111-sync-audit-v1/);
 }
 assert.match(teacher,/teacher-access\.js\?v=20261113-teacher-mobile-v1/);
 assert.match(parent,/parents-cloud\.js\?v=20261111-sync-timeout-v1/);
 for(const f of ['teacher-access.html','teacher-access.js','parents.html','parents-cloud.js','school-homework-files.js','school-student-photo-cloud.js','teacher-drafts-cloud.js','school-workspace-controller.js'])
  assert.equal(read(f),read('docs/'+f),f+' mirror differs');
});
