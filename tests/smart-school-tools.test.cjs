'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const source=f=>fs.readFileSync(path.join(root,f),'utf8');
const E=require('../smart-tools-engine.js');

test('CSV supports quoted commas, escaped quotes, line breaks and BOM',()=>{
 const rows=E.parseCsv('\uFEFFStudent Name,Note,Marks\n"Jia, K","said ""hello""",49\nArun,"two\nlines",39\n');
 assert.equal(rows.length,2);
 assert.equal(rows[0]['Student Name'],'Jia, K');
 assert.equal(rows[0].Note,'said "hello"');
 assert.equal(rows[1].Note,'two\nlines');
 assert.throws(()=>E.parseCsv('id,id\n1,2'),/Duplicate/);
 assert.throws(()=>E.parseCsv('a,b\n"unclosed,2'),/unclosed/);
});
test('Column mapper tolerates real-world school field variants',()=>{
 const rows=E.parseCsv('Admission No,Student Name,Class,Section\n001,Arun,6,A');
 const c=E.canonical(rows,'students');
 assert.deepEqual(c.records[0],{_row:2,id:'001',name:'Arun',class:'6',section:'A'});
 assert.equal(c.mapping.id,'Admission No');
});
test('Timetable prevents teacher double booking, respects maximum daily loads and unavailability',()=>{
 const teacherRows=E.parseCsv('teacher,subjects,classes,maxdaily,unavailable\nAsha,Math;Science,VI-A;VII-A,2,Mon-1\nRitu,Math;Science,VI-A;VII-A,2,\nMeera,English,VI-A;VII-A,2,');
 const teachers=E.canonical(teacherRows,'teachers').records;
 const demands=[
 {class:'VI-A',subject:'Math',periods:3},
 {class:'VI-A',subject:'Science',periods:2},
 {class:'VII-A',subject:'English',periods:3},
 {class:'VII-A',subject:'Math',periods:2}
 ];
 const out=E.schedule({teachers,demands,days:['Mon','Tue','Wed'],periods:3});
 const busy=new Set();
 for(const row of out.rows.filter(x=>x.teacher)){
  const k=row.day+'|'+row.period+'|'+row.teacher;
  assert.ok(!busy.has(k),'Collision '+k);busy.add(k);
  assert.notEqual(k,'Mon|1|Asha','unavailable slot');
 }
 for(const name of ['Asha','Ritu','Meera']){
  for(const day of out.days){
   const n=out.rows.filter(x=>x.teacher===name&&x.day===day).length;
   assert.ok(n<=2,'Too many lessons for '+name+' on '+day);
  }
 }
 assert.equal(out.rows.length,18);
});
test('Insufficient teacher availability is reported, never silently fabricated',()=>{
 const p=E.schedule({teachers:[{teacher:'Asha',subjects:'Math',maxdaily:1}],
 demands:[{class:'VI-A',subject:'Math',periods:5}],days:['Mon'],periods:2});
 assert.ok(p.issues.length);
 assert.ok(p.rows.some(x=>x.unfilled));
 assert.ok(p.assigned<5);
});
test('Substitute teachers must be qualified, available and not teaching simultaneously',()=>{
 const p={teachers:[
   {name:'Asha',subjects:['Math'],classes:[],maxdaily:4,unavailable:[],index:0},
   {name:'Ritu',subjects:['Math'],classes:[],maxdaily:4,unavailable:[],index:1},
   {name:'Jia',subjects:['Math'],classes:[],maxdaily:4,unavailable:[],index:2},
   {name:'Meera',subjects:['English'],classes:[],maxdaily:4,unavailable:[],index:3}
 ],rows:[
   {day:'Mon',period:1,class:'VI-A',subject:'Math',teacher:'Asha'},
   {day:'Mon',period:1,class:'VI-B',subject:'Math',teacher:'Jia'}
 ]};
 const recs=E.substitutes(p,'Asha','Mon',1);
 assert.equal(recs.length,1);
 assert.deepEqual(recs[0].suggestions.map(x=>x.teacher),['Ritu']);
});
test('Performance uses only recorded marks, supports weaknesses and previous change',()=>{
 const x=E.canonical(E.parseCsv('Student ID,Student Name,Subject,Marks,Max Marks,Previous Marks,Attendance Percent\nBN-1,Aarav,Math,30,100,20,80\nBN-1,Aarav,English,90,100,95,80\nBN-2,Mira,Math,100,50,20,70'),'marks').records;
 const p=E.performance(x,40);
 assert.equal(p.students.length,1);
 assert.equal(p.students[0].average,60);
 assert.deepEqual(p.students[0].weak,['Math']);
 assert.equal(p.students[0].subjects[0].change,10);
 assert.equal(p.issues.length,1);
});
test('School audit flags duplicate admissions/receipts, inconsistent fees, attendance gaps, invalid marks',()=>{
 const map=(name,csv)=>E.canonical(E.parseCsv(csv),name).records;
 const issues=E.detect({
  students:map('students','student_id,student_name,class\nBN-1,Raj,6\nBN-1,Duplicate,6\nBN-2,Neha,7'),
  fees:map('fees','student_id,receipt_no,total_fee,paid,balance\nBN-1,R1,100,60,50\nBN-2,R1,100,110,-10'),
  attendance:map('attendance','student_id,date,status\nBN-1,2026-10-20,present\nBN-1,2026-10-20,present'),
  marks:map('marks','student_id,subject,marks,max_marks\nBN-1,Math,110,100')
 });
 const output=issues.map(x=>x.message).join(' | ');
 for(const expected of ['Duplicate admission','Duplicate receipt','Balance does not match','Amount paid exceeds','Duplicate attendance','No attendance row','Marks outside'])assert.ok(output.includes(expected),expected);
});
test('CSV export neutralizes spreadsheet formulas',()=>{
 const csv=E.toCsv([{student:'=HYPERLINK("bad")',amount:'120'},{student:'+cmd',amount:'-5'}],['student','amount']);
 assert.ok(csv.includes("'=HYPERLINK"));
 assert.ok(csv.includes("'+cmd"));
});
test('All five tools and CSV/XLSX selectors are present; no external AI APIs',()=>{
 const h=source('smart-tools.html'),ui=source('smart-tools-ui.js'),eng=source('smart-tools-engine.js');
 for(const section of ['timetable','substitute','performance','import','errors']){
  assert.match(h,new RegExp('data-tab="'+section+'"'));
  assert.match(h,new RegExp('data-view="'+section+'"'));
 }
 assert.match(h,/\.xlsx/);
 assert.match(ui,/DecompressionStream/);
 assert.match(h,/connect-src 'none'/);
 assert.doesNotMatch(ui,/openai\.com|generativelanguage\.googleapis|api\.groq\.com|https:\/\//);
 assert.doesNotThrow(()=>new Function(ui));
 assert.doesNotThrow(()=>new Function(eng));
 for(const f of ['smart-tools.html','smart-tools-engine.js','smart-tools-ui.js'])assert.equal(source(f),source('docs/'+f));
});
test('Navigation exposes Smart Tools on school OS and static site',()=>{
 for(const f of ['parents-download-menu.js','docs/parents-download-menu.js']){
  const s=source(f);
  assert.match(s,/smart-tools\.html/);
  assert.match(s,/bn-smart-tools-nav/);
  assert.match(s,/bn-smart-tools-top/);
  assert.doesNotThrow(()=>new Function(s));
 }
});


test('Timetable uses editable school forms rather than raw CSV by default',()=>{
 const html=source('smart-tools.html'),js=source('smart-tools-ui.js');
 assert.equal(html,source('docs/smart-tools.html'));
 assert.equal(js,source('docs/smart-tools-ui.js'));
 for(const id of ['demandsEditor','teachersEditor','addDemand','addTeacher','ttClassesList','ttSubjectsList','importTimetableCsv','teachersCsv','demandsCsv']){
   assert.ok(html.includes('id="'+id+'"'),id);
 }
 const details=html.indexOf('<details class="tt-advanced" id="advancedTimetable">');
 assert.ok(details>0,'Advanced CSV collapsed by default');
 const raw=html.indexOf('id="teachersCsv"');
 assert.ok(raw>details,'CSV is inside collapsed advanced editor');
 assert.doesNotMatch(html.slice(details,details+95),/\bopen\b/);
 for(const fn of ['renderDemands','renderTeachers','loadEditorCsv','validatedTimetableInputs','invalidateTimetable','renderSchedule']){
   assert.ok(js.includes('function '+fn+'('),fn);
 }
 assert.match(js,/checkChoices\(card,'SUBJECTS'/);
 assert.match(js,/checkChoices\(card,'CLASSES'/);
 assert.match(js,/id="advancedTimetable"|\$\('advancedTimetable'\)/);
 assert.doesNotThrow(()=>new Function(js));
});
test('Timetable produces class/day/period matrix for user readability',()=>{
 const js=source('smart-tools-ui.js'),start=js.indexOf('function renderSchedule(){');
 const end=js.indexOf('function renderSubstitutes(){',start);
 const fn=js.slice(start,end);
 assert.match(fn,/tt-result-table/);
 assert.match(fn,/tt-result-class/);
 assert.match(fn,/for\(const day of plan.days\)/);
 assert.match(fn,/for\(let period=1;period<=plan.periods;period\+\+\)/);
 assert.match(fn,/Free \/ Study/);
 assert.match(fn,/lesson\.teacher/);
});
