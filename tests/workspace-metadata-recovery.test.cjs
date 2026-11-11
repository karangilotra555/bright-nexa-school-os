'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../school-workspace-controller.js');
const snap=id=>({institution:{institution:{id:'school'}},students:[{id}]});
function fixture(){
 const map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 let current=snap(1);const remote={revision:33,snapshot:snap(1)};
 const opts={storage,getSnapshot:()=>current,applySnapshot:async s=>{current=s},
  client:{pull:async()=>remote,readback:async()=>remote,push:async()=>{throw Error('Must not upload pending data')}},
  backup:async s=>{map.set('backup-'+map.size,JSON.stringify(s))}};
 return {map,storage,opts,remote,get current(){return current},set current(s){current=s}};
}
function login(){
 const previous=global.window;
 global.window={location:{search:'?openSchool=true'},sessionStorage:{getItem:k=>
   k==='bright-nexa-school-os:session:v2'?JSON.stringify({cloudVerified:true,role:'OWNER',institutionId:'school'}):
   k==='bn_school_staff_session_v1'?JSON.stringify({access_token:'fixture'}):null}};
 return ()=>{if(previous===undefined)delete global.window;else global.window=previous;};
}
test('verified owner repairs stale metadata only after exact raw cloud readback',async()=>{
 const f=fixture();await create(f.opts).openSchool('school');
 const key=[...f.map.keys()].find(k=>k.startsWith('bn.workspace.v1.school.'));
 const old=JSON.parse(f.map.get(key));f.map.set(key,JSON.stringify({...old,fingerprint:'v2:stale'}));
 const restore=login();
 try{
  const ctl=create(f.opts);await ctl.initialize();
  assert.equal(ctl.state().status,'synced');assert.equal(ctl.state().revision,33);
  assert.equal(f.current.students[0].id,1);
 }finally{restore();}
});
test('different local data is backed up before cloud copy is reopened',async()=>{
 const f=fixture();await create(f.opts).openSchool('school');
 f.current=snap(99);
 const restore=login();
 try{
  const ctl=create(f.opts);await ctl.initialize();
  assert.equal(ctl.state().status,'synced');
  assert.equal(f.current.students[0].id,1);
  assert.ok([...f.map.entries()].some(([k,v])=>k.startsWith('backup-')&&JSON.parse(v).students[0].id===99));
 }finally{restore();}
});
