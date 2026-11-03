'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=p=>fs.readFileSync(require('node:path').join(__dirname,'..',p),'utf8');
test('QA patches mirror published docs and remain syntactically valid',()=>{
 for(const file of ['index.html','teacher-access.js','smart-tools.html','smart-tools-ui.js','school-demo.html','demo-qa-fixes.js']){
   assert.equal(read(file),read('docs/'+file),'mirror mismatch: '+file);
 }
 for(const script of ['teacher-access.js','smart-tools-ui.js','demo-qa-fixes.js'])
   assert.doesNotThrow(()=>new vm.Script(read(script)),script);
});
test('school accounts stay separate from the demo and registration validates before writing',()=>{
 const login=read('teacher-access.js'),index=read('index.html');
 assert.match(index,/Separate sample mode/);
 assert.match(index,/isolated browser-only demonstration/);
 assert.match(login,/id==='demo' && password==='demo'/);
 assert.match(login,/requireField\('signupSchoolName'/);
 assert.match(login,/requireField\('newSchoolName'/);
 assert.match(login,/requireField\('studentName'/);
 assert.match(login,/Admission number already exists in this school/);
 assert.match(login,/No attendance records selected/);
 assert.doesNotMatch(login,/service_role|sb_secret_/i);
});
test('sample-only demo controls do not write records and handle silent form actions',()=>{
 const code=read('demo-qa-fixes.js'),html=read('school-demo.html');
 assert.match(html,/demo-qa-fixes\.js/);
 assert.match(code,/Save Student/);
 assert.match(code,/Save Marked Records/);
 assert.match(code,/No attendance selected/);
 assert.match(code,/PAGE_SIZE = 10/);
 assert.match(code,/renderKey/);
 assert.match(code,/function studentTable\(\)/);
 assert.match(code,/querySelectorAll\('thead th'\)/);
 assert.match(code,/querySelectorAll\(':scope > tr'\)/);
 assert.doesNotMatch(code,/querySelectorAll\('\.student-row'\)/);
 assert.doesNotMatch(code,/fetch\(|localStorage\.|indexedDB\.|school_students|school_attendance/);
});
test('Excel import flags errors and offers reviewed clean CSV without cloud writes',()=>{
 const html=read('smart-tools.html'),js=read('smart-tools-ui.js');
 for(const marker of ['importIssueReview','excludeInvalid'])assert.match(html,new RegExp(marker));
 assert.match(js,/Review copy: excluded/);
 assert.match(js,/Original file unchanged/);
 assert.match(js,/showImport\(kind\)/);
});
