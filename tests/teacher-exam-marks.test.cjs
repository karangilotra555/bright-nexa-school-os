'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

function setup({confirmation=true}={}){
  const {window}=new JSDOM(read('teacher-access.html'),{url:'https://school.example/teacher-access.html',runScripts:'outside-only'});
  const byId=id=>window.document.getElementById(id),calls=[];
  window.BNHomeworkFiles={create:()=>({})};
  window.fetch=async (url,request)=>{
    const route=new URL(url).pathname.split('/').pop();
    calls.push([route,JSON.parse(request.body)]);
    const data={
      bn_teacher_marks_classes:[{id:'class-a',name:'LKG',section:'A',academic_year:'2026-2027'}],
      bn_teacher_exam_marks:[{exam_id:'exam',exam_name:'English check',student_id:'student',student_name:'Aarav',
        admission_number:'2601',subject:'English',maximum:20,obtained:18}],
      bn_teacher_save_exam_mark:confirmation?{obtained:19.5,maximum:20,changed:true}:{obtained:18}
    };
    return {ok:true,json:async()=>data[route]};
  };
  window.eval(read('teacher-access.js').replace(/\}\)\(\);\s*$/, `
    window.marksTest={loadTeacherMarks,isTabVisibleForRole,setTeacher(assignments){
      me={id:'teacher',role:'teacher',institution_id:'school'};
      allAssignments=assignments;
      session={access_token:'test',expires_at:9999999999};
    }};
  })();`));
  window.marksTest.setTeacher([{school_user_id:'teacher',active:true,can_enter_marks:true}]);
  return {window,byId,calls,api:window.marksTest};
}

test('teacher draft marks load, enforce maximum marks, and report the exact Supabase confirmation',async()=>{
  const f=setup();
  assert.equal(f.api.isTabVisibleForRole('marks','teacher'),true);
  assert.equal(f.api.isTabVisibleForRole('marks','accountant'),false);
  await f.api.loadTeacherMarks();
  const score=f.byId('teacherMarksScore'),form=f.byId('teacherMarksForm');
  assert.equal(score.value,'18');
  assert.equal(score.max,'20');
  score.value='21';
  form.dispatchEvent(new f.window.Event('submit',{cancelable:true}));
  assert.equal(f.calls.length,2);
  assert.match(f.byId('teacherMarksStatus').textContent,/between 0 and 20/);
  score.value='19.5';
  form.dispatchEvent(new f.window.Event('submit',{cancelable:true}));
  assert.equal(f.byId('teacherMarksSave').disabled,true);
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(f.calls[2],['bn_teacher_save_exam_mark',{
    p_school:'school',p_class:'class-a',p_exam:'exam',p_student:'student',p_subject:'English',
    p_obtained:19.5,p_expected:18
  }]);
  assert.match(f.byId('teacherMarksStatus').textContent,/Draft saved · 19.5 \/ 20/);
  assert.equal(f.byId('teacherMarksSave').disabled,false);
  f.api.setTeacher([{school_user_id:'different',active:true,can_enter_marks:true}]);
  assert.equal(f.api.isTabVisibleForRole('marks','teacher'),false);
  f.window.close();
});

test('a mismatched Supabase result retains the entered mark and reports that it is unconfirmed',async()=>{
  const f=setup({confirmation:false});
  await f.api.loadTeacherMarks();
  f.byId('teacherMarksScore').value='19.5';
  f.byId('teacherMarksForm').dispatchEvent(new f.window.Event('submit',{cancelable:true}));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(f.byId('teacherMarksScore').value,'19.5');
  assert.match(f.byId('teacherMarksStatus').textContent,/did not confirm/);
  f.window.close();
});
