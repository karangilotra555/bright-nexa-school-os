'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const sources = ['app-extracted/src/BrightNexaApp.jsx', 'assets/index-brightnexa-v2.js'];
const normalizeClassName = value => String(value || '').trim().toLowerCase().replace(/^class\s*/i, '');
const normalizeSection = value => String(value || '').trim().toUpperCase();

function isolate(source, first, next, symbol) {
  const start = source.indexOf(first), end = source.indexOf(next, start);
  assert.ok(start >= 0 && end > start, 'Missing executable ' + symbol);
  const scope = {
    normalizeClassName, normalizeSection,
    isClassMatch: (a, b) => normalizeClassName(a) === normalizeClassName(b),
    Set, Array, String, JSON
  };
  vm.runInNewContext(source.slice(start, end) + '\nthis.fn=' + symbol + ';', scope, { timeout: 2000 });
  return scope.fn;
}

test('Senior admission dropdown only offers sections configured for the selected stream', () => {
  for (const path of sources) {
    const source = read(path);
    const sections = isolate(source, 'function buildDynamicSectionList(', 'function bnGetApiBase(', 'buildDynamicSectionList');
    const classes = [
      { name: '11', section: 'A', academicStream: 'Science', status: 'Active' },
      { name: '11', section: 'B', academicStream: 'Commerce', status: 'Active' },
      { name: '11', section: 'C', academicStream: 'Science', status: 'Inactive' },
      { name: '12', section: 'A', academicStream: 'Commerce', status: 'Active' },
      { name: '10', section: 'A', status: 'Active' }
    ];
    const students = [{ className: '11', section: 'D', academicStream: 'Science' }];
    assert.deepEqual(Array.from(sections('11', classes, students, 'Science')), ['A']);
    assert.deepEqual(Array.from(sections('11', classes, students, 'Commerce')), ['B']);
    assert.deepEqual(Array.from(sections('12', classes, students, 'Commerce')), ['A']);
    assert.deepEqual(Array.from(sections('11', classes, students, '')), []);
    assert.deepEqual(Array.from(sections('10', classes, [], '')), ['A']);
    assert.match(source, /buildDynamicSectionList\(i\d*\.className, classes, e\d*, i\d*\.academicStream/);
  }
});

test('Senior attendance never treats a missing stream as a wildcard', () => {
  for (const path of sources) {
    const source = read(path);
    const belongs = isolate(source, 'function isStudentInClass(', 'function bnCascadeClassroomChanges(', 'isStudentInClass');
    const science = { name: '11', section: 'A', academicStream: 'Science' };
    const commerce = { name: '11', section: 'A', academicStream: 'Commerce' };
    const child = { className: '11', section: 'A', academicStream: 'Science' };
    assert.equal(belongs(child, science), true);
    assert.equal(belongs(child, commerce), false);
    assert.equal(belongs({ ...child, academicStream: '' }, science), false);
    assert.equal(belongs({ ...child, academicStream: undefined }, commerce), false);
    assert.equal(belongs({ ...child, academicStream: 'Commerce' }, commerce), true);
    assert.equal(belongs({ className: '10', section: 'A' }, { name: '10', section: 'A' }), true);
    assert.match(source, /classKey\(cl\.name, cl\.section, cl\.academicStream\)/);
    assert.match(source, /const key = classKey\(stu\.className, stu\.section, stu\.academicStream\)/);
  }
});

test('Homework requires a matching senior class, section, stream and subject', () => {
  for (const path of sources) {
    const source = read(path);
    const start = source.indexOf('function Ii('), end = source.indexOf('function Li(', start);
    assert.ok(start >= 0 && end > start);
    const form = source.slice(start, end);
    assert.match(form, /seniorHomework/);
    assert.match(form, /currentClassObj = configuredClasses\.find/);
    assert.match(form, /c\.academicStream|c3\.academicStream/);
    assert.match(form, /selectedSubject/);
    assert.match(form, /selectedSection/);
    assert.match(form, /!currentClassObj \|\| !selectedSection \|\| !selectedSubject/);
    assert.match(form, /subject: selectedSubject/);
    assert.match(form, /section: selectedSection/);
  }
});

test('Student and parent class labels display the stream, with mirrored mobile assets', () => {
  const cloud = read('parents-cloud.js');
  const html = read('parents.html');
  const portal = read('portal.js');
  assert.match(cloud, /academicStream:classes\[0\]\?\.academic_stream/);
  assert.match(html, /s\.academicStream\]\.filter\(Boolean\)\.join/);
  assert.match(portal, /dashClassSec:\[student\.className,student\.section,student\.academicStream\]/);
  assert.match(portal, /cardBadge:\[student\.className,student\.section,student\.academicStream\]/);
  for (const dir of ['docs/', 'app-extracted/dist/']) {
    for (const file of ['parents-cloud.js', 'parents.html', 'portal.js', 'assets/index-brightnexa-v2.js']) {
      if (fs.existsSync(path.join(__dirname, '..', dir + file)))
        assert.equal(read(dir + file), read(file), 'Published mirror differs: ' + dir + file);
    }
  }
});
