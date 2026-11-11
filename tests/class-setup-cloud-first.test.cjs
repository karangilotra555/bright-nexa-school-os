'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(base, name), 'utf8');
const cloud = require('../school-workspace-cloud.js');

test('classes are created deliberately and only configured classes appear in admission', () => {
  const src = read('app-extracted/src/BrightNexaApp.jsx');
  const form = src.split('function Fr(')[1].split('function Ir(')[0];
  const admission = src.split('function _Component6(')[1].split('function _Component7(')[0];
  for (const name of ['Nursery','LKG','UKG',...'123456789'.split(''),'10','11','12']) {
    assert.ok(form.includes('`' + name + '`'), name + ' missing from class dropdown');
  }
  assert.match(admission, /return configured\.length \? buildDynamicClassList\(configured, \[\], false\) : \[\]/);
  assert.doesNotMatch(src, /function zr\(e\)/, 'unused hardcoded 9-12 sample classes must not be present');
});

test('school class dialog does not request subjects or silently erase old subject assignments', () => {
  const src = read('app-extracted/src/BrightNexaApp.jsx');
  const form = src.split('function Fr(')[1].split('function Ir(')[0];
  assert.match(form, /\{i && \(\s*<R label=\{`Subjects \(comma separated\)`\}/);
  assert.match(form, /subjects: i \? x\.split/);
  assert.match(form, /\(e\?\.subjects \|\| \[\]\)/);
  assert.match(src, /School record/);
  assert.doesNotMatch(src, /<Component384>\{`Saved locally`\}<\/Component384>/);
  assert.match(src, /controller\.state\(\)\.schoolId !== selectedSchool\.id/);
});

test('class academic session is projected to the authoritative Supabase school_classes year', () => {
  const snapshot = {
    institution: { institution: { id: 'test-school', name: 'School', session: '2026-2027' } },
    students: [],
    operations: { classes: [
      { id: 'c1', name: '2', section: 'A', academicSession: '2027-2028', subjects: [] }
    ] }
  };
  const projection = cloud.buildProjection(snapshot, () => []);
  assert.deepEqual(projection.classes.map(c => [c.name,c.section,c.academicYear]), [['2','A','2027-2028']]);
  assert.deepEqual(cloud.buildProjection({ ...snapshot,operations:{ classes:[] } }, () => []).classes, []);
});

test('all shipped UI and cloud files match, with cache-busting versions', () => {
  const paths = ['','docs/','app-extracted/dist/'];
  for (const name of ['assets/index-brightnexa-v2.js','school-workspace-cloud.js','school-erp-entry.js']) {
    for (const dir of paths) assert.equal(read(dir+name), read(name));
  }
  for (const dir of paths) {
    const index = read(dir+'index.html');
    const sw = read(dir+'sw.js');
    assert.match(index, /school-workspace-cloud\.js\?v=20261111-autoretry-v1/);
    assert.match(index, /school-erp-entry\.js\?v=20261111-teacher-confirm-v1/);
    assert.match(sw, /school-workspace-cloud\.js\?v=20261111-autoretry-v1/);
    assert.match(sw, /school-erp-entry\.js\?v=20261111-teacher-confirm-v1/);
    assert.match(read(dir+'school-erp-entry.js'), /index-brightnexa-v2\.js\?v=20261111-teacher-confirm-v1/);
  }
});
