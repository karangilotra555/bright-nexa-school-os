'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const guard=require('../school-access-guard');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const classes=[{id:'6A',name:'6',section:'A'},{id:'6B',name:'6',section:'B'}];
const assignments=[
 {id:'a',school_user_id:'teacher-a',class_id:'6A',active:true,assignment_type:'subject_teacher',subject:'Mathematics',can_view_roster:true,can_take_attendance:false,can_assign_homework:true},
 {id:'b',school_user_id:'teacher-b',class_id:'6B',active:true,assignment_type:'class_teacher',subject:'',can_view_roster:true,can_take_attendance:true,can_assign_homework:true},
 {id:'c',school_user_id:'teacher-a',class_id:'6B',active:false,assignment_type:'class_teacher',subject:'',can_view_roster:true,can_take_attendance:true,can_assign_homework:true}
];
test('teacher roles deny other class or revoked assignments and only allow assigned subjects',()=>{
 assert.deepEqual(guard.writableClasses('teacher',classes,assignments,'teacher-a','can_view_roster').map(c=>c.id),['6A']);
 assert.deepEqual(guard.writableClasses('teacher',classes,assignments,'teacher-b','can_take_attendance').map(c=>c.id),['6B']);
 assert.deepEqual(guard.writableClasses('accountant',classes,assignments,'teacher-a','can_view_roster'),[]);
 assert.deepEqual(guard.writableClasses('principal',classes,assignments,'teacher-a','can_take_attendance'),classes);
 assert.equal(guard.canPublishHomework('teacher',assignments,'teacher-a','6A','mathematics'),true);
 assert.equal(guard.canPublishHomework('teacher',assignments,'teacher-a','6A','English'),false);
 assert.equal(guard.canPublishHomework('teacher',assignments,'teacher-a','6B','Math'),false);
 assert.equal(guard.canPublishHomework('teacher',assignments,'teacher-b','6B','English'),true);
 assert.equal(guard.canPublishHomework('accountant',assignments,'teacher-a','6A','Math'),false);
});
test('multiple subjects are bounded to assigned subject list, not any typed text',()=>{
 const records=[...assignments,{id:'d',school_user_id:'teacher-a',class_id:'6A',active:true,assignment_type:'subject_teacher',subject:'Science',can_assign_homework:true}];
 const rights=guard.homeworkSubjects('teacher',records,'teacher-a','6A');
 assert.equal(rights.all,false);
 assert.deepEqual(rights.subjects.sort(),['Mathematics','Science']);
 assert.equal(guard.canPublishHomework('teacher',records,'teacher-a','6A','SCIENCE'),true);
 assert.equal(guard.canPublishHomework('teacher',records,'teacher-a','6A','History'),false);
});
test('parent records require an active guardian and exact same-school guardian/student link',()=>{
 const guardians=[{id:'ga',institution_id:'school-a',status:'active'},{id:'gb',institution_id:'school-b',status:'inactive'}];
 const links=[{guardian_id:'ga',institution_id:'school-a',student_id:'s1'},
             {guardian_id:'ga',institution_id:'school-b',student_id:'s2'},
             {guardian_id:'gb',institution_id:'school-b',student_id:'s3'}];
 const students=[{id:'s1',institution_id:'school-a',status:'active',name:'Linked'},
                {id:'s2',institution_id:'school-b',status:'active',name:'Wrong tenant'},
                {id:'s3',institution_id:'school-b',status:'active',name:'Inactive guardian'},
                {id:'s4',institution_id:'school-a',status:'active',name:'Unlinked'},
                {id:'s1x',institution_id:'school-a',status:'archived',name:'Archived'}];
 assert.deepEqual(guard.linkedChildren(guardians,links,students).map(s=>s.id),['s1']);
 assert.deepEqual(guard.linkedChildren([],links,students),[]);
});
test('zero returned rows and unrelated rows are not accepted as cloud writes',()=>{
 assert.deepEqual(guard.confirmRow([{id:'x'}],'x'),{id:'x'});
 assert.throws(()=>guard.confirmRow([], 'x'),/not confirmed/);
 assert.throws(()=>guard.confirmRow([{id:'other'}], 'x'),/different school record/);
 assert.throws(()=>guard.confirmRow(null),/not confirmed/);
});
test('attendance requires exact server confirmation of every marked student',()=>{
 const intended=[
  {student_id:'s1',class_id:'6A',institution_id:'school-a',day:'2026-11-04',status:'present'},
  {student_id:'s2',class_id:'6A',institution_id:'school-a',day:'2026-11-04',status:'absent'}
 ];
 assert.equal(guard.confirmAttendance([...intended].reverse(),intended),true);
 assert.throws(()=>guard.confirmAttendance(intended.slice(0,1),intended),/incomplete/);
 assert.throws(()=>guard.confirmAttendance([{...intended[0],status:'late'},intended[1]],intended),/unexpected records/);
 assert.throws(()=>guard.confirmAttendance([{...intended[0],institution_id:'school-b'},intended[1]],intended),/unexpected records/);
 assert.throws(()=>guard.confirmAttendance([intended[0],intended[0]],intended),/unexpected records/);
});
test('Phase 3 scripts are syntactically valid, mirrored and loaded before dependent portals',()=>{
 for(const p of ['school-access-guard.js','teacher-access.js','parents-cloud.js']){
   assert.equal(read(p),read('docs/'+p));
   assert.doesNotThrow(()=>new vm.Script(read(p)));
 }
 for(const p of ['teacher-access.html','parents-cloud.html'])assert.equal(read(p),read('docs/'+p));
 const teacher=read('teacher-access.html'),parent=read('parents-cloud.html');
 assert.ok(teacher.indexOf('school-access-guard.js')<teacher.indexOf('teacher-access.js'));
 assert.ok(parent.indexOf('school-access-guard.js')<parent.indexOf('parents-cloud.js'));
 assert.match(teacher,/id="teacherDashboard"/);
 assert.match(teacher,/data-tab="dashboard"/);
});
test('Phase 3 teacher access changes preserve server-side authorization and no demo login',()=>{
 const t=read('teacher-access.js');
 assert.match(t,/guard\.canPublishHomework/);
 assert.match(t,/guard\.confirmAttendance/);
 assert.match(t,/guard\.confirmRow\(rows,a\.id\)/);
 assert.match(t,/active:!a\.active/);
 assert.doesNotMatch(t,/school_teacher_assignments[^\n]*'DELETE'/);
 assert.match(t,/token\?grant_type=password/);
 assert.doesNotMatch(t,/service_role|sb_secret_/i);
});
test('Phase 3 parent view revalidates links, prevents stale child render and confirms submitted leave',()=>{
 const p=read('parents-cloud.js');
 assert.match(p,/guard\.linkedChildren/);
 assert.match(p,/selectionEpoch/);
 assert.match(p,/freshGuardians,freshLinks/);
 assert.match(p,/show\('parentData',false\)/);
 assert.match(p,/guard\.confirmRow\(submitted\)/);
 assert.match(p,/user\?\.id!==actorId/);
 assert.doesNotMatch(p,/localStorage\./);
});
