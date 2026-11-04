/* Bright Nexa Phase 3: UI-side guardrails only.
   Supabase Auth + tenant-scoped RLS are the real authorization layer. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.BrightNexaAccessGuard=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const adminRoles=new Set(['school_admin','principal']);
  function activeAssignments(assignments,userId,classId,flag){
    return (assignments||[]).filter(a=>a.active===true&&a.school_user_id===userId&&a.class_id===classId&&(!flag||a[flag]===true));
  }
  function writableClasses(role,classes,assignments,userId,flag){
    if(adminRoles.has(role))return classes||[];
    if(role!=='teacher')return [];
    return (classes||[]).filter(c=>activeAssignments(assignments,userId,c.id,flag).length>0);
  }
  function homeworkSubjects(role,assignments,userId,classId){
    if(adminRoles.has(role))return {all:true,subjects:[]};
    const relevant=activeAssignments(assignments,userId,classId,'can_assign_homework');
    return {all:relevant.some(a=>a.assignment_type==='class_teacher'),subjects:[...new Set(relevant.filter(a=>a.assignment_type==='subject_teacher'&&String(a.subject||'').trim()).map(a=>String(a.subject).trim()))]};
  }
  function canPublishHomework(role,assignments,userId,classId,subject){
    if(adminRoles.has(role))return true;
    if(role!=='teacher')return false;
    const normalized=String(subject||'').trim().toLocaleLowerCase('en');
    if(!normalized)return false;
    const rights=homeworkSubjects(role,assignments,userId,classId);
    return rights.all||rights.subjects.some(s=>s.toLocaleLowerCase('en')===normalized);
  }
  function linkedChildren(guardians,links,students){
    const byId=new Map((guardians||[]).filter(g=>g.status==='active').map(g=>[g.id,g]));
    const matches=new Set((links||[]).filter(l=>{const g=byId.get(l.guardian_id);return g&&g.institution_id===l.institution_id;}).map(l=>l.institution_id+':'+l.student_id));
    return (students||[]).filter(s=>s.status==='active'&&matches.has(s.institution_id+':'+s.id));
  }
  function confirmRow(rows,expectedId){
    if(!Array.isArray(rows)||rows.length!==1||!rows[0]?.id)throw Error('Cloud change was not confirmed. Refresh before retrying.');
    if(expectedId&&rows[0].id!==expectedId)throw Error('A different school record was returned; change not confirmed.');
    return rows[0];
  }
  function confirmAttendance(rows,expected){
    if(!Array.isArray(rows)||rows.length!==expected.length)throw Error('Attendance confirmation incomplete. Refresh class before retrying.');
    const actual=new Map(rows.map(r=>[r.student_id+':'+r.day,r]));
    if(actual.size!==expected.length||!expected.every(r=>{
      const got=actual.get(r.student_id+':'+r.day);
      return got&&got.institution_id===r.institution_id&&got.class_id===r.class_id&&got.status===r.status;
    }))throw Error('Attendance returned unexpected records. Refresh and verify each student.');
    return true;
  }
  return {activeAssignments,writableClasses,homeworkSubjects,canPublishHomework,linkedChildren,confirmRow,confirmAttendance};
});
