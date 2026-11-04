const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const source = fs.readFileSync(path.join(root,'app-extracted/src/BrightNexaApp.jsx'),'utf8');
const bundles = ['assets/index-brightnexa-v2.js','docs/assets/index-brightnexa-v2.js','app-extracted/dist/assets/index-brightnexa-v2.js'].map(p => fs.readFileSync(path.join(root,p),'utf8'));
test('Pulse arrows route to corresponding existing School OS modules',()=>{
  for(const destination of ['Attendance','Fees','Exams & Marks','Growth Passport']){
    assert.ok(source.includes('onClick={() => se(`'+destination+'`)}'),destination+' missing in source');
    assert.ok(bundles.every(s=>s.includes('onClick: () => se(`'+destination+'`)')),destination+' missing in bundle');
  }
});
test('Pulse rows are keyboard accessible and preserve activity-row design',()=>{
  assert.ok(source.includes('role={`button`}'));
  assert.ok(source.includes('tabIndex={0}'));
  assert.ok(source.includes('event.key === `Enter`'));
  assert.ok(source.includes('event.key === ` `'));
  assert.ok(source.includes('className={`activity-row`}'));
  assert.ok(bundles.every(b=>b.includes('role: `button`')&&b.includes('tabIndex: 0')));
  assert.equal(bundles[0],bundles[1]);
  assert.equal(bundles[0],bundles[2]);
});
test('All three service workers reference the new mirrored bundle',()=>{
  const crypto = require('node:crypto');
  const expected = crypto.createHash('sha256').update(bundles[0]).digest('hex');
  const sws=['sw.js','docs/sw.js','app-extracted/dist/sw.js'].map(p=>fs.readFileSync(path.join(root,p),'utf8'));
  assert.ok(sws.every(s=>s.includes('url:"assets/index-brightnexa-v2.js",revision:"'+expected+'"')));
  assert.equal(sws[0],sws[1]);assert.equal(sws[0],sws[2]);
});
