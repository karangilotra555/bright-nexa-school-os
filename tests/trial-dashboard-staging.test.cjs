'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const erp=require('../school-erp-entry.js');
const lead=require('../leadership-app.js');
const controller=require('../school-workspace-controller.js');
test('trial dashboard status uses server time and same countdown on both owner portals',()=>{
 for(const portal of [erp,lead]){
  const status={status:'trial',server_time:'2026-11-25T00:00:00Z',ends_at:'2026-12-25T00:00:00Z'};
  assert.match(portal.trialStatusText(status),/30 days remaining/);
  assert.match(portal.trialStatusText({...status,server_time:'2026-12-18T00:00:00Z'}),/Renewal reminder.*7-day/);
  assert.match(portal.trialStatusText({...status,server_time:'2026-12-22T00:00:00Z'}),/Renewal reminder.*3-day/);
  assert.match(portal.trialStatusText({...status,server_time:'2026-12-24T00:00:00Z'}),/Renewal reminder.*final day/);
  assert.match(portal.trialStatusText({...status,server_time:status.ends_at}),/read-only/);
  assert.match(portal.trialStatusText({status:'unassigned'}),/not assigned/);
  assert.match(portal.trialStatusText({status:'trial'}),/unavailable/);
 }
});

test('expired school 403 preserves local unsynced edits and resumes cleanly once renewed',async()=>{
 const data=new Map();
 const store={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};
 let current={institution:{institution:{id:'local',name:'School'}},students:[{id:1}],operations:{}};
 let remote={revision:1,snapshot:current},expired=false;
 const errors=[],pushes=[],unwantedRetries=[];
 const client={
  connect:async()=>[{id:'school',name:'School'}],
  pull:async()=>remote,
  push:async(_id,rev,snap)=>{
   if(expired){const e=Error('Subscription expired: school is read-only. Contact Bright Nexa.');e.status=403;throw e;}
   pushes.push(snap);return remote={revision:rev+1,snapshot:snap};
  }
 };
 const c=controller.create({client,storage:store,getSnapshot:()=>current,applySnapshot:async s=>{current=s},buildProjection:s=>s.students,onError:e=>errors.push(e.message),scheduleRetry:fn=>{unwantedRetries.push(fn);return fn;}});
 await c.openSchool('school');
 expired=true;
 current={institution:{institution:{id:'local',name:'School'}},students:[{id:1},{id:2}],operations:{}};
 const result=await c.autosave(current);
 assert.equal(c.state().status,'pending');
 assert.equal(c.state().pending,true);
 assert.equal(unwantedRetries.length,0,'403 expiry must stop automatic retries');
 assert.match(result.error.message,/read-only/i);
 assert.ok(errors.some(msg=>/read-only/i.test(msg)));
 assert.equal(pushes.length,0);
 assert.ok([...data.values()].some(v=>v.includes('"students":[{"id":1},{"id":2}]')),'Unsaved draft must remain preserved');
 expired=false;
 await c.sync();
 assert.equal(c.state().status,'synced');
 assert.equal(pushes.at(-1).students.length,2);
});

test('staff portal shows trial/read-only status banner support and ERP entry marks expired state clearly',()=>{
 const fs=require('node:fs');
 const teacherJs=fs.readFileSync('teacher-access.js','utf8');
 const erpJs=fs.readFileSync('school-erp-entry.js','utf8');
 assert.match(teacherJs,/bn_school_trial_status/);
 assert.match(teacherJs,/bn_school_writable/);
 assert.match(erpJs,/data-trial-state/);
});
