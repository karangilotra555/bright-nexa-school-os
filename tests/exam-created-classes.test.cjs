'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

test('examination class and section selectors use school-configured records', () => {
  const source = fs.readFileSync(path.join(root, 'app-extracted/src/BrightNexaApp.jsx'), 'utf8');
  const form = source.split('function Pi(')[1]?.split('function Fi(')[0];
  assert.ok(form, 'examination form must exist');
  assert.match(source, /<Pi[\s\S]*?classes=\{e\.classes\}[\s\S]*?students=\{t\}/);
  assert.ok(form.includes('buildDynamicClassList(configured, [], false)'), 'must use configured class names');
  assert.ok(form.includes('availableExamClasses.map'), 'must render configured class names');
  assert.ok(form.includes('availableExamSections.map'), 'must render sections belonging to selected class');
  assert.ok(form.includes('u(``);'), 'changing class must clear the old section');
  assert.ok(form.includes('Create and select a class in Add Class'), 'must stop saves with no real class');
  assert.doesNotMatch(form, /\[\s*`1`,\s*`2`,\s*`3`/, 'old numeric-only list must not return');
  const bundle = fs.readFileSync(path.join(root, 'assets/index-brightnexa-v2.js'), 'utf8');
  assert.ok(bundle.includes('availableExamClasses.map'), 'the shipped UI must be rebuilt');
  assert.ok(bundle.includes('availableExamSections.map'), 'the shipped UI must use real sections');
});
