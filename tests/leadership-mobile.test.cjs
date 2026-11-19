'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(require('node:path').join(__dirname,'..',p),'utf8');
const {create}=require('../leadership-app.js');
const school='00000000-0000-4000-8000-000000000001',person='00000000-0000-4000-8000-000000000002';
const leave='00000000-0000-4000-8000-000000000003';
function backend(role='principal'){
 const calls=[];
 const token={access_token:'test-access',refresh_token:'test-refresh',expires_in:3600};
 const response=(data,headers={})=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json',...headers}});
 const fetcher=async(url,request={})=>{
  const path=new URL(url,'https://school.example').pathname;
  calls.push({path,body:request.body?JSON.parse(request.body):null,headers:request.headers});
  if(path==='/auth/v1/token')return response(token);
  if(path==='/auth/v1/user')return response({id:person});
  if(path==='/rest/v1/school_users'&&url.includes('auth_user_id='))return response([{id:person,institution_id:school,auth_user_id:person,role,status:'active',display_name:'Head of school'}]);
  if(path==='/rest/v1/institutions')return response([{id:school,name:'Verified school',status:'active'}]);
  if(path==='/rest/v1/school_users')return response([{id:person}],{'content-range':'0-0/7'});
  if(path==='/rest/v1/school_students')return response([{id:'student'}],{'content-range':'0-0/30'});
  if(path==='/rest/v1/rpc/bn_leadership_school_pulse')return response({students:30,teachers:7,students_marked:30,students_present:27,student_percent:90,teachers_marked:3,teachers_present:null,teachers_on_leave:1,scheduled_periods:40,uncovered_periods:2,day:'2026-11-18'});
  if(path==='/rest/v1/rpc/bn_leadership_fee_snapshot')return response({total:18000,cash:7000,online:8000,unclassified:3000,receipt_count:12,day:'2026-11-18'});
  if(path==='/rest/v1/rpc/bn_leadership_publish_urgent_notice')return response(JSON.parse(request.body).p_request_id);
  if(path==='/api/timetable/cover-ai')return response({choices:[],summary:'Review qualified candidates',question:''});
  if(path==='/rest/v1/rpc/bn_list_teacher_leaves')return response([
   {id:leave,teacher_name:'Teacher A',status:'pending',kind:'emergency',starts_on:'2026-11-18',ends_on:'2026-11-18'},
   {id:leave.replace(/3$/,'4'),teacher_name:'Teacher B',status:'approved',kind:'planned',starts_on:'2026-11-18',ends_on:'2026-11-18'}
  ]);
  if(path==='/rest/v1/rpc/bn_review_teacher_leave')return response(null);
  if(path==='/rest/v1/rpc/bn_teacher_leave_cover_plan')return response([
   {slot_id:'slot',class_id:'class',class_name:'10 A',subject:'Math',starts_at:'09:00:00',ends_at:'09:45:00',teacher_id:'t1',candidates:[{teacher_id:'t1',teacher_name:'Teacher C',subject_match:true,periods:2}]}
  ]);
  if(path==='/rest/v1/rpc/bn_publish_teacher_covers')return response(null);
  throw Error('Unexpected request: '+url);
 };
 return {fetcher,calls};
}
test('Owner and Principal enter only through live verified Supabase memberships',async()=>{
 for(const role of ['principal','school_admin']){
  const mock=backend(role),client=create(mock.fetcher,null);
  const result=await client.login('principal@example.com','correct password');
  assert.equal(result.selected.role,role);
  assert.equal(result.selected.name,'Verified school');
  const stats=await client.overview();
  assert.equal(stats.students,30);
  assert.equal(stats.teachers,7);
  assert.equal(stats.pending,1);
  assert.equal(stats.pulse.student_percent,90);
  assert.equal(stats.pulse.teachers_present,null);
  assert.equal(stats.pulse.uncovered_periods,2);
  assert.equal(stats.fees.unclassified,3000);
  assert.equal(stats.emergency,1);
  await client.review(leave,'approved');
  await client.publishUrgent('Urgent notice','School will close early today due to weather.',leave);
  assert.deepEqual(mock.calls.find(x=>x.path.endsWith('bn_leadership_publish_urgent_notice')).body,{p_school:school,p_request_id:leave,p_title:'Urgent notice',p_body:'School will close early today due to weather.'});
  assert.deepEqual(mock.calls.find(x=>x.path.endsWith('bn_review_teacher_leave')).body,
    {p_school:school,p_leave:leave,p_status:'approved'});
  await assert.rejects(client.review(leave,'cancelled'),/Invalid leave decision/);
  await assert.rejects(()=>client.choose('other-school'),/verified school/);
  await client.logout();
  await assert.rejects(client.overview(),/verified school/);
 }
});
test('Teacher and accountant credentials cannot access the leadership app',async()=>{
 for(const role of ['teacher','accountant','librarian']){
  const mock=backend(role),client=create(mock.fetcher,null);
  await assert.rejects(client.login('other@example.com','password'),/Owner or Principal/);
  await assert.rejects(client.overview(),/verified school/);
 }
});
test('Leadership mobile assets are mirrored and preserve ERP navigation',()=>{
 assert.equal(read('leadership.html'),read('docs/leadership.html'));
 assert.equal(read('leadership-app.js'),read('docs/leadership-app.js'));
 assert.equal(read('leadership.webmanifest'),read('docs/leadership.webmanifest'));
 const html=read('leadership.html');
 assert.match(html,/id="metricPending"/);
 assert.match(html,/id="leaveList"/);
 assert.match(html,/id="coverRows"/);
 assert.match(html,/id="feeTotal"/);
 assert.match(html,/id="noticeBody"/);
 assert.match(html,/id="metricStudents"/);
 assert.match(html,/school-mobile-session\.js/);
 for(const path of ['sw.js','docs/sw.js','app-extracted/dist/sw.js'])
   assert.match(read(path),/leadership\\\.html/);
});
test('Principal approval migration is narrowly scoped to leave and cover RPCs',()=>{
 const sql=read('supabase/migrations/20261118093000_principal_leave_approvals.sql');
 for(const fn of ['bn_list_teacher_leaves','bn_review_teacher_leave','bn_teacher_leave_cover_plan','bn_publish_teacher_covers'])
   assert.match(sql,new RegExp('create or replace function public\\.'+fn+'\\('));
 assert.equal((sql.match(/array\['school_admin','principal'\]/g)||[]).length,4);
 assert.doesNotMatch(sql,/grant .*all|drop table|truncate|school_fee_entries/i);
 assert.doesNotMatch(sql,/delete from public\.(?!school_teacher_covers\b)/i);
});

test('Proactive preview is allowed before leave approval but cover publication stays gated',()=>{
 const migration=read('supabase/migrations/20261118093000_principal_leave_approvals.sql');
 const preview=migration.slice(migration.indexOf('create or replace function public.bn_teacher_leave_cover_plan'),migration.indexOf('create or replace function public.bn_publish_teacher_covers'));
 const publish=migration.slice(migration.indexOf('create or replace function public.bn_publish_teacher_covers'));
 assert.match(preview,/l.status in \('pending','approved'\)/);
 assert.match(publish,/l.status='approved'/);
 assert.match(read('src/smart-tools/teacher-ai.cjs'),/\['school_admin','principal'\]\.includes\(staff.role\)/);
});
test('Daily pulse and finance are read-only and missing attendance is not guessed',()=>{
 const sql=read('supabase/migrations/20261118100000_leadership_pulse_notice_finance.sql');
 for(const name of ['bn_leadership_school_pulse','bn_leadership_fee_snapshot','bn_leadership_publish_urgent_notice'])
  assert.match(sql,new RegExp('create or replace function public\\.'+name+'\\('));
 assert.match(sql,/marked_students=active_students/);
 assert.match(sql,/marked_teachers=active_teachers/);
 assert.match(sql,/unclassified/);
 assert.match(sql,/revoke all on function/);
 assert.match(sql,/school_private.has_role\(p_school,array\['school_admin','principal'\]\)/);
 assert.doesNotMatch(sql,/grant (?:all|select|update|insert) on (?:public\.)?(?:school_fee_entries|school_students)/i);
});

test('Leadership resumes the verified staff session without a second password grant',async()=>{
 for(const role of ['principal','school_admin']){
  const mock=backend(role),client=create(mock.fetcher,null);
  const result=await client.resumeStaff({access_token:'existing',refresh_token:'existing-refresh',expires_at:Date.now()/1000+3600},school);
  assert.equal(result.selected.role,role);
  assert.equal(result.selected.id,school);
  assert.equal(mock.calls.some(call=>call.path==='/auth/v1/token'),false);
  assert.equal(mock.calls.find(call=>call.path==='/auth/v1/user').headers.Authorization,'Bearer existing');
 }
});

test('Leadership rejects an unauthorized school or Teacher session before querying dashboard data',async()=>{
 const session={access_token:'existing',refresh_token:'existing-refresh',expires_at:Date.now()/1000+3600};
 for(const [role,requested] of [['teacher',school],['principal',leave]]){
  const mock=backend(role),client=create(mock.fetcher,null);
  await assert.rejects(()=>client.resumeStaff(session,requested),/Owner or Principal/);
  await assert.rejects(()=>client.overview(),/verified school/);
  assert.equal(mock.calls.some(call=>call.path.includes('/rpc/')),false);
 }
});

test('a revoked remembered Leadership session returns to sign-in and clears its launch marker',async()=>{
 let cleared=false;
 const fetcher=async()=>new Response(JSON.stringify({error_code:'refresh_token_not_found'}),{status:400});
 const client=create(fetcher,{read:async()=> 'revoked-refresh',clear:async()=>{cleared=true;}});
 assert.equal(await client.restore(),null);
 assert.equal(cleared,true);
});

test('an offline Leadership restore leaves the remembered session available for retry',async()=>{
 let cleared=false;
 const client=create(async()=>{throw Error('offline');},{read:async()=> 'valid-refresh',clear:async()=>{cleared=true;}});
 await assert.rejects(()=>client.restore(),/offline/);
 assert.equal(cleared,false);
});

test('a shared app logout racing with device persistence cannot reopen Leadership',async()=>{
 const mock=backend();
 let marker=null;
 const client=create(mock.fetcher,{marker:()=>marker,write:async()=>{marker='signed out concurrently';return false;}});
 await assert.rejects(()=>client.resumeStaff({access_token:'existing',refresh_token:'refresh',expires_at:Date.now()/1000+3600},school),/sign in again/i);
 await assert.rejects(()=>client.overview(),/verified school/);
});

test('Android reopens the last verified Leadership school for a multi-school account',async()=>{
 const mock=backend();
 let stored;
 const other={id:leave,name:'Second school',status:'active'};
 const membership={id:leave,institution_id:leave,auth_user_id:person,role:'school_admin',status:'active'};
 const fetcher=async(url,options)=>{
  const parsed=new URL(url);
  if(parsed.pathname==='/rest/v1/school_users'&&parsed.searchParams.has('auth_user_id')){
   const response=await mock.fetcher(url,options);
   return Response.json([...(await response.json()),membership]);
  }
  if(parsed.pathname==='/rest/v1/institutions'&&parsed.searchParams.get('id')==='eq.'+leave)return Response.json([other]);
  return mock.fetcher(url,options);
 };
 const device={read:async()=>stored,write:async record=>{stored=record;return true;}};
 const client=create(fetcher,device);
 assert.equal((await client.login('leader@example.com','password')).selected.id,school);
 await client.choose(leave);
 const reopened=create(fetcher,device);
 assert.equal((await reopened.restore()).selected.id,leave);
});

test('the shared Staff handoff opens the Principal dashboard in the actual Leadership page',async()=>{
 const {JSDOM}=require('jsdom');
 const mock=backend();
 const dom=new JSDOM(read('leadership.html'),{runScripts:'outside-only',url:'https://school.example/leadership.html?entry=staff&school='+school});
 try{
  const win=dom.window;
  win.fetch=mock.fetcher;
  win.sessionStorage.setItem('bn_school_staff_session_v1',JSON.stringify({
   access_token:'existing',refresh_token:'refresh',expires_at:Date.now()/1000+3600
  }));
  win.eval(read('leadership-app.js'));
  win.dispatchEvent(new win.Event('DOMContentLoaded'));
  for(let i=0;i<20&&win.document.getElementById('metricStudents').textContent!=='90%';i++){
   await new Promise(resolve=>setImmediate(resolve));
  }
  assert.equal(win.document.getElementById('loginPage').hidden,true);
  assert.equal(win.document.getElementById('roleLabel').textContent,'Principal');
  assert.equal(win.document.getElementById('metricStudents').textContent,'90%');
  assert.equal(win.sessionStorage.getItem('bn_school_staff_session_v1'),null);
  assert.equal(mock.calls.some(call=>call.path==='/auth/v1/token'),false);
 }finally{dom.window.close();}
});

test('AI cover suggestions support null choices and use local API fallback when not on production host',async()=>{
 const mock=backend();
 const client=create(mock.fetcher,null);
 await client.login('leader@example.com','password');
 const suggestions=await client.suggestCover(leave,'2026-11-18');
 assert.deepEqual(suggestions,{choices:[],summary:'Review qualified candidates',question:''});
 const aiCall=mock.calls.find(call=>call.path==='/api/timetable/cover-ai');
 assert.ok(aiCall,'cover-ai endpoint must be queried');
 assert.equal(aiCall.body.school,school);
 assert.equal(aiCall.body.leave,leave);
 assert.equal(aiCall.body.day,'2026-11-18');
});

test('AI cover suggestion with null teacher_id unassigns the slot to empty choice in UI',async()=>{
 const {JSDOM}=require('jsdom');
 const mock=backend();
 const dom=new JSDOM(read('leadership.html'),{runScripts:'outside-only',url:'https://school.example/leadership.html'});
 try{
  const win=dom.window;
  win.fetch=mock.fetcher;
  win.eval(read('leadership-app.js'));
  win.dispatchEvent(new win.Event('DOMContentLoaded'));
  await new Promise(resolve=>setImmediate(resolve));
  win.document.getElementById('email').value='leader@example.com';
  win.document.getElementById('password').value='password';
  win.document.getElementById('loginForm').dispatchEvent(new win.Event('submit'));
  for(let i=0;i<20&&win.document.getElementById('metricStudents').textContent==='—';i++){
   await new Promise(resolve=>setImmediate(resolve));
  }
  // Open leaves tab and click preview for pending leave
  const previewBtn=win.document.querySelector('button[data-action="preview"]');
  assert.ok(previewBtn,'preview button must exist');
  previewBtn.click();
  for(let i=0;i<20&&win.document.getElementById('coverRows').childElementCount===0;i++){
   await new Promise(resolve=>setImmediate(resolve));
  }
  const select=win.document.querySelector('select[data-slot="slot"]');
  assert.ok(select,'period select must exist');
  // Mock AI returning null for teacher_id (unassigned)
  const originalFetcher=win.fetch;
  win.fetch=async(url,opts)=>{
   if(url.includes('/api/timetable/cover-ai')){
    return new Response(JSON.stringify({choices:[{slot_id:'slot',class_id:'class',teacher_id:null}],summary:'Unassigned',question:''}),{status:200,headers:{'Content-Type':'application/json'}});
   }
   return originalFetcher(url,opts);
  };
  win.document.getElementById('aiSuggest').click();
  for(let i=0;i<20&&win.document.getElementById('aiCoverReason').textContent==='';i++){
   await new Promise(resolve=>setImmediate(resolve));
  }
  assert.equal(select.value,'','AI suggesting null teacher_id must select empty option');
 }finally{dom.window.close();}
});



test('dashboard cards open the relevant attendance, leave and timetable sections',async()=>{
 const {JSDOM}=require('jsdom');
 const mock=backend();
 const dom=new JSDOM(read('leadership.html'),{runScripts:'outside-only',url:'https://school.example/leadership.html?entry=staff&school='+school});
 try{
  const {window}=dom, doc=window.document;
  window.fetch=async(url,options)=>{
   const path=new URL(url).pathname;
   if(path==='/rest/v1/school_classes')return Response.json([{id:leave,name:'Class 10',section:'A'}]);
   if(path.endsWith('/bn_school_dated_timetable'))return Response.json([
    {day:'2026-11-18',class_id:leave,starts_at:'09:00:00',ends_at:'09:30:00',subject:'Math',teacher_id:null},
    {day:'2026-11-18',class_id:leave,starts_at:'10:00:00',ends_at:'10:30:00',subject:'English',teacher_id:person}
   ]);
   return mock.fetcher(url,options);
  };
  window.sessionStorage.setItem('bn_school_staff_session_v1',JSON.stringify({
   access_token:'existing',refresh_token:'refresh',expires_at:Date.now()/1000+3600
  }));
  window.eval(read('leadership-app.js'));
  window.dispatchEvent(new window.Event('DOMContentLoaded'));
  for(let i=0;i<20&&doc.getElementById('metricStudents').textContent!=='90%';i++){
   await new Promise(resolve=>setImmediate(resolve));
  }
  for(const [metric,page,expected] of [
   ['metricStudents','student-attendance',/27 students present/i],
   ['metricTeachers','teacher-attendance',/3 of 7 teacher attendance marks linked/i],
   ['metricPending','leaves',/Teacher A/],
   ['metricUrgent','uncovered',/Math/]
  ]){
   doc.querySelector('[data-nav="home"]').click();
   const card=doc.getElementById(metric).closest('button');
   assert.ok(card,metric+' must be a keyboard-accessible card');
   card.click();
   const destination=doc.querySelector('[data-page="'+page+'"]');
   assert.equal(destination.hidden,false);
   for(let i=0;i<20&&!expected.test(destination.textContent);i++){
    await new Promise(resolve=>setImmediate(resolve));
   }
   assert.match(destination.textContent,expected);
   await waitForPilot(()=>!card.disabled,'section refresh finishes before the next tap');
  }
  assert.doesNotMatch(doc.querySelector('[data-page="uncovered"]').textContent,/English/);
  assert.equal(doc.getElementById('openTeachingRegister').hidden,true,'Principal cannot open the write register');
 }finally{dom.window.close();}
});

test('Owner attendance card can hand the selected school to the normal ERP sign-in gate',async()=>{
 const mock=backend('school_admin');
 const client=create(mock.fetcher,null);
 await client.login('admin@example.com','password');
 const sessionStorage=new Map();
 const url=await client.attendanceEntry('teaching',{
  setItem:(key,value)=>sessionStorage.set(key,value)
 });
 const target=new URL(url,'https://school.example');
 assert.equal(target.pathname,'/index.html');
 assert.equal(target.searchParams.get('tab'),'Attendance');
 assert.equal(target.searchParams.get('attendance'),'teaching');
 assert.equal(sessionStorage.get('bn_school_staff_selected_school_v1'),school);
 assert.equal(JSON.parse(sessionStorage.get('bn_school_staff_session_v1')).access_token,'test-access');

 const principal=create(backend().fetcher,null);
 await principal.login('principal@example.com','password');
 await assert.rejects(principal.attendanceEntry('teaching',{setItem:()=>assert.fail('Principal wrote an ERP session')}),/Owner or Admin/);
});

async function pilotLeadership(fetcher, initialStorage={}){
 const {JSDOM}=require('jsdom');
 const dom=new JSDOM(read('leadership.html'),{runScripts:'outside-only',url:'https://school.example/leadership.html',pretendToBeVisual:true});
 const {window}=dom,doc=window.document;
 Object.defineProperty(window,'crypto',{value:require('node:crypto').webcrypto});
 window.TextEncoder=TextEncoder;
 window.fetch=fetcher;
 for(const [key,value] of Object.entries(initialStorage))window.sessionStorage.setItem(key,value);
 window.eval(read('leadership-app.js'));
 await new Promise(resolve=>setImmediate(resolve));
 doc.getElementById('email').value='owner@example.com';
 doc.getElementById('password').value='test password';
 doc.getElementById('loginForm').dispatchEvent(new window.Event('submit'));
 await waitForPilot(()=>doc.getElementById('metricStudents').textContent==='90%', 'initial daily overview');
 return {dom,window,doc,el:id=>doc.getElementById(id)};
}

async function waitForPilot(condition,label){
 for(let i=0;i<30&&!condition();i++)await new Promise(resolve=>setTimeout(resolve,5));
 assert.ok(condition(),label);
}

test('Leadership refreshes previously opened attendance when returning to the foreground',async()=>{
 const mock=backend();
 let score=90;
 const app=await pilotLeadership(async(url,options)=>{
  const response=await mock.fetcher(url,options);
  if(!url.endsWith('/bn_leadership_school_pulse'))return response;
  return Response.json({...await response.json(),student_percent:score,students_present:score===90?27:30});
 });
 try{
  app.el('metricStudents').closest('button').click();
  score=100;
  app.doc.dispatchEvent(new app.window.Event('visibilitychange'));
  await waitForPilot(()=>app.el('studentAttendanceDetail').textContent.includes('30 students present'),'updated attendance from the second device');
  assert.equal(app.el('metricStudents').textContent,'100%');
 }finally{app.dom.window.close();}
});

test('opening Leadership Leaves fetches teacher requests submitted after dashboard load',async()=>{
 const mock=backend('school_admin');
 let submitted=false;
 const app=await pilotLeadership(async(url,options)=>{
  if(submitted&&url.endsWith('/bn_list_teacher_leaves')){
   assert.equal(JSON.parse(options.body).p_school,school);
   return Response.json([{id:leave,teacher_name:'New teacher request',status:'pending',kind:'emergency',starts_on:'2026-11-19',ends_on:'2026-11-19'}]);
  }
  return mock.fetcher(url,options);
 });
 try{
  assert.doesNotMatch(app.el('leaveList').textContent,/New teacher request/);
  submitted=true;
  app.doc.querySelector('[data-nav="leaves"]').click();
  await waitForPilot(()=>app.el('leaveList').textContent.includes('New teacher request'),'fresh request in Owner Leaves');
  assert.ok(app.el('leaveList').querySelector('[data-action="approved"]'));
 }finally{app.dom.window.close();}
});

test('Leadership removes attendance register handoff on sign-out even when revocation is offline',async()=>{
 const mock=backend('school_admin');
 const app=await pilotLeadership(mock.fetcher,{
  'bn_school_staff_session_v1':'saved ERP handoff',
  'bn_school_staff_selected_school_v1':school,
  'bright-nexa-school-os:session:v2':'saved ERP workspace session',
  'bn_parents_session':'separate guardian login'
 });
 try{
  app.el('logoutBtn').click();
  await waitForPilot(()=>!app.el('loginPage').hidden,'sign-out returns to the login');
  for(const key of ['bn_school_staff_session_v1','bn_school_staff_selected_school_v1','bright-nexa-school-os:session:v2'])
   assert.equal(app.window.sessionStorage.getItem(key),null,key+' must be removed locally');
  assert.equal(app.window.sessionStorage.getItem('bn_parents_session'),'separate guardian login');
 }finally{app.dom.window.close();}
});

test('a failed substitute date change clears the previous date’s choices',async()=>{
 const mock=backend();
 let fails=false;
 const app=await pilotLeadership(async(url,options)=>{
  if(url.endsWith('/bn_teacher_leave_cover_plan')&&fails)throw Error('Could not load this date');
  const response=await mock.fetcher(url,options);
  if(!url.endsWith('/bn_list_teacher_leaves'))return response;
  const leaves=await response.json();
  leaves[1].ends_on='2026-11-25';
  return Response.json(leaves);
 });
 try{
  app.doc.querySelector('button[data-action="cover"]').click();
  await waitForPilot(()=>app.el('coverRows').querySelector('select'),'first date’s proposed cover');
  fails=true;
  app.el('coverDate').value='2026-11-25';
  app.el('coverDate').dispatchEvent(new app.window.Event('change'));
  await waitForPilot(()=>app.el('notice').textContent.includes('Could not load this date'),'date request failed');
  assert.equal(app.el('coverRows').querySelector('select'),null,'old options cannot be submitted after a failed lookup');
 }finally{app.dom.window.close();}
});

test('urgent delivery status can be checked again without publishing the circular again',async()=>{
 const mock=backend('school_admin');
 let statusReads=0;
 const app=await pilotLeadership(async(url,options)=>{
  if(url.endsWith('/bn_leadership_urgent_delivery_status')){
   statusReads++;
   return Response.json({waiting:statusReads===1?1:0,accepted:statusReads===1?0:1,expired:0,unavailable:0});
  }
  return mock.fetcher(url,options);
 });
 try{
  let confirmation='';
  app.window.confirm=text=>{confirmation=text;return true;};
  app.el('noticeTitle').value='Emergency notice';
  app.el('noticeBody').value='School will dismiss early today.';
  app.el('sendNotice').click();
  await waitForPilot(()=>app.el('noticePublishStatus').textContent.includes('1 waiting'),'initial queue status');
  const refresh=app.el('refreshNoticeStatus');
  assert.ok(refresh&&!refresh.hidden,'published notice has a status refresh action');
  refresh.click();
  await waitForPilot(()=>app.el('noticePublishStatus').textContent.includes('1 accepted by Firebase'),'later Firebase acceptance');
  assert.match(confirmation,/\n\nEmergency notice\n\n/);
  assert.equal(mock.calls.filter(call=>call.path.endsWith('/bn_leadership_publish_urgent_notice')).length,1);
 }finally{app.dom.window.close();}
});

test('retrying an ambiguous notice publish after reload reuses the same request ID',async()=>{
 const mock=backend('school_admin');
 const ids=[];
 const fetcher=async(url,options)=>{
  if(url.endsWith('/bn_leadership_publish_urgent_notice')){
   const id=JSON.parse(options.body).p_request_id;
   ids.push(id);
   if(ids.length===1)throw Error('Connection interrupted while confirming publication');
   return Response.json(id);
  }
  if(url.endsWith('/bn_leadership_urgent_delivery_status'))
   return Response.json({waiting:1,accepted:0,expired:0,unavailable:0});
  return mock.fetcher(url,options);
 };
 const first=await pilotLeadership(fetcher);
 let saved;
 try{
  first.window.confirm=()=>true;
  first.el('noticeTitle').value='Emergency notice';
  first.el('noticeBody').value='School will dismiss early today.';
  first.el('sendNotice').click();
  await waitForPilot(()=>first.el('notice').textContent.includes('Connection interrupted'),'response lost');
  saved=Object.fromEntries(Object.keys(first.window.sessionStorage).map(key=>[key,first.window.sessionStorage.getItem(key)]));
  assert.doesNotMatch(JSON.stringify(saved),/School will dismiss early today/);
 }finally{first.dom.window.close();}
 const second=await pilotLeadership(fetcher,saved);
 try{
  second.window.confirm=()=>true;
  second.el('noticeTitle').value='  Emergency notice ';
  second.el('noticeBody').value='School will dismiss early today.  ';
  second.el('sendNotice').click();
  await waitForPilot(()=>second.el('noticePublishStatus').textContent.includes('Circular published'),'retry acknowledged');
  assert.equal(ids.length,2);
  assert.equal(ids[0],ids[1],'server idempotency must cover retries after reload');
 }finally{second.dom.window.close();}
});

test('publishing cover sends unassigned slots with teacher_id: null so revoked covers are cleared',async()=>{
 const mock=backend();
 const app=await pilotLeadership(mock.fetcher);
 try{
  app.window.confirm=()=>true;
  app.doc.querySelector('[data-nav="leaves"]').click();
  await waitForPilot(()=>app.el('leaveList').textContent.includes('Teacher B'),'approved leave visible');
  await waitForPilot(()=>!app.el('coverDate').disabled,'leaves refresh finished');
  const planBtn=app.doc.querySelector('button[data-action="cover"]');
  assert.ok(planBtn,'plan substitute button must exist');
  planBtn.click();
  await waitForPilot(()=>app.el('coverRows').childElementCount>0,'cover rows loaded');
  const select=app.doc.querySelector('select[data-slot="slot"]');
  assert.ok(select,'period select exists');
  select.value='';
  await waitForPilot(()=>!app.el('coverDate').disabled,'cover plan load finished');
  app.el('publishCover').click();
  await waitForPilot(()=>{
   const publishCall=mock.calls.find(c=>c.path.endsWith('/bn_publish_teacher_covers'));
   return Boolean(publishCall);
  },'publish cover call made');
  const publishCall=mock.calls.find(c=>c.path.endsWith('/bn_publish_teacher_covers'));
  assert.deepEqual(publishCall.body.p_covers,[{slot_id:'slot',class_id:'class',teacher_id:null}]);
 }finally{app.dom.window.close();}
});

test('copyWhatsAppCover copies formatted plain-text substitution slip to clipboard',async()=>{
 const mock=backend();
 const app=await pilotLeadership(mock.fetcher);
 try{
  let copiedText='';
  Object.defineProperty(app.window.navigator,'clipboard',{
   value:{writeText:async text=>{copiedText=text;}},
   configurable:true
  });
  app.doc.querySelector('[data-nav="leaves"]').click();
  await waitForPilot(()=>app.el('leaveList').textContent.includes('Teacher B'),'approved leave visible');
  await waitForPilot(()=>!app.el('coverDate').disabled,'leaves refresh finished');
  const planBtn=app.doc.querySelector('button[data-action="cover"]');
  planBtn.click();
  await waitForPilot(()=>app.el('coverRows').childElementCount>0,'cover rows loaded');
  app.el('copyWhatsAppCover').click();
  await waitForPilot(()=>copiedText.includes('Teacher Substitution Slip'),'slip copied to clipboard');
  await waitForPilot(()=>app.el('notice').textContent.includes('WhatsApp substitution slip copied'),'note updated');
  assert.match(copiedText,/Bright Nexa.*Teacher Substitution Slip/);
  assert.match(copiedText,/Teacher on Leave: Teacher B \(Planned Leave\)/);
  assert.match(copiedText,/10 A · Math/);
  assert.match(copiedText,/Cover: Teacher C/);
 }finally{app.dom.window.close();}
});

test('overview excludes expired approved leaves from stats.approved and reminder insights',async()=>{
 const mock=backend();
 const originalFetcher=mock.fetcher;
 mock.fetcher=async(url,opts)=>{
  const path=new URL(url,'https://school.example').pathname;
  if(path==='/rest/v1/rpc/bn_list_teacher_leaves'){
   return new Response(JSON.stringify([
    {id:leave,teacher_name:'Teacher A',status:'pending',kind:'emergency',starts_on:'2026-11-18',ends_on:'2026-11-18'},
    {id:leave.replace(/3$/,'4'),teacher_name:'Teacher B',status:'approved',kind:'planned',starts_on:'2026-11-18',ends_on:'2026-11-20'},
    {id:leave.replace(/3$/,'5'),teacher_name:'Teacher Past',status:'approved',kind:'planned',starts_on:'2026-11-01',ends_on:'2026-11-10'}
   ]),{status:200,headers:{'Content-Type':'application/json'}});
  }
  return originalFetcher(url,opts);
 };
 const client=create(mock.fetcher,null);
 await client.login('principal@example.com','correct password');
 const stats=await client.overview();
 assert.equal(stats.pending,1);
 assert.equal(stats.approved,1,'expired approved leave must not be counted in stats.approved');
});

test('clearing cover and publishing keeps the slot unassigned on reload and WhatsApp slip copies unassigned status',async()=>{
 let persistedCover='t1';
 const mock=backend();
 const originalFetcher=mock.fetcher;
 mock.fetcher=async(url,opts)=>{
  const path=new URL(url,'https://school.example').pathname;
  if(path==='/rest/v1/rpc/bn_teacher_leave_cover_plan'){
   return new Response(JSON.stringify([
    {slot_id:'slot',class_id:'class',class_name:'10 A',subject:'Math',starts_at:'09:00:00',ends_at:'09:45:00',teacher_id:persistedCover,candidates:[{teacher_id:'t1',teacher_name:'Teacher C',subject_match:true,periods:2}]}
   ]),{status:200,headers:{'Content-Type':'application/json'}});
  }
  if(path==='/rest/v1/rpc/bn_publish_teacher_covers'){
   const body=opts.body?JSON.parse(opts.body):{};
   const covers=body.p_covers||[];
   persistedCover=covers[0]?.teacher_id||null;
   return new Response(JSON.stringify(null),{status:200,headers:{'Content-Type':'application/json'}});
  }
  return originalFetcher(url,opts);
 };
 const app=await pilotLeadership(mock.fetcher);
 try{
  let copiedText='';
  Object.defineProperty(app.window.navigator,'clipboard',{
   value:{writeText:async text=>{copiedText=text;}},
   configurable:true
  });
  app.window.confirm=()=>true;
  app.doc.querySelector('[data-nav="leaves"]').click();
  await waitForPilot(()=>app.el('leaveList').textContent.includes('Teacher B'),'approved leave visible');
  await waitForPilot(()=>!app.el('coverDate').disabled,'leaves refresh finished');
  const planBtn=app.doc.querySelector('button[data-action="cover"]');
  planBtn.click();
  await waitForPilot(()=>app.el('coverRows').childElementCount>0,'cover rows loaded');

  let select=app.doc.querySelector('select[data-slot="slot"]');
  assert.equal(select.value,'t1','initially assigned cover must reflect published teacher_id');

  select.value='';
  await waitForPilot(()=>!app.el('coverDate').disabled,'cover plan load finished');
  app.el('publishCover').click();
  await waitForPilot(()=>app.el('notice').textContent.includes('Cover cleared'),'cover cleared note displayed');
  await waitForPilot(()=>!app.el('coverDate').disabled,'publish cover run finished');

  select=app.doc.querySelector('select[data-slot="slot"]');
  assert.equal(select.value,'','cleared cover must remain unassigned after reload, not auto-select candidate 0');

  app.el('copyWhatsAppCover').click();
  await waitForPilot(()=>copiedText.includes('Teacher Substitution Slip'),'slip copied to clipboard');
  await waitForPilot(()=>!app.el('coverDate').disabled,'copy WhatsApp slip finished');
  assert.match(copiedText,/10 A · Math/);
  assert.match(copiedText,/Cover: No substitute \(Self-study \/ Unassigned\)/);
  assert.doesNotMatch(copiedText,/Cover: Teacher C/);
 }finally{app.dom.window.close();}
});

test('unassigned cover plan defaults dropdown to empty choice and WhatsApp slip copies unassigned status',async()=>{
 const mock=backend();
 const originalFetcher=mock.fetcher;
 mock.fetcher=async(url,opts)=>{
  const path=new URL(url,'https://school.example').pathname;
  if(path==='/rest/v1/rpc/bn_teacher_leave_cover_plan'){
   return new Response(JSON.stringify([
    {slot_id:'slot',class_id:'class',class_name:'10 A',subject:'Math',starts_at:'09:00:00',ends_at:'09:45:00',teacher_id:null,candidates:[{teacher_id:'t1',teacher_name:'Teacher C',subject_match:true,periods:2}]}
   ]),{status:200,headers:{'Content-Type':'application/json'}});
  }
  return originalFetcher(url,opts);
 };
 const app=await pilotLeadership(mock.fetcher);
 try{
  let copiedText='';
  Object.defineProperty(app.window.navigator,'clipboard',{
   value:{writeText:async text=>{copiedText=text;}},
   configurable:true
  });
  app.doc.querySelector('[data-nav="leaves"]').click();
  await waitForPilot(()=>app.el('leaveList').textContent.includes('Teacher B'),'approved leave visible');
  await waitForPilot(()=>!app.el('coverDate').disabled,'leaves refresh finished');
  const planBtn=app.doc.querySelector('button[data-action="cover"]');
  planBtn.click();
  await waitForPilot(()=>app.el('coverRows').childElementCount>0,'cover rows loaded');

  const select=app.doc.querySelector('select[data-slot="slot"]');
  assert.equal(select.value,'','unassigned slot must default to empty choice despite eligible candidates');

  app.el('copyWhatsAppCover').click();
  await waitForPilot(()=>copiedText.includes('Teacher Substitution Slip'),'slip copied to clipboard');
  await waitForPilot(()=>!app.el('coverDate').disabled,'copy WhatsApp slip finished');
  assert.match(copiedText,/Cover: No substitute \(Self-study \/ Unassigned\)/);
  assert.doesNotMatch(copiedText,/Cover: Teacher C/);
 }finally{app.dom.window.close();}
});

