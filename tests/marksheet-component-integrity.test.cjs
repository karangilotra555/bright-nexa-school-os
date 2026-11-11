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

test('marksheet toolbar wraps within its own width and preserves A4 print sheet',()=>{
 for(const file of ['marksheet.html','marksheet-a4.html']){
  const src=read(file);
  assert.match(src,/\.control-actions\s*\{[^}]*width:\s*100%;[^}]*flex-wrap:\s*wrap;/);
  assert.match(src,/\.control-actions select\s*\{[^}]*flex:\s*1 1 230px;/);
  assert.match(src,/\.control-actions \.btn\s*\{[^}]*white-space:\s*nowrap;/);
  assert.match(src,/@media \(max-width: 600px\)/);
  assert.match(src,/@media print/);
  assert.match(src,/\.a4-marksheet\s*\{[^}]*width:\s*210mm;/);
 }
});

test('embedded marksheet toolbar uses bounded grid tracks so controls cannot spill horizontally',()=>{
 for(const file of ['marksheet-a4.html','marksheet.html']){
  const page=read(file);
  assert.match(page,/\.no-print-bar \.control-actions\s*\{[^}]*display:\s*grid;/);
  assert.match(page,/grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(page,/\.no-print-bar \.control-actions > select\s*\{[^}]*grid-column:\s*span 3;/);
  assert.match(page,/\.no-print-bar \.control-actions > \.btn\s*\{[^}]*grid-column:\s*span 2;/);
  assert.match(page,/\.no-print-bar \.control-actions > \.btn\s*\{[^}]*overflow-wrap:\s*anywhere;/);
  assert.match(page,/@media\(max-width: 520px\)/);
  assert.equal(page,read('docs/'+file));
  assert.equal(page,read('app-extracted/dist/'+file));
 }
});
