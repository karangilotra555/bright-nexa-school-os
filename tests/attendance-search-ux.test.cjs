'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const versions=['','docs/','app-extracted/dist/'];
test('global school search is a non-login search field in editable source and deployed bundle',()=>{
 for(const file of ['app-extracted/src/BrightNexaApp.jsx','assets/index-brightnexa-v2.js']){
  const s=read(file);
  const near=s.slice(s.indexOf('ref={searchInputRef}')>0?s.indexOf('ref={searchInputRef}')-400:s.indexOf('ref: searchInputRef')-400,
    s.indexOf('ref={searchInputRef}')>0?s.indexOf('ref={searchInputRef}')+900:s.indexOf('ref: searchInputRef')+900);
  assert.match(near,/bn-school-record-lookup/,file+' missing dedicated search field name');
  assert.match(near,/autoComplete:\s*\x60off\x60|autoComplete=\{\x60off\x60\}/,file+' must disable credential autofill');
  assert.match(near,/type:\s*\x60search\x60|type=\{\x60search\x60\}/,file+' must be a native search field');
  assert.match(near,/data-lpignore/,file+' must exclude password managers');
  assert.match(near,/setGlobalSearch/,file+' controlled search must continue working');
 }
});
test('attendance destructive button uses existing accessible secondary-danger design without removing confirmation',()=>{
 const css=read('assets/index-C1ADVAqn.css');
 assert.match(css,/\.secondary-button\.danger/,'Use the actual defined danger theme');
 for(const file of ['app-extracted/src/BrightNexaApp.jsx','assets/index-brightnexa-v2.js']){
  const s=read(file);
  const i=s.indexOf('Delete Day Record');
  assert.ok(i>0,file+' missing destructive attendance action');
  const block=s.slice(i-1500,i+250);
  assert.match(block,/secondary-button danger bn-attendance-delete/,file+' missing designed danger class');
  assert.doesNotMatch(block,/className[:=]\s*\x60danger-button\x60/,file+' cannot use undefined CSS class');
  assert.match(block,/window\.confirm/,'require existing deletion confirmation');
  assert.match(block,/attendance\.filter/,'preserve selected-roster delete filter');
  assert.match(block,/\x60DELETE\x60/,'keep same school write action');
 }
});
test('hosted, docs and desktop mirrors and service-worker revisions are synchronized',()=>{
 for(const file of ['assets/index-brightnexa-v2.js','index.html','school-erp-entry.js','sw.js']){
  const src=read(file);
  for(const prefix of ['docs/','app-extracted/dist/'])assert.equal(read(prefix+file),src,prefix+file+' has stale copy');
 }
 const index=read('index.html'),entry=read('school-erp-entry.js'),sw=read('sw.js');
 assert.match(index,/school-erp-entry\.js\?v=20261113-attendance-autofill-delete-v1/);
 assert.match(entry,/index-brightnexa-v2\.js\?v=20261113-attendance-autofill-delete-v1/);
 const crypto=require('node:crypto'),hash=filename=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,filename))).digest('hex');
 assert.ok(sw.includes('"url":"index.html","revision":"'+hash('index.html')+'"'));
 assert.ok(sw.includes('"url":"school-erp-entry.js?v=20261113-attendance-autofill-delete-v1","revision":"'+hash('school-erp-entry.js')+'"'));
 assert.ok(sw.includes('url:"assets/index-brightnexa-v2.js",revision:"'+hash('assets/index-brightnexa-v2.js')+'"'));
});
