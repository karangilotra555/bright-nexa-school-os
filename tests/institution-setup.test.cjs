'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('institution registration form offers only School and excludes Coaching Centre', () => {
  const jsx = read('app-extracted/src/BrightNexaApp.jsx');
  const bundle = read('assets/index-brightnexa-v2.js');
  const docsBundle = read('docs/assets/index-brightnexa-v2.js');
  const distBundle = read('app-extracted/dist/assets/index-brightnexa-v2.js');

  assert.equal(bundle, docsBundle, 'docs bundle must match root bundle');
  assert.equal(bundle, distBundle, 'dist bundle must match root bundle');

  // Verify setup form has School but not Coaching Centre
  const setupGridMatch = jsx.match(/className=\{`auth-form-grid setup-grid`\}[\s\S]*?<\/Component2277>/);
  assert.ok(setupGridMatch, 'Setup grid form must exist');
  assert.match(setupGridMatch[0], /<Component2207>\{`School`\}<\/Component2207>/);
  assert.doesNotMatch(setupGridMatch[0], /Coaching Centre/, 'Coaching Centre must be removed from setup form');

  // In bundle
  const bundleMatch = bundle.match(/auth-form-grid setup-grid[\s\S]*?Official school name/);
  assert.ok(bundleMatch, 'Setup form must exist in bundle');
  assert.match(bundleMatch[0], /`School`/);
  assert.doesNotMatch(bundleMatch[0], /`Coaching Centre`/, 'Coaching Centre must be removed from bundle setup form');
});
