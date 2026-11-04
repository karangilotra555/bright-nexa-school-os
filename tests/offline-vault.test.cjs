'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {webcrypto}=require('node:crypto');
const {Vault,scopeOf}=require('../docs/offline-vault');
const SCHOOL='11111111-1111-4111-8111-111111111111';
const USER='22222222-2222-4222-8222-222222222222';
const OTHER='33333333-3333-4333-8333-333333333333';
const SECRET='a-long-private-passphrase-for-offline';
function memory(){
 const records=new Map();
 return {records,
   get:async k=>records.get(k),
   put:async(k,v)=>{records.set(k,v);},
   remove:async k=>{records.delete(k);},
   list:async prefix=>[...records].filter(([key])=>key.startsWith(prefix)).map(([key,value])=>({key,value}))
 };
}
function vault(storage){return new Vault({storage,crypto:webcrypto});}
const data={school:{id:SCHOOL,name:'School A'},me:{institution_id:SCHOOL,id:'abc'},students:[{name:'Sensitive Child Name',id:'test'}],classes:[],staff:[],fees:[],attendance:[],notices:[],extra:[]};
test('requires verified UUID scope and a strong offline passphrase',async()=>{
 assert.throws(()=>scopeOf('school','user'),/Verified school/);
 const v=vault(memory());
 await assert.rejects(()=>v.unlock(SCHOOL,USER,'12345',true),/at least 12/);
 await assert.rejects(()=>v.unlock(SCHOOL,USER,SECRET),/No encrypted offline copy/);
});
test('encrypted school cache has no plaintext, survives unlock and rejects wrong passphrase',async()=>{
 const store=memory(),v=vault(store);
 await v.unlock(SCHOOL,USER,SECRET,true);
 await v.saveSnapshot(SCHOOL,USER,data);
 assert.doesNotMatch(JSON.stringify([...store.records]),/Sensitive Child Name|School A/);
 v.lock();
 const second=vault(store);
 await assert.rejects(()=>second.unlock(SCHOOL,USER,SECRET+'bad'),/incorrect/);
 await second.unlock(SCHOOL,USER,SECRET);
 assert.equal((await second.getSnapshot(SCHOOL,USER)).students[0].name,'Sensitive Child Name');
 await assert.rejects(()=>second.getSnapshot(SCHOOL,OTHER),/Unlock this school/);
});
test('corrupted ciphertext is rejected instead of returning unsafe data',async()=>{
 const store=memory(),v=vault(store);
 await v.unlock(SCHOOL,USER,SECRET,true);
 await v.saveSnapshot(SCHOOL,USER,data);
 const k='snapshot:'+scopeOf(SCHOOL,USER),item=store.records.get(k);
 store.records.set(k,{...item,value:item.value.slice(0,-3)+'AAA'});
 await assert.rejects(()=>v.getSnapshot(SCHOOL,USER));
});
test('failed cloud acknowledgement keeps encrypted queue; success removes only confirmed operations',async()=>{
 const store=memory(),v=vault(store);
 await v.unlock(SCHOOL,USER,SECRET,true);
 const opId=await v.queue(SCHOOL,USER,{table:'school_attendance',method:'POST',body:{institution_id:SCHOOL,student_id:OTHER,day:'2026-11-04',status:'present'}});
 assert.match(opId,/^[0-9a-f-]{36}$/);
 assert.doesNotMatch(JSON.stringify([...store.records]),/2026-11-04|present|school_attendance/);
 assert.equal((await v.pending(SCHOOL,USER)).length,1);
 await assert.rejects(()=>v.sync(SCHOOL,USER,async()=>({acknowledged:false})),/acknowledgement missing/);
 assert.equal((await v.pending(SCHOOL,USER)).length,1);
 const result=await v.sync(SCHOOL,USER,async op=>({acknowledged:op.opId===opId}));
 assert.deepEqual(result,{synced:1,pending:0});
});
test('fee operations are prohibited without a server-side idempotency contract',async()=>{
 const v=vault(memory());await v.unlock(SCHOOL,USER,SECRET,true);
 await assert.rejects(()=>v.queue(SCHOOL,USER,{table:'school_fee_entries',method:'POST',body:{institution_id:SCHOOL,amount_rupees:500}}),/Unsafe offline operation/);
 await assert.rejects(()=>v.queue(SCHOOL,USER,{table:'school_students',method:'POST',body:{institution_id:OTHER}}),/Unsafe offline operation/);
});
test('offline cache is time limited and does not grant indefinite revoked access',async()=>{
 const storage=memory(),v=vault(storage);await v.unlock(SCHOOL,USER,SECRET,true);
 await v.saveSnapshot(SCHOOL,USER,data);
 await assert.rejects(()=>v.getSnapshot(SCHOOL,USER,-1),/expired/);
});
