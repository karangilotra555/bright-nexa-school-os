'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');

function setup({confirmation=true,saveResult}={}){
  const {window}=new JSDOM(read('teacher-access.html'),{url:'https://school.example/teacher-access.html',runScripts:'outside-only'});
  const byId=id=>window.document.getElementById(id),calls=[];
  window.BNHomeworkFiles={create:()=>({})};
  window.fetch=async (url,request)=>{
    const route=new URL(url).pathname.split('/').pop();
    calls.push([route,JSON.parse(request.body)]);
    if(route==='bn_teacher_save_exam_marks_batch'){
      const body=JSON.parse(request.body);
      return {ok:true,json:async()=>saveResult?.(body) ??
        [{student_id:'student',obtained:confirmation?19.5:18,error:null}]};
    }
    const data={
      bn_teacher_marks_classes:[{id:'class-a',name:'LKG',section:'A',academic_year:'2026-2027'}],
      bn_teacher_exam_marks:[{exam_id:'exam',exam_name:'English check',student_id:'student',student_name:'Aarav',
        admission_number:'2601',subject:'English',maximum:20,obtained:18}]
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
  assert.deepEqual(f.calls[2],['bn_teacher_save_exam_marks_batch',{
    p_school:'school',p_class:'class-a',p_exam:'exam',p_subject:'English',
    p_marks:[{student_id:'student',obtained:19.5,expected:18}]
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

test('desktop marks can clear a saved draft and later save an actual zero',async t=>{
  const f=setup({saveResult:body=>body.p_marks.map(mark=>({student_id:mark.student_id,obtained:mark.obtained,error:null}))});
  t.after(()=>f.window.close());
  await f.api.loadTeacherMarks();
  const score=f.byId('teacherMarksScore'),form=f.byId('teacherMarksForm');
  assert.equal(score.value,'18');
  score.value='';
  form.requestSubmit();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(f.calls.at(-1),['bn_teacher_save_exam_marks_batch',{
    p_school:'school',p_class:'class-a',p_exam:'exam',p_subject:'English',
    p_marks:[{student_id:'student',obtained:null,expected:18}]
  }]);
  assert.match(f.byId('teacherMarksStatus').textContent,/Cleared.*Unmarked/);
  score.value='0';
  form.requestSubmit();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(f.calls.at(-1)[1].p_marks,[{student_id:'student',obtained:0,expected:null}]);
});

test('desktop clear shows the server conflict and requires reloading the newer draft',async t=>{
  const f=setup({saveResult:()=>[{student_id:'student',obtained:null,error:'This mark changed. Reload marks before saving again.'}]});
  t.after(()=>f.window.close());
  await f.api.loadTeacherMarks();
  f.byId('teacherMarksScore').value='';
  f.byId('teacherMarksForm').requestSubmit();
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(f.byId('teacherMarksStatus').textContent,/mark changed/i);
  assert.doesNotMatch(f.byId('teacherMarksStatus').textContent,/cleared/i);
});
