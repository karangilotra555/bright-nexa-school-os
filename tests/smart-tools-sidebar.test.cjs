const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const bundles = ['assets/index-brightnexa-v2.js', 'docs/assets/index-brightnexa-v2.js', 'app-extracted/dist/assets/index-brightnexa-v2.js'];
test('Smart Tools appears immediately below AI Teacher Tools in the sidebar', () => {
  for (const file of ['app-extracted/src/BrightNexaApp.jsx', ...bundles]) {
    const content = read(file);
    const ai = content.indexOf('label: `AI Teacher Tools`');
    const smart = content.indexOf('label: `Smart Tools`');
    const desk = content.indexOf('label: `Opportunity Desk`');
    assert.ok(ai >= 0 && ai < smart && smart < desk, file);
    assert.ok(smart - ai < 150, file);
  }
});
test('Smart Tools is rendered in current School OS workspace and all bundles agree', () => {
  assert.ok(read('app-extracted/src/BrightNexaApp.jsx').includes('c === `Smart Tools` ? (' ));
  for (const file of bundles) {
    assert.ok(read(file).includes('c2 === `Smart Tools` ?'), file);
    assert.ok(read(file).includes('smart-tools.html?embedded=1'), file);
  }
  assert.equal(read(bundles[0]),read(bundles[1]));
  assert.equal(read(bundles[0]),read(bundles[2]));
});
test('Embedded tools hide only the duplicate header', () => {
  for (const prefix of ['', 'docs/']) {
    assert.ok(read(prefix+'smart-tools-ui.js').includes("get('embedded')==='1'"));
    assert.ok(read(prefix+'smart-tools.html').includes('html.school-os-embedded header{display:none}'));
  }
});
test('Service workers allow Smart Tools navigation rather than redirect to dashboard', () => {
  for (const prefix of ['', 'docs/', 'app-extracted/dist/'])
    assert.ok(read(prefix+'sw.js').includes('/smart-tools.*\\.html$/i'));
});
