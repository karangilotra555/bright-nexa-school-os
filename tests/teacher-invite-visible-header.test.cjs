'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../app-extracted/src/BrightNexaApp.jsx'),'utf8');
const profile=src.slice(src.indexOf('function _Component10({ teacher:'),src.indexOf('function Tr({ entries:'));
test('teacher invite button is in modal header before the scrollable long profile body',()=>{
  assert.ok(profile.length>3000);
  const header=profile.indexOf('<Component293>');
  const body=profile.indexOf('<Component299 className={`simple-modal-body`}>');
  const invite=profile.indexOf('onClick={inviteTeacher}');
  const primary=profile.indexOf('Create / Sync Teacher App Access');
  assert.ok(header>=0&&invite>header&&invite<body,'invitation action must be above profile scroll area');
  assert.ok(primary<body,'main invitation label visible without scroll');
  assert.equal(profile.split('onClick={inviteTeacher}').length-1,1,'one functional invite button');
  assert.match(profile,/disabled=\{inviteBusy \|\| !e.email\}/);
  assert.match(profile,/aria-label=\{\`Create or sync Teacher App access for/);
});
test('teacher profile still shows feedback errors in its visible header',()=>{
  assert.match(profile,/role=\{inviteError \? 'alert' : 'status'\}/);
  assert.match(profile,/aria-live="polite"/);
  assert.ok(profile.indexOf('{inviteFeedback ||') < profile.indexOf('<Component299 className={`simple-modal-body`}>'));
  assert.ok(profile.includes('onClick={n}'));
  assert.ok(profile.includes('onClick={r}'));
  assert.ok(src.includes('async function bnInviteTeacherAppAccount(teacher)'));
  assert.ok(src.includes("status: result.status, assignments: Number(result.assignments || 0)"));
});
