'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {JSDOM}=require('jsdom');
const {create}=require('../school-workspace-controller.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('verified school admin sees cloud error rather than a silent successful save', async()=>{
 const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://bright-nexa-school-os.onrender.com',runScripts:'outside-only'});
 dom.window.sessionStorage.setItem('bright-nexa-school-os:session:v2',JSON.stringify({cloudVerified:true}));
 dom.window.eval(read('school-online-guard.js'));
 const guard=dom.window.BNWorkspaceOnlineGuard;
 guard.update('pending',new Error('Test network rejected update'));
 const banner=dom.window.document.getElementById('bn-cloud-publish-status');
 assert.match(banner.textContent,/Supabase save failed/);
 assert.match(banner.textContent,/Test network rejected update/);
 assert.match(banner.textContent,/NOT confirmed in Supabase/);
 let retried=0;
 guard.setRetry(async()=>{retried++;return {status:'synced',error:null};});
 banner.querySelector('button').click();
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(retried,1);
 assert.equal(banner.style.display,'none');
 dom.window.close();
});

test('unbound ERP autosave explicitly reports unsynced local changes',async()=>{
 const map=new Map(),errors=[];
 const snapshot={institution:{institution:{id:'school-local'}},students:[],operations:{}};
 const c=create({storage:{getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)},client:{},getSnapshot:()=>snapshot,onError:e=>errors.push(e.message)});
 await c.initialize();const state=await c.autosave(snapshot);
 assert.equal(state.status,'local');
 assert.match(state.error.message,/NOT been published/);
 assert.ok(errors.some(e=>e.includes('NOT been published')));
});

test('source and served copies show pending cloud acknowledgment instead of premature success',()=>{
 const src=read('app-extracted/src/BrightNexaApp.jsx');
 const bundles=['assets/index-brightnexa-v2.js','docs/assets/index-brightnexa-v2.js','app-extracted/dist/assets/index-brightnexa-v2.js'];
 assert.match(src,/awaiting Supabase confirmation/);
 assert.doesNotMatch(src,/added successfully/);
 assert.match(src,/ERP changes saved to Supabase/);
 assert.match(src,/ERP saved to Supabase/);
 for(const file of bundles){assert.match(read(file),/awaiting Supabase confirmation/);assert.doesNotMatch(read(file),/added successfully/);}
 assert.equal(read(bundles[0]),read(bundles[1]));
 assert.equal(read(bundles[0]),read(bundles[2]));
 for(const base of ['','docs/','app-extracted/dist/']){
  const index=read(base+'index.html'),sw=read(base+'sw.js');
  assert.match(index,/CACHE_VERSION = '20261109-signout-v6'/);
  const sha=file=>crypto.createHash('sha256').update(Buffer.from(read(file),'utf8')).digest('hex');
  assert.ok(sw.includes('"url":"school-online-guard.js?v=20261109-logout-ready-v3","revision":"'+sha(base+'school-online-guard.js')+'"'));
  assert.ok(sw.includes('"url":"school-workspace-controller.js?v=20261109-logout-ready-v3","revision":"'+sha(base+'school-workspace-controller.js')+'"'));
  assert.ok(sw.includes('url:"assets/index-brightnexa-v2.js",revision:"'+sha(base+'assets/index-brightnexa-v2.js')+'"'));
  assert.equal(read(base+'school-online-guard.js'),read('school-online-guard.js'));
  assert.equal(read(base+'school-workspace-controller.js'),read('school-workspace-controller.js'));
 }
});

test('browser cache write failures are not silently ignored for every ERP store',()=>{
 const source=read('app-extracted/src/BrightNexaApp.jsx');
 const bundle=read('assets/index-brightnexa-v2.js');
 for(const content of [source,bundle]){
  assert.match(content,/function bnReportBrowserSaveError\(/);
  for(const area of ['School profile','Student records','ERP operations']){
   assert.ok(content.includes("bnReportBrowserSaveError('"+area+"'"),area);
  }
  assert.match(content,/Supabase saved drafts could not be loaded/);
 }
});

test('conflict makes retry unavailable and offers explicit backup-first cloud reopen',async()=>{
 const dom=new JSDOM('<!doctype html><html><body></body></html>',{url:'https://bright-nexa-school-os.onrender.com',runScripts:'outside-only'});
 dom.window.sessionStorage.setItem('bright-nexa-school-os:session:v2',JSON.stringify({cloudVerified:true}));
 dom.window.eval(read('school-online-guard.js'));
 const guard=dom.window.BNWorkspaceOnlineGuard;
 let recovered=0,requested=0;
 dom.window.confirm=()=>{requested++;return false;};
 guard.setRecover(async()=>{recovered++;return {status:'synced',error:null};});
 guard.update('conflict',new Error('Restored local records differ'));
 const modal=dom.window.document.getElementById('bn-cloud-publish-status');
 const retry=modal.querySelector('[data-role=retry]'),recover=modal.querySelector('[data-role=recover]');
 assert.equal(retry.disabled,true,'inert retry is not presented as recovery');
 assert.equal(recover.style.display,'inline-block','explicit recovery is available');
 recover.click();await new Promise(r=>setTimeout(r,0));
 assert.equal(recovered,0,'nothing happens without the device-backup confirmation');
 dom.window.confirm=()=>{requested++;return true;};
 recover.click();await new Promise(r=>setTimeout(r,0));
 assert.equal(recovered,1);
 assert.equal(requested,2);
 assert.equal(modal.style.display,'none');
 dom.window.close();
});
