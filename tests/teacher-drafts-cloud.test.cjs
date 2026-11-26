'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const moduleApi=require('../teacher-drafts-cloud.js');
function harness({memberRole='teacher',active=true,noSession=false,foreign=false,failSave=false}={}){
 const calls=[],storage={getItem:()=>noSession?null:JSON.stringify({access_token:'valid',expires_at:Math.floor(Date.now()/1000)+3600})};
 const fetcher=async(url,options={})=>{
  const method=options.method||'GET';calls.push({url,method,body:options.body});
  let response=[];
  if(url.endsWith('/auth/v1/user'))response={id:'user'};
  else if(url.includes('/school_users?'))response=[{id:'member',institution_id:'school',auth_user_id:'user',role:memberRole,status:active?'active':'inactive'}];
  else if(url.includes('/institutions?'))response=[{id:'school',status:'active'}];
  else if(url.includes('/school_teacher_drafts?'))response=[{id:'draft',institution_id:'school',author_school_user_id:'member',tool:'Lesson Plan Generator',class_label:'6',subject:'Science',topic:'Food Components',language:'English',content:'Text',created_at:'2026-11-06T00:00:00Z'}];
  else if(url.includes('/school_teacher_drafts')&&method==='POST'){
   const row=JSON.parse(options.body);response=[{...row,id:'draft',created_at:'2026-11-06T00:00:00Z',institution_id:foreign?'other':row.institution_id}];
   if(failSave)return {ok:false,status:403,json:async()=>({message:'RLS denied'})};
  }else throw Error('Unexpected URL '+url);
  return {ok:true,json:async()=>response};
 };
 return {client:moduleApi.create({fetcher,sessionStorage:storage}),calls};
}
const draft={tool:'Lesson Plan Generator',className:'6',subject:'Science',topic:'Food Components',language:'English',content:'Teacher reviewed content'};
test('Only verified staff can save private drafts to Supabase',async()=>{
 const h=harness();const row=await h.client.save(draft);
 assert.equal(row.title,'Science: Food Components');
 const post=h.calls.filter(c=>c.method==='POST');assert.equal(post.length,1);
 const saved=JSON.parse(post[0].body);assert.equal(saved.institution_id,'school');assert.equal(saved.author_school_user_id,'member');
 assert.match(post[0].url,/school_teacher_drafts/);
});
test('Draft list is scoped by user and tenant and reads only Supabase',async()=>{
 const h=harness();const list=await h.client.list();
 assert.equal(list.length,1);assert.equal(list[0].topic,'Food Components');
 const url=h.calls.find(c=>c.url.includes('school_teacher_drafts?')).url;
 assert.match(url,/institution_id=eq.school/);assert.match(url,/author_school_user_id=eq.member/);
});
test('Inactive, unauthorized, no session, RLS failures and cross-tenant confirmations fail closed',async()=>{
 for(const mode of [{memberRole:'accountant'},{active:false},{noSession:true},{failSave:true},{foreign:true}]){
  const h=harness(mode);
  await assert.rejects(h.client.save(draft));
  if(mode.noSession||mode.active===false||mode.memberRole==='accountant')assert.equal(h.calls.filter(c=>c.method==='POST').length,0);
 }
});
test('Blank content and invalid language cannot trigger a write',async()=>{
 const h=harness();
 await assert.rejects(h.client.save({...draft,content:''}),/Check tool/);
 await assert.rejects(h.client.save({...draft,language:'Français'}),/Check tool/);
 assert.equal(h.calls.length,0);
});
test('client script never stores draft content in localStorage or reports local success',()=>{
 const fs=require('node:fs'),s=fs.readFileSync(require('node:path').join(__dirname,'../teacher-drafts-cloud.js'),'utf8');
 assert.doesNotMatch(s,/localStorage|Template saved locally|service_role/);
});

test('TDD: multi-school member lists and saves drafts scoped strictly to selected school UUID',async()=>{
 const schoolA='11111111-1111-4111-8111-111111111111';
 const schoolB='22222222-2222-4222-8222-222222222222';
 const calls=[];
 const store=new Map([
  ['bn_school_staff_session_v1',JSON.stringify({access_token:'valid',expires_at:Math.floor(Date.now()/1000)+3600})],
  ['bn_school_staff_selected_school_v1',schoolB]
 ]);
 const api=moduleApi.create({
  sessionStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},
  fetcher:async(url,opts={})=>{
   const method=opts.method||'GET';calls.push({url,method,body:opts.body});
   if(url.endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:'multi-user'})};
   if(url.includes('/school_users?'))return {ok:true,json:async()=>[
    {id:'member-a',institution_id:schoolA,auth_user_id:'multi-user',role:'school_admin',status:'active'},
    {id:'member-b',institution_id:schoolB,auth_user_id:'multi-user',role:'teacher',status:'active'}
   ]};
   if(url.includes('/institutions?'))return {ok:true,json:async()=>[{id:schoolB,status:'active'}]};
   if(url.includes('/school_teacher_drafts')&&method==='POST'){
    const row=JSON.parse(opts.body);
    return {ok:true,json:async()=>[{...row,id:'draft-b',created_at:'2026-11-26T00:00:00Z'}]};
   }
   return {ok:true,json:async()=>[{id:'draft-b',institution_id:schoolB,author_school_user_id:'member-b',tool:'Lesson Plan Generator',class_label:'6',subject:'Science',topic:'Light',language:'English',content:'Draft content',created_at:'2026-11-26T00:00:00Z'}]};
  }
 });
 const listed=await api.list();
 assert.equal(listed.length,1);
 assert.match(calls.find(c=>c.url.includes('school_teacher_drafts?')).url,new RegExp('institution_id=eq\\.'+schoolB));
 await api.save(draft);
 const postBody=JSON.parse(calls.find(c=>c.method==='POST').body);
 assert.equal(postBody.institution_id,schoolB);
 assert.equal(postBody.author_school_user_id,'member-b');
});
