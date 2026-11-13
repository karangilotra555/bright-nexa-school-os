'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sha=p=>crypto.createHash('sha256').update(Buffer.from(read(p),'utf8')).digest('hex');
test('dashboard metrics do not truncate Not marked or squeeze cloud counts beside value',()=>{
  const s=read('school-dashboard-integrity.js');
  assert.match(s,/\.metric-grid \.metric-card\{flex-wrap:wrap;align-content:flex-start\}/);
  assert.match(s,/\.metric-grid \.metric-card strong\{white-space:normal;overflow:visible;text-overflow:clip/);
  assert.match(s,/\.metric-grid \.metric-card\[data-bn-cloud-count\]::after,.metric-grid \.metric-card\[data-bn-attendance-note\]::after/);
  assert.match(s,/flex:0 0 calc\(100% - 56px\);margin:2px 0 0 56px/);
  const jsx=read('app-extracted/src/BrightNexaApp.jsx');
  assert.ok(jsx.includes('value={ee === null ? `Not marked`'));
  for(const folder of ['docs/','app-extracted/dist/'])assert.equal(read(folder+'school-dashboard-integrity.js'),s);
});
test('dashboard script has updated service worker revision in every published target',()=>{
  for(const dir of ['','docs/','app-extracted/dist/']){
    const html=read(dir+'index.html'),sw=read(dir+'sw.js');
    const match=html.match(/src="\.\/(school-dashboard-integrity\.js\?v=[^"]+)"/);
    assert.ok(match,'dashboard script referenced by '+dir+'index.html');
    const expected='"url":'+JSON.stringify(match[1])+',"revision":"'+sha(dir+'school-dashboard-integrity.js')+'"';
    assert.ok(sw.includes(expected),'dashboard script revision out of date at '+dir);
  }
});
