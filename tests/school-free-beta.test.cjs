'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');

const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('free beta sends schools to the existing owner signup and provides a feedback path', () => {
  const html = read('school-beta.html');
  assert.equal(html, read('docs/school-beta.html'));
  const dom = new JSDOM(html);
  const links = [...dom.window.document.querySelectorAll('a')].map(a => a.getAttribute('href'));
  assert.ok(links.includes('./teacher-access.html?signup=1'));
  assert.ok(links.includes('./parent-app-download.html'));
  assert.ok(links.some(href => href.includes('/issues/new')));
  assert.match(dom.window.document.body.textContent, /no card required/i);
  dom.window.close();
});
