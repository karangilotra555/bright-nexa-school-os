/* Bright Nexa secure logout; never alter school data or backup queues. */
(function(root){
'use strict';
const STAFF='bn_school_staff_session_v1';
const SELECTED='bn_school_staff_selected_school_v1';
const ERP='bright-nexa-school-os:session:v2';
const API='https://mrfvbwmyxndrakskqyas.supabase.co/auth/v1/logout?scope=local';
const KEY='sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT';
let busy=false,channel=null;
function currentToken(){
  try{return JSON.parse(root.sessionStorage.getItem(STAFF)||'null')?.access_token||null}catch(_){return null;}
}
function clearSessions(){
  root.BNPrivateCache?.lock();
  // No localStorage/IndexedDB clearing: school records and pending sync are retained.
  [STAFF,SELECTED,ERP].forEach(key=>root.sessionStorage.removeItem(key));
  root.document?.getElementById('bn-cloud-publish-status')?.remove();
}
function destination(){return new URL('./teacher-access.html?loggedOut=1',root.location.href).href;}
function signOut(opts){
  if(busy)return Promise.resolve(false);
  busy=true;
  const token=currentToken();
  clearSessions(); // Prevent silent re-login even if network request fails.
  if(opts?.broadcast!==false&&channel){try{channel.postMessage({type:'signed-out'});}catch(_){}}
  // Keep the revocation request alive during navigation. Local logout is immediate.
  if(token&&opts?.revoke!==false&&typeof root.fetch==='function'){
    try{void root.fetch(API,{method:'POST',cache:'no-store',keepalive:true,headers:{apikey:KEY,Authorization:'Bearer '+token}}).catch(()=>{});}
    catch(_){}
  }
  try{root.location.replace(destination());}catch(_){root.location.href=destination();}
  return Promise.resolve(true);
}
function requestSignOut(){
  if(busy)return;
  const doc=root.document;
  if(doc.getElementById('bn-signout-dialog')?.open)return;
  const dialog=doc.createElement?.('dialog');
  if(typeof dialog?.showModal!=='function'){
    if(root.confirm('Sign out of Bright Nexa on this device?'))void signOut();
    return;
  }
  dialog.id='bn-signout-dialog';
  dialog.setAttribute('aria-labelledby','bn-signout-title');
  dialog.setAttribute('aria-describedby','bn-signout-description');
  dialog.style.cssText='box-sizing:border-box;width:min(420px,calc(100vw - 32px));border:1px solid #cbd5e1;border-radius:14px;padding:24px;background:#fff;color:#0b2545;font:inherit;box-shadow:0 16px 48px #0b25454d';
  const form=doc.createElement('form');
  form.innerHTML='<h2 id="bn-signout-title" style="margin:0 0 8px;font-size:20px">Log out of Bright Nexa?</h2>'+
    '<p id="bn-signout-description" style="margin:0 0 20px">Pending school edits will stay on this device.</p>'+
    '<div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap">'+
    '<button type="button" value="cancel" autofocus style="padding:8px 14px;border:1px solid #cbd5e1;border-radius:8px;color:#0b2545;background:#f1f5f9">Cancel</button>'+
    '<button type="submit" style="padding:8px 14px;border:1px solid #0b315e;border-radius:8px;background:#0b315e;color:#fff">Log out</button></div>';
  form.querySelector('[value="cancel"]').addEventListener('click',()=>dialog.close());
  form.addEventListener('submit',event=>{
    event.preventDefault();
    dialog.close();
    void signOut();
  });
  dialog.addEventListener('close',()=>dialog.remove(),{once:true});
  dialog.append(form);
  doc.body.append(dialog);
  dialog.showModal();
}
function onClick(event){
  // Opening the profile/avatar is not the same as requesting sign-out.
  // Only the explicit Logout control should revoke the current session.
  if(!event.target?.closest?.('#logout, [data-bn-action="logout"]'))return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  requestSignOut();
}
root.document?.addEventListener('click',onClick,true);
if(typeof root.BroadcastChannel==='function'){
  try{
    channel=new root.BroadcastChannel('bright-nexa-school-os-auth');
    channel.onmessage=event=>{if(event.data?.type==='signed-out')void signOut({broadcast:false,revoke:false});};
  }catch(_){channel=null;}
}
root.BNSchoolLogout={requestSignOut,signOut,clearSessions};
})(window);
