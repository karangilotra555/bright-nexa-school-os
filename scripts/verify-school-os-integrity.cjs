#!/usr/bin/env node
'use strict';

/**
 * School OS Integrity & Architectural Rigor Verification Harness
 * Validates relational bindings, stream isolation, dropdown enforcements,
 * human name resolutions, photo propagations, and precache consistency.
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const read = (relPath) => fs.readFileSync(path.join(root, relPath), 'utf8');

const checks = [];

function check(name, fn) {
  try {
    fn();
    checks.push({ name, status: 'PASS' });
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    checks.push({ name, status: 'FAIL', error: err.message });
    console.error(`  [FAIL] ${name}`);
    console.error(`         ${err.message}`);
  }
}

console.log('\n======================================================');
console.log('  BRIGHT NEXA SCHOOL OS — ARCHITECTURAL INTEGRITY AUDIT');
console.log('======================================================\n');

// 1. Relational Stream Isolation in bn-store-sync.js
check('Stream Isolation: Class cascades do not co-modify Science & Commerce streams', () => {
  const { bnCascadeClassroomChanges } = require('../bn-store-sync.js');
  const oldClasses = [
    { id: 'c11-sci', name: 'Class 11', section: 'A', academicStream: 'Science' },
    { id: 'c11-comm', name: 'Class 11', section: 'A', academicStream: 'Commerce' }
  ];
  const newClasses = [
    { id: 'c11-sci', name: 'Class 11', section: 'A-Medical', academicStream: 'Science' },
    { id: 'c11-comm', name: 'Class 11', section: 'A', academicStream: 'Commerce' }
  ];
  const students = [
    { id: 's-sci', name: 'Rohan Sharma', className: 'Class 11', section: 'A', academicStream: 'Science' },
    { id: 's-comm', name: 'Ananya Gupta', className: 'Class 11', section: 'A', academicStream: 'Commerce' }
  ];
  const operations = {
    feeStructures: [
      { id: 'fs-sci', className: 'Class 11', category: 'Science Lab Fee', academicStream: 'Science', amount: 2000 },
      { id: 'fs-comm', className: 'Class 11', category: 'Commerce Accounts Fee', academicStream: 'Commerce', amount: 1500 }
    ],
    attendance: [
      { id: 'att-sci', studentId: 's-sci', className: 'Class 11', section: 'A', academicStream: 'Science', status: 'Present' },
      { id: 'att-comm', studentId: 's-comm', className: 'Class 11', section: 'A', academicStream: 'Commerce', status: 'Present' }
    ]
  };

  const res = bnCascadeClassroomChanges(oldClasses, newClasses, students, operations);
  const commStudent = res.updatedStudents.find(s => s.id === 's-comm');
  assert.equal(commStudent.section, 'A', 'Commerce student section must not be changed by Science update');
  assert.equal(commStudent.academicStream, 'Commerce');

  const commFee = res.updatedOperations.feeStructures.find(f => f.id === 'fs-comm');
  assert.equal(commFee.academicStream, 'Commerce');

  const commAtt = res.updatedOperations.attendance.find(a => a.id === 'att-comm');
  assert.equal(commAtt.section, 'A');
});

// 2. Dropdown Enforcement across AI Tools and Homework
check('Dropdown Enforcement: AI Teacher Tools & Homework modal enforce configured <select> options', () => {
  const src = read('app-extracted/src/BrightNexaApp.jsx');
  assert.match(src, /<R label=\{`Class \/ batch`\}>\s*<select/, 'AI Teacher Tools Class must be a select dropdown');
  assert.match(src, /<R label=\{`Subject`\}>\s*<select/, 'AI Teacher Tools Subject must be a select dropdown');
  assert.match(src, /<R label=\{`Class`\}>\s*<select/, 'Homework dialog Class must be a select dropdown');
  assert.match(src, /<R label=\{`Section`\}>\s*<select/, 'Homework dialog Section must be a select dropdown');
  assert.match(src, /<R label=\{`Subject`\}>\s*<select/, 'Homework dialog Subject must be a select dropdown');
});

// 3. Question Paper Diversity & Pools
check('Question Paper Generator: Multi-section distinct pools with no duplicate questions', () => {
  const src = read('app-extracted/src/BrightNexaApp.jsx');
  assert.match(src, /secAPool\s*=/, 'Dedicated diverse Section A pool');
  assert.match(src, /secBPool\s*=/, 'Dedicated diverse Section B pool');
  assert.match(src, /secCPool\s*=/, 'Dedicated diverse Section C pool');
  assert.doesNotMatch(src, /for\s*\(\s*let\s+e\s*=\s*0;\s*e\s*<\s*10;\s*e\+\+\s*\)\s*n\s*\+=\s*`\s*\$\{e\s*\+\s*1\}\.\s+Give one practical unit/, 'Must not have duplicate practical unit questions loop');
});

// 4. Teacher Human Name Resolution
check('Teacher Identity: Staff names resolved from user_metadata and local staff directory', () => {
  for (const file of ['teacher-access.js', 'docs/teacher-access.js']) {
    const js = read(file);
    assert.match(js, /function staffName\(/, `${file} must define staffName helper`);
    assert.match(js, /user_metadata\?\.full_name/, `${file} must check user_metadata.full_name`);
    assert.match(js, /options\('assignTeacher'/, `${file} must populate teacher dropdown`);
  }
  for (const file of ['teacher-access.html', 'docs/teacher-access.html']) {
    const html = read(file);
    assert.match(html, /Staff Account Profile/, `${file} must include Staff Account Profile card`);
    assert.match(html, /id="accountNameInput"/, `${file} must include Display Name input`);
  }
});

// 5. Student Photo Propagation
check('Photo Propagation: Uploaded student photos link to Marksheets, ID Cards and Report Cards', () => {
  for (const file of ['marksheet.html', 'marksheet-a4.html', 'docs/marksheet.html', 'docs/marksheet-a4.html']) {
    const html = read(file);
    assert.match(html, /photoDataUrl/, `${file} must support student photoDataUrl`);
    assert.match(html, /photoFrame\.innerHTML/, `${file} must render student photo frame`);
  }
  for (const file of ['id-card-a4.html', 'docs/id-card-a4.html']) {
    const html = read(file);
    assert.match(html, /s\.photoDataUrl\s*\|\|\s*s\.photoUrl/, `${file} must check student photo`);
  }
  const appSrc = read('app-extracted/src/BrightNexaApp.jsx');
  assert.match(appSrc, /l\.photoDataUrl\s*\?/, 'Report card preview must display student photoDataUrl');
});

// 6. Root and docs/ Mirror Consistency
check('Mirror Consistency: Cloud teacher portal root and docs/ files are bit-for-bit identical', () => {
  const rootHtml = read('teacher-access.html');
  const docsHtml = read('docs/teacher-access.html');
  assert.equal(rootHtml, docsHtml, 'teacher-access.html must match docs/teacher-access.html');

  const rootJs = read('teacher-access.js');
  const docsJs = read('docs/teacher-access.js');
  assert.equal(rootJs, docsJs, 'teacher-access.js must match docs/teacher-access.js');
});

// Summary
const passed = checks.filter(c => c.status === 'PASS').length;
const failed = checks.filter(c => c.status === 'FAIL').length;

console.log('\n------------------------------------------------------');
console.log(`  AUDIT RESULT: ${passed} PASSED, ${failed} FAILED (TOTAL: ${checks.length})`);
console.log('------------------------------------------------------\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('  All architectural integrity checks verified successfully.\n');
}
