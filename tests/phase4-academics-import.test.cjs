'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const A=require('../docs/school-phase4-academics.js'),E=require('../docs/smart-tools-engine.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const students=[{id:'s1',name:'Aarav',admission_number:'A-001',status:'active'},
                {id:'s2',name:'Diya',admission_number:'B-002',status:'active'}];
const entries=[
 {id:'m1',module:'exams',details:{student:'s1',exam:'Unit Test',subject:'Math',obtained:'38',maximum:'50'}},
 {id:'m2',module:'exams',details:{student:'s1',exam:'Unit Test',subject:'English',obtained:'42',maximum:'50'}},
 {id:'m3',module:'exams',details:{student:'s1',exam:'Final',subject:'Math',obtained:'85',maximum:'100'}},
 {id:'m4',module:'exams',details:{student:'s2',exam:'Unit Test',subject:'Math',obtained:'49',maximum:'50'}}
];
const classes=[{id:'c1',name:'Class 1',section:'A',academic_year:'2026-2027'},
               {id:'c2',name:'Class 1',section:'B',academic_year:'2026-2027'},
               {id:'c3',name:'Class 1',section:'A',academic_year:'2025-2026'},
               {id:'c4',name:'LKG',section:'A',academic_year:'2026-2027'}];
test('marks only accept real school students and numeric values between zero and maximum',()=>{
 const valid={student:'s1',exam:'Final',subject:'Science',obtained:'0',maximum:'80'};
 assert.deepEqual(A.markDetails(valid,students,entries),{...valid,obtained:'0',maximum:'80'});
 assert.throws(()=>A.markDetails({...valid,student:'other'},students,entries),/belonging to this school/);
 assert.throws(()=>A.markDetails({...valid,obtained:'81'},students,entries),/exceed/);
 assert.throws(()=>A.markDetails({...valid,obtained:'-1'},students,entries),/obtained marks/);
 assert.throws(()=>A.markDetails({...valid,maximum:'0'},students,entries),/maximum marks/);
 assert.throws(()=>A.markDetails({...valid,obtained:'1.234'},students,entries),/two decimal/);
});
test('existing marks must be edited rather than duplicated under the same student/exam/subject',()=>{
 const v={student:'s1',exam:'unit test',subject:' MATH ',obtained:'39',maximum:'50'};
 assert.throws(()=>A.markDetails(v,students,entries),/already has a saved mark/);
 assert.equal(A.markDetails(v,students,entries,'m1').obtained,'39');
 assert.equal(A.markDetails({...v,exam:'Final',subject:'Science'},students,entries).exam,'Final');
});
test('report cards never mix Unit Test and Final, or another student',()=>{
 assert.deepEqual(A.examNames(entries,'s1'),['Final','Unit Test']);
 const unit=A.report(entries,'s1','UNIT TEST');
 assert.equal(unit.subjects.length,2);assert.equal(unit.obtained,80);assert.equal(unit.maximum,100);assert.equal(unit.percent,80);
 const final=A.report(entries,'s1','Final');
 assert.equal(final.subjects.length,1);assert.equal(final.obtained,85);assert.equal(final.maximum,100);
 assert.equal(A.report(entries,'s2','Unit Test').obtained,49);
});
test('invalid or duplicate legacy marks are explicitly reported, not silently added',()=>{
 const duplicate={id:'m5',module:'exams',details:{student:'s1',exam:'Unit Test',subject:'MATH',obtained:'48',maximum:'50'}};
 const impossible={id:'m6',module:'exams',details:{student:'s1',exam:'Unit Test',subject:'Science',obtained:'120',maximum:'50'}};
 const r=A.report([...entries,duplicate,impossible],'s1','Unit Test');
 assert.equal(r.subjects.length,2);
 assert.equal(r.issues.length,2);
});
test('CSV exports neutralize formulas and quote unsafe values',()=>{
 const output=A.csv([{student:'=HYPERLINK("evil")',subject:'+cmd',exam:'Unit, Test',note:'line\nbreak'}],['student','subject','exam','note']);
 assert.ok(output.includes("'=HYPERLINK"));
 assert.ok(output.includes("'+cmd"));
 assert.ok(output.includes('"Unit, Test"'));
 assert.ok(output.includes('"line\nbreak"'));
});
test('preview-only admissions import resolves class + year and validates DOB including Excel serial',()=>{
 const csv='Admission No,Student Name,Class,Section,Academic Year,DOB\nA-003,Rekha,Class 1,A,2026-2027,2017-02-08\nA-004,Rohan,LKG,A,2026-2027,42100';
 const parsed=E.parseCsv(csv),preview=A.previewAdmissions(parsed,classes,students);
 assert.equal(preview.canCommit,true);assert.equal(preview.valid.length,2);
 assert.equal(preview.valid[0].class_id,'c1');
 assert.match(preview.valid[1].dob,/^20\d\d-/);
 assert.equal(preview.valid[0].dob,'2017-02-08');
});
test('admissions import aborts whole batch on duplicate, unknown or ambiguous rows',()=>{
 const file='Admission No,Student Name,Class,Section,DOB\nA-003,Rekha,Class 1,A,2017-02-08\nA-003,Rohan,LKG,A,2016-01-10\nA-001,Existing,LKG,A,2015-01-10\nA-005,Bad,Class 7,Z,2016-01-10';
 const result=A.previewAdmissions(E.parseCsv(file),classes,students);
 assert.equal(result.canCommit,false);
 assert.equal(result.errors.length,4);
 assert.match(result.errors.map(x=>x.reason).join('|'),/ambiguous|Duplicate|exists|not found/i);
 const single='Admission No,Student Name,Class,Section,Academic Year\nA-006,Asha,Class 1,A,2026-2027';
 assert.equal(A.previewAdmissions(E.parseCsv(single),classes,students).canCommit,true);
 assert.equal(A.previewAdmissions(E.parseCsv(single),classes,[...students,{admission_number:'A-006',status:'archived'}]).canCommit,false);
});
test('dates reject future and invalid calendar values',()=>{
 assert.equal(A.parseDob('08/02/2017'),'2017-02-08');
 assert.throws(()=>A.parseDob('31/02/2017'),/real date/);
 assert.throws(()=>A.parseDob('2099-01-01'),/future/);
});
test('Phase 4 development modules parse and load in owner workspace; import never silently writes',()=>{
 const html=read('docs/real-owner-workspace.html'),owner=read('docs/real-owner-workspace.js'),extra=read('docs/school-extra-modules.js');
 const importer=read('docs/school-phase4-import-ui.js'),xlsx=read('docs/school-xlsx-reader.js');
 for(const script of ['smart-tools-engine.js','school-xlsx-reader.js','school-phase4-academics.js','school-phase4-import-ui.js','school-extra-modules.js']){
   assert.ok(html.includes('./'+script),script+' missing');
 }
 assert.ok(html.indexOf('school-phase4-academics.js')<html.indexOf('school-extra-modules.js'));
 assert.ok(html.indexOf('school-phase4-import-ui.js')<html.indexOf('real-owner-workspace.js'));
 assert.match(owner,/BrightNexaAdmissionsImport/);
 assert.match(extra,/BrightNexaAcademics\.markDetails/);
 assert.match(extra,/BrightNexaAcademics/);
 assert.match(importer,/previewAdmissions/);
 assert.match(importer,/const \[currentStudents,currentClasses\]=await Promise\.all/);
 assert.match(importer,/\.canCommit/);
 assert.match(importer,/if\(!Array\.isArray\(written\)/);
 assert.match(importer,/if\(state\.offlineReadOnly\)/);
 for(const code of [owner,extra,importer,xlsx])assert.doesNotThrow(()=>new vm.Script(code));
});
test('Phase 4 new scripts are included in owner offline shell without caching auth or REST responses',()=>{
 const sw=read('docs/owner-offline-sw.js');
 for(const filename of ['school-xlsx-reader.js','school-phase4-academics.js','school-phase4-import-ui.js','smart-tools-engine.js'])assert.ok(sw.includes(filename));
 assert.match(sw,/bright-nexa-owner-shell-v7/);
 assert.doesNotMatch(sw,/rest\/v1|auth\/v1/);
});
