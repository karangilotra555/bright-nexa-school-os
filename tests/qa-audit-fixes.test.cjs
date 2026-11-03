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
 assert.match(login,/No attendance marked/);
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

test('public demo masks sample contact numbers in profile dialogs without changing records',()=>{
 const code=read('demo-qa-fixes.js');
 assert.match(code,/function maskDemoProfiles\(\)/);
 assert.match(code,/document\.body/);
 assert.match(code,/profile-detail-grid-item/);
 assert.match(code,/profile-detail-value/);
 assert.match(code,/Student Profile/);
 assert.doesNotMatch(code,/\\\\b/,'phone regex must have only one backslash per word boundary');
 const from=code.indexOf('  function maskPhoneText(text) {');
 const to=code.indexOf('  function maskDemoProfiles()',from);
 assert.ok(from>=0 && to>from);
 const mask=new Function(code.slice(from,to)+';return maskPhoneText;')();
 assert.equal(mask('9876543210'),'987*****10');
 assert.equal(mask('Phone 9812302001'),'Phone 981*****01');
 assert.equal(mask('Already masked 987*****10'),'Already masked 987*****10');
});

test('demo Student Profile parent phone is redacted without touching noncontact fields',()=>{
 const code=read('demo-qa-fixes.js');
 const start=code.indexOf('  function maskPhoneText(text) {');
 const end=code.indexOf('  function maskDemoProfiles()',start);
 const mask=new Function(code.slice(start,end)+';return maskPhoneText;')();
 const label={textContent:'Parent Mobile'};
 const value={textContent:'9876543210',querySelector:()=>null};
 const otherLabel={textContent:'Admission Number'};
 const otherValue={textContent:'2026110310',querySelector:()=>null};
 const cell=(caption,input)=>({querySelector:q=>q==='.profile-detail-label'?caption:q==='.profile-detail-value'?input:null});
 const dialog={querySelectorAll:q=>q==='.profile-detail-grid-item'?[cell(label,value),cell(otherLabel,otherValue)]:[]};
 const doc={querySelectorAll:q=>q.includes('student-profile-modal')?[dialog]:[]};
 const from=code.indexOf('  function maskDemoProfiles() {');
 const to=code.indexOf('  function prepareFeeDialog()',from);
 const runMask=new Function('document','maskPhoneText',code.slice(from,to)+';return maskDemoProfiles;')(doc,mask);
 runMask();
 assert.equal(value.textContent,'987*****10');
 assert.equal(otherValue.textContent,'2026110310');
 assert.equal(mask('987*****10'),'987*****10');
 assert.match(read('school-demo.html'),/demo-qa-fixes\.js\?v=20261103-profile-fee2/);
});
test('fee Save Payment is blocked for blank or whitespace cashier before React receives the click',()=>{
 const code=read('demo-qa-fixes.js');
 assert.match(code,/Cashier or authorised person/);
 assert.match(code,/Received By is required/);
 assert.match(code,/field\.required=true/);
 assert.match(code,/document\.addEventListener\('submit',enforceFeeCashierOnSubmit,true\)/);
 assert.match(code,/if \(feeButton\) enforceFeeCashierOnSubmit\(event\)/);
 const from=code.indexOf('  function enforceFeeCashierOnSubmit(event) {');
 const to=code.indexOf('  // Capture both click',from);
 const calls={error:0};
 const modal={}; const cashier={value:'  '};
 const guard=new Function('feeDialogFrom','cashierField','cashierError',code.slice(from,to)+';return enforceFeeCashierOnSubmit;')(
  ()=>modal,()=>cashier,()=>calls.error++
 );
 let prevented=0,stopped=0;
 const e={target:{},preventDefault:()=>prevented++,stopImmediatePropagation:()=>stopped++};
 guard(e);assert.equal(prevented,1);assert.equal(stopped,1);assert.equal(calls.error,1);
 cashier.value='Test Cashier';
 guard(e);assert.equal(prevented,1);assert.equal(calls.error,1);
});
