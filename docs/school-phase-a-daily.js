/* Phase A1: real daily school operational picture, no synthetic school actions.
   Active owner reads each school-scoped table using existing RLS and JWT. */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.BrightNexaDailyOps=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 function snapshot({students,staff,fees,classes},extra,{today,month}){
   const activeStudents=students.filter(s=>s.status==='active');
   const status=extra?.todayAttendance||[];
   const activeIds=new Set(activeStudents.map(s=>s.id));
   const unique=new Set(status.filter(x=>activeIds.has(x.student_id)).map(x=>x.student_id));
   const teacherLogins=(extra?.schoolUsers||[]).filter(x=>x.status==='active'&&x.role==='teacher');
   const assignments=(extra?.assignments||[]).filter(a=>a.active===true&&teacherLogins.some(t=>t.id===a.school_user_id));
   const parentIds=new Set((extra?.guardianLinks||[]).map(l=>l.guardian_id));
   const parents=(extra?.guardians||[]).filter(g=>g.status==='active');
   const outstanding=extra?.ledger||null;
   const pendingLeaves=(extra?.leaves||[]).filter(l=>l.status==='pending');
   const marked=status.filter(s=>activeIds.has(s.student_id)&&['present','absent','late','excused'].includes(s.status));
   const alerts=[];
   if(staff.some(x=>x.staff_category==='teaching')&&!teacherLogins.length)alerts.push('Teacher profiles exist, but no active teacher login has been verified.');
   if(teacherLogins.length&&!assignments.length)alerts.push('Teacher login accounts exist, but no active class assignments have been saved.');
   if(!parents.length)alerts.push('No active verified parent accounts are linked yet.');
   if(!fees.some(e=>e.kind==='charge'))alerts.push('No fee charges recorded; unpaid amounts cannot yet reflect a full fee structure.');
   return {
     today,month,activeStudents:activeStudents.length,
     markedToday:new Set(marked.map(x=>x.student_id)).size,
     absentToday:new Set(marked.filter(s=>s.status==='absent').map(s=>s.student_id)).size,
     unmarkedToday:Math.max(0,activeStudents.length-unique.size),
     collectedThisMonth:outstanding?.totals.monthCollected??null,
     unpaidRecorded:outstanding?.totals.unpaid??null,
     pendingLeaveCount:pendingLeaves.length,
     teacherProfiles:staff.filter(x=>x.staff_category==='teaching').length,
     teacherLogins:teacherLogins.length,
     teacherAssignments:assignments.length,
     verifiedParents:parents.length,
     linkedChildren:new Set((extra?.guardianLinks||[]).filter(x=>parents.some(p=>p.id===x.guardian_id)).map(x=>x.student_id)).size,
     parentsWithoutLinks:parents.filter(p=>!parentIds.has(p.id)).length,
     alerts
   };
 }
 return {snapshot};
});
