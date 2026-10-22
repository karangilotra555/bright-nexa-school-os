'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const standalone=['parent-app-download.html','teacher-access.html','smart-tools.html'];

function routeFromWorker(script){
 let route=null,precached=null;
 const workbox={
  precacheAndRoute(entries){precached=entries},
  cleanupOutdatedCaches(){},
  registerRoute(r){route=r},
  createHandlerBoundToURL(url){return {url}},
  NavigationRoute:class NavigationRoute{
   constructor(handler,options){this.handler=handler;this.options=options;}
  }
 };
 const self={define:true,skipWaiting(){},clients:{claim(){return Promise.resolve()}},addEventListener(){}};
 vm.runInNewContext(script,{self,define:(_,callback)=>callback(workbox),URL});
 return {route,precached};
}

test('Workbox SPA fallback excludes all three independent HTML pages',()=>{
 assert.equal(read('sw.js'),read('docs/sw.js'));
 const {route,precached}=routeFromWorker(read('docs/sw.js'));
 assert.ok(route&&precached?.length,'Workbox route and precache must initialize');
 assert.equal(route.handler.url,'index.html');
 assert.ok(precached.some(e=>e.url==='index.html'&&e.revision==='20261022-workspace-isolation'));
 for(const file of ['assets/workspace-storage.js','assets/workspace-storage-classic.js','portal.js','school-profile.json']){
  assert.ok(precached.some(e=>e.url===file&&e.revision),'Missing versioned dependency '+file);
 }
 const excluded=route.options.denylist;
 for(const p of standalone)assert.ok(excluded.some(x=>x.test('/'+p)),'SPA fallback would intercept '+p);
 for(const p of ['student-portal.html','id-card-a4.html','marksheet-a4.html']){
  assert.ok(excluded.some(x=>x.test('/'+p)),'Existing exception lost for '+p);
 }
 assert.ok(!excluded.some(x=>x.test('/dashboard')),'Main app route must still be served by SPA');
});

test('Index HTML invalidates old cached shortcuts and includes new script version',()=>{
 for(const p of ['index.html','docs/index.html']){
  const html=read(p);
  assert.match(html,/CACHE_VERSION = '20261022-workspace-v8'/);
  assert.match(html,/parents-download-menu\.js\?v=20261022-pwa-standalone-v7/);
  for(const route of ['parent-app-download','teacher-access','smart-tools']){
    assert.ok(html.includes("window.location.pathname.includes('"+route+"')"),route);
  }
 }
});

test('Current click handler unregisters old controlling Workbox SW before navigating',async()=>{
 const js=read('docs/parents-download-menu.js');
 assert.equal(js,read('parents-download-menu.js'));
 let click=null;
 let unregistered=false, navigated=false, badOrder=false;
 const navs=[];
 const nav={children:[],append(x){this.children.push(x)}};
 const target=documentStub=>({
  tagName:'SPAN',
  closest:()=>documentStub
 });
 const link={
  dataset:{bnDirectLink:'smart'},
  href:'https://bright-nexa-school-os.onrender.com/smart-tools.html',
  target:'',hasAttribute:()=>false
 };
 const document={
  readyState:'complete',baseURI:'https://bright-nexa-school-os.onrender.com/',
  body:{},
  querySelector:selector=>selector==='.navigation'?nav:null,
  getElementById:()=>null,
  createElement:tag=>({
   tagName:tag.toUpperCase(),style:{},dataset:{},
   setAttribute(){},append(){},addEventListener(){},
   href:'',id:'',target:'',children:[],
  })
 };
 const navigator={serviceWorker:{
  controller:{},getRegistration:async()=>{
   return {unregister:async()=>{unregistered=true}};
  }
 }};
 const window={location:{
  origin:'https://bright-nexa-school-os.onrender.com',
  assign(url){navigated=true;if(!unregistered)badOrder=true;navs.push(url)}
 },addEventListener(kind,handler,capture){assert.equal(capture,true);click=handler}};
 class MutationObserver{observe(){}}
 vm.runInNewContext(js,{document,navigator,window,MutationObserver,URL,Promise});
 const e={
  button:0,defaultPrevented:false,target:target(link),
  preventDefault(){this.defaultPrevented=true},stopPropagation(){},
  stopImmediatePropagation(){}
 };
 click(e);
 assert.equal(e.defaultPrevented,true);
 for(let i=0;i<10&&!navigated;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(unregistered,true,'The stale SPA route should be unregistered');
 assert.equal(navigated,true,'Click should navigate after cleanup');
 assert.equal(badOrder,false,'Cleanup must happen before navigation');
 assert.deepEqual(navs,['https://bright-nexa-school-os.onrender.com/smart-tools.html']);
});
