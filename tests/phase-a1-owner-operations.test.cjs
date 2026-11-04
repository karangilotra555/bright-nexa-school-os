'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const readiness=require('../docs/school-phase-a-daily.js');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const sampleState={
 students:[{id:'s1',status:'active'},{id:'s2',status:'active'},{id:'s3',status:'archived'}],
 staff:[{id:'p1',staff_category:'teaching'},{id:'p2',staff_category:'teaching'}],
 fees:[{kind:'payment'}],classes:[{id:'class-1'}]
};
test('daily operations distinguish missing attendance from recorded absence',()=>{
 const result=readiness.snapshot(sampleState,{
  todayAttendance:[{student_id:'s1',status:'absent'},{student_id:'s3',status:'present'}],
  schoolUsers:[],assignments:[],guardians:[],guardianLinks:[],leaves:[],
  ledger:{totals:{monthCollected:300,unpaid:1000}}
 },{today:'2026-11-04',month:'2026-11'});
 assert.equal(result.activeStudents,2);
 assert.equal(result.markedToday,1);assert.equal(result.absentToday,1);assert.equal(result.unmarkedToday,1);
 assert.equal(result.collectedThisMonth,300);assert.equal(result.unpaidRecorded,1000);
 assert.equal(result.teacherProfiles,2);assert.equal(result.teacherLogins,0);
 assert.ok(result.alerts.some(t=>t.includes('no active teacher login')));
 assert.ok(result.alerts.some(t=>t.includes('No fee charges')));
});
test('only verified active teacher logins with active assignments count as ready',()=>{
 const state={...sampleState,fees:[{kind:'charge'}]};
 const report=readiness.snapshot(state,{
  todayAttendance:[],schoolUsers:[{id:'u1',role:'teacher',status:'active'},{id:'u2',role:'teacher',status:'inactive'}],
  assignments:[{school_user_id:'u1',active:true},{school_user_id:'u2',active:true},{school_user_id:'u1',active:false}],
  guardians:[{id:'g1',status:'active'},{id:'g2',status:'pending'}],
  guardianLinks:[{guardian_id:'g1',student_id:'s1'},{guardian_id:'g2',student_id:'s2'}],
  leaves:[{status:'pending'},{status:'approved'}],
  ledger:{totals:{monthCollected:0,unpaid:0}}
 },{today:'2026-11-04',month:'2026-11'});
 assert.equal(report.teacherLogins,1);
 assert.equal(report.teacherAssignments,1);
 assert.equal(report.verifiedParents,1);
 assert.equal(report.linkedChildren,1);
 assert.equal(report.pendingLeaveCount,1);
 assert.equal(report.unmarkedToday,2);
 assert.equal(report.alerts.length,0);
});
test('daily owner UI queries actual scoped tables, never inserts or fabricates records',()=>{
 const html=read('docs/real-owner-workspace.html'),js=read('docs/real-owner-workspace.js');
 const ui=read('docs/school-phase-a-daily-ui.js'),sw=read('docs/owner-offline-sw.js');
 assert.equal((html.match(/id="phaseAOps"/g)||[]).length,1);
 assert.ok(html.indexOf('school-phase-a-daily.js')<html.indexOf('school-phase-a-daily-ui.js'));
 assert.ok(html.indexOf('school-phase-a-daily-ui.js')<html.indexOf('real-owner-workspace.js'));
 assert.match(js,/BrightNexaPhaseADashboard\?\.refresh\(\{state,allSchool,open\}\)/);
 for(const table of ['school_users','school_teacher_assignments','school_guardians','school_guardian_students','school_parent_leaves','school_attendance'])
   assert.ok(ui.includes("allSchool('"+table+"'"),table);
 assert.doesNotMatch(ui,/method:'POST'|method:'PATCH'|service_role|sb_secret_|demo mode/);
 assert.ok(sw.includes('school-phase-a-daily.js'));
 assert.ok(sw.includes('school-phase-a-daily-ui.js'));
 for(const code of [ui,read('docs/school-phase-a-daily.js')])assert.doesNotThrow(()=>new vm.Script(code));
});
