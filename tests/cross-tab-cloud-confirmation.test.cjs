'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('unverified student/teacher records never propagate across browser tabs',()=>{
 for(const file of ['app-extracted/src/BrightNexaApp.jsx','assets/index-brightnexa-v2.js']){
  const s=read(file),sender=s.slice(s.indexOf('function bnBroadcastStoreSync('),s.indexOf('function bnBroadcastCloudConfirmed('));
  assert.ok(!sender.includes('postMessage('),file+' cannot transmit unsaved records');
  assert.ok(!s.includes('BN_STORE_SYNC'),file+' must ignore unsafe legacy events');
  assert.ok(s.includes('BN_CLOUD_CONFIRMED'));
  assert.ok(s.includes('bnBroadcastCloudConfirmed(latestWorkspace.current)'));
  assert.ok(s.includes('bn-cloud-recheck'));
  assert.ok(s.includes('event.data.institutionId !== currentId'));
  assert.ok(!/if \(event\.data\.students\) [a-z0-9]+\(event\.data\.students\)/i.test(s),'remote local state cannot hydrate');
 }
 for(const file of ['docs/assets/index-brightnexa-v2.js','app-extracted/dist/assets/index-brightnexa-v2.js'])assert.equal(read(file),read('assets/index-brightnexa-v2.js'));
});
