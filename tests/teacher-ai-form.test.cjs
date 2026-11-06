'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom'),esbuild=require('esbuild');
const svc=require('../src/smart-tools/teacher-ai.cjs');
test('switching through all ten generators keeps academic defaults valid',async()=>{
 const source=fs.readFileSync('app-extracted/src/BrightNexaApp.jsx','utf8').replace(/\r\n/g,'\n');
 const bootstrap=source.lastIndexOf('sa();\nCt.createRoot');assert.ok(bootstrap>0);
 const dom=new JSDOM('<div id="root"></div>',{url:'https://school.test',runScripts:'outside-only',pretendToBeVisual:true});
 const requests=[];
 dom.window.BNSmartToolsAI={generate:async input=>{requests.push(input);return 'Teacher reviewed fixture content. '.repeat(5)}};
 try{
  dom.window.eval(esbuild.transformSync(source.slice(0,bootstrap)+'\nCt.createRoot(document.getElementById("root")).render(w.createElement(Ea));',{loader:'jsx',format:'iife',jsxFactory:'w.createElement',jsxFragment:'w.Fragment',target:'es2022'}).code);
  const wait=()=>new Promise(r=>setTimeout(r,35));await wait();
  const doc=dom.window.document;
  assert.ok(doc.querySelector('a[href="./teacher-access.html"]'),'Missing sessions need an actionable same-tab sign-in link');
  for(const tool of ['Question Paper Generator','Class Test Generator','Weak Student Remedial Plan','Worksheet Generator','Homework Generator','Activity Ideas Generator','Lesson Plan Generator','Student Remark Generator','Parent Message Generator','School Notice Generator']){
   [...doc.querySelectorAll('aside button')].find(b=>b.textContent===tool).click();await wait();
   const textarea=doc.querySelector('.ai-input-grid textarea');
   Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype,'value').set.call(textarea,'Observed: learner identifies shapes but needs help comparing their sides.');
   textarea.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await wait();
   doc.querySelector('.ai-builder > .primary-button').click();await wait();
   const input=requests.at(-1);assert.equal(input.tool,tool);
   if(tool==='Student Remark Generator')assert.equal(input.duration,'Term 1 / Periodic Test');
   assert.equal(Object.hasOwn(input,'topic'),false,'No separate legacy chapter payload');
   if(['Lesson Plan Generator','Worksheet Generator','Question Paper Generator','Homework Generator','Activity Ideas Generator','Class Test Generator'].includes(tool)){
    assert.doesNotThrow(()=>svc.validateInput(input),tool);
    if(svc.contractFor(tool).kind==='assessment')assert.doesNotThrow(()=>svc.planAssessment(input),tool);
   }
  }
 }finally{dom.window.close()}
});
