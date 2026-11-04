/* Bright Nexa School OS: encrypted local vault + fail-closed sync outbox.
   No plaintext student data, access tokens or passwords are written to IndexedDB.
   School/user scoping is mandatory; an acknowledgement is mandatory before dequeue.
   This module is not a replacement for a remote backup or live Auth/RLS checks. */
(function (root, factory) {
  'use strict';
  const api=factory();
  if (typeof module==='object' && module.exports) module.exports=api;
  else root.BrightNexaOffline=api;
})(typeof globalThis==='object' ? globalThis : this, function () {
  'use strict';
  const STORE='vault', DB='bright-nexa-school-offline-v1', VERSION=1;
  const enc=new TextEncoder(), dec=new TextDecoder();
  const allowed=new Set(['school_students','school_staff_profiles','school_classes','school_attendance','school_notices']);
  function scopeOf(institutionId,userId) {
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if(!uuid.test(String(institutionId)) || !uuid.test(String(userId))) throw Error('Verified school and user IDs required.');
    return String(institutionId).toLowerCase()+':'+String(userId).toLowerCase();
  }
  function indexedDBAdapter(idb) {
    if(!idb || typeof idb.open!=='function') throw Error('IndexedDB unavailable; offline save cannot be guaranteed.');
    let opening;
    function db(){return opening||(opening=new Promise((resolve,reject)=>{
      const r=idb.open(DB,VERSION);
      r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE);};
      r.onerror=()=>reject(r.error||Error('Local database failed'));
      r.onsuccess=()=>resolve(r.result);
    }));}
    async function work(mode,operation) {
      const conn=await db();
      return new Promise((resolve,reject)=>{
        const tx=conn.transaction(STORE,mode), store=tx.objectStore(STORE);
        let result;
        try { operation(store,value=>{result=value;}); } catch(e) {tx.abort();reject(e);return}
        tx.oncomplete=()=>resolve(result);
        tx.onerror=()=>reject(tx.error||Error('Local storage transaction failed'));
        tx.onabort=()=>reject(tx.error||Error('Local storage transaction aborted'));
      });
    }
    return {
      get:key=>work('readonly',(s,set)=>{const r=s.get(key);r.onsuccess=()=>set(r.result);}),
      put:(key,value)=>work('readwrite',s=>{s.put(value,key);}),
      remove:key=>work('readwrite',s=>{s.delete(key);}),
      list:prefix=>work('readonly',(s,set)=>{
        const results=[], r=s.openCursor();
        r.onsuccess=()=>{const cursor=r.result;if(!cursor){set(results);return;}if(String(cursor.key).startsWith(prefix))results.push({key:cursor.key,value:cursor.value});cursor.continue();};
      })
    };
  }
  function b64(bytes) {
    if(typeof Buffer!=='undefined')return Buffer.from(bytes).toString('base64');
    let s='';for(const byte of bytes)s+=String.fromCharCode(byte);
    return btoa(s);
  }
  function unb64(str) {
    if(typeof Buffer!=='undefined')return new Uint8Array(Buffer.from(str,'base64'));
    return Uint8Array.from(atob(str),c=>c.charCodeAt(0));
  }
  class Vault {
    constructor(options={}) {
      this.crypto=options.crypto||(typeof globalThis==='object'&&globalThis.crypto);
      this.storage=options.storage||indexedDBAdapter(typeof indexedDB!=='undefined'?indexedDB:null);
      this.key=null;this.scope=null;this.flushing=false;
      if(!this.crypto?.subtle || !this.crypto?.getRandomValues)throw Error('Secure browser cryptography required.');
    }
    async derive(secret,salt) {
      const raw=await this.crypto.subtle.importKey('raw',enc.encode(secret),'PBKDF2',false,['deriveKey']);
      return this.crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
    }
    async seal(key,scope,kind,data) {
      const iv=this.crypto.getRandomValues(new Uint8Array(12));
      const value=await this.crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(scope+'|'+kind)},key,enc.encode(JSON.stringify(data)));
      return {iv:b64(iv),value:b64(new Uint8Array(value))};
    }
    async unseal(key,scope,kind,item) {
      const value=await this.crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(item.iv),additionalData:enc.encode(scope+'|'+kind)},key,unb64(item.value));
      return JSON.parse(dec.decode(value));
    }
    async unlock(institutionId,userId,secret,create=false) {
      const scope=scopeOf(institutionId,userId);
      if(typeof secret!=='string'||secret.length<12)throw Error('Use a separate offline passphrase of at least 12 characters.');
      const storageKey='meta:'+scope;
      let meta=await this.storage.get(storageKey);
      if(!meta && !create)throw Error('No encrypted offline copy exists on this device.');
      const salt=meta?unb64(meta.salt):this.crypto.getRandomValues(new Uint8Array(16));
      const key=await this.derive(secret,salt);
      if(meta) {
        try {const check=await this.unseal(key,scope,'verify',meta.verify);if(check.scope!==scope)throw Error('Wrong school');}
        catch {throw Error('Offline passphrase incorrect or local copy damaged.');}
      } else {
        const verify=await this.seal(key,scope,'verify',{scope,version:1});
        await this.storage.put(storageKey,{salt:b64(salt),verify});
      }
      this.key=key;this.scope=scope;return true;
    }
    lock(){this.key=null;this.scope=null;}
    assert(scope){if(!this.key||this.scope!==scope)throw Error('Unlock this school’s offline copy first.');}
    async saveSnapshot(institutionId,userId,payload){
      const scope=scopeOf(institutionId,userId);this.assert(scope);
      if(!payload?.school || !payload?.me || payload.school.id!==institutionId || payload.me.institution_id!==institutionId || payload.me.auth_user_id && payload.me.auth_user_id!==userId)throw Error('Offline snapshot does not match verified school membership.');
      const value=await this.seal(this.key,scope,'snapshot',{at:Date.now(),payload});
      await this.storage.put('snapshot:'+scope,value);return true;
    }
    async getSnapshot(institutionId,userId,maxAgeMs=24*60*60*1000){
      const scope=scopeOf(institutionId,userId);this.assert(scope);
      const item=await this.storage.get('snapshot:'+scope);
      if(!item)return null;
      const out=await this.unseal(this.key,scope,'snapshot',item);
      if(!out?.at || Date.now()-out.at>maxAgeMs || out.at>Date.now()+60000)throw Error('Offline copy expired; reconnect to verify school access.');
      if(out.payload?.school?.id!==institutionId || out.payload?.me?.institution_id!==institutionId)throw Error('Offline school mismatch.');
      return out.payload;
    }
    async queue(institutionId,userId,request){
      const scope=scopeOf(institutionId,userId);this.assert(scope);
      if(!allowed.has(request?.table) || !['POST','PATCH'].includes(request?.method) || !request.body || request.body.institution_id!==institutionId)throw Error('Unsafe offline operation rejected.');
      if(request.table==='school_attendance' && (!request.body.student_id || !request.body.day))throw Error('Attendance identity required.');
      const opId=this.crypto.randomUUID();
      const entry={opId,table:request.table,method:request.method,body:request.body,filter:request.filter||'',createdAt:Date.now()};
      await this.storage.put('op:'+scope+':'+opId,await this.seal(this.key,scope,'op:'+opId,entry));
      return opId;
    }
    async pending(institutionId,userId){
      const scope=scopeOf(institutionId,userId);this.assert(scope);
      const rows=await this.storage.list('op:'+scope+':');
      const out=[];
      for(const row of rows){const id=row.key.split(':').at(-1);out.push(await this.unseal(this.key,scope,'op:'+id,row.value));}
      return out.sort((a,b)=>a.createdAt-b.createdAt||a.opId.localeCompare(b.opId));
    }
    async sync(institutionId,userId,authenticatedSend){
      const scope=scopeOf(institutionId,userId);this.assert(scope);
      if(typeof authenticatedSend!=='function')throw Error('Authenticated transport required.');
      if(this.flushing)throw Error('Sync is already running.');
      this.flushing=true;
      let done=0;
      try {
        for(const op of await this.pending(institutionId,userId)){
          // Callback MUST verify server acknowledgement and idempotency before returning acknowledged=true.
          const response=await authenticatedSend(op);
          if(response?.acknowledged!==true)throw Error('Cloud acknowledgement missing; pending records kept.');
          await this.storage.remove('op:'+scope+':'+op.opId);
          done++;
        }
        return {synced:done,pending:(await this.pending(institutionId,userId)).length};
      } finally {this.flushing=false;}
    }
  }
  return {Vault,scopeOf,indexedDBAdapter};
});
