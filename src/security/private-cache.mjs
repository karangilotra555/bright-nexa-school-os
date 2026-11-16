import { gcm } from '@noble/ciphers/aes.js';

const META='bn.private-cache.v1';
const ITERATIONS=600000;
const DATABASE_TIMEOUT_MS=20000;
const DATABASES=[['bright-nexa-school-os','records'],['bn-workspace-recovery-v1','backups']];
const BLOCKED='Close other School OS tabs, then retry.';
const enc=new TextEncoder(),dec=new TextDecoder();
const protectedKey=k=>k.startsWith('bright-nexa-school-os:')||k.startsWith('bn.workspace.v1.')||k==='school_admin_token';
function base64(bytes){let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);}
function bytes(s){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}

// The key lives only in this page's memory. No key/passphrase is persisted or
// transmitted. Synchronous AEAD keeps existing durable Storage/CAS semantics;
// PBKDF2 runs in native WebCrypto before the application can read any records.
export function createPrivateCache({storage:raw,indexedDB,crypto,timeoutMs=DATABASE_TIMEOUT_MS}){
 let key=null,ready=false,generation=0;
 function requireKey(){if(!key)throw Error('Device records are locked. Unlock with the device passphrase.');}
 function seal(value,context){
  requireKey();const nonce=crypto.getRandomValues(new Uint8Array(12));
  return {bnEncrypted:1,nonce:base64(nonce),data:base64(gcm(key,nonce,enc.encode(context)).encrypt(enc.encode(JSON.stringify(value))))};
 }
 function open(value,context){
  requireKey();
  if(value?.bnEncrypted!==1)throw Error('Unencrypted device record detected. Reload to migrate it safely.');
  return JSON.parse(dec.decode(gcm(key,bytes(value.nonce),enc.encode(context)).decrypt(bytes(value.data))));
 }
 function lock(){generation++;ready=false;if(key)key.fill(0);key=null;}
 function migrateLocal(){
  const keys=Array.from({length:raw.length},(_,i)=>raw.key(i)).filter(k=>k&&protectedKey(k));
  for(const k of keys){
   const old=raw.getItem(k);if(old===null)continue;
   let parsed;try{parsed=JSON.parse(old);}catch{}
   if(parsed?.bnEncrypted===1){open(parsed,'local:'+k);continue;}
   const replacement=JSON.stringify(seal(old,'local:'+k));
   if(open(JSON.parse(replacement),'local:'+k)!==old)throw Error('Device migration verification failed.');
   raw.setItem(k,replacement);
   if(raw.getItem(k)!==replacement)throw Error('Device migration write failed.');
  }
 }
 function scanDatabase(name,store,mode,visit){
  return new Promise((resolve,reject)=>{
   let request,db,tx,timer,finished=false;
   function watchProgress(){
    clearTimeout(timer);
    timer=setTimeout(()=>fail(Error('Device storage timed out. '+BLOCKED)),timeoutMs);
   }
   watchProgress();
   function finish(error){
    if(finished)return;
    finished=true;
    clearTimeout(timer);
    if(error&&tx){try{tx.abort();}catch{}}
    db?.close();
    if(error)reject(error);else resolve();
   }
   function fail(error){finish(error||Error('Unable to read device storage. '+BLOCKED));}
   try{request=indexedDB.open(name,1);}catch(error){fail(error);return;}
   request.onblocked=()=>fail(Error('Device storage is busy. '+BLOCKED));
   request.onerror=()=>fail(request.error);
   request.onupgradeneeded=()=>{
    if(finished){request.transaction.abort();return;}
    try{request.result.createObjectStore(store);}catch(error){
     request.transaction.abort();fail(error);
    }
   };
   request.onsuccess=()=>{
    if(finished){request.result.close();return;}
    db=request.result;
    watchProgress();
    try{
     tx=db.transaction(store,mode);
     tx.oncomplete=()=>finish();
     tx.onabort=tx.onerror=()=>fail(tx.error);
     const cursor=tx.objectStore(store).openCursor();
     cursor.onerror=()=>fail(cursor.error);
     cursor.onsuccess=()=>{
      if(finished)return;
      watchProgress();
      const row=cursor.result;
      if(!row)return;
      try{visit(row);row.continue();}catch(error){fail(error);}
     };
    }catch(error){fail(error);}
   };
  });
 }
 function migrateDatabase(name,store,attempt){
  return scanDatabase(name,store,'readwrite',row=>{
   if(attempt!==generation)throw Error('Device unlock was cancelled. Retry.');
   const context=store+':'+row.key;
   if(row.value?.bnEncrypted===1){open(row.value,context);return;}
   const replacement=seal(row.value,context);
   if(JSON.stringify(open(replacement,context))!==JSON.stringify(row.value))throw Error('Device migration verification failed.');
   row.update(replacement);
  });
 }
 async function unlock(passphrase){
  lock();const attempt=generation;
  if(typeof passphrase!=='string'||passphrase.length<12)throw Error('Use a device passphrase of at least 12 characters.');
  const original=raw.getItem(META);
  const metadata=original?JSON.parse(original):{version:1,salt:base64(crypto.getRandomValues(new Uint8Array(16))),iterations:ITERATIONS};
  if(metadata.version!==1||metadata.iterations!==ITERATIONS)throw Error('Unsupported device encryption settings. Records were retained.');
  const material=await crypto.subtle.importKey('raw',enc.encode(passphrase),'PBKDF2',false,['deriveBits']);
  const derived=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:bytes(metadata.salt),iterations:ITERATIONS},material,256));
  if(attempt!==generation){derived.fill(0);throw Error('Device unlock was cancelled. Retry.');}
  key=derived;
  try{
   if(raw.getItem(META)!==original)throw Error('Another tab configured device encryption. Retry with its passphrase.');
   if(original){if(open(metadata.check,'verifier')!=='Bright Nexa device cache')throw Error('Incorrect device passphrase.');}
   else{metadata.check=seal('Bright Nexa device cache','verifier');raw.setItem(META,JSON.stringify(metadata));}
   for(const [name,store] of DATABASES){
    if(attempt!==generation)throw Error('Device unlock was cancelled. Retry.');
    await migrateDatabase(name,store,attempt);
   }
   if(attempt!==generation)throw Error('Device unlock was cancelled. Retry.');
   migrateLocal();ready=true;
  }catch(error){if(attempt===generation)lock();throw error;}
 }
 // Export remains available even when storage quota prevents migration. It never
 // changes the originals, and uses an independent key so it cannot unlock the app.
 async function exportRecovery(passphrase){
  if(typeof passphrase!=='string'||passphrase.length<12)throw Error('Use a recovery passphrase of at least 12 characters.');
  const records={format:'bright-nexa-device-recovery-v1',local:{},databases:{}};
  for(let i=0;i<raw.length;i++){const k=raw.key(i);if(k&&(protectedKey(k)||k===META))records.local[k]=raw.getItem(k);}
  for(const [name,store] of DATABASES){
   const rows=[];
   await scanDatabase(name,store,'readonly',row=>rows.push({key:row.key,value:row.value}));
   records.databases[name]={store,rows};
  }
  const salt=crypto.getRandomValues(new Uint8Array(16)),nonce=crypto.getRandomValues(new Uint8Array(12));
  const material=await crypto.subtle.importKey('raw',enc.encode(passphrase),'PBKDF2',false,['deriveKey']);
  const recoveryKey=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:ITERATIONS},material,{name:'AES-GCM',length:256},false,['encrypt']);
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,additionalData:enc.encode(records.format)},recoveryKey,enc.encode(JSON.stringify(records)));
  return {format:records.format,iterations:ITERATIONS,salt:base64(salt),nonce:base64(nonce),data:base64(new Uint8Array(data))};
 }
 const storage={
  get length(){return raw.length},key:i=>raw.key(i),
  getItem(k){if(!protectedKey(k))return raw.getItem(k);requireKey();const v=raw.getItem(k);return v===null?null:open(JSON.parse(v),'local:'+k);},
  setItem(k,v){if(!protectedKey(k))return raw.setItem(k,String(v));requireKey();raw.setItem(k,JSON.stringify(seal(String(v),'local:'+k)));},
  removeItem(k){if(protectedKey(k))requireKey();raw.removeItem(k);}
 };
 return {unlock,lock,seal,open,storage,exportRecovery,isUnlocked:()=>ready,isConfigured:()=>raw.getItem(META)!==null};
}

export function installPrivateCache(root){
 const vault=createPrivateCache({storage:root.localStorage,indexedDB:root.indexedDB,crypto:root.crypto});
 let pending=null;
 vault.ensureUnlocked=()=>{
  if(vault.isUnlocked())return Promise.resolve();
  if(pending)return pending;
  pending=new Promise((resolve,reject)=>{
   const doc=root.document,dialog=doc.createElement('dialog');
   dialog.setAttribute('aria-labelledby','bn-device-cache-title');
   dialog.style.cssText='max-width:460px;width:90%;box-sizing:border-box;border:1px solid #dce6ef;border-radius:16px;padding:24px;color:#102640;font:15px system-ui;line-height:1.5';
   const form=doc.createElement('form'),title=doc.createElement('h2'),info=doc.createElement('p'),label=doc.createElement('label'),input=doc.createElement('input'),confirmLabel=doc.createElement('label'),confirm=doc.createElement('input'),message=doc.createElement('p'),button=doc.createElement('button');
   const setup=!vault.isConfigured();title.id='bn-device-cache-title';title.textContent=setup?'Protect records on this device':'Unlock device records';
   info.textContent=setup?'Create a separate device passphrase (12+ characters) to encrypt offline records and pending changes. Keep it safe: it cannot be reset, and losing it prevents recovery of unsent work. Your school login stays the same.':'Enter the device passphrase to open encrypted offline records and pending changes. It is separate from your school login.';
   label.textContent='Device passphrase';input.type='password';input.minLength=12;input.required=true;input.autocomplete=setup?'new-password':'current-password';
   confirmLabel.textContent='Confirm device passphrase';confirm.type='password';confirm.minLength=12;confirm.required=setup;confirm.autocomplete='new-password';confirmLabel.hidden=!setup;
   for(const field of [input,confirm])field.style.cssText='display:block;width:100%;box-sizing:border-box;padding:12px;margin:6px 0 16px;border:1px solid #ccd6e2;border-radius:8px';
   button.textContent=setup?'Encrypt and continue':'Unlock';button.type='submit';
   const backup=doc.createElement('button');backup.type='button';backup.textContent='Download encrypted recovery';
   button.style.cssText=backup.style.cssText='min-height:44px;padding:10px 14px;border-radius:9px;font:inherit;font-weight:650;cursor:pointer';
   button.style.cssText+=';background:#0b6bac;color:#fff;border:1px solid #0b6bac';
   backup.style.cssText+=';background:#eef5fc;color:#0b315e;border:1px solid #c6dcec';
   const actions=doc.createElement('div');actions.style.cssText='display:flex;flex-wrap:wrap;gap:10px';
   actions.append(button,backup);
   message.style.cssText='margin:0 0 14px;overflow-wrap:anywhere';
   message.setAttribute('role','status');label.append(input);confirmLabel.append(confirm);form.append(title,info,label,confirmLabel,message,actions);dialog.append(form);doc.body.append(dialog);
   function setBusy(busy){
    button.disabled=busy;backup.disabled=busy;input.readOnly=busy;confirm.readOnly=busy;
    button.style.opacity=backup.style.opacity=busy?'.65':'1';
    actions.setAttribute('aria-busy',String(busy));
   }
   backup.addEventListener('click',async()=>{
    if(button.disabled||backup.disabled)return;
    if(setup&&input.value!==confirm.value){message.textContent='Passphrases do not match.';return;}
    setBusy(true);message.textContent='Preparing encrypted recovery…';
    try{const recovery=await vault.exportRecovery(input.value);const url=root.URL.createObjectURL(new root.Blob([JSON.stringify(recovery)],{type:'application/json'}));
     const link=doc.createElement('a');link.href=url;link.download='school-device-recovery.encrypted.json';link.hidden=true;dialog.append(link);
     try{link.click();}finally{link.remove();root.setTimeout(()=>root.URL.revokeObjectURL(url),60000);}
     message.textContent='Encrypted recovery download started. Keep this passphrase and any earlier device passphrase. No records were removed. Recovery instructions: DEVICE_CACHE_RECOVERY.md.';
    }catch(error){message.textContent='Recovery export failed: '+error.message;}
    finally{setBusy(false);}
   });
   dialog.addEventListener('cancel',event=>event.preventDefault());
   form.addEventListener('submit',async event=>{
    event.preventDefault();if(button.disabled)return;
    if(setup&&input.value!==confirm.value){message.textContent='Passphrases do not match.';return;}
    setBusy(true);message.textContent='Unlocking and verifying device records…';
    try{await vault.unlock(input.value);input.value='';confirm.value='';dialog.close();dialog.remove();resolve();}
    catch(error){message.textContent='Unable to unlock: '+error.message+'. Records were retained. If storage is full, download encrypted recovery before freeing space.';setBusy(false);}
   });
   dialog.showModal();input.focus();
  }).finally(()=>{pending=null;});
  return pending;
 };
 root.BNPrivateCache=vault;
 root.addEventListener('pagehide',()=>vault.lock());
 root.addEventListener('pageshow',event=>{if(event.persisted)root.location.reload();});
 return vault;
}
if(typeof window!=='undefined'&&window.document)installPrivateCache(window);
