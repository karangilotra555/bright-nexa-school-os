'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
const toolGroups=[
 ['Lesson Plan Generator','Homework Generator','Worksheet Generator','Activity Ideas Generator'],
 ['Question Paper Generator','Class Test Generator'],
 ['Student Remark Generator','Weak Student Remedial Plan','Parent Message Generator','School Notice Generator']
];
test('ten teacher generators are preserved behind one grouped accessible select',async()=>{
 const dom=new JSDOM('<!doctype html><html><body><aside id="ai"></aside><main><h2>Homework Generator</h2></main></body></html>',
 {url:'https://example.test',runScripts:'outside-only',pretendToBeVisual:true});
 try{
  const clicked=[],aside=dom.window.document.getElementById('ai');
  for(const name of toolGroups.flat()){
   const button=dom.window.document.createElement('button');button.textContent=name;
   button.addEventListener('click',()=>{clicked.push(name);dom.window.document.querySelector('h2').textContent=name;});
   aside.appendChild(button);
  }
  const script=fs.readFileSync('teacher-ai-form-bridge.js','utf8');
  dom.window.eval(script);
  await new Promise(resolve=>setTimeout(resolve,110));
  const select=aside.querySelector('[data-bn-ai-tool-picker] select');
  assert.ok(select,'A compact accessible picker should replace the 10-button visual menu');
  assert.equal(select.getAttribute('aria-label'),'Choose AI generator');
  assert.equal(select.querySelectorAll('optgroup').length,3);
  assert.equal(select.querySelectorAll('option').length,10);
  assert.equal(select.value,'Homework Generator','current tool must remain selected');
  assert.ok([...aside.querySelectorAll('button')].every(b=>b.style.display==='none'&&b.getAttribute('aria-hidden')==='true'));
  select.value='Question Paper Generator';
  select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  assert.deepEqual(clicked,['Question Paper Generator'],'must dispatch original React button action');
  await new Promise(resolve=>setTimeout(resolve,110));
  assert.equal(aside.querySelectorAll('[data-bn-ai-tool-picker]').length,1,'observer must not create duplicate pickers');
  assert.equal(select.value,'Question Paper Generator');
  const reads=['docs/teacher-ai-form-bridge.js','app-extracted/dist/teacher-ai-form-bridge.js'];
  for(const path of reads)assert.equal(fs.readFileSync(path,'utf8'),script,path+' must match live source');
 }finally{dom.window.close();}
});
test('unrelated school sidebars remain untouched',async()=>{
 const dom=new JSDOM('<!doctype html><html><body><aside><button>Dashboard</button><button>Students</button></aside></body></html>',
  {url:'https://example.test',runScripts:'outside-only',pretendToBeVisual:true});
 try{
  dom.window.eval(fs.readFileSync('teacher-ai-form-bridge.js','utf8'));
  await new Promise(resolve=>setTimeout(resolve,110));
  assert.equal(dom.window.document.querySelector('[data-bn-ai-tool-picker]'),null);
  assert.equal(dom.window.document.querySelectorAll('aside button').length,2);
  assert.ok([...dom.window.document.querySelectorAll('aside button')].every(b=>b.style.display!=='none'));
 }finally{dom.window.close();}
});
