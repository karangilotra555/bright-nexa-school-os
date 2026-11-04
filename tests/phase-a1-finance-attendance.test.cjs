'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const R=require('../docs/school-phase-a-reports.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const inst='11111111-1111-4111-8111-111111111111';
const classes=[{id:'c1',name:'Class 1',section:'A'},{id:'c2',name:'Class 2',section:'B'}];
const students=[
 {id:'s1',name:'Aman',admission_number:'A001',status:'active',class_id:'c1'},
 {id:'s2',name:'Bela',admission_number:'B002',status:'active',class_id:'c1'},
 {id:'s3',name:'Chitra',admission_number:'C003',status:'active',class_id:'c2'},
 {id:'s4',name:'Archived student',admission_number:'D004',status:'archived',class_id:'c2'}
];
const fees=[
 {id:'f1',institution_id:inst,student_id:'s1',kind:'charge',amount_rupees:3000,reference:'CHG-1',occurred_on:'2026-11-01'},
 {id:'f2',institution_id:inst,student_id:'s1',kind:'payment',amount_rupees:2000,reference:'PAY-1',occurred_on:'2026-11-02'},
 {id:'f3',institution_id:inst,student_id:'s2',kind:'payment',amount_rupees:2000,reference:'PAY-2',occurred_on:'2026-11-03'},
 {id:'f4',institution_id:inst,student_id:'s3',kind:'charge',amount_rupees:4500,reference:'CHG-3',occurred_on:'2026-10-15'},
 {id:'f5',institution_id:inst,student_id:'s1',kind:'charge',amount_rupees:3000,reference:'CHG-FUTURE',occurred_on:'2026-12-01'},
 {id:'f6',institution_id:inst,student_id:'s4',kind:'charge',amount_rupees:4500,reference:'OLD-ARCH',occurred_on:'2026-10-15'}
];
const marks=[
 {id:'a1',student_id:'s1',day:'2026-11-01',status:'present'},
 {id:'a2',student_id:'s2',day:'2026-11-01',status:'absent'},
 {id:'a3',student_id:'s1',day:'2026-11-02',status:'late'},
 {id:'a4',student_id:'s1',day:'2026-11-03',status:'excused'},
 {id:'a5',student_id:'s1',day:'2026-10-20',status:'present'},
 {id:'a6',student_id:'s3',day:'2026-11-01',status:'present'}
];
test('fee balance uses charge-minus-payment, not fake due dates or negative defaulters',()=>{
 const r=R.ledgerReport(students,classes,fees,{asOf:'2026-11-04',month:'2026-11'});
 const a=r.rows.find(x=>x.student_id==='s1'),b=r.rows.find(x=>x.student_id==='s2');
 assert.equal(a.charges,3000);assert.equal(a.paid,2000);assert.equal(a.unpaid,1000);
 assert.equal(b.charges,0);assert.equal(b.paid,2000);assert.equal(b.unpaid,0);assert.equal(b.advance,2000);
 assert.equal(r.totals.charges,7500);assert.equal(r.totals.paid,4000);assert.equal(r.totals.unpaid,5500);
 assert.equal(r.totals.advance,2000);assert.equal(r.totals.monthCollected,4000);
 assert.equal(r.totals.students,3);assert.equal(r.totals.withBalance,2);
 assert.match(r.note,/NOT an overdue/);
});
test('fee report filters by class, admission search and archived status intentionally',()=>{
 const f={asOf:'2026-11-04',month:'2026-11',classId:'c2'};
 assert.deepEqual(R.ledgerReport(students,classes,fees,f).rows.map(x=>x.name),['Chitra']);
 assert.deepEqual(R.ledgerReport(students,classes,fees,{...f,includeArchived:true}).rows.map(x=>x.name),['Archived student','Chitra']);
 assert.equal(R.ledgerReport(students,classes,fees,{...f,search:'C003'}).rows.length,1);
 assert.equal(R.ledgerReport(students,classes,fees,{...f,search:'A001'}).rows.length,0);
});
test('fee report detects malformed ledger records and does not silently total them',()=>{
 const invalid={id:'bad',student_id:'s1',kind:'payment',amount_rupees:'0',occurred_on:'2026-11-04'};
 const r=R.ledgerReport(students,classes,[...fees,invalid],{asOf:'2026-11-04',month:'2026-11'});
 assert.equal(r.totals.issues.length,1);
 assert.equal(r.rows.find(x=>x.student_id==='s1').paid,2000);
});
test('receipt requires confirmed same-school payment and its immutable reference',()=>{
 const r=R.receipt(fees[1],students[0],{id:inst,name:'Haridwar Public School'});
 assert.deepEqual([r.school,r.student,r.amount,r.reference],['Haridwar Public School','Aman',2000,'PAY-1']);
 assert.throws(()=>R.receipt(fees[0],students[0],{id:inst}),/confirmed same-school payment/);
 assert.throws(()=>R.receipt(fees[1],students[1],{id:inst}),/confirmed same-school payment/);
 assert.throws(()=>R.receipt(fees[1],students[0],{id:'other'}),/confirmed same-school payment/);
});
test('attendance counts present late absent excused and NEVER invents absent for unmarked students',()=>{
 const r=R.monthAttendance(students,classes,marks,{month:'2026-11',classId:'c1'});
 const s1=r.byStudent.find(x=>x.student_id==='s1'),s2=r.byStudent.find(x=>x.student_id==='s2');
 assert.deepEqual([s1.present,s1.late,s1.absent,s1.excused,s1.marked],[1,1,0,1,3]);
 assert.equal(s1.attendancePercent,66.67);
 assert.equal(s2.marked,1);assert.equal(s2.absent,1);
 assert.equal(r.summary.marked,4);assert.equal(r.summary.recordedDates,3);
 const day=r.dates.find(x=>x.day==='2026-11-02');
 assert.equal(day.marked,1);assert.equal(day.unmarked,1);
 assert.match(r.note,/Unmarked is NOT absent/);
});
test('invalid attendance and duplicate student-day are surfaced',()=>{
 const invalid=[...marks,{id:'dupe',student_id:'s1',day:'2026-11-01',status:'absent'},
 {id:'bad',student_id:'s2',day:'2026-11-03',status:'mystery'}];
 const r=R.monthAttendance(students,classes,invalid,{month:'2026-11'});
 assert.equal(r.summary.issues.length,2);
 assert.equal(r.byStudent.find(x=>x.student_id==='s1').absent,0);
 assert.equal(r.byStudent.find(x=>x.student_id==='s2').marked,1);
});
test('months validate and cap correctly including December to January rollover',()=>{
 assert.deepEqual(R.monthBounds('2026-12'),{month:'2026-12',start:'2026-12-01',end:'2027-01-01'});
 assert.throws(()=>R.monthBounds('2026-13'),/valid reporting month/);
 assert.throws(()=>R.monthBounds('2026-00'),/valid reporting month/);
});
test('CSV neutralizes spreadsheet formula injection, escapes commas, quotes, linebreaks',()=>{
 const csv=R.csv([{name:'=cmd',admission_number:'+100',title:'quoted "name", hi',note:'a\nb'}],
 ['name','admission_number','title','note']);
 assert.match(csv,/"'=cmd"/);assert.match(csv,/"'\+100"/);assert.match(csv,/"quoted ""name"", hi"/);assert.match(csv,/"a\nb"/);
});
test('Phase A UI is strictly read-only and wired into correct owner sections',()=>{
 const owner=read('docs/real-owner-workspace.js'),html=read('docs/real-owner-workspace.html');
 const ui=read('docs/school-phase-a-reports-ui.js'),engine=read('docs/school-phase-a-reports.js'),sw=read('docs/owner-offline-sw.js');
 assert.ok(html.indexOf('school-phase-a-reports.js')<html.indexOf('school-phase-a-reports-ui.js'));
 assert.ok(html.indexOf('school-phase-a-reports-ui.js')<html.indexOf('real-owner-workspace.js'));
 assert.match(owner,/BrightNexaPhaseAReports\?\.showFees/);
 assert.match(owner,/BrightNexaPhaseAReports\?\.showAttendance/);
 assert.match(owner,/allSchool\('school_fee_entries','id,institution_id,student_id/);
 assert.match(ui,/allSchool\('school_attendance'/);
 assert.match(ui,/day\.gte\./);
 assert.match(ui,/day\.lt\./);
 assert.match(ui,/state\.offlineReadOnly/);
 assert.doesNotMatch(ui,/method:'POST'|method:'PATCH'|service_role|sb_secret_|demoLogin/);
 assert.ok(sw.includes('school-phase-a-reports-ui.js'));assert.ok(sw.includes('school-phase-a-reports.js'));
 for(const source of [ui,engine,owner])assert.doesNotThrow(()=>new vm.Script(source));
});
