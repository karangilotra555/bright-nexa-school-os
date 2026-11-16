'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const rules=require('../school-student-admission-rules.js');
const classes=[
{id:'c1',name:'Nursery',section:'A',academicSession:'2026-2027',status:'Active'},
{id:'c2',name:'LKG',section:'B',academicSession:'2026-2027',status:'Active'},
{id:'c3',name:'11',section:'A',academicStream:'Commerce',status:'Active'}];
const base={name:'Test Student',admissionNumber:'ADM-123',className:'Nursery',section:'A',status:'Active'};
test('valid configured student admits and normalizes status',()=>{
 assert.deepEqual(rules.validate(base,[],classes),{});
 assert.equal(rules.normalize({...base,status:''}).status,'Active');
});
test('required name, admission, class, section prevent incomplete save',()=>{
 const v=rules.validate({name:'',admissionNumber:'',className:'',section:''},[],classes);
 for(const field of ['name','admissionNumber','className','section'])assert.ok(v[field],field);
});
test('wrong class-section and inactive class are blocked',()=>{
 assert.match(rules.validate({...base,section:'C'},[],classes).className,/do not exist/);
 assert.match(rules.validate({...base,className:'UKG'},[],classes).className,/do not exist/);
});
test('case-insensitive admission duplicates blocked on add, self allowed on edit',()=>{
 const old=[{...base,id:'student1',admissionNumber:'adm-123'}];
 assert.match(rules.validate(base,old,classes).admissionNumber,/already exists/);
 assert.deepEqual(rules.validate({...base,id:'student1'},old,classes,'student1'),{});
});
test('invalid parent mobile and date blocked before sync',()=>{
 const err=rules.validate({...base,parentMobile:'12345',dateOfBirth:'2026-02-30'},[],classes);
 assert.ok(err.parentMobile);
 assert.ok(err.dateOfBirth);
});
test('stream is required and selected stream must match configured class',()=>{
 assert.ok(rules.validate({...base,className:'11',section:'A',academicStream:''},[],classes).academicStream);
 assert.ok(rules.validate({...base,className:'Class 11',section:'A',academicStream:''},[],classes).academicStream);
 assert.ok(rules.validate({...base,className:'Class 12',section:'A',academicStream:''},[],classes).academicStream);
 assert.ok(rules.validate({...base,className:'XI',section:'A',academicStream:''},[],classes).academicStream);
 assert.ok(rules.validate({...base,className:'XII',section:'A',academicStream:''},[],classes).academicStream);
 assert.ok(rules.validate({...base,className:'11',section:'A',academicStream:'Medical'},[],classes).className);
 assert.deepEqual(rules.validate({...base,className:'11',section:'A',academicStream:'Commerce'},[],classes),{});
});
test('roll number validation enforces positive integer and class-level uniqueness',()=>{
 const class11Classes=[{id:'c3',name:'11',section:'A',academicStream:'Commerce',status:'Active'},{id:'c4',name:'11',section:'B',academicStream:'Commerce',status:'Active'}];
 const existing=[
  {id:'s1',name:'Student One',admissionNumber:'ADM-001',className:'11',section:'A',academicStream:'Commerce',rollNumber:'5',status:'Active'},
  {id:'s2',name:'Student Two',admissionNumber:'ADM-002',className:'11',section:'A',academicStream:'Commerce',rollNumber:'12',status:'Transferred'}
 ];
 // invalid formats
 assert.match(rules.validate({...base,className:'11',section:'A',academicStream:'Commerce',rollNumber:'-1'},existing,class11Classes).rollNumber,/positive/i);
 assert.match(rules.validate({...base,className:'11',section:'A',academicStream:'Commerce',rollNumber:'0'},existing,class11Classes).rollNumber,/positive/i);
 assert.match(rules.validate({...base,className:'11',section:'A',academicStream:'Commerce',rollNumber:'abc'},existing,class11Classes).rollNumber,/positive/i);
 assert.match(rules.validate({...base,className:'11',section:'A',academicStream:'Commerce',rollNumber:'1.5'},existing,class11Classes).rollNumber,/positive/i);
 // duplicate active roll in same class/section/stream
 assert.match(rules.validate({...base,className:'11',section:'A',academicStream:'Commerce',rollNumber:'5'},existing,class11Classes).rollNumber,/already assigned/i);
 assert.match(rules.validate({...base,className:'11',section:'A',academicStream:'Commerce',rollNumber:'05'},existing,class11Classes).rollNumber,/already assigned/i);
 // self edit allows own roll
 assert.equal(rules.validate({...base,id:'s1',className:'11',section:'A',academicStream:'Commerce',rollNumber:'5'},existing,class11Classes,'s1').rollNumber,undefined);
 // transferred student roll can be reassigned
 assert.equal(rules.validate({...base,className:'11',section:'A',academicStream:'Commerce',rollNumber:'12'},existing,class11Classes).rollNumber,undefined);
 // same roll in different section allowed
 assert.equal(rules.validate({...base,className:'11',section:'B',academicStream:'Commerce',rollNumber:'5'},existing,class11Classes).rollNumber,undefined);
});
test('import refuses section that was not configured',()=>{
 assert.equal(rules.importAllowed({...base,section:'D'},[],classes),false);
 assert.equal(rules.importAllowed(base,[],classes),true);
});
test('ambiguous same-name same-section across years is rejected',()=>{
 const both=[classes[0],{...classes[0],id:'nextYear',academicSession:'2027-2028'}];
 assert.match(rules.validate(base,[],both).section,/More than one/);
});
