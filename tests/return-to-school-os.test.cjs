'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

for(const file of ['parent-app-download.html','teacher-access.html','smart-tools.html']){
 test(file+' has an obvious, functional Back to School OS link in the page header',()=>{
   const html=read(file);
   assert.equal(html,read('docs/'+file),'Root and static deployment should match');
   const header=html.match(/<header(?:\s[^>]*)?>([\s\S]*?)<\/header>/);
   assert.ok(header,'Page header missing: '+file);
   const back=header[1].match(/<a\b(?=[^>]*\bid="backToSchoolOs")(?=[^>]*\bhref="\.\/index\.html")[^>]*>([\s\S]*?)<\/a>/);
   assert.ok(back,'Back to School OS must be a real same-origin link in header of '+file);
   assert.match(back[1],/Back to School OS/);
   assert.ok(!/onclick=/.test(back[0]),'Do not depend on JavaScript for the Back link');
 });
}

test('Parent app Back button is visible even before scrolling down',()=>{
 const html=read('parent-app-download.html');
 const header=html.indexOf('id="backToSchoolOs"');
 const hero=html.indexOf('class="card hero"');
 assert.ok(header>0&&hero>header,'The parent return control must precede the large download card');
 assert.match(html,/\.header-back\s*\{[^}]*display:inline-flex/);
 assert.match(html,/@media\(max-width:480px\)\{\.header-inner/);
});

test('Teacher and Smart Tools Back links survive login or tab state changes',()=>{
 const teacher=read('teacher-access.html'),smart=read('smart-tools.html');
 const teacherBack=teacher.indexOf('id="backToSchoolOs"');
 assert.ok(teacherBack>0&&teacherBack<teacher.indexOf('id="loginSection"'));
 const smartBack=smart.indexOf('id="backToSchoolOs"');
 assert.ok(smartBack>0&&smartBack<smart.indexOf('data-view="timetable"'));
});

test('PWA worker excludes standalone pages from homepage fallback',()=>{
 const sw=read('docs/sw.js');
 for(const p of ['parent-app-download','teacher-access','smart-tools']){
   assert.ok(sw.includes(p),'Service worker must exclude '+p);
 }
});
