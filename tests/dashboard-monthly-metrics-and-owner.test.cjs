'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('Dashboard fee totals and receipt counts use identical current-month criterion',()=>{
 const source=read('app-extracted/src/BrightNexaApp.jsx');
 const pred="e.status !== `Reversed` && String(e.paymentDate || ``).startsWith(D)";
 assert.ok(source.includes(pred),'both amount and receipts should use guarded current-month date');
 assert.equal(source.split(pred).length-1,2,'same predicate in monthly total and receipt count');
 const filter=new Function('payments','D',"return payments.filter(e=>"+pred+");");
 const rows=[
 {status:'Paid',paymentDate:'2026-11-12',amount:250},
 {status:'Paid',paymentDate:'2026-10-30',amount:300},
 {status:'Reversed',paymentDate:'2026-11-12',amount:100},
 {status:'Paid',amount:75},
 {status:'Paid',paymentDate:null,amount:50}
 ];
 const month=filter(rows,'2026-11');
 assert.equal(month.length,1);
 assert.equal(month.reduce((n,r)=>n+r.amount,0),250);
});
test('Dashboard starts with a neutral owner label when display name not supplied',()=>{
 const source=read('app-extracted/src/BrightNexaApp.jsx');
 assert.ok(source.includes('g?.name?.split(` `)[0] ?? `School Admin`'));
 assert.doesNotMatch(source,/g\?\.name\?\.split\(` `\)\[0\] \?\? `Rajesh`/);
});
test('all Dashboard released bundles match current source-backed statements',()=>{
 const bundles=['assets/index-brightnexa-v2.js','docs/assets/index-brightnexa-v2.js','app-extracted/dist/assets/index-brightnexa-v2.js'].map(read);
 assert.equal(bundles[0],bundles[1]);assert.equal(bundles[0],bundles[2]);
 assert.ok(bundles[0].includes('String(e3.paymentDate || ``).startsWith(D2)'));
 assert.ok(bundles[0].includes('receipts this month'));
 assert.ok(bundles[0].includes('g2?.name?.split(` `)[0] ?? `School Admin`'));
});
