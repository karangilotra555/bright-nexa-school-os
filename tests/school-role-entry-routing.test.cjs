'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {roleDestination,preferredView}=require('../school-role-entry.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('verified single-school admin enters existing full ERP by default',()=>{
 assert.equal(roleDestination({role:'school_admin',verified:true,membershipCount:1,search:''}),'./index.html?openSchool=true');
 assert.equal(roleDestination({role:'school_admin',verified:true,membershipCount:1,search:'?school=abc'}),'./index.html?openSchool=true');
});
test('unverified identity, absent membership and multiple-school choice never skip staff selector',()=>{
 for(const x of [
  {role:'school_admin',verified:false,membershipCount:1},
  {role:'school_admin',verified:true,membershipCount:0},
  {role:'school_admin',verified:true,membershipCount:2},
  {role:'teacher',verified:true,membershipCount:1},
  {role:'accountant',verified:true,membershipCount:1},
  {role:'transport_staff',verified:true,membershipCount:1}
 ])assert.equal(roleDestination(x),null,JSON.stringify(x));
});
test('explicit staff links avoid admin login redirect loops',()=>{
 for(const search of ['?view=timetable','?view=admin','?view=account','?staffPortal=1']){
  assert.equal(roleDestination({role:'school_admin',verified:true,membershipCount:1,search}),null);
 }
});
test('librarian with verified membership reaches library; explicit account link stays in staff portal',()=>{
 assert.equal(roleDestination({role:'librarian',verified:true,membershipCount:1,search:''}),'./library.html');
 assert.equal(roleDestination({role:'librarian',verified:true,membershipCount:1,search:'?view=account'}),null);
});
test('all seven real school roles have appropriate landing views',()=>{
 const expected={school_admin:'classes',principal:'classes',teacher:'attendance',accountant:'fees',librarian:'account',receptionist:'profiles',transport_staff:'notices'};
 for(const [role,view] of Object.entries(expected))assert.equal(preferredView(role),view);
 assert.equal(preferredView('fabricated-role'),'account');
});
test('Render and root staff assets remain mirrored and role logic is wired',()=>{
 assert.equal(read('teacher-access.js'),read('docs/teacher-access.js'));
 assert.equal(read('teacher-access.html'),read('docs/teacher-access.html'));
 assert.equal(read('school-role-entry.js'),read('docs/school-role-entry.js'));
 for(const html of ['teacher-access.html','docs/teacher-access.html']){
  const source=read(html);
  assert.match(source,/school-role-entry\.js/);
  assert.match(source,/id="feesTab"/);
  assert.match(source,/id="feeEntryForm"/);
  assert.match(source,/id="staffDesktopShortcut"/);
 }
});
test('staff code uses server verified member identity, restrictions and fee RPC',()=>{
 const src=read('teacher-access.js');
 assert.match(src,/verified:me\.status==='active'&&me\.auth_user_id===identity\.id/);
 assert.match(src,/if\(tabName==='admin'\)return role==='school_admin'/);
 assert.match(src,/if\(tabName==='fees'\)return role==='school_admin'\|\|role==='accountant'/);
 assert.match(src,/school_fee_summary/);
 assert.match(src,/created_by:me\.id/);
 assert.match(src,/feeEntryForm/);
 for(const forbidden of [/role:params\.get\('role'\)/,/localStorage\.getItem\('role'\)/])assert.doesNotMatch(src,forbidden);
});
test('index does not auto open full ERP just because any role has a staff token',()=>{
 for(const page of ['index.html','docs/index.html']){
  assert.doesNotMatch(read(page),/if\s*\(staff&&staff\.access_token\)/);
 }
 assert.match(read('parents-download-menu.js'),/teacher-access\.html\?staffPortal=1/);
 assert.equal(read('parents-download-menu.js'),read('docs/parents-download-menu.js'));
});
