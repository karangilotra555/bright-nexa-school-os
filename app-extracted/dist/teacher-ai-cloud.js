/* Authenticated Smart Tools client — never stores provider keys or fabricated drafts. */
(function(root,factory){const api=factory();if(typeof window==='object')window.BNSmartToolsAI=api;else root.BNSmartToolsAI=api;if(typeof module==='object'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const SESSION='bn_school_staff_session_v1';
 const SUPABASE='https://mrfvbwmyxndrakskqyas.supabase.co';
 const PUBLISHABLE='sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT';
 const API='https://bright-nexa-school-os-api.onrender.com';
 function create({fetcher,storage,baseUrl}={}){
  const network=fetcher||(typeof fetch==='function'?fetch.bind(globalThis):null);
  const store=storage||(typeof sessionStorage!=='undefined'?sessionStorage:null);
  if(!network||!store)throw Error('School AI requires a supported browser session.');
  async function session(){
   let s;try{s=JSON.parse(store.getItem(SESSION)||'null')}catch(_){}
   if(!s?.access_token)throw Error('Sign in via Teachers & Staff (school cloud account) to use AI. Local Mode alone does not authorize AI usage.');
   if(!Number.isFinite(Number(s.expires_at))||Number(s.expires_at)<=Date.now()/1000+90){
    if(!s.refresh_token)throw Error('Teacher session expired. Sign in again.');
    const res=await network(SUPABASE+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:PUBLISHABLE,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token}),cache:'no-store'});
    let data;try{data=await res.json()}catch{throw Error('Cloud login refresh failed.')}
    if(!res.ok||!data.access_token)throw Error('Cloud login expired. Sign in through Teachers & Staff.');
    s={access_token:data.access_token,refresh_token:data.refresh_token||s.refresh_token,expires_at:Math.floor(Date.now()/1000)+Number(data.expires_in||3600)};
    store.setItem(SESSION,JSON.stringify(s));
   }
   return s;
  }
  async function generate(input){
   const s=await session();
   const endpoint=(baseUrl||API).replace(/\/$/,'')+'/api/smart-tools/generate';
   const controller=typeof AbortController==='function'?new AbortController():null;
   const timeout=controller&&typeof setTimeout==='function'?setTimeout(()=>controller.abort(),85000):null;
   let response;
   try{
    response=await network(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+s.access_token},body:JSON.stringify(input),cache:'no-store',...(controller?{signal:controller.signal}:{})});
   }catch(err){
    throw Error(err.name==='AbortError'?'AI generation timed out; retry with fewer questions.':'School AI server could not be reached. Check connection and deployment.');
   }finally{if(timeout)clearTimeout(timeout)}
   let payload;try{payload=await response.json()}catch{throw Error('School AI service returned an invalid response.')}
   if(!response.ok)throw Error(payload?.error||'AI generation failed. No draft was created.');
   if(typeof payload?.content!=='string'||payload.content.trim().length<60)throw Error('AI response failed content validation. No draft was created.');
   return payload.content;
  }
  return {generate};
 }
 return {create,generate:async input=>create().generate(input)};
});
