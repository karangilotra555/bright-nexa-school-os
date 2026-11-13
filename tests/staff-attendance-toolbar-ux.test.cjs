'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const get=p=>fs.readFileSync(path.join(root,p),'utf8');
test('Teaching and Non-Teaching Staff share compact save/delete actions and preserve existing cloud flow',()=>{
 const source=get('app-extracted/src/BrightNexaApp.jsx');
 const begin=source.indexOf('<Component437 className={`attendance-controls bn-staff-attendance-controls`}>');
 const end=source.indexOf('<Component442 className={`bulk-attendance`}>',begin);
 assert.ok(begin>0&&end>begin,'Target staff toolbar must exist');
 const toolbar=source.slice(begin,end);
 assert.match(toolbar,/bn-staff-attendance-save/,'Save button should not stretch across the entire grid');
 assert.match(toolbar,/secondary-button danger bn-attendance-delete bn-staff-attendance-delete/,'Delete must use existing danger style');
 assert.match(toolbar,/bn-staff-attendance-status/,'Save confirmation must be a full-width separate line');
 assert.match(toolbar,/window\.confirm/,'Destructive action requires confirmation');
 assert.match(toolbar,/staffAttendance:\s*e\.staffAttendance\.filter/,'Delete filtering must remain unchanged');
 assert.match(toolbar,/attendanceSaving/,'Preserve save-in-progress protection');
 assert.match(toolbar,/setAttendanceSaveMessage/,'Preserve Supabase save confirmation');
 assert.doesNotMatch(toolbar,/className=\{`danger-button`\}/,'No undefined danger class in staff toolbar');
 const student=source.slice(source.indexOf('<Component413 className={`attendance-controls`}>'),begin);
 assert.match(student,/secondary-button danger bn-attendance-delete/,'Student Attendance design remains intact');
});
test('staff toolbar and status line are responsive without changing other tabs',()=>{
 for(const file of ['assets/index-C1ADVAqn.css','docs/assets/index-C1ADVAqn.css','app-extracted/dist/assets/index-C1ADVAqn.css']){
  const css=get(file);
  assert.match(css,/\.attendance-controls\.bn-staff-attendance-controls\s*\{/);
  assert.match(css,/grid-template-columns:\s*minmax\(145px,\s*190px\)\s+minmax\(185px,\s*1fr\)\s+max-content\s+max-content/);
  assert.match(css,/\.bn-staff-attendance-controls\s*>\s*\.bn-staff-attendance-save/);
  assert.match(css,/\.bn-staff-attendance-controls\s*>\s*\.bn-staff-attendance-delete/);
  assert.match(css,/\.bn-staff-attendance-controls\s*>\s*\.bn-staff-attendance-status/);
  assert.match(css,/@media\s*\(max-width:\s*900px\)/);
  assert.match(css,/@media\s*\(max-width:\s*520px\)/);
 }
});
test('deployed bundle copies, CSS revisions and Workbox precache match release',()=>{
 for(const file of ['assets/index-brightnexa-v2.js','index.html','sw.js']){
  const s=get(file);
  for(const prefix of ['docs/','app-extracted/dist/'])assert.equal(get(prefix+file),s,prefix+file+' must match root');
 }
 const bundle=get('assets/index-brightnexa-v2.js');
 const staff=bundle.slice(bundle.indexOf('className: `attendance-controls bn-staff-attendance-controls`'),bundle.indexOf('className: `bulk-attendance`',bundle.indexOf('className: `attendance-controls bn-staff-attendance-controls`')));
 assert.match(staff,/primary-button bn-staff-attendance-save/);
 assert.match(staff,/secondary-button danger bn-attendance-delete bn-staff-attendance-delete/);
 assert.match(staff,/section-helper bn-staff-attendance-status/);
 assert.match(staff,/window\.confirm/);
 const index=get('index.html'),sw=get('sw.js'),hash=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
 assert.match(index,/assets\/index-C1ADVAqn\.css\?v=20261114-staff-attendance-ux-v1/);
 assert.ok(sw.includes('"url":"index.html","revision":"'+hash('index.html')+'"'));
 assert.ok(sw.includes('url:"assets/index-brightnexa-v2.js",revision:"'+hash('assets/index-brightnexa-v2.js')+'"'));
});
