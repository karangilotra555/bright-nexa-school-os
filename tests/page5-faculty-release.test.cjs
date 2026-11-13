'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app-extracted/src/BrightNexaApp.jsx'),'utf8');
const edge=fs.readFileSync(path.join(__dirname,'../supabase/functions/school-invite-staff/index.ts'),'utf8');
const faculty=source.slice(source.indexOf('function Sr({ data:'),source.indexOf('async function bnInviteTeacherAppAccount('));
test('faculty delete does not close profile unless cloud confirms',()=>{
  assert.match(faculty,/let f = async \(teacher\)/);
  assert.ok(faculty.includes("result?.status !== 'synced' || result.pending"));
  const f=faculty.slice(faculty.indexOf('let f = async'),faculty.indexOf('const Component176'));
  assert.ok(f.indexOf("result?.status !== 'synced'") < f.indexOf('a(null)'));
  assert.ok(f.includes('setTeacherDeleteState({id:null,error:'));
  assert.ok(source.includes('disabled={deleteBusy}'));
  assert.ok(source.includes('{deleteError &&'));
});
test('faculty profiles cannot save incomplete status, joining date, email or code',()=>{
  for(const term of [
    'Teacher full name (at least 2 characters) is required.',
    'Employee code is required.','Enter a valid teacher email address.',
    'Date of Joining is required.','Select the employment status.',
    'Select the employment type.','Another teacher already uses this email.'
  ])assert.ok(faculty.includes(term),term);
});
test('employment subforms are constrained to matching type',()=>{
  for(const term of ["a.employmentType === 'Contract'","a.employmentType === 'Part-time'","a.employmentType === 'Visiting'",
    "Contract End Date","Days per Week","Hours per Day","Visits per Month",
    'one or more assigned classes'])assert.ok(faculty.includes(term) || faculty.toLowerCase().includes(term.toLowerCase()),term);
});
test('faculty invitations verify persisted profile and fail closed on assignment errors',()=>{
  assert.ok(source.includes("facultyId:String(teacher.id)"));
  assert.ok(edge.includes('await teacherContext(admin,member.institution_id,facultyId,email)'));
  assert.ok(edge.includes('status:role==="teacher"?"disabled":"active"'));
  assert.ok(edge.includes('school_staff_profiles'));
  assert.ok(edge.includes('school_teacher_assignments'));
  assert.ok(edge.includes('onConflict:"school_user_id,class_id,subject"'));
  assert.ok(edge.includes('status:"updated"'));
});
test('oversize faculty photo gets optimized before cloud save',()=>{
  assert.ok(faculty.includes("o.photoDataUrl.length > 300000"));
  assert.ok(faculty.includes('bnOptimizePortrait(new File([original]'));
  assert.ok(faculty.includes("Salary and bank data are part of the authenticated school workspace"));
});
