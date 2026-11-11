'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const engine=require('../school-owner-reports.js');
const fixture={
 teachers:[{id:'t1',name:'Teacher One',salary:30000,salaryFrequency:'Monthly',paidLeaveAllowedPerMonth:1,status:'Active'}],
 nonTeachingStaff:[{id:'n1',name:'Staff One',employeeCode:'S001',salary:18000,salaryFrequency:'Monthly',paidLeaveAllowedPerMonth:0,status:'Active'}],
 staffAttendance:[
  {staffType:'Teaching',staffId:'t1',date:'2026-11-03',status:'Present'},
  {staffType:'Teaching',staffId:'t1',date:'2026-11-04',status:'Paid Leave'},
  {staffType:'Non-Teaching',staffId:'n1',date:'2026-11-03',status:'Absent'},
  {staffType:'Non-Teaching',staffId:'n1',date:'2026-11-03',status:'Absent'}
 ],
 holidays:[{id:'h1',date:'2026-11-05',name:'Festival',appliesTo:'All'}, {id:'h2',date:'2026-11-06',name:'Teachers Day',appliesTo:'Teaching Staff'}],
 feePayments:[
  {id:'f1',paymentDate:'2026-11-02',studentId:'s1',amount:1500,receiptNumber:'R001',status:'Posted'},
  {id:'f2',paymentDate:'2026-11-03',studentId:'s1',amount:2000,receiptNumber:'R002',status:'Reversed'},
  {id:'f3',paymentDate:'2026-10-30',studentId:'s1',amount:50}
 ],
 expenses:[
  {id:'e1',expenseDate:'2026-11-08',title:'School Rent',category:'Building Rent or Lease',totalAmount:20000,amountPaid:12000,paymentStatus:'Partially Paid'},
  {id:'e2',expenseDate:'2026-11-10',title:'Staff Salaries',category:'Non-Teaching Staff Salaries',totalAmount:18000,amountPaid:18000,paymentStatus:'Paid'},
  {id:'e3',expenseDate:'2026-10-25',totalAmount:10000,amountPaid:10000,paymentStatus:'Paid'}
 ]
};
const report=engine.aggregate(fixture,[{id:'s1',name:'Student One',admissionNumber:'A01'}],'2026-11');
test('Owner monthly totals use actual ledger: reversed fees excluded; salary is NOT added twice',()=>{
 assert.equal(report.feeCollected,1500);
 assert.equal(report.feeReceipts,1);
 assert.equal(report.fees.length,2);
 assert.equal(report.fees[0].admission,'A01');
 assert.equal(report.expenseTotal,38000);
 assert.equal(report.expensePaid,30000);
 assert.equal(report.expenseDue,8000);
 assert.equal(report.monthlySalaryConfigured,48000);
 assert.ok(report.estimatedPayroll<48000);
 assert.equal(report.expenses.length,2);
});
test('Paid leave, staff absences and school holidays are different metrics',()=>{
 const teacher=report.staff.find(x=>x.id==='t1'),staff=report.staff.find(x=>x.id==='n1');
 assert.equal(teacher.paidLeave,1);
 assert.equal(teacher.allowance,1);
 assert.equal(teacher.deductible,0);
 assert.equal(teacher.excludedHolidays,2);
 assert.equal(staff.excludedHolidays,1);
 assert.equal(staff.absent,1,'Duplicate same-day staff mark must not double-count absence');
 assert.equal(staff.deductible,1);
 assert.ok(staff.estimated<18000);
 assert.ok(teacher.pending>0);
 assert.equal(report.paidLeaves,1);
});
test('Missing salaries show as not configured instead of a fictitious zero-pay employee',()=>{
 const data={teachers:[{id:'p1',name:'New Teacher',status:'Active'}],nonTeachingStaff:[
  {id:'n2',name:'Daily Worker',salary:800,salaryFrequency:'Daily',status:'Active'}
 ]};
 const r=engine.aggregate(data,[],'2026-11');
 assert.equal(r.missingSalary,2);
 assert.equal(r.staff[0].estimated,null);
 assert.equal(r.staff[1].estimated,null);
 assert.equal(r.estimatedPayroll,0);
 assert.throws(()=>engine.aggregate(data,[],'2026-13'),/valid reporting month/);
});
test('Owner Reports is a native owner-only sidebar item in both JSX and compiled mirror',()=>{
 for(const file of ['app-extracted/src/BrightNexaApp.jsx','assets/index-brightnexa-v2.js']){
  const s=read(file),nav=s.slice(s.indexOf('var Ts = ['));
  assert.match(nav,/label: \x60Owner Reports\x60,\s*icon: _Component12,\s*roles: \[\x60OWNER\x60\]/);
  assert.match(s,/window\.BNOwnerReports\.getView\(w\)/);
  assert.match(s,/Owner access is required/);
  const form=s.slice(s.indexOf('function $a({ initial:'),s.indexOf('function _Component91(',s.indexOf('function $a({ initial:')));
  assert.ok(form.indexOf('Salary Amount (₹)')<form.indexOf('Staff Category'),'Salary must show in first visible section');
  assert.match(form,/Bank and Verification Information/);
  assert.ok(!form.includes('Salary, Bank, and Verification Information'));
 }
 assert.equal(read('assets/index-brightnexa-v2.js'),read('docs/assets/index-brightnexa-v2.js'));
 assert.equal(read('assets/index-brightnexa-v2.js'),read('app-extracted/dist/assets/index-brightnexa-v2.js'));
});
test('Owner reports files and PWA cache are mirrored with exact content checksums',()=>{
 const js=read('school-owner-reports.js'),css=read('school-owner-reports.css');
 const index=read('index.html'),sw=read('sw.js'),bundle=read('assets/index-brightnexa-v2.js');
 for(const prefix of ['docs/','app-extracted/dist/']){
  for(const file of ['school-owner-reports.js','school-owner-reports.css','index.html','sw.js'])assert.equal(read(prefix+file),read(file),prefix+file);
 }
 assert.match(index,/school-owner-reports\.js\?v=20261111-owner-reports-v1/);
 assert.match(index,/school-owner-reports\.css\?v=20261111-owner-reports-v1/);
 for(const [path,content] of [
  ['index.html',index],['assets/index-brightnexa-v2.js',bundle],
  ['school-owner-reports.js?v=20261111-owner-reports-v1',js],
  ['school-owner-reports.css?v=20261111-owner-reports-v1',css]
 ]){
  const digest=crypto.createHash('sha256').update(content).digest('hex');
  assert.ok(sw.includes('url:"'+path+'",revision:"'+digest+'"') || sw.includes('"url":"'+path+'","revision":"'+digest+'"'),path+' precache checksum');
 }
 assert.doesNotMatch(js,/service_role|SUPABASE_SERVICE_ROLE_KEY/);
});
test('CSV export escapes cells, protecting spreadsheet formula injection',()=>{
 const csv=engine.csv([{name:'=SUM(1,1)',value:123,notes:'a"b'}],[['Name','name'],['Value','value'],['Notes','notes']]);
 assert.match(csv,/'=SUM/);
 assert.match(csv,/a""b/);
});
