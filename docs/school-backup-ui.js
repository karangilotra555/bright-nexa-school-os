/* School owner self-service encrypted off-site backup and local verification. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const core=window.BrightNexaBackupCore;
 function passphraseDialog(confirmPass=false){
  return new Promise(resolve=>{
   const dlg=document.createElement('dialog');dlg.style.cssText='padding:24px;border:1px solid #b8cadb;border-radius:14px;max-width:420px;width:calc(100% - 30px)';
   const frm=document.createElement('form');frm.method='dialog';
   const title=document.createElement('h3');title.textContent=confirmPass?'Create backup passphrase':'Unlock backup for verification';
   const p=document.createElement('p');p.textContent='Use a unique 12+ character passphrase, different from your school login. This passphrase is not saved or recoverable.';frm.append(title,p);
   const first=document.createElement('input');first.type='password';first.autocomplete='off';first.required=true;first.minLength=12;first.placeholder='Backup passphrase';first.style.cssText='width:100%;padding:10px;margin-bottom:10px';
   frm.append(first);
   let again=null;
   if(confirmPass){again=document.createElement('input');again.type='password';again.autocomplete='off';again.required=true;again.minLength=12;again.placeholder='Confirm passphrase';again.style.cssText=first.style.cssText;frm.append(again);}
   const button=document.createElement('button');button.type='submit';button.textContent=confirmPass?'Create encrypted backup':'Verify encrypted backup';
   const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.addEventListener('click',()=>dlg.close());
   frm.append(button,cancel);dlg.append(frm);document.body.append(dlg);
   let accepted=false;
   frm.addEventListener('submit',e=>{
    e.preventDefault();if(!frm.reportValidity())return;
    if(again&&first.value!==again.value){again.setCustomValidity('Passphrases do not match');again.reportValidity();again.setCustomValidity('');return;}
    const pass=first.value;first.value='';if(again)again.value='';
    accepted=true;dlg.close();resolve(pass);
   });
   dlg.addEventListener('close',()=>{dlg.remove();if(!accepted)resolve(null);},{once:true});
   dlg.showModal();first.focus();
  });
 }
 function attach({state,allSchool,error}){
  const download=$('backupDownload'),verify=$('backupVerify'),status=$('backupStatus');
  if(!download||!verify||!core){if(status)status.textContent='Encrypted school backup module could not load.';return;}
  if(download.dataset.bound)return;download.dataset.bound='1';
  download.addEventListener('click',async()=>{
   if(state.offlineReadOnly){status.textContent='Reconnect and verify owner login before exporting a fresh cloud backup.';return;}
   const pass=await passphraseDialog(true);if(pass===null)return;
   download.disabled=true;status.textContent='Reading complete school records securely from Supabase…';
   try{
    if(state.me?.role!=='school_admin'||state.me?.institution_id!==state.school?.id)throw Error('School owner session required.');
    const snapshot=await core.collect(allSchool,state.school);
    status.textContent='Encrypting '+core.TABLES.length+' school tables on this device…';
    const encrypted=await core.encrypt(snapshot,pass);
    const checked=await core.decrypt(encrypted,pass);
    if(checked.school_id!==snapshot.school_id||JSON.stringify(core.counts(checked))!==JSON.stringify(core.counts(snapshot)))
      throw Error('Encrypted backup self-check failed.');
    const blob=new Blob([JSON.stringify(encrypted)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='bright-nexa-school-backup-'+new Date().toISOString().slice(0,10)+'.bnbackup';document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    status.textContent='Encrypted backup created and verified locally ('+snapshot.table_names.length+' tables). Save the downloaded .bnbackup in a secure place and retain the passphrase separately.';
   }catch(e){status.textContent='Backup NOT created: '+e.message;error(e);}
   finally{download.disabled=false;}
  });
  const file=document.createElement('input');file.type='file';file.accept='.bnbackup,application/json';file.hidden=true;file.setAttribute('aria-label','Choose encrypted Bright Nexa backup to verify');
  document.body.append(file);
  verify.addEventListener('click',()=>file.click());
  file.addEventListener('change',async()=>{
   const chosen=file.files?.[0];file.value='';if(!chosen)return;
   if(chosen.size>35*1024*1024){status.textContent='Backup file is too large.';return;}
   const pass=await passphraseDialog(false);if(pass===null)return;
   verify.disabled=true;
   try{
    const decrypted=await core.decrypt(JSON.parse(await chosen.text()),pass);
    if(decrypted.school_id!==state.school?.id)throw Error('This backup belongs to a different school.');
    const counts=core.counts(decrypted);
    status.textContent='Encrypted backup VERIFIED: '+decrypted.table_names.length+' tables, '+counts.school_students+' student records, '+counts.school_classes+' classes, '+counts.school_staff_profiles+' staff profiles. This is a local read/verification, not a database restore.';
   }catch(e){status.textContent='Verification FAILED: '+e.message;error(e);}
   finally{verify.disabled=false}
  });
 }
 window.BrightNexaBackup={attach};
})();
