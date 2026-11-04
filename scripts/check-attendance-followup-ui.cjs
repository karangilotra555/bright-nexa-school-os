// Optional fixture-only DOM/persistence check. Requires jsdom@26.1.0 and esbuild@0.25.12 via NODE_PATH.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom'),esbuild=require('esbuild');
const repo=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(repo,'app-extracted/src/BrightNexaApp.jsx'),'utf8');
const baseline=cp.execFileSync('git',['show','ad7ec6b:assets/index-brightnexa-v2.js'],{cwd:repo,encoding:'utf8',maxBuffer:5e6});
const today=new Date().toISOString().slice(0,10);
const students=[{id:'a',name:'Fixture A',className:'9',section:'A',status:'Active',parentMobile:'0000000000'},{id:'b',name:'Fixture B',className:'9',section:'A',status:'Active'}];
const actor={accountId:'fixture-owner',name:'Fixture Owner',role:'OWNER'};
const pause=()=>new Promise(r=>setTimeout(r,45));
async function mount(code,recovered){
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://fixture.test/',runScripts:'outside-only',pretendToBeVisual:true});
 const w=dom.window;w.confirm=()=>true;
 w.sessionStorage.setItem('bright-nexa-school-os:session:v2',JSON.stringify(actor));
 let error;w.addEventListener('error',event=>{error=event.error||event.message;});
 const start=code.lastIndexOf(recovered?'sa();\nCt.createRoot':'(sa(),');assert(start>0);
 const harness=`\nwindow.__fixture={empty:Oi,read:Ai,write:ji};let fixtureRoot=Ct.createRoot(document.getElementById('root'));window.__renderFixture=(data)=>fixtureRoot.render(w.createElement(Hr,{data,students:window.__students,onUpdate(next){window.__updated=next;ji(next);window.__renderFixture(next);}}));`;
 w.eval(esbuild.transformSync(code.slice(0,start)+harness,{loader:'jsx',format:'iife',jsxFactory:'w.createElement',jsxFragment:'w.Fragment'}).code);
 w.__students=students;
 const data=w.__fixture.empty();data.classes=[{id:'c1',name:'9',section:'A',status:'Active'}];data.attendance=[{id:'r1',studentId:'a',date:today,classId:'c1',className:'9',section:'A',status:'Absent'},{id:'r2',studentId:'b',date:today,classId:'c1',className:'9',section:'A',status:'Present'}];
 w.__renderFixture(data);await pause();assert(!error,String(error));return {dom,w,data};
}
const button=(d,text)=>Array.from(d.querySelectorAll('button')).find(b=>b.textContent.trim()===text);
function field(d,label){return Array.from(d.querySelectorAll('label')).find(x=>x.querySelector('span')?.textContent===label)?.querySelector('input,textarea,select');}
function change(w,input,value){const proto=input.tagName==='SELECT'?w.HTMLSelectElement.prototype:input.tagName==='TEXTAREA'?w.HTMLTextAreaElement.prototype:w.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(input,value);input.dispatchEvent(new w.Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));}
(async()=>{
 const old=await mount(baseline,false),next=await mount(source,true),w=next.w,d=w.document;
 const clone=d.getElementById('root').cloneNode(true),action=button(clone,'Absent follow-up');assert(action);action.parentElement.remove();
 assert.equal(clone.innerHTML,old.w.document.getElementById('root').innerHTML,'existing attendance screen unchanged except the one added header action');
 const original=JSON.stringify(next.data.attendance);
 button(d,'Absent follow-up').click();await pause();assert(d.querySelector('[role=dialog]'));
 button(d,'Record follow-up').click();await pause();
 change(w,field(d,'Follow-up status'),'Contacted');await pause();
 change(w,field(d,'Actual contact date'),today);await pause();
 change(w,field(d,'Contact / reason notes'),'Fixture parent called');await pause();
 button(d,'Save follow-up record').closest('form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await pause();
 assert.equal(w.__updated.attendanceFollowUps[0].status,'Contacted');assert.equal(JSON.stringify(w.__updated.attendance),original);
 const restored=w.__fixture.read();assert.equal(restored.attendanceFollowUps[0].notes,'Fixture parent called','follow-up survives existing storage/load path');
 assert(d.body.textContent.includes('No message was sent.'));
 const savedKeys=Object.keys(JSON.parse(w.localStorage.getItem('bright-nexa-school-os:operations:v1')));assert(savedKeys.includes('attendanceFollowUps'));
 w.sessionStorage.setItem('bright-nexa-school-os:session:v2',JSON.stringify({...actor,role:'TEACHER'}));w.__renderFixture(restored);await pause();assert(!button(d,'Absent follow-up'));assert(!d.querySelector('[role=dialog]'),'teacher cannot inherit the open owner follow-up dialog');
 old.w.close();w.close();console.log('PASS: baseline attendance DOM preserved; owner contact event saved/reloaded; attendance unchanged; no message sent; teacher follow-up action/dialog denied.');
})().catch(error=>{console.error(error);process.exitCode=1;});
