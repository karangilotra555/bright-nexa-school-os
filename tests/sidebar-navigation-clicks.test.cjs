'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

function simulate(host='https://bright-nexa-school-os.onrender.com/'){
 class Element {
  constructor(tag){
   this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.style={};
   this.attributes={};this.parent=null;this.href='';this.id='';this.target='';
  }
  append(...els){for(const el of els){el.parent=this;this.children.push(el)}}
  insertBefore(el,before){
   el.parent=this;
   const at=this.children.indexOf(before);
   if(at<0)this.children.push(el);else this.children.splice(at,0,el);
  }
  setAttribute(k,v){this.attributes[k]=v}
  hasAttribute(k){return Object.hasOwn(this.attributes,k)}
  closest(selector){
   for(let node=this;node;node=node.parent){
    if(selector==='a[data-bn-direct-link]'&&node.tagName==='A'&&node.dataset.bnDirectLink)return node;
   }return null;
  }
 }
 const nav=new Element('nav'),top=new Element('div');
 const all=()=>[nav,top].flatMap(function visit(node){return [node,...node.children.flatMap(visit)]});
 const origin=new URL(host).origin, listeners={};const destinations=[];
 const document={
  readyState:'complete',baseURI:host,body:new Element('body'),
  createElement:tag=>new Element(tag),
  querySelector:selector=>selector==='.navigation'?nav:selector==='.topbar-actions'?top:null,
  getElementById:id=>all().find(el=>el.id===id)||null
 };
 const window={
  location:{origin,assign:url=>destinations.push(url)},
  addEventListener:(event,callback,capture)=>{assert.equal(event,'click');assert.equal(capture,true);listeners[event]=callback}
 };
 class MutationObserver {observe(){}}
 vm.runInNewContext(read('parents-download-menu.js'),{document,window,MutationObserver,URL}, {filename:'parents-download-menu.js'});
 return {nav,top,document,destinations,fire:(target,extras={})=>{
  const evt={
   target,button:0,defaultPrevented:false,
   preventDefault(){this.defaultPrevented=true},
   stopPropagation(){this.stopped=true},
   stopImmediatePropagation(){this.stoppedImmediately=true},
   ...extras
  };
  listeners.click(evt);
  return evt;
 }};
}

test('header shortcuts stay available while React owns the sidebar links',()=>{
 const app=simulate();
 const links=[...app.top.children];
 assert.equal(app.nav.children.length,0,'no separately injected sidebar links');
 assert.equal(app.top.children.length,3);
 for(const [kind,page] of Object.entries({parents:'parent-app-download.html',teachers:'teacher-access.html?staffPortal=1',timetable:'teacher-access.html?view=timetable'})){
  const matching=links.filter(x=>x.dataset.bnDirectLink===kind);
  assert.equal(matching.length,1,kind);
  for(const link of matching){
   assert.equal(link.href,'./'+page);
   assert.ok(link.children.length||link.textContent);
   assert.equal(link.style.pointerEvents,'auto');
  }
 }
 const ids=links.map(x=>x.id);
 for(const expected of ['bn-parents-app-top','bn-teacher-access-top','bn-timetable-top']){
  assert.ok(ids.includes(expected),expected);
 }
});

test('clicking header shortcuts navigates to the correct page despite React SPA capture handlers',()=>{
 const app=simulate();
 const origin='https://bright-nexa-school-os.onrender.com/';
 for(const [kind,filename] of [['parents','parent-app-download.html'],['teachers','teacher-access.html?staffPortal=1'],['timetable','teacher-access.html?view=timetable']]){
  for(const place of [app.top]){
   const anchor=place.children.find(x=>x.dataset.bnDirectLink===kind);
   const target=anchor.children[0]||anchor;
   const event=app.fire(target);
   assert.equal(event.defaultPrevented,true);
   assert.equal(event.stoppedImmediately,true);
   assert.equal(app.destinations.at(-1),origin+filename);
  }
 }
 assert.equal(app.destinations.length,3);
});

test('shortcuts work after Render domain change without hard-coded old domain',()=>{
 const origin='https://brightnexa.onrender.com/';
 const app=simulate(origin);
 for(const link of app.top.children){
  app.fire(link);
  assert.equal(app.destinations.at(-1),origin+link.href.slice(2));
 }
 assert.equal(app.destinations.length,3);
});

test('modifier and auxiliary clicks preserve normal browser open-new-tab behavior',()=>{
 const app=simulate(),link=app.top.children[0];
 for(const props of [{button:1},{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true}]){
  const e=app.fire(link,props);
  assert.equal(e.defaultPrevented,false);
 }
 assert.equal(app.destinations.length,0);
});

test('unknown and malicious links do not trigger automatic navigation',()=>{
 const app=simulate();
 const alien=app.top.children[0];
 alien.href='https://phishing.invalid/not-a-school-page';
 const event=app.fire(alien);
 assert.equal(event.defaultPrevented,false);
 assert.equal(app.destinations.length,0);
 const bad=new Object();
 bad.closest=()=>null;
 app.fire(bad);
 assert.equal(app.destinations.length,0);
});

test('static and root navigation shims are identical and reference existing hosted pages',()=>{
 assert.equal(read('parents-download-menu.js'),read('docs/parents-download-menu.js'));
 for(const file of ['docs/parent-app-download.html','docs/teacher-access.html','docs/smart-tools.html']){
  assert.ok(read(file).length>1000,file);
 }
 assert.doesNotThrow(()=>new Function(read('parents-download-menu.js')));
});


test('All 26 sidebar routes are in school workflow order, with portal shortcuts owned by React',()=>{
 const expected=["Dashboard","School Profile","Classes & Batches","Students","Teachers","Teachers · Online Access","Non-Teaching Staff","School Timetable","Attendance","Homework & Notices","Exams & Marks","Report Cards","Fees","Expenses & Budget","Owner Reports","Transport & Routes","Infrastructure & Assets","Parent Messages","Parents App · Download","AI Teacher Tools","Smart Tools","Opportunity Desk","Growth Passport","School Quality Score","Settings","Contact & Support"];
 const base=read('app-extracted/src/BrightNexaApp.jsx');
 const assets=['assets/index-brightnexa-v2.js','docs/assets/index-brightnexa-v2.js','app-extracted/dist/assets/index-brightnexa-v2.js'];
 const source=base.slice(base.indexOf('var Ts = ['),base.indexOf('];',base.indexOf('var Ts = ['))+2);
 const actual=[...source.matchAll(/label: `([^`]+)`/g)].map(x=>x[1]);
 assert.deepEqual(actual,expected);
 const links={'Teachers · Online Access':['./teacher-access.html?staffPortal=1','bn-teacher-access-nav'],'School Timetable':['./teacher-access.html?view=timetable','bn-timetable-nav'],'Parents App · Download':['./parent-app-download.html','bn-parents-app-nav']};
 for(const [label,[href,id]] of Object.entries(links)){
  const menu=source.slice(source.indexOf('label: `'+label+'`'));
  assert.ok(menu.includes('href: `'+href+'`'),label);
  assert.ok(menu.includes('navId: `'+id+'`'),id);
  assert.ok(menu.includes('directKind: `'+({ 'bn-teacher-access-nav':'teachers','bn-timetable-nav':'timetable','bn-parents-app-nav':'parents' })[id]+'`'),id+' directKind');
 }
 assert.ok(base.includes('const NavItem = href ? `a` : Component2064'));
 assert.ok(base.includes('onClick={href ? undefined : () => se(e)}'));
 assert.ok(base.includes('data-bn-direct-link={directKind || undefined}'));
 for(const f of assets){
  const app=read(f);
  const menu=app.slice(app.indexOf('var Ts = ['),app.indexOf('];',app.indexOf('var Ts = ['))+2);
  assert.deepEqual([...menu.matchAll(/label: `([^`]+)`/g)].map(x=>x[1]),expected,f);
  assert.ok(app.includes('href ? "a" : Component2064'),f);
  assert.ok(app.includes('"data-bn-direct-link": directKind || void 0'),f);
 }
 assert.equal(read(assets[0]),read(assets[1]));
 assert.equal(read(assets[0]),read(assets[2]));
});

test('native React sidebar links use the same safe direct navigation without injected duplicates',()=>{
 const app=simulate();
 const targets=[
  ['teachers','teacher-access.html?staffPortal=1'],
  ['timetable','teacher-access.html?view=timetable'],
  ['parents','parent-app-download.html']
 ];
 assert.equal(app.nav.children.length,0);
 for(const [kind,page] of targets){
  const anchor=app.document.createElement('a');
  anchor.href='./'+page;
  anchor.dataset.bnDirectLink=kind;
  const nested=app.document.createElement('span');anchor.append(nested);app.nav.append(anchor);
  const event=app.fire(nested);
  assert.equal(event.defaultPrevented,true,kind);
  assert.equal(app.destinations.at(-1),'https://bright-nexa-school-os.onrender.com/'+page);
 }
});
