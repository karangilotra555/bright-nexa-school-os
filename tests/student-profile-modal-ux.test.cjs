'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('profile shows top Edit details using existing editor action and hides only duplicate photo view',async()=>{
 const dom=new JSDOM('<!doctype html><body><div role="dialog" aria-label="Test Learner profile"><header><div class="record-profile-heading"><img src="data:image/png;base64,abc"></div><div><button aria-label="Maximize">Max</button><button aria-label="Close profile">X</button></div></header><div class="stored-identity-grid"><article class="stored-identity-card"><img src="data:image/png;base64,abc"><strong>Student Photograph</strong></article><article class="stored-identity-card"><img src="data:image/png;base64,xyz"><strong>Aadhaar Card — Front</strong></article></div><button id="edit">Edit Record</button></div></body>',{runScripts:'outside-only',url:'https://school.invalid/'});
 const win=dom.window;let clicked=0;win.document.getElementById('edit').addEventListener('click',()=>clicked++);
 win.eval(read('school-profile-modal-ux.js'));
 win.document.dispatchEvent(new win.Event('DOMContentLoaded'));
 await new Promise(resolve=>setTimeout(resolve,0));
 const dialog=win.document.querySelector('[role=dialog]');
 const action=dialog.querySelector('[data-bn-profile-edit-top]');
 assert.ok(action,'edit is reachable at top without scrolling');
 action.click();assert.equal(clicked,1,'delegates to existing editor, not fake mutation');
 const cards=dialog.querySelectorAll('.stored-identity-card');
 assert.equal(cards[0].hidden,true,'duplicate student photo is hidden only in presentation');
 assert.equal(cards[1].hidden,false,'other attachments preserved');
 assert.ok(dialog.querySelector('.record-profile-heading img'),'hero photo kept');
 dom.window.close();
});
test('profile script and ERP entry mirrored across publish surfaces',()=>{
 const js=read('school-profile-modal-ux.js');
 for(const prefix of ['docs/','app-extracted/dist/']){
  assert.equal(read(prefix+'school-profile-modal-ux.js'),js);
  assert.equal(read(prefix+'index.html'),read('index.html'));
 }
 assert.match(read('index.html'),/school-profile-modal-ux\.js\?v=20261112-profile-edit-v1/);
});
