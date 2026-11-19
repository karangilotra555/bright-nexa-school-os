'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');

const schoolA='00000000-0000-4000-8000-000000000001';
const schoolB='00000000-0000-4000-8000-000000000002';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function staffScreen(fetcher){
 const dom=new JSDOM(fs.readFileSync('teacher-access.html','utf8'),{url:'https://school.invalid/teacher-access.html',runScripts:'outside-only'});
 const w=dom.window;
 w.BNHomeworkFiles={create:()=>({list:async()=>[],links(){}})};
 w.fetch=async(url,options)=>({ok:true,status:200,json:async()=>fetcher(new URL(url),options)});
 const src=fs.readFileSync('teacher-access.js','utf8').replace(/\}\)\(\);\s*$/,`globalThis.fixture={
  reload,loadNotices,tab,
  select(school){++schoolLoadEpoch;me={id:'teacher-'+school,institution_id:school,role:'teacher'};session={access_token:school,expires_at:9999999999};},
  data(){return {classes:allClasses,students:allStudents,homework:allHomework};}
 };})();`);
 await w.eval(src);
 return {w,portal:w.fixture,el:id=>w.document.getElementById(id),close:()=>w.close()};
}

test('a slow Staff reload cannot replace the selected school’s class, roster, homework or notices',async()=>{
 let release,entered;
 const oldRequest=new Promise(resolve=>{release=resolve;});
 const started=new Promise(resolve=>{entered=resolve;});
 const screen=await staffScreen(async url=>{
  const school=url.searchParams.get('institution_id')?.slice(3);
  if(url.pathname.endsWith('/school_classes')){
   if(school===schoolA){entered();await oldRequest;}
   return [{id:school+'-class',name:school,institution_id:school}];
  }
  if(url.pathname.endsWith('/school_students'))return [{id:school+'-child',name:school,class_id:school+'-class'}];
  if(url.pathname.endsWith('/school_homework'))return [{id:school+'-homework',class_id:school+'-class',title:school,subject:'English'}];
  if(url.pathname.endsWith('/school_notices'))return [{title:school,body:'School circular',created_at:'2026-11-19'}];
  return [];
 });
 try{
  screen.portal.select(schoolA);
  const old=screen.portal.reload();await started;
  screen.portal.select(schoolB);await screen.portal.reload();
  release();await old;
  assert.equal(screen.portal.data().classes[0].id,schoolB+'-class');
  assert.equal(screen.portal.data().students[0].id,schoolB+'-child');
  assert.equal(screen.portal.data().homework[0].id,schoolB+'-homework');
  assert.match(screen.el('noticesList').textContent,new RegExp(schoolB));
  assert.doesNotMatch(screen.el('classesList').textContent,new RegExp(schoolA));
 }finally{screen.close();}
});

test('Teacher reopens the notices tab and latest refresh supersedes older same-school response',async()=>{
 let release,entered,reads=0;
 const delayed=new Promise(resolve=>{release=resolve;});
 const started=new Promise(resolve=>{entered=resolve;});
 const screen=await staffScreen(async url=>{
  if(!url.pathname.endsWith('/school_notices'))return [];
  const visit=++reads;
  if(visit===1){entered();await delayed;}
  return [{title:visit===1?'Old message':'Latest message',body:'School circular',created_at:'2026-11-19'}];
 });
 try{
  screen.portal.select(schoolA);
  const old=screen.portal.loadNotices();await started;
  screen.portal.tab('notices');await tick();
  release();await old;
  assert.equal(reads,2);
  assert.match(screen.el('noticesList').textContent,/Latest message/);
  assert.doesNotMatch(screen.el('noticesList').textContent,/Old message/);
 }finally{screen.close();}
});

test('Teacher reopening Homework updates the feed without resetting the open homework draft',async()=>{
 let reads=0;
 const screen=await staffScreen(async url=>{
  if(!url.pathname.endsWith('/school_homework'))return [];
  return [{id:'homework',title:++reads===1?'Original assignment':'Current assignment',subject:'English'}];
 });
 try{
  screen.portal.select(schoolA);
  screen.w.document.body.classList.add('bn-teacher-app');
  screen.portal.tab('homework');await tick();
  assert.match(screen.el('homeworkList').textContent,/Original assignment/);
  screen.el('homeworkTitle').value='Retained local draft';
  screen.portal.tab('notices');
  screen.portal.tab('homework');await tick();
  assert.match(screen.el('homeworkList').textContent,/Current assignment/);
  assert.equal(screen.el('homeworkTitle').value,'Retained local draft');
 }finally{screen.close();}
});

test('Parent receipt write is confirmed even when Supabase refreshes the same login first',async()=>{
 const {create}=require('../parents-cloud.js');
 const link={institution_id:schoolA,student_id:'linked-child'},calls=[];
 const user={id:'parent',app_metadata:{bn_institution_id:schoolA,bn_student_id:link.student_id}};
 const client=create(async(url,options)=>{
  const path=new URL(url).pathname;calls.push({path,options});
  let out=[];
  if(path.endsWith('school-student-login'))out={links:[link],session:{access_token:'old',refresh_token:'old-refresh',user,expires_in:30}};
  if(path.endsWith('/auth/v1/token'))out={access_token:'fresh',refresh_token:'fresh-refresh',user,expires_in:3600};
  if(path.endsWith('school_parent_inbox_reads')&&options.method!=='POST')out=[{item_kind:'notice',item_id:'notice'}];
  return {ok:true,status:200,text:async()=>JSON.stringify(out)};
 });
 await client.login('ADM0001','fixture-password');
 await client.markInboxRead(link,'notice','notice');
 assert.equal(calls.filter(c=>c.path.endsWith('/auth/v1/token')).length,1);
 assert.deepEqual(calls.filter(c=>c.path.endsWith('school_parent_inbox_reads')).map(c=>[c.options.method||'GET',c.options.headers.Authorization]),[
  ['POST','Bearer fresh'],['GET','Bearer fresh']
 ]);
});
