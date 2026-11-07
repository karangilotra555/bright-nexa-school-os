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
  const retry=root.document.createElement('button');retry.type='button';retry.textContent='Retry sync';retry.style.cssText='background:#188bd7;color:white;border:0;border-radius:8px;padding:12px 20px;font-weight:600;cursor:pointer';retry.onclick=()=>root.location.reload();
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
  const title=el.querySelector('[data-role=heading]'),message=el.querySelector('[data-role=message]');
  if(title)title.textContent=current==='loading'||current==='pending'||current==='syncing'?'Syncing school records':'School records are not published';
  const description=error?.message||String(error||'');
  if(message)message.textContent=description||(
   current==='loading'||current==='syncing'?'Loading your school records from Supabase…':
   current==='pending'?'Publishing changes to Supabase. Do not close the application.':
   'Your school is not connected to cloud data. New students cannot use the Parent Portal until the school sync succeeds.'
  );
 }
 function init(){
  if(!root.document)return;
  if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',()=>update('loading'),{once:true});
  else update('loading');
 }
 return {init,update,active};
});