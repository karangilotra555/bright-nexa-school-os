'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const engine=require('../school-timetable-cloud.js');
const school='11111111-1111-1111-1111-111111111111';
const cls='22222222-2222-2222-2222-222222222222';
const teacher='33333333-3333-3333-3333-333333333333';
const slot='44444444-4444-4444-4444-444444444444';

async function mount(role='school_admin'){
 const dom=new JSDOM('<div id="schoolTimetableRoot"></div>',{url:'https://school.invalid/teacher-access.html'});
 const before={document:global.document,confirm:global.confirm};
 global.document=dom.window.document;global.confirm=()=>true;
 const state={
  slots:[{id:slot,institution_id:school,academic_year:'2026',weekday:1,slot_index:1,kind:'period',label:'Period 1',starts_at:'08:00:00',ends_at:'08:40:00'}],
  drafts:[],published:[],loads:[],calls:[]
 };
 const ctx={
  me:{role,institution_id:school},
  classes:[{id:cls,name:'6',section:'A',academic_year:'2026'}],
  assignments:[{institution_id:school,class_id:cls,school_user_id:teacher,active:true,assignment_type:'subject_teacher',subject:'Mathematics'}],
  staff:[{id:teacher,display_name:'Teacher Example',email:'example@school.invalid',role:'teacher',status:'active'}],
  query:params=>new URLSearchParams(params).toString(),
  eq:value=>'eq.'+value,
  notify:()=>{},
  openAssignments:()=>{},
  api:async(table,_query,method='GET',body)=>{
    state.calls.push({table,method,body});
    if(method==='POST'&&table==='school_timetable_drafts'){
      for(const record of body)state.drafts=state.drafts.filter(x=>x.slot_id!==record.slot_id||x.class_id!==record.class_id).concat([{id:'draft-1',...record}]);
      return state.drafts;
    }
    if(method==='POST'&&table==='rpc/bn_publish_class_timetable'){
      state.published=state.drafts.map(x=>({id:'published-1',...x}));
      return state.published.length;
    }
    if(method==='GET'){
      if(table==='school_timetable_slots')return [...state.slots];
      if(table==='school_timetable_drafts')return [...state.drafts];
      if(table==='school_timetable_published')return [...state.published];
      if(table==='school_timetable_subject_loads')return [...state.loads];
    }
    throw Error('Unexpected cloud operation: '+method+' '+table);
  }
 };
 engine.activate(ctx);
 const tick=async()=>{await new Promise(resolve=>setTimeout(resolve,0));};
 await tick();
 return {dom,state,ctx,tick,restore(){
  global.document=before.document;
  global.confirm=before.confirm;
  dom.window.close();
 }};
}

test('admin timetable UI saves one assigned period and publishes it',async()=>{
 const f=await mount();
 try{
  const d=f.dom.window.document;
  assert.equal(d.getElementById('bnTimeClass').value,cls);
  assert.ok(d.getElementById('bnTimeSlot'),'editor should expose periods');
  d.getElementById('bnTimeSubject').value='Mathematics';
  d.getElementById('bnTimeTeacher').value=teacher;
  d.getElementById('bnTimeSubject').closest('form')
    .dispatchEvent(new f.dom.window.Event('submit',{bubbles:true,cancelable:true}));
  await f.tick();
  assert.equal(f.state.drafts.length,1,'draft saved through authenticated cloud API');
  assert.equal(f.state.drafts[0].teacher_user_id,teacher);
  const publish=[...d.querySelectorAll('button')].find(b=>b.textContent.includes('Publish this class timetable'));
  assert.ok(publish);
  publish.click();
  await f.tick();
  assert.equal(f.state.published.length,1);
  assert.equal(f.state.calls.filter(c=>c.table==='rpc/bn_publish_class_timetable').length,1);
  assert.ok(d.getElementById('schoolTimetableRoot').textContent.includes('published lessons'));
 }finally{f.restore();}
});

test('teacher timetable view remains read-only and loads published lessons',async()=>{
 const f=await mount('teacher');
 try{
  const d=f.dom.window.document;
  assert.ok(d.getElementById('schoolTimetableRoot').textContent.includes('School Timetable'));
  assert.equal(d.getElementById('bnTimeSubject'),null,'staff cannot see draft editor');
  assert.equal(f.state.calls.filter(c=>c.table==='school_timetable_drafts').length,0);
  assert.equal(f.state.calls.filter(c=>c.method!=='GET').length,0);
 }finally{f.restore();}
});
