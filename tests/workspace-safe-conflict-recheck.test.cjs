'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../school-workspace-controller.js');
const snapshot=(n=1)=>({institution:{institution:{id:'local',name:'School'}},students:[{id:n}],operations:{teachers:[]}});
function fixture(){
 const values=new Map(),backups=[],pushes=[];
 const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 let current=snapshot(),cloud={revision:5,snapshot:snapshot()},fail=false;
 const client={connect:async()=>[{id:'school'}],pull:async()=>cloud,readback:async()=>cloud,
  push:async(id,rev,s)=>{
   if(fail)throw Error('Network temporarily unavailable');
   pushes.push(s);cloud={revision:rev+1,snapshot:s};return cloud;
  }};
 const opts={storage,client,getSnapshot:()=>current,applySnapshot:async s=>{current=s;},
  buildProjection:s=>s.students,backup:async s=>{backups.push(structuredClone(s));}};
 return {opts,values,backups,pushes,client,get current(){return current},set current(v){current=v},
  get cloud(){return cloud},set cloud(v){cloud=v},set fail(v){fail=v},
  make:()=>create(opts),recordKey:()=>[...values.keys()].find(k=>k.startsWith('bn.workspace.v1.school.'))};
}
async function verifiedOwner(callback,owner=true){
 const previous=global.window;
 global.window={location:{search:'?openSchool=true&tab=Teachers'},
  sessionStorage:{getItem:key=>key==='bright-nexa-school-os:session:v2'
   ?JSON.stringify({cloudVerified:true,role:owner?'OWNER':'TEACHER',institutionId:'school'})
   :key==='bn_school_staff_session_v1'?JSON.stringify({access_token:'fixture-owner-jwt'}):null},
  BNWorkspaceOnlineGuard:{update(){},setRetry(){},setRecover(){}}};
 try{return await callback();}finally{if(previous===undefined)delete global.window;else global.window=previous;}
}
test('clean stale checksum from another tab reconciles with raw Supabase data without changing school records',async()=>{
 await verifiedOwner(async()=>{
  const f=fixture(),c=f.make();
  await c.openSchool('school');
  const key=f.recordKey(),stale=JSON.parse(f.values.get(key));
  f.values.set(key,JSON.stringify({...stale,fingerprint:'v2:old-browser-checksum'}));
  assert.equal((await c.sync()).status,'synced');
  assert.equal(c.state().revision,5);
  assert.equal(f.current.students[0].id,1);
  assert.equal(f.pushes.length,0);
  assert.equal(f.backups.length,1,'only the initial open backup is needed for identical cloud data');
 });
});
test('clean older tab updates from newer cloud after saving a verified device backup',async()=>{
 await verifiedOwner(async()=>{
  const f=fixture(),c=f.make();
  await c.openSchool('school');
  const backupCount=f.backups.length;
  const key=f.recordKey(),prior=JSON.parse(f.values.get(key));
  f.cloud={revision:6,snapshot:snapshot(9)};
  f.values.set(key,JSON.stringify({...prior,revision:6,fingerprint:'v2:other-tab-committed'}));
  assert.equal((await c.sync()).status,'synced');
  assert.equal(c.state().revision,6);
  assert.equal(f.current.students[0].id,9);
  assert.ok(f.backups.length>backupCount);
  assert.equal(f.backups.at(-1).students[0].id,1);
  assert.equal(f.pushes.length,0);
 });
});
test('actual unsaved edits in a stale tab never upload, overwrite, or clear pending data during safe recheck',async()=>{
 await verifiedOwner(async()=>{
  const f=fixture(),c=f.make();
  await c.openSchool('school');
  f.fail=true;
  f.current=snapshot(22);
  await c.autosave(f.current);
  const pendingValue=f.values.get(f.recordKey());
  assert.match(pendingValue,/"pending":/);
  const key=f.recordKey();
  f.values.set(key,JSON.stringify({revision:6,fingerprint:'v2:other-tab'}));
  f.cloud={revision:6,snapshot:snapshot(30)};
  await c.autosave(f.current);
  assert.equal(c.state().status,'conflict');
  await c.sync();
  assert.equal(c.state().status,'conflict');
  assert.equal(f.current.students[0].id,22);
  assert.equal(f.pushes.length,0);
  assert.ok(pendingValue.includes('"id":22'));
 });
});
test('teacher or unverified sessions cannot auto-replace stale local tab data',async()=>{
 await verifiedOwner(async()=>{
  const f=fixture(),c=f.make();
  await c.openSchool('school');
  const key=f.recordKey(),prior=f.values.get(key);
  f.values.set(key,JSON.stringify({...JSON.parse(prior),fingerprint:'v2:stale'}));
  // Switch role to non-owner before attempting a recheck.
  global.window.sessionStorage.getItem=k=>k==='bright-nexa-school-os:session:v2'
   ? JSON.stringify({cloudVerified:true,role:'TEACHER',institutionId:'school'})
   :JSON.stringify({access_token:'test'});
  assert.equal((await c.sync()).status,'conflict');
  assert.equal(f.current.students[0].id,1);
  assert.equal(f.values.get(key),JSON.stringify({...JSON.parse(prior),fingerprint:'v2:stale'}));
 });
});
test('conflict UI offers a safe recheck instead of a permanently disabled retry',()=>{
 const fs=require('node:fs'),p=require('node:path');
 const src=fs.readFileSync(p.join(__dirname,'../school-online-guard.js'),'utf8');
 assert.match(src,/Recheck cloud safely/);
 assert.doesNotMatch(src,/Retry unavailable \(conflict\)/);
 assert.match(src,/retry.disabled=current==='conflict'&&!retryHandler/);
});
