const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app-extracted/src/BrightNexaApp.jsx'),'utf8');
function engine(){
  const start=source.indexOf('var Rn = [');
  const end=source.indexOf('var Zn = ',start);
  const context={};vm.createContext(context);
  vm.runInContext(source.slice(start,end)+';this.api={Xn,report:typeof buildPendingFeeReport===\'function\'?buildPendingFeeReport:null,csv:typeof pendingFeeCsv===\'function\'?pendingFeeCsv:null}',context);
  return context.api;
}
const student={id:'s1',name:'Learner',className:'9',section:'A',status:'Active',studentUniqueId:'ID1'};
const institution={session:'2026–27'};
function data(extra={}){return {feeStructures:[{id:'tuition',category:'Tuition',className:'9',academicSession:institution.session,amount:1000,frequency:'Monthly',dueDay:10}],feePayments:[],...extra};}
function report(d,students=[student],day='2026-05-10'){
 const api=engine();assert.equal(typeof api.report,'function','pending report must be implemented');
 return JSON.parse(JSON.stringify(api.report(d,students,institution,day)));
}
test('separates overdue, due today and future amounts without calling the whole year overdue',()=>{
 const d=data({feePayments:[{id:'p',studentId:'s1',category:'Tuition',amount:400,concessionAmount:100,billingMonth:4,billingYear:2026}]});
 const result=report(d);assert.equal(result.totals.overdue,500);assert.equal(result.totals.dueToday,1000);assert.equal(result.totals.upcoming,10000);assert.equal(result.totals.outstanding,11500);assert.equal(result.rows[0].earliestDue,'2026-04-10');
});
test('reversed payments do not settle fees and concessions settle without creating cash',()=>{
 const d=data({feePayments:[{studentId:'s1',category:'Tuition',amount:1000,billingMonth:4,billingYear:2026,status:'Reversed'},{studentId:'s1',category:'Tuition',amount:0,concessionAmount:1000,billingMonth:5,billingYear:2026}]});
 const r=report(d);assert.equal(r.totals.overdue,1000);assert.equal(r.totals.dueToday,0);assert.equal(r.rows[0].lines.length,11);
});
test('one-time and annual fees without explicit billing dates remain unscheduled',()=>{
 const d=data({feeStructures:[{id:'a',category:'Admission',className:'9',amount:200,frequency:'One time',dueDay:10},{id:'b',category:'Annual',className:'9',amount:300,frequency:'Annual',dueDay:10}]});
 const r=report(d);assert.equal(r.totals.unscheduled,500);assert.equal(r.totals.overdue,0);assert.equal(r.rows[0].earliestDue,null);
});
test('includes active students only, excludes settled students and does not mutate inputs',()=>{
 const d=data({feePayments:[{studentId:'s1',category:'Tuition',amount:12000,obligationKey:'tuition|s1|April 2026'}]});
 const students=[student,{...student,id:'archived',status:'Archived'},{...student,id:'paid',name:'Paid'}];
 d.feePayments.push(...Array.from({length:12},(_,i)=>({studentId:'paid',category:'Tuition',amount:1000,billingMonth:i<9?i+4:i-8,billingYear:i<9?2026:2027})));
 const before=JSON.stringify({d,students});const r=report(d,students);assert.equal(r.rows.length,1);assert.equal(r.rows[0].student.id,'s1');assert.equal(r.totals.outstanding,11000);assert.equal(JSON.stringify({d,students}),before);
});
test('clamps a configured day 31 to the last day of a shorter month',()=>{
 const d=data();d.feeStructures[0].dueDay=31;const r=report(d,[student],'2026-04-30');assert.equal(r.totals.overdue,0);assert.equal(r.totals.dueToday,1000);assert.equal(r.rows[0].lines[0].dueOn,'2026-04-30');
});
test('missing due day is not silently treated as overdue',()=>{
 const d=data();delete d.feeStructures[0].dueDay;const r=report(d);assert.equal(r.totals.unscheduled,12000);assert.equal(r.totals.overdue,0);
});
test('invalid dates and nonfinite balances fail explicitly',()=>{
 assert.throws(()=>report(data(),[student],'2026-02-30'),/date/i);const d=data();d.feeStructures[0].amount=NaN;assert.throws(()=>report(d),/amount|balance/i);
});
test('CSV escapes spreadsheet formulas and exports the same detailed outstanding totals',()=>{
 const r=report(data(),[{...student,name:'=HYPERLINK("bad")'}]);const api=engine();assert.equal(typeof api.csv,'function');const csv=api.csv(r);assert.ok(csv.includes("'=HYPERLINK"));assert.ok(csv.includes('Due date'));assert.equal(csv.split('\r\n').length,13);
});
