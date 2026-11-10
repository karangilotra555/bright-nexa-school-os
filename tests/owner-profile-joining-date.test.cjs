'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
test('owner profile omits staff joining date without changing principal', () => {
 const source=read('app-extracted/src/BrightNexaApp.jsx');
 const form=source.split('function _Component49(')[1].split('function Ba(')[0];
 const card=source.split('function Ba({ title: e,')[1].split('function Va(')[0];
 assert.ok(form.includes('{e !== `directorProfile` && ('));
 assert.ok(form.includes('<R label={`Date of Joining`}>'));
 assert.ok(card.includes('e === `Director / Owner` ? `` : Ka(t?.joiningDate)'));
 for(const dir of ['', 'docs/', 'app-extracted/dist/']){
  const bundle=read(dir+'assets/index-brightnexa-v2.js');
  assert.ok(bundle.split('function _Component49(')[1].split('function Ba(')[0].includes('e2 !== `directorProfile` &&'));
  assert.ok(bundle.includes('e2 === `Director / Owner` ? `` : Ka(t2?.joiningDate)'));
 }
});
