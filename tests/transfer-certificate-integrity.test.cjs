'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('transfer certificate never invents fake issuance, dates or school results',()=>{
 const src=read('tc-certificate-a4.html');
 assert.doesNotMatch(src,/TC-2026-NaN|parseInt\(s\.id/);
 assert.doesNotMatch(src,/AARAV SHARMA|ANANYA VERMA|ROHAN MEHTA|PRIYA CHOUDHARY/);
 assert.doesNotMatch(src,/PROMOTED TO CLASS VII|212 DAYS|202 DAYS \(95\.3%\)|PARENTS' TRANSFER TO ANOTHER CITY/);
 assert.doesNotMatch(src,/MARCH 2026 \(FULL DUES CLEARED/);
 assert.match(src,/let students = \[\]/);
 assert.match(src,/set\('tcNo','Not issued'\)/);
 assert.match(src,/set\('tcFeeStatus','Not verified'\)/);
 assert.match(src,/function printVerifiedTC\(\)/);
 assert.match(src,/if\(!rosterReady\)/);
 for(const folder of ['docs/','app-extracted/dist/'])assert.equal(read(folder+'tc-certificate-a4.html'),src);
});
