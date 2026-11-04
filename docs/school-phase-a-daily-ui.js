/* Phase A1: owner attention dashboard. All metrics come from authorized school records. */
(() => {
 'use strict';
 const reader=window.BrightNexaDailyOps,report=window.BrightNexaOperationsReports;
 const el=(name,value,cls)=>{const x=document.createElement(name);if(value!==undefined)x.textContent=String(value);if(cls)x.className=cls;return x};
 const stamp=()=>new Date().toLocaleDateString('en-CA');
 const inr=n=>n===null?'Not recorded':'₹'+Number(n).toLocaleString('en-IN');
 let generation=0;
 function metric(label,value,hint){
   const item=el('article',undefined,'phase-a-metric');
   item.append(el('span',label),el('strong',value),el('small',hint));return item;
 }
 async function refresh({state,allSchool,open}){
   const panel=document.getElementById('phaseAOps');if(!panel)return;
   const id=++generation;
   panel.replaceChildren();panel.append(el('h2','Today’s school operations'),
     el('p','Verified cloud activity and setup status. Unmarked attendance is never treated as absent.','phase-a-help'));
   if(state.offlineReadOnly){panel.append(el('p','Offline snapshot: daily operations require fresh cloud records.','phase-a-alert'));return}
   panel.append(el('p','Refreshing operational checks…','phase-a-help'));
   try{
     const today=stamp(),month=today.slice(0,7);
     const [attendance,schoolUsers,assignments,guardians,links,leaves]=await Promise.all([
       allSchool('school_attendance','id,student_id,day,status',{day:'eq.'+today}),
       allSchool('school_users','id,role,status,email'),
       allSchool('school_teacher_assignments','id,school_user_id,class_id,active'),
       allSchool('school_guardians','id,status'),
       allSchool('school_guardian_students','guardian_id,student_id'),
       allSchool('school_parent_leaves','id,status',{status:'eq.pending'})
     ]);
     if(id!==generation)return;
     const fees=report.ledgerReport([...state.students,...state.formerStudents],state.classes,state.fees,
       {asOf:today,month});
     if(fees.totals.issues.length)throw Error('Financial summary has invalid ledger rows; review Fee balances before decisions.');
     const summary=reader.snapshot(state,{
       todayAttendance:attendance,schoolUsers,assignments,guardians,guardianLinks:links,leaves,ledger:fees
     },{today,month});
     panel.replaceChildren();
     panel.append(el('h2','Today’s school operations'),
       el('p','As of '+today+' · Based on authorized cloud records. Unmarked students are not absent.','phase-a-help'));
     const grid=el('div',undefined,'phase-a-metrics');
     grid.append(
       metric('Student attendance marked',summary.markedToday+' / '+summary.activeStudents,'Today'),
       metric('Absent (recorded)',summary.absentToday,'Not-marked '+summary.unmarkedToday+' · may be holiday'),
       metric('Fee collected this month',inr(summary.collectedThisMonth),'Recorded payments only'),
       metric('Recorded unpaid balance',inr(summary.unpaidRecorded),'NOT overdue until fee schedules exist'),
       metric('Pending parent leave',summary.pendingLeaveCount,'Awaiting school decision'),
       metric('Teacher logins / profiles',summary.teacherLogins+' / '+summary.teacherProfiles,
         summary.teacherAssignments+' active class assignments'),
       metric('Verified parents',summary.verifiedParents,summary.linkedChildren+' children linked')
     );
     panel.append(grid);
     const actions=el('div',undefined,'phase-a-actions');
     for(const [title,destination] of [['Attendance report','Attendance'],['Fees & receipts','Fees'],['Students','Students']]){
       const b=el('button',title);b.type='button';b.addEventListener('click',()=>open(destination));actions.append(b);
     }
     const teacher=el('a','Invite teachers / assign class rights');teacher.href='./index.html?view=roles';actions.append(teacher);
     const parent=el('a','Link verified parents');parent.href='./school-operations.html';actions.append(parent);
     panel.append(actions);
     if(summary.alerts.length){
       const p=el('div',undefined,'phase-a-attention');p.append(el('h3','Setup attention'));
       const list=el('ul');
       for(const warning of summary.alerts)list.append(el('li',warning));
       p.append(list);panel.append(p);
     }
     panel.append(el('p','Attendance is a today-only summary; fees are the recorded ledger balance. School holiday calendar, approved fee schedules and late-fee policies are not yet configured.','phase-a-help'));
   }catch(e){
     if(id!==generation)return;
     panel.replaceChildren();panel.append(el('h2','Today’s school operations'),
       el('p','Live operational dashboard unavailable: '+e.message,'phase-a-alert'));
   }
 }
 window.BrightNexaPhaseADashboard={refresh};
})();
