'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
test('cloud guard emits real status transitions and clears stale error on confirmed sync',()=>{
  const dom=new JSDOM('<!doctype html><html><body></body></html>',{
    url:'https://bright-nexa-school-os.onrender.com/',
    runScripts:'outside-only'
  });
  const win=dom.window;
  win.sessionStorage.setItem('bright-nexa-school-os:session:v2',JSON.stringify({cloudVerified:true}));
  const events=[];
  win.addEventListener('bn-cloud-guard-state',e=>events.push(e.detail));
  win.eval(read('school-online-guard.js'));
  const guard=win.BNWorkspaceOnlineGuard;
  guard.update('pending',new Error('Failed to fetch'));
  assert.equal(events.at(-1).status,'pending');
  assert.equal(events.at(-1).problem,'Failed to fetch');
  assert.equal(guard.getStatus().problem,'Failed to fetch');
  assert.match(win.document.getElementById('bn-cloud-publish-status').textContent,/not published/i);
  guard.update('synced');
  assert.equal(events.at(-1).status,'synced');
  assert.equal(events.at(-1).problem,'');
  assert.equal(guard.getStatus().problem,'');
  assert.equal(win.document.getElementById('bn-cloud-publish-status').style.display,'none');
  const before=events.length;
  guard.update('synced');
  assert.equal(events.length,before,'unchanged status should not dispatch repeatedly');
  dom.window.close();
});
test('ERP save label requires both server confirmation and clean guard; cannot show green on failure',()=>{
  const code=read('app-extracted/src/BrightNexaApp.jsx');
  const start=code.indexOf('const [cloudGuardState, setCloudGuardState]');
  const end=code.indexOf('// Teacher Portal attendance',start);
  assert.ok(start>=0&&end>start);
  const segment=code.slice(start,end);
  assert.match(segment,/bn-cloud-guard-state/);
  assert.match(segment,/cloudBadgeConfirmed\s*=\s*!cloudBadgeConflict/);
  assert.match(segment,/syncStatus==='synced' && cloudGuardState\.status==='synced'/);
  assert.match(segment,/cloudBadgeFailed.*'Cloud save failed — not published'/);
  assert.match(code,/<span>\{cloudBadgeLabel\}<\/span>/);
  assert.match(code,/background: cloudBadgeFailed \|\| cloudBadgeConflict \?/);
});
