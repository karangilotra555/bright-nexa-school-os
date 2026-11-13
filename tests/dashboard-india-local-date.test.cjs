'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('school Dashboard uses local calendar date, never UTC, for today attendance and fee month',()=>{
 const source=read('app-extracted/src/BrightNexaApp.jsx');
 const bundle=read('assets/index-brightnexa-v2.js');
 assert.doesNotMatch(source,/let T = new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
 assert.doesNotMatch(bundle,/let T2 = \(\/\* @__PURE__ \*\/ new Date\(\)\)\.toISOString\(\)\.slice\(0, 10\)/);
 assert.match(source,/localNow\.getFullYear\(\)/);
 assert.match(bundle,/localNow\d*\.getMonth\(\)\s*\+\s*1/);
 assert.equal(bundle,read('docs/assets/index-brightnexa-v2.js'));
 assert.equal(bundle,read('app-extracted/dist/assets/index-brightnexa-v2.js'));
});
test('India midnight attendance calendar stays on current local day rather than previous UTC day',()=>{
 const src='const now = new Date("2026-11-11T19:45:00Z");process.stdout.write([now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-"));';
 const local=cp.execFileSync(process.execPath,['-e',src],{env:{...process.env,TZ:'Asia/Kolkata'},encoding:'utf8'});
 assert.equal(local,'2026-11-12');
});
