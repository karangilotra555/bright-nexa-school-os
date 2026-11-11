'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('teacher form cannot dismiss on backdrop or discard unsaved input unnoticed',()=>{
 for(const name of ['app-extracted/src/BrightNexaApp.jsx','assets/index-brightnexa-v2.js']){
  const js=read(name);
  const modal=js.slice(js.indexOf('function L({ title:'),js.indexOf('function bnNormalizePhone',js.indexOf('function L({ title:')));
  const teacher=js.slice(js.indexOf('function Cr({'),js.indexOf('function _Component10({ teacher:'));
  assert.ok(modal.includes('dismissOnBackdrop = true'));
  assert.ok(modal.includes('dismissOnBackdrop &&'));
  assert.match(teacher,/dismissOnBackdrop[=:]\\s*false/);
  assert.ok(teacher.includes('initialTeacherDraft'));
  assert.ok(teacher.includes('const closeTeacherSafely = () =>'));
  assert.ok(teacher.includes('if (savingToCloud)'));
  assert.ok(teacher.includes("window.confirm('Teacher details have not been saved."));
  assert.match(teacher,/onClose[=:]\\s*closeTeacherSafely/);
 }
});
