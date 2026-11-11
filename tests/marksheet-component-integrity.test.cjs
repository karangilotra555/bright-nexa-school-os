'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('marksheets never fabricate PT, notebook, enrichment or annual marks from a single overall total',()=>{
 for(const file of ['marksheet.html','marksheet-a4.html']){
  const src=read(file);
  assert.doesNotMatch(src,/pt\s*=\s*parseFloat\(\(tot\s*\*\s*0\.1\)/);
  assert.doesNotMatch(src,/nb\s*=\s*parseFloat\(\(tot\s*\*\s*0\.05\)/);
  assert.doesNotMatch(src,/se\s*=\s*parseFloat\(\(tot\s*\*\s*0\.05\)/);
  assert.match(src,/pt = nb = se = annual = null/);
  assert.match(src,/hasEntry && Number\.isFinite\(sub\.pt\)/);
  assert.match(src,/hasEntry && Number\.isFinite\(sub\.annual\)/);
  assert.equal(read('docs/'+file),src,'docs must mirror live published source');
  assert.equal(read('app-extracted/dist/'+file),src,'dist must mirror published source');
 }
});
