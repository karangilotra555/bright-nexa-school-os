'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
test('every PWA asset has the exact shipped bytes and all current entrypoint dependencies are cached',()=>{
 for(const prefix of ['','docs','app-extracted/dist']){
  const dir=path.join(root,prefix),read=p=>fs.readFileSync(path.join(dir,p),'utf8');
  const match=read('sw.js').match(/e\.precacheAndRoute\((\[[\s\S]*?\]),\{\}\)/);
  assert.ok(match,prefix+' precache exists');
  const entries=vm.runInNewContext('('+match[1]+')',{}, {timeout:1000});
  const urls=new Set();
  for(const entry of entries){
   assert.ok(!urls.has(entry.url),'duplicate precache URL '+entry.url);urls.add(entry.url);
   const file=path.join(dir,entry.url.split('?')[0]);
   assert.ok(fs.existsSync(file),prefix+' missing '+entry.url);
   assert.equal(entry.revision,crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),prefix+' stale '+entry.url);
  }
  for(const page of ['index.html','teacher-access.html','smart-tools.html']){
   if(!fs.existsSync(path.join(dir,page)))continue;
   for(const ref of read(page).matchAll(/(?:src|href)="\.\/([^"?#]+\.(?:js|css)(?:\?v=[^"#]+)?)"/g))assert.ok(urls.has(ref[1]),prefix+' uncached dependency '+ref[1]);
  }
 }
});
