'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {IDBFactory}=require('fake-indexeddb');
const KEY='bright-nexa-school-os:students:v1',PASSWORD='test device phrase 8249';
function storage(){const data=new Map();return {data,get length(){return data.size},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};}
async function fixture(){
 const mod=await import('../src/security/private-cache.mjs').catch(()=>({}));
 assert.equal(typeof mod.createPrivateCache,'function','Encrypted device cache must be available');
 const raw=storage(),indexedDB=new IDBFactory();
 return {raw,indexedDB,make:()=>mod.createPrivateCache({storage:raw,indexedDB,crypto:globalThis.crypto})};
}
async function dbRequest(indexedDB,name,store,write){
 const db=await new Promise((resolve,reject)=>{const req=indexedDB.open(name,1);req.onupgradeneeded=()=>req.result.createObjectStore(store);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction(store,write?'readwrite':'readonly');let result;const req=write?tx.objectStore(store).put(write,'students'):tx.objectStore(store).get('students');req.onsuccess=()=>result=req.result;tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(tx.error);});}finally{db.close();}
}
test('device cache encrypts school records and requires the passphrase after lock/reload',async()=>{
 const f=await fixture(),vault=f.make();await vault.unlock(PASSWORD);
 vault.storage.setItem(KEY,JSON.stringify([{name:'PRIVATE CHILD',dob:'2014-03-12'}]));
 assert.ok(!JSON.stringify([...f.raw.data]).includes('PRIVATE CHILD'));
 assert.ok(!JSON.stringify([...f.raw.data]).includes(PASSWORD));
 assert.equal(JSON.parse(vault.storage.getItem(KEY))[0].name,'PRIVATE CHILD');
 vault.lock();assert.throws(()=>vault.storage.getItem(KEY),/locked/i);
 const reopened=f.make();await assert.rejects(reopened.unlock('wrong password 1234'));
 await reopened.unlock(PASSWORD);assert.equal(JSON.parse(reopened.storage.getItem(KEY))[0].name,'PRIVATE CHILD');
});
test('migrates legacy local records, IndexedDB and pending backups without losing data',async()=>{
 const f=await fixture();const legacy=JSON.stringify([{name:'LEGACY CHILD'}]);f.raw.setItem(KEY,legacy);
 f.raw.setItem('bn.workspace.v1.school.school.cloud',JSON.stringify({revision:4,pending:{students:[{name:'PENDING CHILD'}]}}));
 await dbRequest(f.indexedDB,'bright-nexa-school-os','records',[{name:'LEGACY CHILD'}]);
 await dbRequest(f.indexedDB,'bn-workspace-recovery-v1','backups',JSON.stringify({name:'PENDING CHILD'}));
 const vault=f.make();await vault.unlock(PASSWORD);
 assert.equal(vault.storage.getItem(KEY),legacy);
 const encrypted=await dbRequest(f.indexedDB,'bright-nexa-school-os','records');
 assert.ok(!JSON.stringify(encrypted).includes('LEGACY CHILD'));
 assert.deepEqual(vault.open(encrypted,'records:students'),[{name:'LEGACY CHILD'}]);
 const backup=await dbRequest(f.indexedDB,'bn-workspace-recovery-v1','backups');
 assert.ok(!JSON.stringify(backup).includes('PENDING CHILD'));
 assert.equal(vault.open(backup,'backups:students'),JSON.stringify({name:'PENDING CHILD'}));
 assert.ok(!JSON.stringify([...f.raw.data]).includes('CHILD'));
});
test('tampering and moving ciphertext to another record fail closed',async()=>{
 const f=await fixture(),v=f.make();await v.unlock(PASSWORD);
 const one=v.seal({name:'Private'},'records:students'),two=v.seal({name:'Private'},'records:students');
 assert.notDeepEqual(one,two,'Every encryption needs a fresh nonce');
 assert.throws(()=>v.open(one,'records:accounts'));
 one.data=one.data.slice(0,-4)+'AAAA';assert.throws(()=>v.open(one,'records:students'));
});
test('failed migration retains legacy records and can resume with the same passphrase',async()=>{
 const f=await fixture();f.raw.setItem(KEY,'private original');const set=f.raw.setItem;
 f.raw.setItem=(k,v)=>{if(k===KEY)throw Error('QuotaExceededError');set(k,v);};
 await assert.rejects(f.make().unlock(PASSWORD),/Quota/);assert.equal(f.raw.getItem(KEY),'private original');
 f.raw.setItem=set;const v=f.make();await v.unlock(PASSWORD);assert.equal(v.storage.getItem(KEY),'private original');
});
test('two unlocked tabs observe each other without exposing school values in native storage',async()=>{
 const f=await fixture(),a=f.make(),b=f.make();await a.unlock(PASSWORD);await b.unlock(PASSWORD);
 a.storage.setItem(KEY,'first');assert.equal(b.storage.getItem(KEY),'first');
 b.storage.setItem(KEY,'second');assert.equal(a.storage.getItem(KEY),'second');
});

test('actual ERP IndexedDB helpers write encrypted records and read them back',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),f=await fixture(),v=f.make();await v.unlock(PASSWORD);
 const source=fs.readFileSync('app-extracted/src/BrightNexaApp.jsx','utf8');
 const start=source.indexOf('var wt = `bright-nexa-school-os`');
 const code=source.slice(start,source.indexOf('var jt =',start));
 const sandbox={window:{BNPrivateCache:v},indexedDB:f.indexedDB,structuredClone};vm.createContext(sandbox);vm.runInContext(code,sandbox);
 await sandbox.Ot('students',[{name:'PRIVATE ERP CHILD'}]);
 const saved=await dbRequest(f.indexedDB,'bright-nexa-school-os','records');assert.equal(saved.bnEncrypted,1);assert.ok(!JSON.stringify(saved).includes('PRIVATE ERP CHILD'));
 assert.equal((await sandbox.kt('students'))[0].name,'PRIVATE ERP CHILD');
 v.lock();await assert.rejects(sandbox.kt('students'),/locked/i);
});

test('unlock dialog verifies passphrase confirmation and removes secrets after successful setup',async()=>{
 const {JSDOM}=require('jsdom'),{installPrivateCache}=await import('../src/security/private-cache.mjs');
 const dom=new JSDOM('<body></body>',{url:'https://fixture.test'}),w=dom.window;
 Object.defineProperty(w,'crypto',{value:globalThis.crypto});w.indexedDB=new IDBFactory();
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
 const vault=installPrivateCache(w),unlock=vault.ensureUnlocked(),form=w.document.querySelector('form'),fields=form.querySelectorAll('input');
 fields[0].value=PASSWORD;fields[1].value='different password';form.dispatchEvent(new w.Event('submit',{cancelable:true}));
 assert.match(form.textContent,/do not match/);assert.equal(vault.isConfigured(),false);
 fields[1].value=PASSWORD;form.dispatchEvent(new w.Event('submit',{cancelable:true}));await unlock;
 assert.equal(w.document.querySelector('dialog'),null);assert.equal(fields[0].value,'');assert.equal(vault.isUnlocked(),true);
 w.dispatchEvent(new w.Event('pagehide'));assert.equal(vault.isUnlocked(),false);dom.window.close();
});
module.exports={fixture,dbRequest,PASSWORD};

test('real workspace controller encrypts recoverable pending edits and resumes them after reload',async()=>{
 const fs=require('node:fs'),vm=require('node:vm'),f=await fixture(),vault=f.make();await vault.unlock(PASSWORD);
 function controller(cache,current){
  const box={module:{exports:{}},window:{indexedDB:f.indexedDB,BNPrivateCache:cache,addEventListener(){},removeEventListener(){}}};
  vm.runInNewContext(fs.readFileSync('school-workspace-controller.js','utf8'),box);
  return box.module.exports.create({storage:cache.storage,getSnapshot:()=>current.value,applySnapshot:async s=>{current.value=s},buildProjection:()=>({}),
   client:{pull:async()=>({revision:1,snapshot:{institution:{institution:{id:'school',name:'PRIVATE SCHOOL'}},students:[],operations:{}}}),push:async()=>{throw Error('offline')}}});
 }
 const current={value:{institution:{institution:{id:'school',name:'PRIVATE SCHOOL'}},students:[],operations:{}}};
 const c=controller(vault,current);await c.openSchool('school');
 const set=f.raw.setItem;f.raw.setItem=(k,v)=>{if(k.startsWith('bn.workspace.v1.school.')&&v.length>2000){const e=Error('quota exceeded');e.name='QuotaExceededError';throw e;}set(k,v);};
 current.value={...current.value,students:[{name:'PRIVATE CHILD',notes:'x'.repeat(6000)}]};
 await c.autosave(current.value);assert.equal(c.state().pending,true);
 assert.ok(!JSON.stringify([...f.raw.data]).includes('PRIVATE'));
 c.dispose();vault.lock();const reopened=f.make();await reopened.unlock(PASSWORD);
 const resumed=controller(reopened,current);await resumed.initialize();assert.equal(resumed.state().pending,true);assert.notEqual(resumed.state().status,'conflict');resumed.dispose();
});


test('fixed storage quota permits encrypted recovery without deleting original pending records',async()=>{
 const f=await fixture(),original=JSON.stringify({name:'PRIVATE CHILD',pending:'x'.repeat(9000)});f.raw.setItem(KEY,original);
 const set=f.raw.setItem;f.raw.setItem=(k,v)=>{const copy=new Map(f.raw.data);copy.set(k,String(v));if([...copy].reduce((n,[k,v])=>n+k.length+v.length,0)>11000)throw Error('QuotaExceededError');set(k,v);};
 const vault=f.make();await assert.rejects(vault.unlock(PASSWORD),/Quota/);
 await assert.rejects(vault.unlock(PASSWORD),/Quota/);
 const recovery=await vault.exportRecovery(PASSWORD);assert.equal(vault.isUnlocked(),false);
 assert.ok(!JSON.stringify(recovery).includes('PRIVATE CHILD'));assert.equal(f.raw.getItem(KEY),original);
 const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(PASSWORD),'PBKDF2',false,['deriveKey']);
 const key=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt:Buffer.from(recovery.salt,'base64'),iterations:600000},material,{name:'AES-GCM',length:256},false,['decrypt']);
 const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:Buffer.from(recovery.nonce,'base64'),additionalData:new TextEncoder().encode(recovery.format)},key,Buffer.from(recovery.data,'base64'));
 assert.equal(JSON.parse(new TextDecoder().decode(data)).local[KEY],original);
});

test('logout during key derivation cannot resurrect an unlocked key',async()=>{
 const f=await fixture(),vault=f.make();const pending=vault.unlock(PASSWORD);vault.lock();
 await assert.rejects(pending,/cancelled/);assert.equal(vault.isUnlocked(),false);assert.throws(()=>vault.seal({},'test'),/locked/);
});
