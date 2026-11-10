'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const source = () => read('app-extracted/src/BrightNexaApp.jsx');

test('school class editor offers all standards but no school subject textarea', () => {
  const src = source();
  const form = src.slice(src.indexOf('function Fr('), src.indexOf('function Ir('));
  for (const label of ['Nursery', 'LKG', 'UKG', ...Array.from({length:12},(_,i)=>String(i+1))]) {
    assert.ok(form.includes('`'+label+'`'), 'Missing class dropdown option: '+label);
  }
  assert.match(form, /\{i && \(\s*<R label=\{`Subjects \(comma separated\)`\}/);
  assert.match(form, /subjects: i \? x\.split/);
  assert.match(form, /: \(e\?\.subjects \|\| \[\]\)/);
  assert.match(form, /already exists for the selected session/);
});

test('existing class definitions can be cleared without removing school data', () => {
  const src = source();
  const page = src.slice(src.indexOf('function Pr('), src.indexOf('function Fr('));
  assert.match(page, /Delete all classes/);
  assert.match(page, /window\.confirm/);
  assert.match(page, /n\(\{ \.\.\.e, classes: \[\] \}/);
  assert.doesNotMatch(page, /students: \[\]|teachers: \[\]|feePayments: \[\]/);
  assert.match(page, /\{s && t\.subjects\.length > 0 && \(/);
});

test('built school form and its mirrors use neutral status instead of false local save claim', () => {
  const built = read('assets/index-brightnexa-v2.js');
  assert.match(built, /i2 && \/\* @__PURE__ \*\/ w\.createElement\(R, \{ label: `Subjects \(comma separated\)`/);
  assert.match(built, /Save Class & Section/);
  assert.match(built, /Delete all classes/);
  assert.match(built, /School record/);
  for(const mirror of ['docs/assets/index-brightnexa-v2.js','app-extracted/dist/assets/index-brightnexa-v2.js'])
    assert.equal(read(mirror), built);
});
