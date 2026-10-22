'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {
  ACTIONS,ROLE_ACTIONS,authorizeStaff,requireStaffAccess,filterAuthorizedRecords
}=require('../src/security/staff-permissions.cjs');
const teacher={
  verified:true,status:'ACTIVE',schoolId:'school-1',role:'CLASS_TEACHER',
  assignments:[{active:true,schoolId:'school-1',className:'Class VI',section:'A'}]
};
const subjectTeacher={
  verified:true,status:'ACTIVE',schoolId:'school-1',role:'SUBJECT_TEACHER',
  assignments:[{active:true,schoolId:'school-1',className:'Class VI',section:'A',subject:'Mathematics'}]
};
const scope=(action,cls='Class VI',section='A',subject='Mathematics',schoolId='school-1')=>
  ({action,schoolId,className:cls,section,subject});
const permit=(a,r)=>authorizeStaff(a,r).allowed;

test('a class teacher can handle only assigned class students and attendance',()=>{
 assert.equal(permit(teacher,scope('students.read_basic')),true);
 assert.equal(permit(teacher,scope('attendance.write')),true);
 assert.equal(permit(teacher,scope('exams.write')),true);
 assert.equal(permit(teacher,scope('students.read_basic','Class VI','B')),false);
 assert.equal(permit(teacher,scope('attendance.write','Class VII','A')),false);
 assert.equal(permit(teacher,scope('attendance.write','Class VI','A','Maths','school-2')),false);
 assert.equal(permit(teacher,{action:'students.read_basic',schoolId:'school-1'}),false);
});
test('subject teacher is restricted to assigned classes and subjects',()=>{
 assert.equal(permit(subjectTeacher,scope('homework.write')),true);
 assert.equal(permit(subjectTeacher,scope('exams.read')),true);
 assert.equal(permit(subjectTeacher,scope('homework.write','Class VI','A','English')),false);
 assert.equal(permit(subjectTeacher,scope('homework.write','Class VI','A','')),false);
 assert.equal(permit(subjectTeacher,scope('students.read_basic')),true);
 assert.equal(permit(subjectTeacher,scope('students.read_basic','Class VI','B')),false);
 assert.equal(permit(subjectTeacher,scope('attendance.write')),false);
});
test('teachers never have financial or staff-management access',()=>{
 for(const action of ['fees.read','fees.write','salary.read','salary.write','roles.manage','staff.manage']){
   assert.equal(permit(teacher,scope(action)),false,action);
   assert.equal(permit(subjectTeacher,scope(action)),false,action);
 }
});
test('accountant cannot see teacher-only or payroll data and principal cannot assign roles',()=>{
 const accountant={verified:true,status:'ACTIVE',schoolId:'school-1',role:'ACCOUNTANT'};
 const principal={verified:true,status:'ACTIVE',schoolId:'school-1',role:'PRINCIPAL'};
 assert.equal(permit(accountant,scope('fees.write')),true);
 assert.equal(permit(accountant,scope('homework.read')),false);
 assert.equal(permit(accountant,scope('salary.read')),false);
 assert.equal(permit(principal,scope('staff.read')),true);
 assert.equal(permit(principal,scope('roles.manage')),false);
});
test('missing verified membership, wrong tenant, unknown action and revoked staff all denied',()=>{
 for(const actor of [undefined,{}, {...teacher,verified:false},{...teacher,status:'SUSPENDED'},
   {...teacher,role:'ADMIN'},{...teacher,schoolId:''}]){
   assert.equal(permit(actor,scope('students.read_basic')),false);
 }
 assert.equal(permit(teacher,scope('students.read_basic','Class VI','A','Math','')),false);
 assert.equal(permit(teacher,scope('database.dump')),false);
 assert.equal(permit(teacher,scope('roles.manage')),false);
});
test('custom per-user restrictions can revoke but cannot escalate permission',()=>{
 const restrict={...teacher,allowedActions:['students.read_basic']};
 assert.equal(permit(restrict,scope('students.read_basic')),true);
 assert.equal(permit(restrict,scope('attendance.write')),false);
 const elevate={...teacher,allowedActions:['salary.read','fees.write']};
 assert.equal(permit(elevate,scope('salary.read')),false);
 assert.equal(permit(elevate,scope('fees.write')),false);
 const deny={...teacher,deniedActions:['attendance.write']};
 assert.equal(permit(deny,scope('attendance.write')),false);
});
test('filter is row-scoped, never leaks other class, school or subject',()=>{
 const records=[
 {schoolId:'school-1',className:'Class VI',section:'A',subject:'Mathematics',id:'allowed'},
 {schoolId:'school-1',className:'Class VI',section:'A',subject:'English',id:'wrong-subject'},
 {schoolId:'school-1',className:'Class VI',section:'B',subject:'Mathematics',id:'wrong-section'},
 {schoolId:'school-2',className:'Class VI',section:'A',subject:'Mathematics',id:'wrong-school'}
 ];
 const allowed=filterAuthorizedRecords(subjectTeacher,'exams.read',records,row=>({
   schoolId:row.schoolId,className:row.className,section:row.section,subject:row.subject
 }));
 assert.deepEqual(allowed.map(x=>x.id),['allowed']);
});
test('throws on denied privilege and role permission list is bounded',()=>{
 assert.throws(()=>requireStaffAccess(subjectTeacher,scope('salary.read')),e=>e.statusCode===403);
 assert.equal(ROLE_ACTIONS.SCHOOL_ADMIN.length,ACTIONS.length);
 assert.equal(permit({verified:true,status:'ACTIVE',schoolId:'school-1',role:'SCHOOL_ADMIN'},scope('roles.manage')),true);
 assert.equal(permit({...teacher,assignments:[{...teacher.assignments[0],active:false}]},scope('attendance.write')),false);
});
