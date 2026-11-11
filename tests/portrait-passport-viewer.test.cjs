'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {JSDOM}=require('jsdom');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');

test('passport viewer is mirrored, loaded by ERP, and revisioned for offline PWA',()=>{
  const script=read('school-portrait-preview.js');
  const entry=read('school-erp-entry.js');
  const sw=read('sw.js');
  for(const dir of ['docs/','app-extracted/dist/']){
    assert.equal(read(dir+'school-portrait-preview.js'),script);
    assert.equal(read(dir+'school-erp-entry.js'),entry);
    assert.equal(read(dir+'sw.js'),sw);
  }
  assert.match(entry,/school-portrait-preview\.js\?v=20261111-passport-v1/);
  assert.ok(sw.includes('"url":"school-portrait-preview.js?v=20261111-passport-v1","revision":"'+sha(script)+'"'));
  assert.ok(sw.includes('"url":"school-erp-entry.js?v=20261111-portrait-compact-v1","revision":"'+sha(entry)+'"'));
  assert.match(script,/width:120px!important;height:160px!important/);
  assert.match(script,/Preview only\. Save the form to confirm in Supabase\./);
});

test('student photographs enlarge with mouse or keyboard; existing teacher viewer stays the owner',async()=>{
  const dom=new JSDOM('<!doctype html><html><head></head><body><div id="root">'+
    '<div class="student-cell"><img id="student" src="data:image/jpeg;base64,AAAA" alt="Student photograph"></div>'+
    '<div class="student-cell"><button title="Enlarge teacher photograph"><img id="teacher" src="data:image/jpeg;base64,BBBB" alt=""></button></div>'+
    '</div></body></html>',{runScripts:'outside-only',url:'https://school.example.invalid/'});
  try{
    dom.window.eval(read('school-portrait-preview.js'));
    await Promise.resolve();
    const student=dom.window.document.getElementById('student');
    assert.ok(student.classList.contains('bn-passport-list-photo'));
    assert.equal(student.getAttribute('tabindex'),'0');
    student.click();
    assert.ok(dom.window.document.querySelector('dialog.bn-passport-photo-dialog'));
    dom.window.document.querySelector('dialog button').click();
    assert.equal(dom.window.document.querySelector('dialog'),null);
    student.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
    assert.ok(dom.window.document.querySelector('dialog'));
    dom.window.document.querySelector('dialog button').click();
    dom.window.document.getElementById('teacher').click();
    assert.equal(dom.window.document.querySelector('dialog'),null,'React teacher photo button must not be intercepted');
  }finally{dom.window.close();}
});

test('new photo selection gives portrait preview without treating an Aadhaar document as a photo',async()=>{
  const dom=new JSDOM('<!doctype html><html><head></head><body><div id="root"><div class="student-modal">'+
    '<div><span>Student Photograph</span><button id="choose">Choose photo</button></div>'+
    '<input type="file" id="photoFile">'+
    '<div><span>Aadhaar Document</span><button id="documentButton">Choose document</button></div>'+
    '<input type="file" id="documentFile">'+
    '</div></div></body></html>',{runScripts:'outside-only',url:'https://school.example.invalid/'});
  try{
    const win=dom.window;
    let revoked=0;
    win.URL.createObjectURL=()=> 'blob:preview-test';
    win.URL.revokeObjectURL=()=>{revoked++;};
    win.eval(read('school-portrait-preview.js'));
    const chosenPhoto=win.document.getElementById('photoFile');
    const chosenDocument=win.document.getElementById('documentFile');
    Object.defineProperty(chosenPhoto,'files',{value:[new win.File(['jpeg'],'student.jpg',{type:'image/jpeg'})]});
    Object.defineProperty(chosenDocument,'files',{value:[new win.File(['id'],'aadhaar.jpg',{type:'image/jpeg'})]});
    win.document.getElementById('choose').click();
    chosenPhoto.dispatchEvent(new win.Event('change',{bubbles:true}));
    assert.ok(win.document.querySelector('.bn-passport-draft img[src="blob:preview-test"]'));
    win.document.querySelector('.bn-passport-draft button').click();
    assert.equal(revoked,1,'temporary object URL must be revoked');
    win.document.getElementById('choose').click();
    win.document.getElementById('documentButton').click();
    chosenDocument.dispatchEvent(new win.Event('change',{bubbles:true}));
    assert.equal(win.document.querySelector('.bn-passport-draft'),null,'Aadhaar must never be displayed as the person portrait');
  }finally{dom.window.close();}
});
