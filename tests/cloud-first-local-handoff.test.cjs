'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const bridge=require('../school-local-handoff.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const localProfile={institution:{id:'local-1',name:'Hps',email:'yrskaran@gmail.com',
  city:'Haridwar',address:'Local school draft',contactNumber:'1234567890',session:'2026-2027'},services:[]};
function localStorageMock(map){
 return {getItem:k=>Object.hasOwn(map,k)?map[k]:null};
}
test('hosted ERP shows clean sign-in without auto-opening a local-only school, retaining its records',async()=>{
 const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
   {url:'https://bright-nexa-school-os.onrender.com/',runScripts:'outside-only'});
 const json=JSON.stringify(localProfile);
 dom.window.localStorage.setItem('bright-nexa-school-os:snapshot:v1',json);
 dom.window.eval(read('school-erp-entry.js'));
 await Promise.resolve();
 const body=dom.window.document.getElementById('root');
 assert.match(body.textContent,/Sign in to access your Bright Nexa school/i);
 assert.doesNotMatch(body.textContent,/No school record has been confirmed in Supabase/i);
 assert.ok(body.querySelector('a[href="./teacher-access.html"]'));
 assert.ok(body.querySelector('a[href*="teacher-access.html?fromLocal=1"]'));
 assert.equal(dom.window.localStorage.getItem('bright-nexa-school-os:snapshot:v1'),json);
 assert.equal(dom.window.document.querySelector('script[type="module"]'),null);
 dom.window.close();
});
test('local Hps draft is eligible for verified full profile migration',()=>{
 const storage=localStorageMock({
  [bridge.KEYS.institution]:JSON.stringify(localProfile),
  [bridge.KEYS.students]:'[]',
  [bridge.KEYS.operations]:JSON.stringify({classes:[],teachers:[],attendance:[],homework:[],notices:[],feeStructures:[],feePayments:[]})
 });
 const draft=bridge.read(storage);
 assert.equal(draft.name,'Hps');
 assert.equal(draft.email,'yrskaran@gmail.com');
 const id='11111111-1111-4111-8111-111111111111';
 const initial={school:{id,name:'Hps'},snapshot:{institution:{institution:{id,name:'Hps',city:''},services:[]},
   students:[],operations:{classes:[],teachers:[],attendance:[],homework:[],notices:[]}}};
 let calls=0;
 const prepared=bridge.prepare(draft,initial,snapshot=>{calls++;assert.equal(snapshot.institution.institution.id,id);
   return {classes:[],students:[],attendance:[],homework:[],notices:[],fees:[]};});
 assert.equal(calls,1);
 assert.equal(prepared.snapshot.institution.institution.address,'Local school draft');
 assert.equal(prepared.snapshot.institution.institution.city,'Haridwar');
 assert.equal(prepared.snapshot.institution.institution.name,'Hps');
 assert.deepEqual(prepared.snapshot.students,[]);
 assert.deepEqual(prepared.projection.classes,[]);
});
test('financial records never silently disappear during cloud onboarding',()=>{
 const draft=bridge.read(localStorageMock({
  [bridge.KEYS.institution]:JSON.stringify(localProfile),
  [bridge.KEYS.students]:'[]',
  [bridge.KEYS.operations]:JSON.stringify({classes:[],feeStructures:[{id:'f1'}],feePayments:[]})
 }));
 const id='11111111-1111-4111-8111-111111111111';
 const initial={school:{id,name:'Hps'},snapshot:{institution:{institution:{name:'Hps'}},students:[],operations:{}}};
 assert.throws(()=>bridge.prepare(draft,initial,()=>({})),/financial records/i);
});
test('root/docs/desktop scripts and cloud owner signup are in sync',()=>{
 assert.equal(read('school-erp-entry.js'),read('docs/school-erp-entry.js'));
 assert.equal(read('school-erp-entry.js'),read('app-extracted/dist/school-erp-entry.js'));
 assert.equal(read('school-local-handoff.js'),read('docs/school-local-handoff.js'));
 assert.equal(read('teacher-access.js'),read('docs/teacher-access.js'));
 assert.equal(read('teacher-access.html'),read('docs/teacher-access.html'));
 const portal=read('teacher-access.js');
 assert.match(portal,/register_first_school/);
 assert.match(portal,/school_workspace_push/);
 assert.match(portal,/school_workspace_pull/);
 assert.match(portal,/bn_school_import_pending_clear_v1/);
 assert.match(portal,/localSchoolImportConsent/);
 assert.match(read('school-erp-entry.js'),/clearImportedDeviceDraft/);
});
