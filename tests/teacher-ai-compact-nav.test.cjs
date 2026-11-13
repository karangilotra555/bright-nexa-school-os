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

test('lesson plan shows only essentials by default and keeps advanced values intact',async()=>{
 const dom=new JSDOM('<!doctype html><html><head></head><body><div class="ai-workbench"><aside id="ai"></aside><section class="ai-builder"><h2>Lesson Plan Generator</h2><div class="ai-input-grid"><label><span>Class / batch</span><select><option>Nursery</option></select></label><label><span>Subject</span><select><option>Science</option></select></label><label class="wide"><span>Suggestions / Chapter (optional)</span><textarea></textarea></label><label><span>Output Language</span><select><option>English</option></select></label><label><span>Plan Duration</span><select><option>45 Minutes</option></select></label><label><span>Difficulty / Depth</span><select><option>Standard</option></select></label></div></section></div></body></html>',{url:'https://example.test',runScripts:'outside-only',pretendToBeVisual:true});
 try{
  const aside=dom.window.document.getElementById('ai'),names=toolGroups.flat();
  names.forEach(name=>{
   const b=dom.window.document.createElement('button');
   b.textContent=name;
   b.addEventListener('click',()=>{dom.window.document.querySelector('.ai-builder h2').textContent=name;});
   aside.appendChild(b);
  });
  dom.window.eval(fs.readFileSync('teacher-ai-form-bridge.js','utf8'));
  await new Promise(resolve=>setTimeout(resolve,115));
  const wb=dom.window.document.querySelector('.ai-workbench');
  assert.ok(wb.classList.contains('bn-ai-compact'),'toolbar layout should replace side rail');
  assert.equal(wb.getAttribute('data-bn-ai-options'),'collapsed');
  assert.equal(wb.querySelectorAll('[data-bn-ai-advanced="true"]').length,3,'only three default controls are collapsed');
  assert.equal(wb.querySelectorAll('.ai-input-grid > label:not([data-bn-ai-advanced])').length,3);
  const toggle=wb.querySelector('[data-bn-ai-advanced-toggle]');
  assert.equal(toggle.textContent,'More options');
  assert.equal(toggle.getAttribute('aria-expanded'),'false');
  toggle.click();
  assert.equal(wb.getAttribute('data-bn-ai-options'),'expanded');
  assert.equal(toggle.getAttribute('aria-expanded'),'true');
  assert.equal(toggle.textContent,'Fewer options');
  assert.equal(wb.querySelectorAll('.ai-input-grid select')[3].value,'45 Minutes','no defaults must be reset');
  const picker=wb.querySelector('[data-bn-ai-tool-picker] select');
  picker.value='Homework Generator';
  picker.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  await new Promise(resolve=>setTimeout(resolve,115));
  assert.equal(wb.getAttribute('data-bn-lesson'),'false');
  assert.equal(toggle.style.display,'none','other generators retain their original controls');
 }finally{dom.window.close();}
});
