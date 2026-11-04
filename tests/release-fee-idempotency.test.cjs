'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const safe=require('../school-fee-ledger.js');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const base={institution_id:'school-a',student_id:'student-a',kind:'payment',amount_rupees:3500,
 occurred_on:'2026-11-04',description:'Tuition',created_by:'accountant-a'};
test('reference stays identical for an uncertain fee request, changes for different details',()=>{
 const d=safe.draft(),a=d.prepare(base,''),b=d.prepare(base,'');
 assert.match(a.reference,/^BN-[0-9a-f-]+$/);
 assert.equal(a.reference,b.reference);
 assert.notEqual(d.prepare({...base,amount_rupees:3600},'').reference,a.reference);
 d.clear();assert.notEqual(d.prepare(base,'').reference,a.reference);
 assert.equal(safe.draft().prepare(base,'RCPT-001').reference,'RCPT-001');
});
test('single server acknowledged fee is accepted',async()=>{
 const d=safe.draft(),payload=d.prepare(base,'RCPT-001');
 const rec={...payload,id:'fee-1'};
 const result=await safe.save({payload,post:async()=>[rec],find:async()=>{throw Error('should not query')}});
 assert.deepEqual(result,{record:rec,recovered:false});
});
test('lost network response resolves existing payment by unique reference, without second POST',async()=>{
 const d=safe.draft(),payload=d.prepare(base,'RCPT-002');let posts=0,lookups=0;
 const result=await safe.save({payload,
  post:async()=>{posts++;throw Error('connection lost after database commit')},
  find:async r=>{lookups++;assert.equal(r,payload.reference);return [{...payload,id:'fee-2'}]}
 });
 assert.equal(result.recovered,true);
 assert.equal(posts,1);
 assert.equal(lookups,1);
});
test('same reference with conflicting amount must not be confirmed or inserted twice',async()=>{
 const payload=safe.draft().prepare(base,'RCPT-003');
 await assert.rejects(()=>safe.save({payload,
  post:async()=>{throw Error('duplicate key value violates unique constraint')},
  find:async()=>[{...payload,id:'fee-3',amount_rupees:100}]
 }),/different fee details/);
});
test('unconfirmed fee fails closed with original reference and no automatic retries',async()=>{
 const payload=safe.draft().prepare(base,'RCPT-004');let postCalls=0;
 await assert.rejects(()=>safe.save({payload,post:async()=>{postCalls++;throw Error('timeout')},find:async()=>[]}),/Do not change the amount or retry with a new reference/);
 assert.equal(postCalls,1);
});
test('owner, operations and offline shell load fee safety code with no service role',()=>{
 const html=read('docs/real-owner-workspace.html'),owner=read('docs/real-owner-workspace.js');
 const opsHtml=read('school-operations.html'),ops=read('school-operations.js'),sw=read('docs/owner-offline-sw.js');
 assert.ok(html.indexOf('school-fee-ledger.js')<html.indexOf('real-owner-workspace.js'));
 assert.ok(opsHtml.indexOf('school-fee-ledger.js')<opsHtml.indexOf('school-operations.js'));
 assert.equal(ops,read('docs/school-operations.js'));assert.equal(opsHtml,read('docs/school-operations.html'));
 assert.equal(read('school-fee-ledger.js'),read('docs/school-fee-ledger.js'));
 assert.match(owner,/fee\.save\(/);assert.match(ops,/feeSafety\.save\(/);
 assert.match(sw,/school-fee-ledger\.js/);
 for(const src of [owner,ops,read('docs/school-fee-ledger.js')])assert.doesNotThrow(()=>new vm.Script(src));
});
