'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const schoolId='8dd0f94f-021a-4ed2-80cc-e1be68d76be1',photo='data:image/jpeg;base64,AAAA';
const snapshot={institution:{institution:{id:schoolId,name:'HPS',session:'2026-2027'}},students:[{id:'s1',name:'Rivan',className:'Nursery',section:'A',admissionNumber:'HPS001',rollNumber:'1',photoDataUrl:photo}],operations:{classes:[]}};
function mount(options={}){
 const dom=new JSDOM(read('id-card-a4.html'),{url:'https://school.example.invalid/id-card-a4.html?embedded=1&schoolId='+(options.wrong?'00000000-0000-4000-a000-000000000001':schoolId),runScripts:'outside-only'});
 const w=dom.window,s=[...w.document.querySelectorAll('script')].find(x=>!x.src&&x.textContent.includes('function loadSchoolOSData()'));
 assert.ok(s,'inline app script exists');
 let printed=0,pulls=0;
 w.print=()=>printed++;
 w.fetch=async()=>{throw Error('Unit test must not make network requests');};
 w.QRCode={toCanvas(_canvas,_value,_settings,done){done?.(null);}};
 w.BNWorkspaceCloud={create:()=>({connect:async()=>options.fail?Promise.reject(Error('Session expired')):[{id:schoolId,name:'HPS'}],pull:async id=>{assert.equal(id,schoolId);pulls++;return{revision:42,snapshot};}})};
 w.localStorage.setItem('bright-nexa-school-os:students:v1',JSON.stringify([{id:'old',name:'STALE DEVICE STUDENT',admissionNumber:'OLD'}]));
 w.eval(s.textContent);
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 return {dom,w,settle:()=>new Promise(r=>setTimeout(r,45)),printed:()=>printed,pulls:()=>pulls};
}
test('ID card uses verified Supabase roster and stored photo, not stale device-only image',async()=>{
 const x=mount();try{await x.settle();const d=x.w.document;
 assert.match(d.getElementById('bnPrintCloudStatus').textContent,/Supabase confirmed/);
 assert.match(d.getElementById('dataSourcePill').textContent,/Supabase confirmed \(1 students\)/);
 assert.equal(d.querySelector('.photo-frame img').getAttribute('src'),photo);
 assert.match(d.getElementById('pagesContainer').textContent,/RIVAN/);
 assert.doesNotMatch(d.getElementById('pagesContainer').textContent,/STALE DEVICE STUDENT/);
 assert.equal(d.getElementById('bnPrintBack'),null,'ERP sidebar is owned by native parent');
 assert.equal(x.pulls(),1);
 }finally{x.dom.window.close();}
});
test('search, class/student filters, theme, print side, and print work',async()=>{
 const x=mount();try{await x.settle();const w=x.w,d=w.document;
 d.getElementById('searchInput').value='unknown';w.handleSearch();
 assert.match(d.getElementById('countBadge').textContent,/0 Students/);
 d.getElementById('searchInput').value='rivan';w.handleSearch();
 assert.match(d.getElementById('countBadge').textContent,/1 Student/);
 w.clearSearch();
 const cls=d.getElementById('classFilter');assert.ok([...cls.options].some(o=>o.value==='Class Nursery'));
 cls.value='Class Nursery';w.filterStudents();
 d.getElementById('studentFilter').value='s1';w.renderCards();
 d.getElementById('colorTheme').value='forest';w.changeTheme();
 assert.equal(d.documentElement.style.getPropertyValue('--primary'),'#064e3b');
 w.setIdPrintSide('back');assert.equal(d.body.dataset.printSide,'back');
 await new Promise(r=>setTimeout(r,35));w.handlePrint();assert.equal(x.printed(),1);
 assert.ok(d.querySelector('a[href="marksheet-a4.html"]'));
 assert.ok(d.querySelector('a[href="tc-certificate-a4.html"]'));
 assert.equal(d.querySelector('a[href^="https://bright-nexa-school-os-api"]').getAttribute('target'),'_blank');
 }finally{x.dom.window.close();}
});
test('cross-school and expired session cannot be falsely labelled as synced',async()=>{
 for(const mode of [{wrong:true},{fail:true}]){const x=mount(mode);try{await x.settle();const d=x.w.document;
 assert.ok(d.getElementById('bnPrintCloudStatus').classList.contains('error'));
 assert.match(d.getElementById('dataSourcePill').textContent,/cloud not verified.*hidden/i);
 assert.equal(x.pulls(),0);
 }finally{x.dom.window.close();}}
});
test('all shipped copies and native sidebar route are consistent',()=>{
 const html=read('id-card-a4.html');
 for(const f of ['docs/id-card-a4.html','app-extracted/dist/id-card-a4.html'])assert.equal(read(f),html);
 assert.match(html,/tries < 10/);
 for(const f of ['app-extracted/src/BrightNexaApp.jsx','assets/index-brightnexa-v2.js']){
  const src=read(f);
  assert.match(src,/label: \x60ID Cards & Certificates\x60/);
  assert.match(src,/bn-open-school-tool/);
  assert.match(src,/printTool.*embedded=1/);
  assert.doesNotMatch(src,/window\.open\(\x60\.\/id-card-a4\.html\x60, \x60_blank\x60\)/);
 }
});
