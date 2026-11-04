/* Owner offline pilot: opt-in encrypted read-only cache.
   Online Auth + RLS remain mandatory for writes, even if browser says online. */
(() => {
  'use strict';
  const POINTER='bn_school_offline_last_owner_v1';
  const recordKeys=['classes','students','formerStudents','staff','fees','attendance','notices','extra'];
  let vault=null,ids=null;
  const status=message=>{const el=document.getElementById('localStatus');if(el)el.textContent=message;};
  function passphraseDialog(heading){
    return new Promise(resolve=>{
      const dialog=document.createElement('dialog');
      dialog.setAttribute('aria-label',heading);
      dialog.style.cssText='border:1px solid #abc2d8;border-radius:14px;padding:22px;max-width:450px;width:calc(100% - 32px);box-shadow:0 18px 80px #1235';
      const form=document.createElement('form');form.method='dialog';
      const title=document.createElement('h2');title.textContent=heading;
      const note=document.createElement('p');note.textContent='Use a unique 12+ character offline passphrase, not your school login password. It is never saved. If you forget it, your local copy cannot be unlocked.';
      const input=document.createElement('input');input.type='password';input.required=true;input.minLength=12;input.autocomplete='off';input.style.cssText='width:100%;padding:12px;margin:10px 0 16px';input.setAttribute('aria-label','Offline passphrase');
      const buttons=document.createElement('div');buttons.style.cssText='display:flex;gap:10px;justify-content:flex-end';
      const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.onclick=()=>dialog.close();
      const save=document.createElement('button');save.type='submit';save.textContent='Unlock';save.className='primary';
      buttons.append(cancel,save);form.append(title,note,input,buttons);dialog.append(form);document.body.append(dialog);
      let accepted=false;
      form.addEventListener('submit',event=>{
        event.preventDefault();if(!input.reportValidity())return;
        accepted=true;const value=input.value;input.value='';dialog.close();resolve(value);
      });
      dialog.addEventListener('close',()=>{dialog.remove();if(!accepted)resolve(null);},{once:true});
      dialog.showModal();input.focus();
    });
  }
  function snapshot(state){
    if(!state.school?.id||!state.authUserId||state.school.id!==state.me?.institution_id)throw Error('Verified school session required.');
    const result={school:{id:state.school.id,name:state.school.name,status:state.school.status},
      me:{id:state.me.id,institution_id:state.me.institution_id,role:state.me.role,status:state.me.status,auth_user_id:state.authUserId}};
    for(const key of recordKeys)result[key]=state[key]||[];
    return result;
  }
  async function save(state){
    if(!vault||!ids||state.offlineReadOnly)return false;
    if(ids.schoolId!==state.me?.institution_id||ids.userId!==state.authUserId)throw Error('Different school session; offline save blocked.');
    await vault.saveSnapshot(ids.schoolId,ids.userId,snapshot(state));
    status('Encrypted local copy saved. Offline access: read-only.');
    return true;
  }
  async function enable(state){
    try {
      if(!window.BrightNexaOffline)throw Error('Encrypted offline module unavailable.');
      const pass=await passphraseDialog('Enable encrypted offline copy');
      if(pass===null)return;
      const schoolId=state.me?.institution_id,userId=state.authUserId;
      const candidate=new window.BrightNexaOffline.Vault();
      await candidate.unlock(schoolId,userId,pass,true);
      vault=candidate;ids={schoolId,userId};
      await save(state);
      localStorage.setItem(POINTER,JSON.stringify(ids)); // UUID pointer only; never tokens or school records.
    }catch(error){status('Offline save failed: '+error.message);}
  }
  async function restore(){
    if(!window.BrightNexaOffline)throw Error('Offline module not installed on this computer.');
    let pointer;
    try{pointer=JSON.parse(localStorage.getItem(POINTER)||'null');}catch{pointer=null;}
    if(!pointer?.schoolId||!pointer?.userId)throw Error('No offline copy configured on this device.');
    const pass=await passphraseDialog('Unlock school records offline');
    if(pass===null)throw Error('Offline unlock cancelled.');
    const candidate=new window.BrightNexaOffline.Vault();
    await candidate.unlock(pointer.schoolId,pointer.userId,pass,false);
    const payload=await candidate.getSnapshot(pointer.schoolId,pointer.userId);
    if(!payload || payload.me.role!=='school_admin')throw Error('Owner offline copy is missing or invalid.');
    vault=candidate;ids=pointer;
    status('Offline read-only. Reconnect and sign in to make changes.');
    return {payload,userId:pointer.userId};
  }
  function attach(state){
    const btn=document.getElementById('enableOffline');
    if(btn&&!btn.dataset.bound){btn.dataset.bound='1';btn.addEventListener('click',()=>enable(state));}
    if(!state.offlineReadOnly)status(vault?'Encrypted local copy enabled':'Encrypted offline copy is off');
  }
  if('serviceWorker' in navigator && window.isSecureContext){
    navigator.serviceWorker.register('./owner-offline-sw.js',{scope:'./'}).catch(()=>{});
  }
  window.BrightNexaOfflineUI={attach,save,restore};
})();
