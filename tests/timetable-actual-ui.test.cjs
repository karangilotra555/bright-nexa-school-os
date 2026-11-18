'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const engine=require('../school-timetable-cloud.js');
const school='11111111-1111-1111-1111-111111111111';
const cls='22222222-2222-2222-2222-222222222222';
const otherClass='55555555-5555-5555-5555-555555555555';
const teacher='33333333-3333-3333-3333-333333333333';
const slot='44444444-4444-4444-4444-444444444444';
const substitute='66666666-6666-6666-6666-666666666666';

async function mount(role='school_admin',initial={}){
 const dom=new JSDOM('<div id="schoolTimetableRoot"></div>',{url:'https://school.invalid/teacher-access.html'});
 const before={document:global.document,confirm:global.confirm};
 global.document=dom.window.document;global.confirm=()=>true;
 const state={
  slots:[{id:slot,institution_id:school,academic_year:'2026',weekday:1,slot_index:1,kind:'period',label:'Period 1',starts_at:'08:00:00',ends_at:'08:40:00'}],
  drafts:[],published:[],loads:[],dated:[],calls:[],...initial
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
    if(method==='POST'&&table==='rpc/bn_school_dated_timetable'){
      return typeof state.dated==='function'?state.dated(body):state.dated;
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
  assert.ok(d.getElementById('schoolTimetableRoot').textContent.includes('Published 1 lesson slots'));
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

test('dated view and print use the verified class and date range without modifying weekly assignments',async()=>{
 const day='2026-11-16', later='2026-11-23';
 const weekly={class_id:cls,slot_id:slot,subject:'Mathematics',teacher_user_id:teacher,room_number:'04'};
 const dated={day,class_id:cls,slot_id:slot,label:'Period 1',subject:'Mathematics',room_number:'04',
   starts_at:'08:00:00',ends_at:'08:40:00',regular_id:teacher,teacher_id:substitute,
   regular_name:'Teacher Example',teacher_name:'Substitute Example',is_cover:true};
 const f=await mount('school_admin',{drafts:[weekly],published:[weekly],dated:[dated,
   {...dated,day:later,is_cover:false,teacher_id:teacher,teacher_name:'Teacher Example'}]});
 try{
  const d=f.dom.window.document;
  const view=d.getElementById('bnDatedTimetable');
  assert.ok(view,'date-specific view is available from the desktop timetable');
  view.open=true;await f.tick();
  d.getElementById('bnDatedFrom').value=day;
  d.getElementById('bnDatedTo').value=later;
  d.getElementById('bnDatedLoad').click();
  await f.tick();
  assert.deepEqual(f.state.calls.at(-1).body,{p_school:school,p_class:cls,p_from:day,p_to:later});
  assert.match(view.textContent,/Substitute Example.*cover/i);
  assert.match(view.textContent,/2026-11-23.*Teacher Example/);
  const grid=d.querySelector('#schoolTimetableRoot .data-table');
  assert.match(grid.textContent,/Teacher Example/);
  assert.doesNotMatch(grid.textContent,/Substitute Example/);
  let print='';
  f.dom.window.print=()=>{
   print=d.querySelector('.bn-timetable-print').textContent;
   f.dom.window.dispatchEvent(new f.dom.window.Event('afterprint'));
  };
  f.state.dated[0]={...dated,teacher_name:'Updated Substitute'};
  d.getElementById('bnDatedPrint').click();await f.tick();
  assert.match(print,/2026-11-16.*2026-11-23.*Updated Substitute.*cover/i);
  assert.equal(d.querySelector('.bn-timetable-print'),null);
  assert.deepEqual(f.state.published,[weekly]);
  assert.equal(f.state.calls.filter(c=>c.method==='POST').every(c=>c.table==='rpc/bn_school_dated_timetable'),true);
 }finally{f.restore();}
});

test('a pending dated response is discarded when the signed-in school changes',async()=>{
 const day='2026-11-16';
 const f=await mount('school_admin');
 try{
  let stillSelected=true, finish;
  f.ctx.active=()=>stillSelected;
  f.state.dated=({p_from})=>p_from===day?new Promise(resolve=>{finish=resolve;}):[];
  engine.activate(f.ctx);
  const d=f.dom.window.document,view=d.getElementById('bnDatedTimetable');
  view.open=true;await f.tick();
  d.getElementById('bnDatedFrom').value=day;
  d.getElementById('bnDatedTo').value=day;
  d.getElementById('bnDatedLoad').click();await f.tick();
  stillSelected=false;
  finish([{day,class_id:cls,slot_id:slot,label:'Period 1',subject:'Private period',starts_at:'08:00',ends_at:'08:40'}]);
  await f.tick();
  assert.doesNotMatch(view.textContent,/Private period/);
  assert.equal(d.getElementById('bnDatedPrint').disabled,true);
 }finally{f.restore();}
});

test('dated view rejects a mismatched cloud response and never prints an unverified timetable',async()=>{
 const day='2026-11-16';
 const f=await mount('school_admin',{dated:[{day,class_id:otherClass,slot_id:slot}]});
 try{
  const d=f.dom.window.document;
  const view=d.getElementById('bnDatedTimetable');view.open=true;await f.tick();
  d.getElementById('bnDatedFrom').value=day;
  d.getElementById('bnDatedTo').value=day;
  d.getElementById('bnDatedLoad').click();await f.tick();
  assert.match(view.querySelector('[role=status]').textContent,/could not verify/i);
  assert.equal(d.getElementById('bnDatedPrint').disabled,true);
 }finally{f.restore();}
});

for(const source of ['drafts','published']){
 test('manual timetable rejects a same-period teacher clash in another class '+source,async()=>{
  const f=await mount('school_admin',{[source]:[{class_id:otherClass,slot_id:slot,teacher_user_id:teacher,subject:'English',notes:''}]});
  try{
   const d=f.dom.window.document;
   d.getElementById('bnTimeSubject').value='Mathematics';
   d.getElementById('bnTimeTeacher').value=teacher;
   d.getElementById('bnTimeSubject').closest('form').requestSubmit();
   await f.tick();
   assert.equal(f.state.calls.filter(c=>c.method==='POST'&&c.table==='school_timetable_drafts').length,0);
   assert.match(d.getElementById('schoolTimetableRoot').querySelector('[role=status]').textContent,/teacher.*another class.*draft.*published/i);
  }finally{f.restore();}
 });
}
