'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const source=()=>read('app-extracted/src/BrightNexaApp.jsx');
const bundled=()=>read('assets/index-brightnexa-v2.js');
test('student editor checks Supabase-ready name, admission, class, and section before calling onSave',()=>{
  for(const content of [source(),bundled()]){
    assert.match(content,/BNStudentAdmissionRules/);
    assert.match(content,/admissionRules\.validate\(/);
    assert.match(content,/admissionRules\.normalize\(/);
    assert.match(content,/error:\s*o\d*\.section|error=\{o\.section\}/);
    assert.match(content,/status:\s*`Active`/);
  }
});
test('Excel import validates each class section and does not claim success before Supabase',()=>{
  for(const content of [source(),bundled()]){
    assert.match(content,/BNStudentAdmissionRules\?\.importAllowed\(/);
    assert.match(content,/student records staged\. Confirm Supabase sync/);
    assert.doesNotMatch(content,/students imported successfully/);
  }
});
test('Students table pages filtered results at 25 rows with next previous and search reset',()=>{
  for(const content of [source(),bundled()]){
    assert.match(content,/studentPageSize\s*=\s*25/);
    assert.match(content,/pagedStudents\.map\(/);
    assert.match(content,/studentPageCount\s*>\s*1/);
    assert.match(content,/setStudentPage\(1\)/);
    assert.match(content,/student-pagination/);
  }
});
test('shipped page and scripts are identical across web, docs, and desktop',()=>{
  for(const base of ['docs/','app-extracted/dist/']){
    for(const name of ['index.html','school-student-admission-rules.js','assets/index-brightnexa-v2.js','school-student-roster-layout.css'])
      assert.equal(read(base+name),read(name),base+name+' differs');
  }
  for(const base of ['','docs/','app-extracted/dist/']){
    const html=read(base+'index.html');
    const rules=html.indexOf('school-student-admission-rules.js?v=20261112-student-validation-v1');
    const entry=html.indexOf('school-erp-entry.js?v=');
    assert.ok(rules>=0&&rules<entry,'rules must load before ERP bundle');
  }
});
