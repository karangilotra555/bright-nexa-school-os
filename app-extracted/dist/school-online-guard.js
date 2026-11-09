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
 let retryHandler=null,recoveryHandler=null;
 function setRetry(handler){retryHandler=typeof handler==='function'?handler:null;}
 function setRecover(handler){recoveryHandler=typeof handler==='function'?handler:null;}
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
  const recover=root.document.createElement('button');
  recover.type='button';recover.dataset.role='recover';recover.textContent='Open cloud school (back up device first)';
  recover.style.cssText='background:#fff;color:#0a3155;border:1px solid #b6c8dc;border-radius:8px;padding:12px 16px;font-weight:600;cursor:pointer';
  recover.onclick=async()=>{
    if(!recoveryHandler)return;
    const ok=root.confirm('The current device data and separately queued changes will be backed up before opening the cloud school. This does NOT upload the pending copy. Continue only if you want to open the verified Supabase school?');
    if(!ok)return;
    recover.disabled=true;
    update('loading');
    try{const result=await recoveryHandler();if(result)update(result.status,result.error);}
    catch(error){update('conflict',error);}
    finally{recover.disabled=false;}
  };
  const signOut=root.document.createElement('button');
  signOut.type='button';signOut.dataset.role='signout';signOut.textContent='Sign out';
  signOut.style.cssText='background:#fff;color:#0a3155;border:1px solid #b6c8dc;border-radius:8px;padding:12px 16px;font-weight:650;cursor:pointer';
  signOut.onclick=()=>{
    if(root.BNSchoolLogout?.signOut)return root.BNSchoolLogout.signOut();
    // Only sign-out session keys, never local records/backups.
    for(const key of ['bn_school_staff_session_v1','bn_school_staff_selected_school_v1','bright-nexa-school-os:session:v2'])root.sessionStorage.removeItem(key);
    root.location.replace('./teacher-access.html?loggedOut=1');
  };
  const login=root.document.createElement('a');login.href='./teacher-access.html?staffPortal=1';login.textContent='Staff login';login.style.cssText='padding:12px 10px;color:#087bc5';
  controls.append(retry,recover,signOut,login);card.append(heading,message,controls);el.append(card);root.document.body.append(el);
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
  const recover=el.querySelector('[data-role=recover]');
  const problem=String(error?.message||error||'').trim();
  if(title)title.textContent=current==='conflict'?'School sync conflict — not published'
    : problem?'Supabase save failed — not published'
    : current==='loading'||current==='syncing'?'Connecting to Supabase'
    : current==='pending'?'Publishing school changes'
    : 'School is not connected to Supabase';
  if(message)message.textContent=current==='conflict'
    ? (problem||'Local and cloud records differ.')+'\nNo data was uploaded. Retry cannot resolve a conflicting local copy. To open verified cloud records, choose the recovery option; current and pending device records will be backed up before any switch.'
    : problem
    ? problem+'\nYour change is NOT confirmed in Supabase. Pending edits on this device are retained. Retry sync without clearing browser/app data.'
    : current==='loading'||current==='syncing'?'Loading your school records from Supabase…'
    : current==='pending'?'Saving changes to Supabase. Do not close the application before confirmation.'
    : current==='conflict'?'Another device changed school records. Your local changes were retained; resolve the conflict before uploading.'
    : 'Changes on this device are not published. Sign in to your verified school, then retry sync.';
  if(retry){retry.textContent=current==='conflict'?'Retry unavailable (conflict)':problem?'Retry sync':'Refresh sync';retry.disabled=current==='conflict';}
  if(recover)recover.style.display=current==='conflict'&&recoveryHandler?'inline-block':'none';
 }
 function init(){
  if(!root.document)return;
  if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',()=>update('loading'),{once:true});
  else update('loading');
 }
 return {init,update,active,setRetry,setRecover};
});