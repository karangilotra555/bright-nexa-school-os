'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  buildDynamicClassList,
  buildDynamicSectionList,
  bnCascadeStudentChanges
} = require('../bn-store-sync.js');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('buildDynamicSectionList only returns configured sections and does not inject hardcoded A/B/C/D', () => {
  const configuredClasses = [
    { name: 'Class 5', section: 'Rose' },
    { name: 'Class 5', section: 'Lotus' },
    { name: 'Class 6', section: 'A' },
    { name: 'Class 6', section: 'B' }
  ];

  const class5Sections = buildDynamicSectionList('Class 5', configuredClasses, []);
  assert.deepEqual(class5Sections, ['Lotus', 'Rose']);
  assert.equal(class5Sections.includes('C'), false, 'Should not inject hardcoded C');
  assert.equal(class5Sections.includes('D'), false, 'Should not inject hardcoded D');

  // Fallback when no section configured
  const emptySections = buildDynamicSectionList('Class 1', [], []);
  assert.deepEqual(emptySections, ['A']);
});

test('buildDynamicClassList with includeStandards=false strictly restricts to configured classes', () => {
  const configuredClasses = [
    { name: 'Class 8', section: 'A' },
    { name: 'Class 9', section: 'B' }
  ];

  const strictList = buildDynamicClassList(configuredClasses, [], false);
  assert.deepEqual(strictList, ['Class 8', 'Class 9']);
  assert.equal(strictList.includes('Nursery'), false);
  assert.equal(strictList.includes('1'), false);
});

test('marksheet.html and marksheet-a4.html link to real student marks, attendance and photos', () => {
  const files = ['marksheet.html', 'marksheet-a4.html', 'docs/marksheet.html', 'docs/marksheet-a4.html'];
  for (const f of files) {
    const content = read(f);
    assert.doesNotMatch(content, /72\s*\+\s*\(\(idx\s*\*\s*7/, `${f} must not contain invented marks formula`);
    assert.doesNotMatch(content, /202\s*\/\s*212\s*Days/, `${f} must not contain hardcoded attendance`);
    if(f.includes('marksheet-a4.html')){
      assert.match(content,/bn_school_published_marksheets/,f+' must read published exam marks');
      assert.match(content,/school_workspace_links/,f+' must map local to cloud student ID');
      assert.doesNotMatch(content,/localStorage\.getItem/,f+' must not use local draft marks');
      assert.match(content,/photoFrame\.append\(img\)/,f+' must render safe student photo');
    }else{
      assert.match(content,/operations\.marks/,f+' must read marks');
      assert.match(content,/operations\.attendance/,f+' must read attendance');
      assert.match(content,/photoDataUrl/,f+' must have photo');
      assert.match(content,/photoFrame\.innerHTML/,f+' must render photo');
    }
  }
});

test('id-card-a4.html displays student photoDataUrl', () => {
  const files = ['id-card-a4.html', 'docs/id-card-a4.html', 'app-extracted/dist/id-card-a4.html'];
  for (const f of files) {
    const content = read(f);
    assert.match(content, /s\.photoDataUrl\s*\|\|\s*s\.photoUrl/, `${f} must check s.photoDataUrl`);
  }
});

test('BrightNexaApp report card Hi displays uploaded photo and realistic roll number fallback', () => {
  const src = read('app-extracted/src/BrightNexaApp.jsx');
  assert.match(src, /l\.photoDataUrl\s*\?/, 'Hi report card preview must check l.photoDataUrl');
  assert.match(src, /l\.rollNumber\s*\|\|\s*`-`/, 'Roll number fallback must be dash rather than 06');
});

test('AI Teacher Tools generate distinct structured templates for each of the 10 tools', () => {
  const src = read('app-extracted/src/BrightNexaApp.jsx');
  const expectedSignatures = [
    'LESSON PLAN:',
    'PRACTICE WORKSHEET:',
    'ANNUAL / PERIODIC EXAMINATION:',
    'DAILY HOMEWORK ASSIGNMENT:',
    'STUDENT PERFORMANCE REMARKS',
    'OFFICIAL PARENT COMMUNICATION',
    'INDIVIDUALIZED REMEDIAL ACTION PLAN',
    'COLLABORATIVE & EXPERIENTIAL CLASSROOM ACTIVITIES',
    'DIAGNOSTIC CLASS TEST:',
    'OFFICIAL SCHOOL CIRCULAR'
  ];

  for (const sig of expectedSignatures) {
    assert.ok(src.includes(sig), `Must contain distinct template for ${sig}`);
  }
});

test('Smart Timetable Generator links School OS classes, subjects and uses polished focus styles', () => {
  for (const file of ['smart-tools-ui.js', 'docs/smart-tools-ui.js']) {
    const js = read(file);
    assert.match(js, /loadSchoolOsContext/, `${file} must load School OS context`);
    assert.match(js, /bright-nexa-school-os:operations:v1/, `${file} must read operations context`);
    assert.match(js, /ttClassesList/, `${file} must populate ttClassesList`);
    assert.match(js, /ttSubjectsList/, `${file} must populate ttSubjectsList`);
  }

  for (const file of ['smart-tools.html', 'docs/smart-tools.html']) {
    const html = read(file);
    assert.doesNotMatch(html, /:focus-visible\{[^}]*#ff7818/, `${file} must not use harsh orange focus outline`);
    assert.match(html, /0284c7/, `${file} must use school primary blue focus outline`);
  }
});

test('AI Teacher Tools and Homework dialog use dropdown selectors populated from configured classes and subjects', () => {
  const src = read('app-extracted/src/BrightNexaApp.jsx');
  // AI Teacher Tools Ea component
  assert.match(src, /function Ea\(\{ data, students \} = \{\}\)/, 'Ea must accept school data and students');
  assert.match(src, /<R label=\{`Class \/ batch`\}>\s*<select/, 'AI Teacher Tools Class must be a select dropdown');
  assert.match(src, /<R label=\{`Subject`\}>\s*<select/, 'AI Teacher Tools Subject must be a select dropdown');
  assert.match(src, /<Ea data=\{i\} students=\{y\} \/>/, 'Ds must pass school data and students to Ea');

  // Homework dialog Ii component
  assert.match(src, /function Ii\(\{ initial: e, onClose: t, onSave: n, classes = \[\] \}\)/, 'Ii must accept configured classes');
  assert.match(src, /<R label=\{`Class`\}>\s*<select/, 'Homework dialog Class must be a select dropdown');
  assert.match(src, /<R label=\{`Section`\}>\s*<select/, 'Homework dialog Section must be a select dropdown');
  assert.match(src, /<R label=\{`Subject`\}>\s*<select/, 'Homework dialog Subject must be a select dropdown');

  // Question Paper generator distinct non-repeating pools
  assert.match(src, /secAPool\s*=/, 'Question paper must have dedicated diverse Section A pool');
  assert.match(src, /secBPool\s*=/, 'Question paper must have dedicated diverse Section B pool');
  assert.match(src, /secCPool\s*=/, 'Question paper must have dedicated diverse Section C pool');
});


