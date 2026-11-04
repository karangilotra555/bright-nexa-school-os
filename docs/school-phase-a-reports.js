/* Phase A1: validated fee statements and attendance coverage reports.
   Pure read-only calculations; no fake dues, grades, payments or absent days. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.BrightNexaOperationsReports=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const money=x=>Number(x);
 function monthBounds(month){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month)))throw Error('Choose a valid reporting month.');
  const [year,n]=month.split('-').map(Number);
  const start=month+'-01', end=new Date(Date.UTC(year,n,1)).toISOString().slice(0,10);
  return {start,end,month};
 }
 function inMonth(day,month){return typeof day==='string'&&day.slice(0,7)===month}
 function compactText(value){return String(value??'').trim().toLowerCase().replace(/\s+/g,' ')}
 function classLabel(classes,id){
  const row=classes.find(c=>c.id===id);
  return row?[row.name,row.section].filter(Boolean).join(' '):'Unassigned';
 }
 function studentRows(students,classes,classId='all',search=''){
  const term=compactText(search);
  return [...students].filter(s=>(classId==='all'||s.class_id===classId)&&
    (!term||compactText(s.name+' '+s.admission_number).includes(term)))
    .sort((a,b)=>a.name.localeCompare(b.name)||a.admission_number.localeCompare(b.admission_number));
 }
 function validateAmount(x){
  const n=Number(x);
  if(!Number.isSafeInteger(n)||n<=0||n>100000000)throw Error('Malformed cloud fee amount.');
  return n;
 }
 function ledgerReport(students,classes,entries,{asOf,month,classId='all',search='',includeArchived=false}={}){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(asOf))||new Date(asOf).toISOString().slice(0,10)!==asOf)throw Error('Choose a valid report date.');
  monthBounds(month);
  const roster=studentRows(students.filter(s=>includeArchived||s.status==='active'),classes,classId,search);
  const chosen=new Set(roster.map(s=>s.id)),totals=new Map(),issues=[];
  for(const s of roster)totals.set(s.id,{student_id:s.id,name:s.name,admission_number:s.admission_number,
     class_id:s.class_id,class_name:classLabel(classes,s.class_id),status:s.status,
     charges:0,paid:0,monthCollected:0,monthCharges:0,entries:0,unpaid:0,advance:0,balance:0});
  for(const entry of entries||[]){
    if(!chosen.has(entry.student_id)||entry.occurred_on>asOf)continue;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(entry.occurred_on||'')) {issues.push({id:entry.id,reason:'Invalid ledger date'});continue}
    const line=totals.get(entry.student_id);
    try{
      const amount=validateAmount(entry.amount_rupees);
      if(entry.kind!=='charge'&&entry.kind!=='payment')throw Error('Unknown ledger entry type.');
      line.entries++;
      if(entry.kind==='charge'){line.charges+=amount;if(inMonth(entry.occurred_on,month))line.monthCharges+=amount}
      else{line.paid+=amount;if(inMonth(entry.occurred_on,month))line.monthCollected+=amount}
    }catch(e){issues.push({id:entry.id,reason:e.message})}
  }
  const aggregate={charges:0,paid:0,monthCollected:0,monthCharges:0,unpaid:0,advance:0,
    noLedger:0,students:roster.length,withBalance:0,issues};
  for(const line of totals.values()){
    line.balance=line.charges-line.paid;line.unpaid=Math.max(0,line.balance);
    line.advance=Math.max(0,-line.balance);
    for(const k of ['charges','paid','monthCollected','monthCharges','unpaid','advance'])aggregate[k]+=line[k];
    if(line.entries===0)aggregate.noLedger++;
    if(line.unpaid>0)aggregate.withBalance++;
  }
  return {asOf,month,rows:[...totals.values()],totals:aggregate,
    note:'Unpaid = recorded charges minus recorded payments. It is NOT an overdue/late-fee report because due dates and fee schedules are not yet recorded.'};
 }
 function monthAttendance(students,classes,records,{month,classId='all',search=''}={}){
  monthBounds(month);
  const roster=studentRows(students.filter(s=>s.status==='active'),classes,classId,search);
  const chosen=new Set(roster.map(s=>s.id)),counts=new Map(),seen=new Set(),issues=[];
  for(const s of roster)counts.set(s.id,{student_id:s.id,name:s.name,admission_number:s.admission_number,
    class_id:s.class_id,class_name:classLabel(classes,s.class_id),
    present:0,absent:0,late:0,excused:0,marked:0,attendancePercent:null});
  const byDate=new Map();
  for(const a of records||[]){
    if(!inMonth(a.day,month)||!chosen.has(a.student_id))continue;
    const pair=a.student_id+'|'+a.day;
    if(seen.has(pair)){issues.push({id:a.id,reason:'Duplicate student/day mark'});continue}
    seen.add(pair);
    if(!['present','absent','late','excused'].includes(a.status)){
      issues.push({id:a.id,reason:'Unexpected attendance status'});continue;
    }
    const person=counts.get(a.student_id);
    person[a.status]++;person.marked++;
    const date=byDate.get(a.day)||{day:a.day,present:0,absent:0,late:0,excused:0,marked:0};
    date[a.status]++;date.marked++;
    byDate.set(a.day,date);
  }
  const byStudent=[...counts.values()];
  const summary={present:0,absent:0,late:0,excused:0,marked:0,totalStudents:roster.length,
    recordedDates:byDate.size,markedPercent:null,issues};
  for(const person of byStudent){
    person.attendancePercent=person.marked?Math.round((person.present+person.late)*10000/person.marked)/100:null;
    for(const key of ['present','absent','late','excused','marked'])summary[key]+=person[key];
  }
  summary.markedPercent=summary.marked?Math.round((summary.present+summary.late)*10000/summary.marked)/100:null;
  const dates=[...byDate.values()].sort((a,b)=>b.day.localeCompare(a.day))
    .map(row=>({...row,unmarked:Math.max(0,roster.length-row.marked)}));
  return {month,byStudent,dates,summary,
    note:'Percentage uses marked student-days only (present + late) / recorded marks. Unmarked is NOT absent. Holidays and scheduled school days are not configured.'};
 }
 function csv(rows,fields){
  const escape=x=>{
    let s=String(x??'');
    // Protect Excel from interpreting attacker-controlled student names/formulas.
    if(/^[\s\u0000-\u001f]*[=+@-]/.test(s))s="'"+s;
    return '"'+s.replace(/"/g,'""')+'"';
  };
  return [fields.map(x=>escape(x)).join(','),...rows.map(r=>fields.map(k=>escape(r[k])).join(','))].join('\r\n');
 }
 function receipt(entry,student,school){
  if(!entry?.id||entry.kind!=='payment'||!student?.id||student.id!==entry.student_id||
    !school?.id||school.id!==entry.institution_id)throw Error('Only a confirmed same-school payment can generate a receipt.');
  const amount=validateAmount(entry.amount_rupees);
  if(!entry.reference||!entry.occurred_on)throw Error('Payment reference and date are required.');
  return {school:school.name,student:student.name,admission:student.admission_number,
    paid_on:entry.occurred_on,amount,reference:entry.reference,description:entry.description||'Payment received'};
 }
 return {monthBounds,classLabel,studentRows,ledgerReport,monthAttendance,csv,receipt};
});
