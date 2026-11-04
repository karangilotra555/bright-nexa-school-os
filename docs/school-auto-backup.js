/* Bright Nexa passwordless encrypted local backup. Browsers can only write to a folder
   explicitly picked by the owner and only while a signed-in browser page is running. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.BrightNexaLocalBackup=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const DATABASE='bright-nexa-local-backup-v1',OBJECT_STORE='settings';
 const TYPE='bright-nexa-local-encrypted-backup',KEY_TYPE='bright-nexa-local-recovery-key';
 const encode=new TextEncoder(),decode=new TextDecoder(),MAX_BYTES=25*1024*1024;
 const base64=bytes=>typeof Buffer!=='undefined'?Buffer.from(bytes).toString('base64'):btoa(String.fromCharCode(...bytes));
 const unbase64=value=>typeof Buffer!=='undefined'?new Uint8Array(Buffer.from(value,'base64')):Uint8Array.from(atob(value),c=>c.charCodeAt(0));
 function scope(schoolId,userId){
   const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
   if(!uuid.test(String(schoolId))||!uuid.test(String(userId)))throw Error('Verified owner and school IDs are required.');
   return String(schoolId).toLowerCase()+':'+String(userId).toLowerCase();
 }
 function secureCrypto(){if(!globalThis.crypto?.subtle||!globalThis.crypto?.getRandomValues)throw Error('Secure browser encryption is unavailable.');return globalThis.crypto;}
 function storage(dbFactory=globalThis.indexedDB){
   if(!dbFactory?.open)throw Error('Private browser storage must be enabled to remember the backup folder.');
   let ready=null;
   const db=()=>ready||(ready=new Promise((resolve,reject)=>{
     const r=dbFactory.open(DATABASE,1);
     r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(OBJECT_STORE))r.result.createObjectStore(OBJECT_STORE);};
     r.onerror=()=>reject(r.error||Error('Backup storage could not open.'));
     r.onsuccess=()=>resolve(r.result);
   }));
   async function run(mode,operation){
     const con=await db();
     return new Promise((resolve,reject)=>{
       const tx=con.transaction(OBJECT_STORE,mode),obj=tx.objectStore(OBJECT_STORE);
       let value;
       try{operation(obj,v=>{value=v})}catch(e){tx.abort();reject(e);return}
       tx.oncomplete=()=>resolve(value);
       tx.onerror=()=>reject(tx.error||Error('Backup storage operation failed.'));
       tx.onabort=()=>reject(tx.error||Error('Backup storage was cancelled.'));
     });
   }
   return {
     get:key=>run('readonly',(obj,set)=>{const r=obj.get(key);r.onsuccess=()=>set(r.result||null);}),
     put:(key,value)=>run('readwrite',obj=>{obj.put(value,key);})
   };
 }
 async function makeKey(){
   const crypto=secureCrypto();
   return {key:await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt']),keyId:crypto.randomUUID()};
 }
 function assertManifest(snapshot,schoolId){
   if(snapshot?.format!=='bright-nexa-school-json'||snapshot.version!==1||snapshot.school_id!==schoolId||
      !Array.isArray(snapshot.table_names)||!snapshot.tables||snapshot.table_names.length<10)throw Error('The school backup is incomplete.');
   for(const table of snapshot.table_names){
      const rows=snapshot.tables[table];
      if(!Array.isArray(rows)||rows.some(row=>row.institution_id!==schoolId))throw Error('School backup contains an incomplete or foreign-school table: '+table);
   }
   return snapshot;
 }
 async function encrypt(snapshot,key,keyId,schoolId){
   assertManifest(snapshot,schoolId);
   if(!key||!keyId)throw Error('School encryption key is unavailable.');
   const crypto=secureCrypto(),iv=crypto.getRandomValues(new Uint8Array(12));
   const plaintext=encode.encode(JSON.stringify(snapshot));
   if(plaintext.length>MAX_BYTES)throw Error('Backup size exceeds 25 MB.');
   const aad=encode.encode('bright-nexa-local-backup-v2|'+schoolId+'|'+keyId);
   const sealed=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},key,plaintext);
   return {format:TYPE,version:2,algorithm:'AES-256-GCM',school_id:schoolId,key_id:keyId,
     created_at:snapshot.created_at,iv:base64(iv),ciphertext:base64(new Uint8Array(sealed))};
 }
 async function decrypt(envelope,key,schoolId,keyId){
   if(envelope?.format!==TYPE||envelope.version!==2||envelope.algorithm!=='AES-256-GCM'||
       envelope.school_id!==schoolId||envelope.key_id!==keyId||
       typeof envelope.iv!=='string'||typeof envelope.ciphertext!=='string'||
       envelope.ciphertext.length>35*1024*1024)throw Error('Backup format, encryption key or school does not match.');
   let manifest;
   try{
     const aad=encode.encode('bright-nexa-local-backup-v2|'+schoolId+'|'+keyId);
     const data=await secureCrypto().subtle.decrypt({name:'AES-GCM',iv:unbase64(envelope.iv),additionalData:aad},key,unbase64(envelope.ciphertext));
     manifest=JSON.parse(decode.decode(data));
   }catch{throw Error('The backup could not be decrypted. The file may be damaged or the recovery key may be wrong.')}
   return assertManifest(manifest,schoolId);
 }
 async function makeRecoveryKey(schoolId,keyId,key){
   const bytes=await secureCrypto().subtle.exportKey('raw',key);
   return {format:KEY_TYPE,version:1,school_id:schoolId,key_id:keyId,algorithm:'AES-256-GCM',
     exported_at:new Date().toISOString(),key:base64(new Uint8Array(bytes))};
 }
 async function readRecoveryKey(item,schoolId){
   if(item?.format!==KEY_TYPE||item.version!==1||item.school_id!==schoolId||
      typeof item.key_id!=='string'||typeof item.key!=='string')throw Error('Wrong school or invalid recovery key file.');
   const decoded=unbase64(item.key);
   if(decoded.byteLength!==32)throw Error('Recovery key length is incorrect.');
   return {key:await secureCrypto().subtle.importKey('raw',decoded,'AES-GCM',false,['encrypt','decrypt']),
     keyId:item.key_id};
 }
 function backupNames(schoolId,date){
   const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,'0'),d=String(date.getDate()).padStart(2,'0');
   return {daily:'bright-nexa-'+schoolId+'-'+y+m+d+'.bnbackup',
     latest:'bright-nexa-'+schoolId+'-latest.bnbackup'};
 }
 async function writeAndVerify(directory,envelope,key,schoolId,keyId,date=new Date()){
   if(!directory?.getFileHandle)throw Error('Choose a valid backup folder.');
   const names=backupNames(schoolId,date);
   const fileContents=JSON.stringify(envelope);
   for(const name of [names.daily,names.latest]){
     const handle=await directory.getFileHandle(name,{create:true});
     const writer=await handle.createWritable();
     try{await writer.write(fileContents);await writer.close()}catch(e){await writer.abort().catch(()=>{});throw e}
     const readback=JSON.parse(await (await handle.getFile()).text());
     const checked=await decrypt(readback,key,schoolId,keyId);
     if(checked.school_id!==schoolId||checked.created_at!==envelope.created_at)
       throw Error('Backup file readback verification failed.');
   }
   return names;
 }
 async function writeBackup({settings,schoolId,userId,allSchool,school,backupCore,now=new Date()}){
   scope(schoolId,userId);
   if(settings?.schoolId!==schoolId||settings?.userId!==userId||settings?.keyId===undefined||
      !settings?.key||!settings?.directory)throw Error('Backup folder is not configured for this owner.');
   const permission=await settings.directory.queryPermission({mode:'readwrite'});
   if(permission!=='granted')throw Error('Folder access needs your approval again. Click Allow folder access.');
   const data=await backupCore.collect(allSchool,school);
   const encrypted=await encrypt(data,settings.key,settings.keyId,schoolId);
   const names=await writeAndVerify(settings.directory,encrypted,settings.key,schoolId,settings.keyId,now);
   return {names,counts:backupCore.counts(data),completedAt:now.toISOString()};
 }
 function supported(root=globalThis){
   return !!(root.isSecureContext&&typeof root.showDirectoryPicker==='function'&&root.indexedDB&&root.crypto?.subtle);
 }
 return {scope,storage,makeKey,makeRecoveryKey,readRecoveryKey,encrypt,decrypt,writeAndVerify,writeBackup,backupNames,supported};
});
