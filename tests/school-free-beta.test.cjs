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

test('the beta page used by the WordPress plugin separates live school setup from role-based testing', () => {
  const dom = new JSDOM(read('school-beta.html'), { url: 'https://bright-nexa-school-os.onrender.com/school-beta.html' });
  try {
    const { document } = dom.window;
    const setup = document.querySelector('#school-setup');
    const guide = document.querySelector('#testing-guide');
    assert.ok(setup && guide, 'the page offers separate real-school setup and testing paths');
    const sections = [...guide.querySelectorAll('details summary')].map(summary => summary.textContent.trim());
    assert.deepEqual(sections, [
      'School setup, admissions and documents',
      'Staff, timetable and teaching',
      'Family access and published records',
      'Fees, expenses and reports',
      'Staff operations, transport and assets',
      'Teaching tools, progress and school quality',
      'Sync, permissions and recovery',
    ]);
    assert.match(setup.textContent, /real admission enquiries/i);
    assert.match(guide.textContent, /separate test school/i);
    assert.match(guide.textContent, /fictional student/i);
    assert.match(guide.textContent, /only their linked student/i);
    assert.match(guide.textContent, /no duplicate receipt/i);
    assert.match(read('wordpress/bright-nexa-school/bright-nexa-school.php'), /CLOUD \. '\/school-beta\.html'/);
    for (const link of document.querySelectorAll('a[href^="./"]')) {
      const target = new URL(link.href).pathname.slice(1);
      assert.equal(fs.existsSync(path.join(__dirname, '..', 'docs', target)), true, target);
    }
  } finally {
    dom.window.close();
  }
});
