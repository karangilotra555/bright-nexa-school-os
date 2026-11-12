/* Bright Nexa secure logout; never alter school data or backup queues. */
(function(root){
'use strict';
const STAFF='bn_school_staff_session_v1';
const SELECTED='bn_school_staff_selected_school_v1';
const ERP='bright-nexa-school-os:session:v2';
const API='https://mrfvbwmyxndrakskqyas.supabase.co/auth/v1/logout';
const KEY='sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT';
let busy=false,channel=null;
function currentToken(){
  try{return JSON.parse(root.sessionStorage.getItem(STAFF)||'null')?.access_token||null}catch(_){return null;}
}
function clearSessions(){
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
  const redirect=()=>{try{root.location.replace(destination());}catch(_){root.location.href=destination();}};
  let request=Promise.resolve();
  if(token&&opts?.revoke!==false&&typeof root.fetch==='function'){
    try{request=root.fetch(API,{method:'POST',cache:'no-store',keepalive:true,headers:{apikey:KEY,Authorization:'Bearer '+token}}).catch(()=>null);}
    catch(_){request=Promise.resolve();}
  }
  // Supabase may be offline: a hung revoke must never prevent local sign-out.
  const timeout=new Promise(resolve=>root.setTimeout(resolve,1800));
  return Promise.race([Promise.resolve(request),timeout]).then(()=>{redirect();return true;},()=>{redirect();return true;});
}
function onClick(event){
  // Opening the profile/avatar is not the same as requesting sign-out.
  // Only the explicit Logout control should revoke the current session.
  if(!event.target?.closest?.('#logout, [data-bn-action="logout"]'))return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  if(root.confirm('Sign out of Bright Nexa on this device?'))void signOut();
}
root.document?.addEventListener('click',onClick,true);
if(typeof root.BroadcastChannel==='function'){
  try{
    channel=new root.BroadcastChannel('bright-nexa-school-os-auth');
    channel.onmessage=event=>{if(event.data?.type==='signed-out')void signOut({broadcast:false,revoke:false});};
  }catch(_){channel=null;}
}
root.BNSchoolLogout={signOut,clearSessions};
})(window);
