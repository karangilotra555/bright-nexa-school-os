'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {setTimeout:delay}=require('node:timers/promises');
const {JSDOM}=require('jsdom');
const {PGlite}=require('@electric-sql/pglite');
const {IDBFactory}=require('fake-indexeddb');
const {fixture}=require('./workspace-database.cjs');
const cloud=require('../school-workspace-cloud.js');
const esbuild=require('esbuild');

const source=fs.readFileSync(path.join(__dirname,'../assets/index-brightnexa-v2.js'),'utf8');
const entry=source.lastIndexOf('sa();\nCt.createRoot');
assert.ok(entry>0,'Find the normal application bootstrap');
const school='11111111-1111-4111-8111-111111111111';
const admin='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const member='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const institution={id:'fixture-school',name:'Offline counter fixture',institutionType:'School',session:'2026–27'};
const operationsKey='bright-nexa-school-os:operations:v1';
const passphrase='disposable checkout counter test passphrase';
const original={
 institution:{institution},students:[{id:'student',name:'Fixture learner',admissionNumber:'FIX-1',className:'9',section:'A',status:'Active'}],
 operations:{classes:[{id:'class',name:'9',section:'A'}],feeStructures:[
  {id:'fee',category:'Admission',className:'9',academicSession:institution.session,frequency:'One time',amount:1000}
 ],feePayments:[],transportRoutes:[]}
};
const controllerCode=fs.readFileSync(path.join(__dirname,'../school-workspace-controller.js'),'utf8');
const migrations=[
 '20261105200548_school_workspace_sync.sql',
 '20261107131000_guard_first_workspace_import.sql',
 '20261108124000_isolate_accountant_ledger_from_erp_sync.sql',
 '20261111092219_avoid_rewriting_unchanged_school_profiles_workspace_links.sql',
 '20261113035818_page5_reduce_workspace_pull_jsonb_rebuilds.sql',
 '20261115092000_teacher_assigned_exam_marks.sql',
 '20261116072358_workspace_academic_streams.sql'
];

function deviceStorage(){
 const entries=new Map();
 return {entries,get length(){return entries.size;},key:i=>[...entries.keys()][i]??null,
  getItem:k=>entries.get(k)??null,setItem:(k,v)=>entries.set(k,String(v)),removeItem:k=>entries.delete(k)};
}
async function waitFor(condition,message){
 for(let i=0;i<200;i++){
  if(await condition())return;
  await delay(10);
 }
 assert.fail(message);
}

async function database(t){
 const db=new PGlite();t.after(()=>db.close());
 await db.exec(fixture);
 await db.exec("create table school_teacher_assignments(institution_id uuid,class_id uuid,school_user_id uuid,subject text,active boolean,can_enter_marks boolean); create function school_private.teacher_can(uuid,uuid,text,text) returns boolean language sql as $$select false$$");
 // The production fee ledger pull reads published school records through the real RPC.
 for(const migration of migrations)await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations',migration),'utf8'));
 await db.query('insert into institutions values($1,$2,$3)',[school,institution.name,'active']);
 await db.query('insert into school_users values($1,$2,$3,$4,$5)',[member,school,admin,'school_admin','active']);
 await db.exec('set role authenticated');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);

 const state={online:true,loseResponse:false,commits:0,readbacks:0};
 const fetcher=async (raw,init)=>{
  if(!state.online)throw Error('Failed to fetch while disconnected');
  const url=new URL(raw);
  const endpoint=url.pathname.split('/').at(-1);
  let data;
  if(endpoint==='user')data={id:admin};
  else if(endpoint==='school_users')data=(await db.query('select institution_id,auth_user_id,role,status from school_users')).rows;
  else if(endpoint==='institutions')data=(await db.query('select id,name,status from institutions where id=$1',[school])).rows;
  else if(endpoint==='school_workspaces'){
   state.readbacks++;
   data=(await db.query('select institution_id,revision::int,snapshot from school_workspaces where institution_id=$1',[school])).rows;
  }else if(endpoint==='school_workspace_pull'){
   data=(await db.query('select school_workspace_pull($1) result',[JSON.parse(init.body).p_institution_id])).rows[0].result;
  }else if(endpoint==='school_workspace_push'){
   const {p_institution_id,p_expected_revision,p_snapshot,p_projection}=JSON.parse(init.body);
   try{
    data=(await db.query('select school_workspace_push($1,$2,$3,$4) result',[p_institution_id,p_expected_revision,p_snapshot,p_projection])).rows[0].result;
    state.commits++;
   }catch(error){
    return {ok:false,status:error.code==='40001'?409:400,json:async()=>({message:error.message})};
   }
   if(state.loseResponse){state.loseResponse=false;throw Error('Failed to fetch after database commit');}
  }else assert.fail('Unexpected fixture HTTP route '+url.pathname);
  return {ok:true,status:200,json:async()=>data};
 };
 const makeClient=()=>cloud.create({fetcher,sessionStorage:{getItem:()=>JSON.stringify({access_token:'fixture-session',expires_at:9999999999})}});
 const ledger=async()=> (await db.query("select kind,amount_rupees::float as amount from school_fee_entries where institution_id=$1 order by kind,amount_rupees",[school])).rows;
 return {state,makeClient,ledger};
}

let mountCode;
async function mount(t,{cache,client,indexedDB,start}){
 const dom=new JSDOM('<div id="root"></div>',{url:'https://counter.test/',runScripts:'outside-only',pretendToBeVisual:true});
 const {window}=dom;
 window.BNPrivateCache=cache;
 window.indexedDB=indexedDB;
 window.structuredClone=structuredClone;
 window.eval(controllerCode);
 mountCode??=esbuild.transformSync(source.slice(0,entry)+`
  window.counterFixture={
   obligations:Xn,readRecord:kt,loadRecords:kn,loadOperations:Mi,
   normalize(snapshot){return {institution:xn(snapshot.institution),students:snapshot.students.map(Sn),operations:Ni(snapshot.operations)};},
   store(snapshot){return Promise.all([Ot('snapshot',snapshot.institution),Ot('students',snapshot.students),Ot('operations',snapshot.operations)]);},
   mount(initial,onSave){
    function Counter(){
     const [snapshot,setSnapshot]=w.useState(initial);
     return w.createElement(_Component93,{data:snapshot.operations,students:snapshot.students,
      institution:snapshot.institution.institution,onUpdate(operations,action,entity,detail){
       const next={...snapshot,operations:z(operations,action,entity,detail)};ji(next.operations);onSave(next);setSnapshot(next);
      }});
    }
    Ct.createRoot(document.getElementById('root')).render(w.createElement(Counter));
   }
  };`,{loader:'jsx',format:'iife',jsxFactory:'w.createElement',jsxFragment:'w.Fragment',define:{'import.meta.url':'document.baseURI'}}).code;
 window.eval(mountCode);
 let snapshot=start,pending=Promise.resolve(),printed=[];
 const controller=window.BNWorkspaceController.create({
  storage:cache.storage,client,retryDelays:[],getSnapshot:()=>snapshot,
  applySnapshot:async next=>{snapshot=window.counterFixture.normalize(next);await window.counterFixture.store(snapshot);},buildProjection:next=>cloud.buildProjection(next,window.counterFixture.obligations)
 });
 window.print=()=>printed.push(window.document.querySelector('.fee-receipt')?.textContent||'');
 let closed=false;
 const close=()=>{if(closed)return;closed=true;controller.dispose();window.close();};
 t.after(close);
 const button=label=>[...window.document.querySelectorAll('button')].find(b=>b.textContent.trim()===label);
 const click=async label=>{await waitFor(()=>button(label),'Missing button '+label);button(label).click();};
 return {window,controller,printed,close,click,obligations:window.counterFixture.obligations,
  get snapshot(){return snapshot;},
  restore:async()=>{
   const [records,operations]=await Promise.all([window.counterFixture.loadRecords(),window.counterFixture.loadOperations()]);
   snapshot={institution:records.snapshot,students:records.students,operations};
  },
  render(){window.counterFixture.mount(snapshot,next=>{snapshot=next;pending=controller.autosave(next);});},
  saved:()=>pending,
  waitForDisk:()=>waitFor(async()=> (await window.counterFixture.readRecord('operations'))?.feePayments?.length===1,'Payment never reached encrypted device storage')
 };
}

async function collectOffline(t){
 const {createPrivateCache}=await import('../src/security/private-cache.mjs');
 const raw=deviceStorage(),indexedDB=new IDBFactory();
 const vault=()=>createPrivateCache({storage:raw,indexedDB,crypto:globalThis.crypto});
 const initialVault=vault();await initialVault.unlock(passphrase);
 const db=await database(t);
 const client=db.makeClient();
 const first=await mount(t,{cache:initialVault,client,indexedDB,start:structuredClone(original)});
 await client.push(school,0,original,cloud.buildProjection(original,first.obligations));
 assert.deepEqual(await db.ledger(),[{kind:'charge',amount:1000}]);
 await first.controller.openSchool(school);
 first.render();
 db.state.online=false;
 await first.click('Pay Now');
 await first.click('Save Payment & Create Receipt');
 await first.click('Print Receipt');
 await first.waitForDisk();
 await first.saved();
 const [payment]=first.snapshot.operations.feePayments;
 assert.ok(payment?.id&&payment?.receiptNumber);
 assert.match(first.printed[0],/Fixture learner/);
 assert.ok(first.printed[0].includes(payment.receiptNumber));
 assert.equal(first.controller.state().status,'pending');
 assert.equal(first.controller.state().pending,true);
 assert.equal(db.state.commits,1);
 assert.deepEqual(await db.ledger(),[{kind:'charge',amount:1000}]);
 assert.doesNotMatch(raw.getItem(operationsKey),/Fixture learner|BAI\//);
 assert.equal(first.snapshot.operations.audit[0].entity,'Fee payment');
 return {first,db,initialVault,vault,indexedDB,payment};
}

test('ERP offline fee receipt survives reload and sync reports conflict when the persisted snapshot differs',async t=>{
 const {first,db,initialVault,vault,indexedDB,payment}=await collectOffline(t);
 first.close();initialVault.lock();
 const restartedVault=vault();await restartedVault.unlock(passphrase);
 const restarted=await mount(t,{cache:restartedVault,client:db.makeClient(),indexedDB,start:structuredClone(original)});
 await restarted.restore();
 await restarted.controller.initialize();
 assert.equal(restarted.controller.state().pending,true);
 assert.deepEqual(restarted.snapshot.operations.feePayments.map(p=>[p.id,p.receiptNumber]),[[payment.id,payment.receiptNumber]]);
 assert.equal(payment.note,'');
 assert.equal(restarted.snapshot.operations.feePayments[0].note,undefined);
 restarted.render();
 await restarted.click('Paid • View Receipt');
 await restarted.click('Print Receipt');
 assert.ok(restarted.printed[0].includes(payment.receiptNumber));

 db.state.online=true;
 await restarted.controller.sync();
 assert.equal(restarted.controller.state().status,'conflict');
 assert.match(restarted.controller.state().error.message,/Saved browser records differ/);
 assert.equal(restarted.controller.state().pending,true);
 assert.equal(db.state.commits,1,'Reconnect must not overwrite a mismatched snapshot');
 assert.deepEqual(await db.ledger(),[{kind:'charge',amount:1000}]);
});

test('ERP offline fee sync confirms a committed payment after losing the response without duplicating the ledger row',async t=>{
 const {first,db,payment}=await collectOffline(t);
 db.state.loseResponse=true;db.state.online=true;
 await first.controller.sync();
 assert.equal(first.controller.state().status,'synced',first.controller.state().error?.message);
 assert.equal(first.controller.state().pending,false);
 assert.equal(db.state.readbacks,1);
 assert.equal(db.state.commits,2,'Only initial workspace and one payment commit');
 const ledger=[{kind:'charge',amount:1000},{kind:'payment',amount:1000}];
 assert.deepEqual(await db.ledger(),ledger);
 const otherDevice=await db.makeClient().pull(school);
 assert.deepEqual(otherDevice.snapshot.operations.feePayments.map(p=>[p.id,p.receiptNumber]),[[payment.id,payment.receiptNumber]]);
 const replay=await first.controller.autosave(first.snapshot);
 assert.equal(replay.status,'synced');
 assert.equal(db.state.commits,3,'The replay reached PostgreSQL');
 assert.deepEqual(await db.ledger(),ledger,'Replay must not append a second payment row');
});
