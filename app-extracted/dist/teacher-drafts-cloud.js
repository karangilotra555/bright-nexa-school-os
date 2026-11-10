/* Teacher draft persistence: Supabase is canonical. No browser-only success path. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BNTeacherDrafts=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const BASE='https://mrfvbwmyxndrakskqyas.supabase.co';
const KEY='sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT';
const SESSION='bn_school_staff_session_v1';
const clean=(v,max)=>String(v==null?'':v).trim().slice(0,max);
function create(options){
 const fetcher=options?.fetcher||(typeof fetch==='function'?fetch.bind(globalThis):null);
 const storage=options?.sessionStorage||(typeof sessionStorage!=='undefined'?sessionStorage:null);
 if(!fetcher||!storage)throw Error('Cloud session is unavailable.');
 async function timedFetch(url,options={}){
  const ctl=typeof AbortController==='function'?new AbortController():null;
  let timer,expired=false;
  try{
    return await Promise.race([
      Promise.resolve().then(()=>fetcher(url,{...options,...(ctl?{signal:ctl.signal}:{})})),
      new Promise((_,reject)=>{timer=setTimeout(()=>{
        expired=true;ctl?.abort();
        reject(Error('Teacher draft request timed out. No cloud save was confirmed; check connection and retry.'));
      },20000);})
    ]);
  }catch(e){
    if(expired||e?.name==='AbortError')throw Error('Teacher draft request timed out. No cloud save was confirmed; check connection and retry.');
    throw e;
  }finally{clearTimeout(timer);}
 }
 async function decode(res){let result;try{result=await res.json()}catch(e){throw Error('Invalid Supabase response; draft not saved.')}
  if(!res.ok)throw Error(result?.message||result?.error_description||result?.error||'Cloud save unavailable; draft not saved.');
  return result;
 }
 async function readSession(){
  let s;try{s=JSON.parse(storage.getItem(SESSION)||'null')}catch(_){}
  if(!s?.access_token)throw Error('Sign in through Teachers & Staff to save private drafts in Supabase.');
  if(!Number.isFinite(+s.expires_at)||s.expires_at<=Date.now()/1000+90){
   if(!s.refresh_token)throw Error('School session expired; sign in again.');
   const refreshed=await decode(await timedFetch(BASE+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token}),cache:'no-store'}));
   if(!refreshed.access_token)throw Error('Cloud session refresh failed.');
   s={access_token:refreshed.access_token,refresh_token:refreshed.refresh_token||s.refresh_token,expires_at:Math.floor(Date.now()/1000)+Number(refreshed.expires_in||3600)};
   storage.setItem(SESSION,JSON.stringify(s));
  }
  return s;
 }
 async function request(path,token,method='GET',body=null){
  return decode(await timedFetch(BASE+path,{method,headers:{apikey:KEY,Authorization:'Bearer '+token,'Content-Type':'application/json',...(method==='POST'?{Prefer:'return=representation'}:{})},body:body===null?undefined:JSON.stringify(body),cache:'no-store'}));
 }
 async function member(){
  const session=await readSession(),user=await request('/auth/v1/user',session.access_token);
  if(!user?.id)throw Error('Cannot verify school identity.');
  const q=new URLSearchParams({select:'id,institution_id,auth_user_id,role,status',auth_user_id:'eq.'+user.id});
  const entries=await request('/rest/v1/school_users?'+q,session.access_token);
  if(!Array.isArray(entries))throw Error('Invalid school membership response.');
  const own=entries.filter(s=>s.auth_user_id===user.id&&s.status==='active'&&['teacher','principal','school_admin'].includes(s.role));
  if(own.length!==1)throw Error('Active teacher, principal or school admin membership required.');
  const schoolQuery=new URLSearchParams({select:'id,status',id:'eq.'+own[0].institution_id});
  const schools=await request('/rest/v1/institutions?'+schoolQuery,session.access_token);
  if(!Array.isArray(schools)||!schools.some(s=>s.id===own[0].institution_id&&['active','trial'].includes(s.status)))throw Error('School is inactive or inaccessible.');
  return {token:session.access_token,user:own[0]};
 }
 function item(row){
  return {id:row.id,tool:row.tool,title:row.subject+': '+row.topic,className:row.class_label,subject:row.subject,topic:row.topic,language:row.language,content:row.content,createdAt:row.created_at};
 }
 async function list(){
  const m=await member();
  const limit=100,records=[],seen=new Set();
  for(let offset=0;;offset+=limit){
   const q=new URLSearchParams({select:'id,tool,class_label,subject,topic,language,content,created_at',institution_id:'eq.'+m.user.institution_id,author_school_user_id:'eq.'+m.user.id,order:'created_at.desc,id.desc',limit:String(limit),offset:String(offset)});
   const rows=await request('/rest/v1/school_teacher_drafts?'+q,m.token);
   if(!Array.isArray(rows))throw Error('Supabase draft list returned an invalid response.');
   for(const row of rows){
    if(!row?.id||seen.has(row.id))throw Error('Supabase draft pagination was inconsistent; refresh and retry.');
    seen.add(row.id);records.push(item(row));
   }
   if(rows.length<limit)break;
  }
  return records;
 }
 async function save(draft){
  const d=draft||{},tool=clean(d.tool,100),className=clean(d.className,100),subject=clean(d.subject,120),topic=clean(d.topic,160),language=clean(d.language,20),content=String(d.content||'').trim();
  if(!tool||!className||!subject||!topic||!content||content.length>20000||!['English','Hindi','Bilingual'].includes(language))throw Error('Check tool, class, subject, topic, language and draft length (max 20,000).');
  const m=await member();
  const payload={institution_id:m.user.institution_id,author_school_user_id:m.user.id,tool,class_label:className,subject,topic,language,content};
  const rows=await request('/rest/v1/school_teacher_drafts',m.token,'POST',payload);
  if(!Array.isArray(rows)||rows.length!==1||rows[0].institution_id!==m.user.institution_id||rows[0].author_school_user_id!==m.user.id||rows[0].content!==content)throw Error('Supabase did not confirm the saved draft.');
  return item(rows[0]);
 }
 return {list,save};
}
return {create,list:async()=>create().list(),save:async d=>create().save(d)};
});