'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function fixture(handler,vault){
  const {window}=new JSDOM(read('teacher-access.html'),{url:'https://school.example/teacher-access.html',runScripts:'outside-only'});
  const id=name=>window.document.getElementById(name),calls=[];
  if(vault)window.BNPrivateCache=vault;
  window.BNHomeworkFiles={create:()=>({links(){}})};
  window.fetch=async (url,request)=>{
    const call={table:new URL(url).pathname.split('/').pop(),query:new URL(url).searchParams,
      method:request.method,body:request.body?JSON.parse(request.body):null};
    calls.push(call);
    return {ok:true,json:async()=>handler(call)};
  };
  window.eval(read('teacher-access.js').replace(/\}\)\(\);\s*$/, `
    window.teacherTest={tab,loadAttendance,loadTeacherMarks,renderHomework,applyNavigationVisibility,setHomework(rows){allHomework=rows;},start(){
      me={id:'teacher',role:'teacher',institution_id:'school'};
      session={access_token:'test',expires_at:9999999999};
      allClasses=[{id:'class-a',name:'LKG',section:'A',academic_year:'2026-2027'}];
      allStudents=[{id:'one',name:'First student',class_id:'class-a'},{id:'two',name:'Second student',class_id:'class-a'}];
      allAssignments=[{school_user_id:'teacher',class_id:'class-a',active:true,can_take_attendance:true,can_enter_marks:true,can_assign_homework:true,assignment_type:'class_teacher'}];
      document.body.classList.add('bn-teacher-app');renderSelects();
    }};
  })();`));
  window.teacherTest.start();
  return {window,id,calls,api:window.teacherTest};
}
test('mobile attendance autoloads; quick marks preserve Leave and show only confirmed saves',async()=>{
  let confirmed=false;
  const f=fixture(call=>call.table==='bn_save_class_attendance'&&confirmed
    ?call.body.p_marks.map(({student_id,status})=>({student_id,status})):[]);
  f.api.tab('attendance');await tick();
  const rows=f.id('rosterList').children;
  assert.equal(rows.length,2);
  rows[0].querySelector('[data-attendance-choice="excused"]').click();
  f.id('markRemainingPresent').click();
  assert.match(f.id('saveAttendance').textContent,/2 changes/);
  f.id('saveAttendance').click();await tick();
  assert.match(f.id('attendanceFeedback').textContent,/couldn.t save/i);
  assert.equal(rows[0].querySelector('[data-attendance-choice="excused"]').getAttribute('aria-pressed'),'true');
  confirmed=true;f.id('saveAttendance').click();await tick();
  assert.match(f.id('attendanceFeedback').textContent,/Attendance saved/);
  assert.deepEqual(f.calls.filter(call=>call.table==='bn_save_class_attendance').at(-1).body.p_marks.map(row=>row.status),['excused','present']);
  assert.doesNotMatch(f.id('rosterList').textContent,/Supabase/);
  f.window.close();
});
test('mobile attendance preserves unsaved choices when moving between dates',async()=>{
  const f=fixture(()=>[]);
  const day=f.id('attendanceDate');
  day.value='2026-11-14';
  await f.api.loadAttendance();
  f.id('rosterList').querySelector('[data-attendance-choice="absent"]').click();
  const change=async value=>{day.value=value;day.dispatchEvent(new f.window.Event('change'));await tick();};
  await change('2026-11-15');await change('2026-11-14');
  assert.equal(f.id('rosterList').querySelector('[data-attendance-choice="absent"]').getAttribute('aria-pressed'),'true');
  assert.match(f.id('saveAttendance').textContent,/1 change/);
  f.window.close();
});
test('mobile attendance rejects future date and sets max date attribute',async()=>{
  const f=fixture(()=>[]);
  const day=f.id('attendanceDate');
  assert.ok(day.max,'attendanceDate must have max attribute set');
  day.value='2099-01-01';
  day.dispatchEvent(new f.window.Event('change'));
  await tick();
  assert.match(f.id('attendanceFeedback').textContent,/future/i);
  assert.equal(f.calls.filter(c=>c.method==='POST').length,0);
  f.window.close();
});
test('mobile class marks use one subject list and retain unconfirmed rows for retry',async()=>{
  let rejectSecond=true;
  const f=fixture(call=>{
    if(call.table==='bn_teacher_marks_classes')return [{id:'class-a',name:'LKG'}];
    if(call.table==='bn_teacher_exam_marks')return ['one','two'].map(student_id=>({exam_id:'exam',exam_name:'Term',student_id,student_name:student_id,subject:'Math',maximum:20,obtained:10}));
    return call.body.p_marks.map(mark=>({student_id:mark.student_id,obtained:rejectSecond&&mark.student_id==='two'?10:mark.obtained}));
  });
  await f.api.loadTeacherMarks();
  const inputs=f.id('teacherMarksRoster').querySelectorAll('input');
  assert.equal(inputs.length,2);
  inputs[0].value='15';inputs[1].value='16';
  f.id('teacherMarksForm').dispatchEvent(new f.window.Event('submit',{cancelable:true}));
  await tick();
  assert.match(f.id('teacherMarksStatus').textContent,/1 saved/);
  assert.equal(inputs[1].value,'16');
  rejectSecond=false;
  f.id('teacherMarksForm').dispatchEvent(new f.window.Event('submit',{cancelable:true}));
  await tick();
  assert.deepEqual(f.calls.filter(call=>call.table==='bn_teacher_save_exam_marks_batch').map(call=>call.body.p_marks.map(mark=>mark.student_id)),[['one','two'],['two']]);
  f.window.close();
});
test('teacher navigation retains access to Marks, Notices, Classes and Account',()=>{
  const f=fixture(()=>[]);
  f.api.applyNavigationVisibility();
  const menu=f.id('teacherMore');
  assert.deepEqual([...menu.querySelectorAll('[data-tab]')].map(button=>button.dataset.tab),['leave','staff-attendance','marks','notices','classes','profiles','account']);
  f.window.close();
});
test('personal timetable displays only published lessons assigned to the signed-in teacher',async()=>{
  const f=fixture(call=>{
    if(call.table==='school_timetable_slots')return [{id:'bell',weekday:2,kind:'period',label:'Period 1',starts_at:'08:00:00',ends_at:'08:40:00'}];
    if(call.table==='school_timetable_published')return [
      {slot_id:'bell',class_id:'class-a',subject:'English',teacher_user_id:'teacher'},
      {slot_id:'bell',class_id:'class-a',subject:'Other subject',teacher_user_id:'another-teacher'}
    ];
    return [];
  });
  f.api.tab('timetable');await tick();
  f.window.document.querySelector('[data-teacher-schedule="week"]').click();await tick();
  assert.match(f.id('teacherPeriods').textContent,/Tuesday.*English/);
  assert.doesNotMatch(f.id('teacherPeriods').textContent,/Other subject/);
  assert.equal(f.calls.find(call=>call.table==='school_timetable_published').query.get('teacher_user_id'),'eq.teacher');
  f.window.close();
});

test('teacher edits an owned homework post in place and keeps the class and subject',async()=>{
  const homework={id:'homework',institution_id:'school',class_id:'class-a',subject:'English',title:'Old title',instructions:'',due_on:null,created_by:'teacher'};
  const f=fixture(call=>call.method==='PATCH'?[{...homework,...call.body}]:[]);
  f.api.setHomework([homework,{...homework,id:'other',created_by:'another-teacher'}]);
  f.api.renderHomework();
  const edits=f.id('homeworkList').querySelectorAll('[data-edit-homework]');
  assert.equal(edits.length,1);
  edits[0].click();
  assert.equal(f.id('homeworkClass').disabled,true);
  f.id('homeworkTitle').value='New title';
  f.id('homeworkForm').dispatchEvent(new f.window.Event('submit',{cancelable:true}));
  await tick();
  const write=f.calls.find(call=>call.method==='PATCH');
  assert.equal(write.query.get('id'),'eq.homework');
  assert.equal(write.query.get('institution_id'),'eq.school');
  assert.deepEqual(write.body,{title:'New title',instructions:'',due_on:null});
  assert.match(f.id('homeworkList').textContent,/New title/);
  f.window.close();
});

test('refreshing marks requires review before overwriting a newer server mark',async()=>{
  let current=10;
  const f=fixture(call=>{
    if(call.table==='bn_teacher_marks_classes')return [{id:'class-a',name:'LKG'}];
    if(call.table==='bn_teacher_exam_marks')return [{exam_id:'exam',exam_name:'Term',student_id:'one',student_name:'First',subject:'Math',maximum:20,obtained:current}];
    return call.body.p_marks.map(mark=>({student_id:mark.student_id,obtained:mark.obtained}));
  });
  const getInput=()=>f.id('teacherMarksRoster').querySelector('input');
  const input=value=>{getInput().value=value;getInput().dispatchEvent(new f.window.Event('input'));};
  const submit=()=>f.id('teacherMarksForm').dispatchEvent(new f.window.Event('submit',{cancelable:true}));
  await f.api.loadTeacherMarks();
  input('15');
  current=12;
  await f.api.loadTeacherMarks();
  assert.equal(getInput().value,'15');
  assert.match(f.id('teacherMarksRoster').textContent,/Current saved mark: 12/);
  submit();
  await tick();
  assert.equal(f.calls.some(call=>call.table==='bn_teacher_save_exam_marks_batch'),false);
  input('16');submit();await tick();
  assert.equal(f.calls.find(call=>call.table==='bn_teacher_save_exam_marks_batch').body.p_marks[0].expected,12);
  f.window.close();
});

test('a homework conflict refreshes the post and keeps the teacher’s edit visible',async()=>{
  const post={id:'one',institution_id:'school',class_id:'class-a',subject:'Math',title:'Original task',instructions:'',due_on:null,created_by:'teacher'};
  const f=fixture(call=>call.method==='PATCH'?[]:[{...post,title:'Updated on another device'}]);
  f.api.setHomework([post]);f.api.renderHomework();
  f.id('homeworkList').querySelector('[data-edit-homework]').click();
  f.id('homeworkTitle').value='My draft';
  f.id('homeworkForm').dispatchEvent(new f.window.Event('submit',{cancelable:true}));
  await tick();
  assert.equal(f.id('homeworkTitle').value,'My draft');
  assert.match(f.id('homeworkFeedback').textContent,/Homework changed/);
  assert.match(f.id('homeworkList').textContent,/Updated on another device/);
  f.window.close();
});

test('mobile draft marks recover after reload from the unlocked private device cache',async()=>{
  const records=new Map();
  let unlocked=false;
  const vault={isUnlocked:()=>unlocked,ensureUnlocked:async()=>{unlocked=true;},storage:{
    getItem:key=>records.get(key)??null,setItem:(key,value)=>records.set(key,value),removeItem:key=>records.delete(key)
  }};
  function response(call){
    if(call.table==='bn_teacher_marks_classes')return [{id:'class-a',name:'LKG'}];
    if(call.table==='bn_teacher_exam_marks')return [{exam_id:'exam',exam_name:'Term',student_id:'one',student_name:'First',subject:'Math',maximum:20,obtained:10}];
    return [];
  }
  const first=fixture(response,vault);
  await first.api.loadTeacherMarks();
  const draft=first.id('teacherMarksRoster').querySelector('input');
  draft.value='15';draft.dispatchEvent(new first.window.Event('input'));
  first.id('teacherMarksDeviceDrafts')?.click();await tick();
  first.window.close();
  unlocked=false;
  const again=fixture(response,vault);
  await again.api.loadTeacherMarks();
  assert.equal(again.id('teacherMarksRoster').querySelector('input').value,'10');
  again.id('teacherMarksDeviceDrafts')?.click();await tick();
  assert.equal(again.id('teacherMarksRoster').querySelector('input').value,'15');
  assert.equal(again.calls.some(call=>call.table==='bn_teacher_save_exam_marks_batch'),false);
  again.window.close();
});

test('clearing a saved mobile mark sends null without treating it as zero',async()=>{
  const f=fixture(call=>{
    if(call.table==='bn_teacher_marks_classes')return [{id:'class-a',name:'11'}];
    if(call.table==='bn_teacher_exam_marks')return [{exam_id:'exam',exam_name:'Term',student_id:'one',student_name:'Student',subject:'Science',maximum:20,obtained:10}];
    return call.body.p_marks.map(mark=>({student_id:mark.student_id,obtained:mark.obtained,error:null}));
  });
  await f.api.loadTeacherMarks();
  const input=f.id('teacherMarksRoster').querySelector('input');
  input.value='';
  input.dispatchEvent(new f.window.Event('input'));
  f.id('teacherMarksForm').dispatchEvent(new f.window.Event('submit',{cancelable:true}));
  await tick();
  const call=f.calls.find(x=>x.table==='bn_teacher_save_exam_marks_batch');
  assert.deepEqual(call?.body.p_marks,[{student_id:'one',obtained:null,expected:10}]);
  assert.match(f.id('teacherMarksRoster').textContent,/Cleared/);
  assert.equal(input.value,'');
  f.window.close();
});

test('homework create rejects a past due date and accepts today',async t=>{
  const f=fixture(call=>call.method==='POST'?[call.body]:[]);
  t.after(()=>f.window.close());
  const now=new f.window.Date();
  const today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
  f.id('newHomework').click();
  f.id('homeworkClass').value='class-a';
  f.id('homeworkSubject').value='English';
  f.id('homeworkTitle').value='New task';
  const due=f.id('homeworkDate'),form=f.id('homeworkForm');
  due.value='2000-01-01';
  form.dispatchEvent(new f.window.Event('submit',{cancelable:true}));
  await tick();
  assert.match(f.id('homeworkFeedback').textContent,/due date.*today/i);
  assert.equal(due.min,today);
  assert.equal(due.validity.rangeUnderflow,true);
  assert.equal(f.calls.some(call=>call.table==='school_homework'&&call.method==='POST'),false);
  due.value=today;
  form.requestSubmit();
  await tick();
  assert.equal(f.calls.find(call=>call.table==='school_homework'&&call.method==='POST').body.due_on,today);
});

test('editing homework with an expired due date requires a current date or clearing the optional date',async t=>{
  const post={id:'homework',institution_id:'school',class_id:'class-a',subject:'English',title:'Old title',instructions:'',due_on:'2000-01-01',created_by:'teacher'};
  const f=fixture(call=>call.method==='PATCH'?[{...post,...call.body}]:[]);
  t.after(()=>f.window.close());
  f.api.setHomework([post]);f.api.renderHomework();
  f.id('homeworkList').querySelector('[data-edit-homework]').click();
  const form=f.id('homeworkForm');
  form.dispatchEvent(new f.window.Event('submit',{cancelable:true}));
  await tick();
  assert.equal(f.calls.some(call=>call.method==='PATCH'),false);
  assert.match(f.id('homeworkFeedback').textContent,/due date.*today/i);
  f.id('homeworkDate').value='';
  form.requestSubmit();
  await tick();
  assert.equal(f.calls.find(call=>call.method==='PATCH').body.due_on,null);
});

test('mobile homework uses a labelled upload action and separates task titles from metadata',()=>{
  const f=fixture(()=>[]);
  const homework={id:'post',class_id:'class-a',subject:'English',title:'Circle the first letter',instructions:'Use the worksheet.',due_on:'2026-11-20',created_by:'teacher'};
  f.api.setHomework([homework,{...homework,id:'another',created_by:'another-teacher'}]);
  f.api.renderHomework();
  const [owned,shared]=f.id('homeworkList').children;
  assert.equal(owned.querySelector('h3').textContent,homework.title);
  assert.equal(owned.querySelector('.teacher-homework-subject').textContent,'English');
  assert.match(owned.querySelector('.teacher-homework-meta').textContent,/LKG A.*20 Nov 2026/);
  const actions=owned.querySelector('.teacher-homework-actions');
  const file=actions.querySelector('input[type="file"]');
  assert.equal(file.labels[0].textContent,'Add photo / PDF');
  assert.equal(file.multiple,true);
  assert.equal(actions.querySelector('[data-edit-homework]').textContent,'Edit homework');
  assert.equal(shared.querySelector('input[type="file"]'),null);
  f.window.close();
});
