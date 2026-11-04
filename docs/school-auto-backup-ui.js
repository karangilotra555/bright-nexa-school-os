/* Owner-controlled automatic local backups. No phrase entry and no backup uploads.
   Local disk writes require a chosen folder and active browser permission. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const engine=window.BrightNexaLocalBackup,backupCore=window.BrightNexaBackupCore;
 const PERIOD=30*60*1000,DEBOUNCE=6500;
 let configured=null,ready=null,store=null,scopeKey=null;
 let busy=false,pending=false,timer=null,queued=null,recovery=null,context=null;
 function show(message){const s=$('backupStatus');if(s)s.textContent=String(message);}
 function controls(){
   const folder=$('backupFolder'),reauth=$('backupReauthorize'),now=$('backupNow'),
         recoveryKey=$('backupRecovery'),verify=$('backupVerify');
   if(!folder)return;
   folder.textContent=configured?.directory?'Change backup folder':'Choose backup folder';
   now.disabled=!configured?.directory;
   recoveryKey.disabled=!configured?.key;
   reauth.hidden=!configured?.directory;
   if(configured?.directory)show('Backup folder: '+configured.directory.name+
       (configured.lastBackupAt?' · Last verified backup: '+new Date(configured.lastBackupAt).toLocaleString('en-IN'):' · No backup saved yet')+
       '. Backups run after saved changes and every 30 minutes while this page is open.');
   else show('Choose a folder on this computer. No backup password needed. A separate recovery key file is recommended.');
 }
 function checkOwner(){
   if(!context||context.state.offlineReadOnly||context.state.me?.role!=='school_admin'||
      context.state.me?.institution_id!==context.state.school?.id||
      context.state.me?.institution_id!==configured?.schoolId&&configured)
     throw Error('Verified online school owner login is required to back up this school.');
 }
 async function load(){
   if(!context||context.state.offlineReadOnly){show('Offline read-only: cloud backups are disabled until online owner login.');return}
   const state=context.state;
   scopeKey=engine.scope(state.school.id,state.authUserId);
   store=engine.storage();
   configured=await store.get(scopeKey);
   if(configured&&(configured.schoolId!==state.school.id||configured.userId!==state.authUserId))
     throw Error('Saved backup folder belongs to a different school owner.');
   controls();
   if(configured?.directory){
     const permission=await configured.directory.queryPermission({mode:'readwrite'});
     $('backupReauthorize').hidden=permission==='granted';
     if(permission!=='granted')show('Previous folder saved ('+configured.directory.name+'). Click Allow folder access to resume automatic backups; browser permission has expired.');
     else if(!configured.lastBackupAt||Date.now()-configured.lastBackupAt>=PERIOD)await run('login');
   }
   if(timer===null)timer=setInterval(()=>{
     if(document.visibilityState==='visible'&&navigator.onLine&&configured?.directory&&
        Date.now()-Number(configured.lastBackupAt||0)>=PERIOD)void run('scheduled');
   },PERIOD);
 }
 function dismissable(e){return e?.name==='AbortError'}
 async function chooseFolder(){
   if(!engine.supported(window))throw Error('Choose Folder needs Chrome or Edge on a secure desktop browser. Unsupported browsers cannot silently write local files.');
   if(!context||context.state.offlineReadOnly)throw Error('Sign in online as the school owner first.');
   const picked=await window.showDirectoryPicker({id:'bright-nexa-school-backup',mode:'readwrite'});
   await ready;
   const state=context.state;
   let next=configured;
   if(!next){
     const material=await engine.makeKey();
     next={schoolId:state.school.id,userId:state.authUserId,directory:picked,key:material.key,keyId:material.keyId,
       lastBackupAt:0,recoverySaved:false};
   }else next={...next,directory:picked,lastBackupAt:0};
   await store.put(scopeKey,next);
   configured=next;controls();$('backupReauthorize').hidden=true;
   await run('folder chosen',true);
   if(!configured.recoverySaved)show('Encrypted backup saved to '+picked.name+
     '. Download your recovery key ONCE and keep it separately from this folder. The key is needed if this browser or laptop is lost.');
 }
 async function authorize(){
   await ready;
   if(!configured?.directory)throw Error('Choose a backup folder first.');
   if(await configured.directory.queryPermission({mode:'readwrite'})!=='granted'){
     const choice=await configured.directory.requestPermission({mode:'readwrite'});
     if(choice!=='granted')throw Error('Folder permission was not granted.');
   }
   $('backupReauthorize').hidden=true;
   await run('permission restored',true);
 }
 async function run(reason,force=false){
   await ready;
   if(!configured?.directory||context?.state.offlineReadOnly)return;
   checkOwner();
   if(!navigator.onLine) {show('Offline: cloud records unavailable. Last backup remains in your chosen folder.');return}
   if(!force&&configured.lastBackupAt&&reason==='scheduled'&&Date.now()-configured.lastBackupAt<PERIOD)return;
   if(busy){pending=true;return}
   busy=true;$('backupNow').disabled=true;
   try{
     const permission=await configured.directory.queryPermission({mode:'readwrite'});
     if(permission!=='granted'){
       $('backupReauthorize').hidden=false;
       show('Folder permission has expired. Click Allow folder access to resume local backups.');
       return;
     }
     show('Encrypting and saving school backup in '+configured.directory.name+'…');
     const result=await engine.writeBackup({
       settings:configured,schoolId:context.state.school.id,userId:context.state.authUserId,
       allSchool:context.allSchool,school:context.state.school,backupCore
     });
     configured={...configured,lastBackupAt:Date.now()};
     await store.put(scopeKey,configured);
     show('Encrypted backup saved & verified · '+new Date(configured.lastBackupAt).toLocaleString('en-IN')+
        ' · '+result.counts.school_students+' students · Folder: '+configured.directory.name+
        '. Daily and latest files are updated automatically.'+
        (!configured.recoverySaved?' Download the separate recovery key file for disaster recovery.':''));
   }catch(e){
     show('Automatic backup FAILED: '+(e?.message||String(e))+'. The last saved backup file was not deleted.');
   }finally{
     busy=false;$('backupNow').disabled=!configured?.directory;
     if(pending){pending=false;queue()}
   }
 }
 function queue(){
   if(!configured?.directory||context?.state.offlineReadOnly)return;
   if(queued)clearTimeout(queued);
   queued=setTimeout(()=>{queued=null;void run('saved change',true)},DEBOUNCE);
 }
 function download(name,data){
   const url=URL.createObjectURL(new Blob([JSON.stringify(data)],{type:'application/json'}));
   const link=document.createElement('a');link.href=url;link.download=name;link.style.display='none';document.body.append(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),30000);
 }
 async function exportRecovery(){
   await ready;
   if(!configured?.key)throw Error('Choose a backup folder first.');
   checkOwner();
   const item=await engine.makeRecoveryKey(configured.schoolId,configured.keyId,configured.key);
   download('bright-nexa-'+configured.schoolId+'-RECOVERY-KEY.bnkey',item);
   configured={...configured,recoverySaved:true};
   await store.put(scopeKey,configured);
   show('Recovery key file downloaded. Keep this .bnkey SEPARATE from the backup folder. Anyone with both files can read school data. The app never asks for a passphrase.');
 }
 function picker(accept,onFile){
   const i=document.createElement('input');i.type='file';i.accept=accept;i.hidden=true;
   i.addEventListener('change',async()=>{
     const file=i.files?.[0];i.value='';if(!file)return;
     try{await onFile(file)}catch(e){show('Backup verification failed: '+(e?.message||String(e)))}
   });
   document.body.append(i);
   return ()=>i.click();
 }
 const verifyFile=picker('.bnbackup,application/json',async file=>{
   await ready;
   if(file.size>36*1024*1024)throw Error('Backup file too large.');
   const parsed=JSON.parse(await file.text());
   const key=recovery?.key||configured?.key, keyId=recovery?.keyId||configured?.keyId;
   if(!key)throw Error('This device has no backup key. Use Import recovery key (.bnkey) first.');
   const data=await engine.decrypt(parsed,key,context.state.school.id,keyId);
   const counts=backupCore.counts(data);
   show('Encrypted file VERIFIED: '+counts.school_students+' students, '+counts.school_classes+
        ' classes, '+counts.school_staff_profiles+' staff profiles. Verification only; no database restore was performed.');
 });
 const importRecovery=picker('.bnkey,application/json',async file=>{
   await ready;
   if(file.size>8192)throw Error('Recovery key file is invalid or too large.');
   recovery=await engine.readRecoveryKey(JSON.parse(await file.text()),context.state.school.id);
   show('Recovery key loaded temporarily. Click Verify backup to read an encrypted file. No database was changed.');
 });
 function attach(args){
   context=args;
   if(!engine||!backupCore){show('Encrypted automatic backup module is missing. Refresh the page.');return}
   if(!engine.supported(window)){
     show('Automatic folder backups require desktop Chrome or Edge in HTTPS. Your browser is not supported. No unencrypted file will be saved.');
     for(const id of ['backupFolder','backupNow','backupVerify','backupRecovery','backupReauthorize'])if($(id))$(id).disabled=true;
     return;
   }
   if($('backupFolder')?.dataset.bound)return;
   $('backupFolder').dataset.bound='1';
   $('backupFolder').addEventListener('click',()=>chooseFolder().catch(e=>{if(!dismissable(e))show('Backup folder error: '+e.message)}));
   $('backupNow').addEventListener('click',()=>run('manual',true).catch(e=>show(e.message)));
   $('backupReauthorize').addEventListener('click',()=>authorize().catch(e=>show(e.message)));
   $('backupRecovery').addEventListener('click',()=>exportRecovery().catch(e=>show(e.message)));
   $('backupVerify').addEventListener('click',verifyFile);
   $('backupImportKey').addEventListener('click',importRecovery);
   ready=load().catch(e=>show('Backup setup error: '+e.message));
 }
 function afterReload(){
   if(!ready)return;
   void ready.then(()=>{
     if(configured?.directory&&(!configured.lastBackupAt||Date.now()-configured.lastBackupAt>=PERIOD))
       return run('school data loaded');
   });
 }
 window.BrightNexaAutoBackup={attach,afterReload,queue};
})();
