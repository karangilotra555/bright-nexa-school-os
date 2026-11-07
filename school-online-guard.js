/* Bright Nexa: never present unsynced local student changes as published cloud records. */
(function(root,factory){
 'use strict';
 const api=factory(root);
 if(typeof module==='object'&&module.exports)module.exports=api;
 else {root.BNWorkspaceOnlineGuard=api;api.init();}
})(typeof window!=='undefined'?window:globalThis,function(root){
 'use strict';
 const SESSION='bright-nexa-school-os:session:v2',ID='bn-cloud-publish-status';
 const entry=()=>{try{return JSON.parse(root.sessionStorage.getItem(SESSION)||'null')}catch(_){return null}};
 let retryHandler=null;
 function setRetry(handler){retryHandler=typeof handler==='function'?handler:null;}
 function active(){return entry()?.cloudVerified===true;}
 function node(){
  if(!root.document||!active())return null;
  let el=root.document.getElementById(ID);
  if(el)return el;
  el=root.document.createElement('section');el.id=ID;el.setAttribute('role','status');
  el.setAttribute('aria-live','polite');el.style.cssText='position:fixed;z-index:2147483000;inset:0;background:#f3f7fd;display:flex;align-items:center;justify-content:center;padding:24px;color:#0a3155;font-family:system-ui,sans-serif';
  const card=root.document.createElement('div');card.style.cssText='background:white;border:1px solid #d9e4ef;border-radius:16px;padding:28px;max-width:440px;width:100%;box-shadow:0 10px 30px #082b4a15';
  const heading=root.document.createElement('h2');heading.textContent='Connecting School OS';heading.dataset.role='heading';
  const message=root.document.createElement('p');message.dataset.role='message';message.textContent='Verifying cloud workspace before enabling school changes.';
  message.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere';
  const controls=root.document.createElement('div');controls.style.cssText='display:flex;gap:12px;flex-wrap:wrap;margin-top:24px';
  const retry=root.document.createElement('button');retry.type='button';retry.dataset.role='retry';retry.textContent='Retry sync';retry.style.cssText='background:#188bd7;color:white;border:0;border-radius:8px;padding:12px 20px;font-weight:600;cursor:pointer';retry.onclick=async()=>{if(!retryHandler){root.location.reload();return;}update('syncing');try{const result=await retryHandler();if(result)update(result.status,result.error);}catch(error){update('pending',error);}};
  const login=root.document.createElement('a');login.href='./teacher-access.html?staffPortal=1';login.textContent='Staff login';login.style.cssText='padding:12px 10px;color:#087bc5';
  controls.append(retry,login);card.append(heading,message,controls);el.append(card);root.document.body.append(el);
  return el;
 }
 function update(status,error){
  if(!active())return;
  const el=node();if(!el)return;
  const current=String(status||'local');
  if(current==='synced'&&!error){el.style.display='none';return;}
  el.style.display='flex';
  const title=el.querySelector('[data-role=heading]');
  const message=el.querySelector('[data-role=message]');
  const retry=el.querySelector('[data-role=retry]');
  const problem=String(error?.message||error||'').trim();
  if(title)title.textContent=problem
    ? 'Supabase save failed — not published'
    : current==='conflict'?'School sync conflict'
    : current==='loading'||current==='syncing'?'Connecting to Supabase'
    : current==='pending'?'Publishing school changes'
    : 'School is not connected to Supabase';
  if(message)message.textContent=problem
    ? problem+'\nYour change is NOT confirmed in Supabase. Pending edits on this device are retained. Retry sync without clearing browser/app data.'
    : current==='loading'||current==='syncing'?'Loading your school records from Supabase…'
    : current==='pending'?'Saving changes to Supabase. Do not close the application before confirmation.'
    : current==='conflict'?'Another device changed school records. Your local changes were retained; resolve the conflict before uploading.'
    : 'Changes on this device are not published. Sign in to your verified school, then retry sync.';
  if(retry)retry.textContent=problem||current==='conflict'?'Retry sync':'Refresh sync';
 }
 function init(){
  if(!root.document)return;
  if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',()=>update('loading'),{once:true});
  else update('loading');
 }
 return {init,update,active,setRetry};
});