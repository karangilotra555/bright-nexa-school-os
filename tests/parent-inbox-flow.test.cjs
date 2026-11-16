const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {setTimeout:delay}=require('node:timers/promises');
const {JSDOM}=require('jsdom');

const links=['first','second'].map(student_id=>({student_id,institution_id:'school'}));
const notice={id:'notice',title:'School closes early',body:'Buses leave at noon',created_at:'2026-11-11T07:00:00Z'};
const homework={id:'task',title:'Read chapter 3',subject:'Science',instructions:'Summarise the experiment',created_at:'2026-11-12T07:00:00Z'};
const absence={id:'absence',status:'absent',day:'2026-11-13'};
const attachment={id:'file',homework_id:'task',name:'worksheet.png',mime:'image/png',storage_path:'00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002/00000000-0000-0000-0000-000000000003.png'};
const html=readFileSync('parents.html','utf8');
const assets=[...html.matchAll(/<script src="([^"?]+)/g)].map(([,path])=>readFileSync(path,'utf8'));
const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];

async function waitFor(predicate){
 for(let i=0;i<60;i++){
  if(predicate())return;
  await delay(10);
 }
 assert.ok(predicate(),'Timed out waiting for the app');
}

function app(state){
 const dom=new JSDOM(html,{url:'https://school.example/parents.html',runScripts:'outside-only'});
 const {window}=dom;
 Object.defineProperty(window.navigator,'userAgent',{value:'Mozilla/5.0 (Linux; Android 14; Pixel 7; wv)'});
 window.scrollTo=()=>{};
 window.URL.createObjectURL=()=> 'blob:worksheet';
 window.URL.revokeObjectURL=()=>{};
 const $=id=>window.document.getElementById(id);
 window.fetch=async(raw,options)=>{
  const url=new URL(raw), table=url.pathname.split('/').at(-1);
  const filter=name=>url.searchParams.get(name)?.slice(3);
  let data=[];
  if(table==='school-student-login')data={session:{access_token:'test-token',user:{id:'parent'}},links};
  if(table==='school_students')data=[{id:filter('id'),name:filter('id'),class_id:filter('id')+'-class'}];
  if(table==='institutions')data=[{name:'Test School'}];
  if(table==='school_classes')data=[{name:'VII',section:'A'}];
  if(table==='school_notices')data=[notice];
  if(table==='school_attendance'&&filter('student_id')==='first')data=[absence];
  if(table==='school_homework'&&filter('class_id')==='first-class')data=[homework];
  if(table==='school_homework_files')data=[attachment];
  if(url.pathname.endsWith(attachment.storage_path)){
   state.attachment=options.headers.Authorization;
   return {ok:true,blob:async()=>new window.Blob(['image'],{type:'image/png'})};
  }
  if(table==='school_parent_inbox_reads'){
   assert.equal(options.headers.Authorization,'Bearer test-token');
   if(options.method==='POST'){
    const payload=JSON.parse(options.body);
    if(state.failWrites)return {status:503,ok:false,text:async()=>JSON.stringify({message:'Unavailable'})};
    state.receipts.set([payload.student_id,payload.item_kind,payload.item_id].join('/'),payload);
    data=null;
   }else{
    data=[...state.receipts.values()].filter(r=>r.student_id===filter('student_id')&&r.institution_id===filter('institution_id'));
    if(filter('item_id'))data=data.filter(r=>r.item_id===filter('item_id')&&r.item_kind===filter('item_kind'));
   }
  }
  return {ok:true,status:200,text:async()=>data===null?'':JSON.stringify(data),json:async()=>data};
 };
 for(const asset of assets)window.eval(asset);
 window.eval(inline);
 const input=(id,value,event='input')=>{$(id).value=value;$(id).dispatchEvent(new window.Event(event,{bubbles:true}));};
 const messages=()=>window.document.querySelector('[data-tab="messages"]');
 const titles=()=>[...$('allNotices').querySelectorAll('summary strong')].map(x=>x.textContent);
 const open=title=>[...$('allNotices').querySelectorAll('summary')].find(x=>x.querySelector('strong').textContent===title).click();
 async function login(){
  $('adm').value='TEST01';$('dob').value='test-password';
  $('loginForm').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  await waitFor(()=>!$('app').classList.contains('hidden'));
  messages().click();
 }
 return {dom,$,input,messages,titles,open,login};
}

test('parent signs in, searches school messages, opens a private attachment, persists read receipts and switches children',async t=>{
 const state={receipts:new Map()};
 const first=app(state);t.after(()=>first.dom.window.close());
 await first.login();
 await waitFor(()=>first.$('inboxUnread').textContent==='3');
 assert.deepEqual(first.titles(),['Marked absent','Read chapter 3','School closes early']);
 first.input('inboxSearch','worksheet.png');
 assert.deepEqual(first.titles(),['Read chapter 3']);
 state.failWrites=true;
 first.open('Read chapter 3');
 await waitFor(()=>/could not mark/i.test(first.$('inboxStatus').textContent));
 assert.equal(first.$('inboxUnread').textContent,'3');
 state.failWrites=false;
 first.$('inboxRetry').click();
 await waitFor(()=>first.$('inboxUnread').textContent==='2');
 const attachmentButton=[...first.$('allNotices').querySelectorAll('button')].find(b=>b.textContent.includes('worksheet.png'));
 assert.ok(attachmentButton);
 attachmentButton.click();
 await waitFor(()=>state.attachment);
 assert.equal(state.attachment,'Bearer test-token');
 first.input('inboxSearch','');
 first.input('inboxFilter','unread','change');
 assert.deepEqual(first.titles(),['Marked absent','School closes early']);

 const next=app(state);t.after(()=>next.dom.window.close());
 await next.login();
 await waitFor(()=>next.$('inboxUnread').textContent==='2');
 next.input('childPicker','1','change');
 await waitFor(()=>next.$('inboxUnread').textContent==='1');
 assert.deepEqual(next.titles(),['School closes early']);
 next.open('School closes early');
 await waitFor(()=>next.$('inboxUnread').hidden);
 assert.equal(state.receipts.size,2);
 next.input('childPicker','0','change');
 await waitFor(()=>next.$('inboxUnread').textContent==='2');
 assert.deepEqual(next.titles(),['Marked absent','Read chapter 3','School closes early']);
 next.$('logout').click();
 assert.equal(next.$('allNotices').textContent,'');
});

test('Supabase receipt policy enforces the logged-in guardian, student, school and message membership',async t=>{
 const {PGlite}=require('@electric-sql/pglite');
 const db=new PGlite();
 t.after(()=>db.close());
 const [parent,otherParent,school,otherSchool,child,sibling,unlinked,schoolClass,otherClass,task,wrongClassTask,noticeId,foreignNotice,absentId,presentId]=
  Array.from({length:15},(_,i)=>'00000000-0000-0000-0000-'+String(i+1).padStart(12,'0'));
 await db.exec(`
  create role anon;
  create role authenticated;
  create schema auth;
  create schema school_private;
  create function auth.uid() returns uuid language sql stable
    as $$select current_setting('request.jwt.claim.sub',true)::uuid$$;
  create table auth.users(id uuid primary key);
  create table institutions(id uuid primary key);
  create table school_students(id uuid primary key,institution_id uuid,class_id uuid,status text,unique(id,institution_id));
  create table school_notices(id uuid primary key,institution_id uuid);
  create table school_homework(id uuid primary key,institution_id uuid,class_id uuid);
  create table school_attendance(id uuid primary key,institution_id uuid,student_id uuid,status text);
  create table guardian_fixture(account uuid,school uuid,student uuid);
  create function school_private.parent_of(p_student uuid,p_institution uuid) returns boolean
    language sql stable security definer set search_path='' as $$
      select exists(select 1 from public.guardian_fixture where account=auth.uid() and student=p_student and school=p_institution)
    $$;
  grant usage on schema auth,school_private to authenticated;
  grant select on school_students,school_notices,school_homework,school_attendance to authenticated;
  insert into auth.users values('${parent}'),('${otherParent}');
  insert into institutions values('${school}'),('${otherSchool}');
  insert into school_students values
    ('${child}','${school}','${schoolClass}','active'),
    ('${sibling}','${school}','${otherClass}','active'),
    ('${unlinked}','${school}','${schoolClass}','active');
  insert into guardian_fixture values
    ('${parent}','${school}','${child}'),('${parent}','${school}','${sibling}'),
    ('${otherParent}','${school}','${child}');
  insert into school_notices values ('${noticeId}','${school}'),('${foreignNotice}','${otherSchool}');
  insert into school_homework values ('${task}','${school}','${schoolClass}'),('${wrongClassTask}','${school}','${otherClass}');
  insert into school_attendance values
    ('${absentId}','${school}','${child}','absent'),('${presentId}','${school}','${child}','present');
 `);
 await db.exec(readFileSync('supabase/migrations/20261116090653_parent_inbox_reads.sql','utf8'));
 await db.exec('set role anon');
 await assert.rejects(db.query('select * from school_parent_inbox_reads'),/permission denied/);
 await db.exec('set role authenticated');
 const login=user=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
 const mark=(user,institution,student,kind,id)=>db.query(`
   insert into school_parent_inbox_reads(auth_user_id,institution_id,student_id,item_kind,item_id)
   values($1,$2,$3,$4,$5)
   on conflict(auth_user_id,institution_id,student_id,item_kind,item_id) do nothing`,[user,institution,student,kind,id]);
 const receipts=async()=> (await db.query('select student_id,item_kind,item_id from school_parent_inbox_reads')).rows;
 await login(parent);
 await mark(parent,school,child,'homework',task);
 await mark(parent,school,child,'homework',task);
 const invalid=[
  [otherParent,school,child,'homework',task],
  [parent,school,child,'homework',wrongClassTask],
  [parent,school,sibling,'homework',task],
  [parent,school,unlinked,'homework',task],
  [parent,school,sibling,'attendance',absentId],
  [parent,school,child,'attendance',presentId],
  [parent,school,child,'notice',foreignNotice],
  [parent,otherSchool,child,'notice',foreignNotice]
 ];
 for(const args of invalid)await assert.rejects(mark(...args),/row-level security/);
 await mark(parent,school,child,'attendance',absentId);
 await mark(parent,school,sibling,'notice',noticeId);
 assert.equal((await receipts()).length,3);
 await login(otherParent);
 assert.deepEqual(await receipts(),[]);
 await mark(otherParent,school,child,'notice',noticeId);
 assert.equal((await receipts()).length,1);
 await db.exec('reset role');
 await db.query('delete from guardian_fixture where account=$1 and student=$2',[otherParent,child]);
 await db.exec('set role authenticated');
 assert.deepEqual(await receipts(),[]);
});
