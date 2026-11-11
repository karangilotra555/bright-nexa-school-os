'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('admin staff portal no longer repeats ERP navigation and marketing blocks',()=>{
 const js=read('teacher-access.js'),html=read('teacher-access.html');
 assert.match(js,/display\('schoolOsAdminNav',false\)/);
 assert.match(js,/display\('adminErpBanner',false\)/);
 assert.match(js,/portalStats'\)\)\$\('portalStats'\)\.classList\.toggle\('hidden',isAdmin\(\)\)/);
 assert.match(html,/id="portalStats"/);
 assert.match(html,/id="portalPermissionNotice"/);
 assert.doesNotMatch(html,/Your school summary is shown above/);
 assert.match(html,/id="loadProfile">View \/ edit student/);
 for(const f of ['teacher-access.js','teacher-access.html'])assert.equal(read('docs/'+f),read(f));
});

test('fee receipt is optional for humans, generated securely for cloud uniqueness',()=>{
 const js=read('teacher-access.js'),html=read('teacher-access.html');
 assert.match(html,/for="feeReference">Receipt \/ reference \(optional\)/);
 assert.doesNotMatch(html,/id="feeReference"[^>]*\srequired/);
 assert.match(js,/globalThis\.crypto\.randomUUID/);
 assert.match(js,/value\.trim\(\)\|\|newFeeReceipt\(\)/);
 assert.match(js,/feeRowsSaved\(rows\)/);
 assert.match(js,/reference:eq\(row\.reference\)/);
 assert.match(js,/student_id===row\.student_id/);
 assert.match(js,/Number\(record\.amount_rupees\)===Number\(row\.amount_rupees\)/);
});

test('fee entries expose Edit and audit-preserving atomic correction, not direct financial UPDATE',()=>{
 const js=read('teacher-access.js'),html=read('teacher-access.html');
 assert.match(html,/id="cancelFeeEdit"/);
 assert.match(html,/id="feeEditHint"/);
 assert.match(html,/<th>Action<\/th>/);
 assert.match(js,/dom\('button','✏ Edit','ghost'\)/);
 assert.match(js,/reference:'REV-'\+original\.id/);
 assert.match(js,/original\?feeCorrectionRows\(original,replacement\):\[replacement\]/);
 assert.match(js,/await api\('school_fee_entries','','POST',original\?rows:rows\[0\]\)/);
 assert.doesNotMatch(js,/api\('school_fee_entries'[^\n]*'(PATCH|PUT|DELETE)'/);
 assert.match(js,/editingFeeEntry=null/);
});

test('every authorized ERP Dashboard deeplink intentionally opens cloud backup-first',()=>{
 const entry=read('school-erp-entry.js');
 assert.match(entry,/url\.searchParams\.set\('openSchool','true'\);/);
 assert.doesNotMatch(entry,/if\(!url\.searchParams\.has\('tab'\)\)url\.searchParams\.set/);
 for(const p of ['docs/','app-extracted/dist/'])assert.equal(read(p+'school-erp-entry.js'),entry);
 const crypto=require('node:crypto');
 const digest=crypto.createHash('sha256').update(entry).digest('hex');
 for(const p of ['','docs/','app-extracted/dist/']){
  assert.ok(read(p+'sw.js').includes('"url":"school-erp-entry.js?v=20261111-portrait-compact-v1","revision":"'+digest+'"'));
 }
});
