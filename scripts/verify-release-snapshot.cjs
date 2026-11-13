#!/usr/bin/env node
'use strict';
// A release gate, not a UI compiler: prevents shipping stale generated files,
// mismatched mirrors, and a Workbox revision for the wrong JavaScript bytes.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p));
const utf=p=>read(p).toString('utf8');
const hash=p=>crypto.createHash('sha256').update(read(p)).digest('hex');
const mirrors=[
 'index.html','sw.js','school-erp-entry.js','school-dashboard-integrity.js','school-workspace-controller.js',
 'school-workspace-cloud.js','school-online-guard.js','school-role-entry.js',
 'teacher-access.html','teacher-access.js','parents.html','parents-cloud.js',
 'assets/index-brightnexa-v2.js'
];
let verified=0;
for(const file of mirrors){
 const base=read(file);
 for(const prefix of ['docs/','app-extracted/dist/']){
  const target=path.join(root,prefix,file);
  if(!fs.existsSync(target))continue;
  assert.ok(base.equals(fs.readFileSync(target)),prefix+file+' differs from the published source');
  verified++;
 }
}
const sw=utf('sw.js');
function precache(url,file){
 const digest=hash(file),quoted='"url":"'+url+'","revision":"'+digest+'"',minified='url:"'+url+'",revision:"'+digest+'"';
 assert.ok(sw.includes(quoted)||sw.includes(minified),'Wrong Workbox checksum: '+url);
 verified++;
}
precache('assets/index-brightnexa-v2.js','assets/index-brightnexa-v2.js');
precache('index.html','index.html');
const index=utf('index.html'),entry=utf('school-erp-entry.js');
const m=index.match(/school-erp-entry\.js\?v=([A-Za-z0-9_-]+)/);
assert.ok(m,'No versioned ERP entry point in hosted index');
precache('school-erp-entry.js?v='+m[1],'school-erp-entry.js');
const dashVersion=index.match(/school-dashboard-integrity\.js\?v=([A-Za-z0-9_-]+)/);
assert.ok(dashVersion,'Versioned dashboard-integrity script missing');
precache('school-dashboard-integrity.js?v='+dashVersion[1],'school-dashboard-integrity.js');
const bundleRef=entry.match(/index-brightnexa-v2\.js\?v=([A-Za-z0-9_-]+)/);
assert.ok(bundleRef,'No versioned ERP bundle reference');
const source=utf('app-extracted/src/BrightNexaApp.jsx'),bundle=utf('assets/index-brightnexa-v2.js');
for(const body of [source,bundle]){
 assert.ok(body.includes('BN_CLOUD_CONFIRMED'),'School confirmation signal missing');
 assert.ok(!body.includes('BN_STORE_SYNC'),'Unverified cross-tab state broadcast is unsafe');
 assert.ok(body.includes('bn-cloud-recheck'),'A confirmed write must refresh other tabs');
 assert.ok(body.includes("Teacher is pending in this browser"),'Teacher cloud confirmation guard missing');
 const end=body.indexOf('async function bnInviteTeacherAppAccount'),start=body.lastIndexOf('function Cr(',end);
 assert.ok(start>=0&&end>start,'Teacher form component missing in release');
 const teacherForm=body.slice(start,end);
 assert.ok(/const teacherClassOptions = Array\.isArray\(/.test(teacherForm),'Save Teacher class options must come from class list');
 assert.ok(/new Set\(teacherClassOptions\.map\(/.test(teacherForm),'Teacher submit still uses form event as an array');
 assert.ok(!/new Set\(e\d*\.map\(/.test(teacherForm),'Teacher submit contains event.map runtime crash');
 assert.ok(teacherForm.includes('teacher-save-error-banner'),'Teacher errors must be visible without losing draft');
 assert.ok(teacherForm.includes('data-teacher-save-field'),'Required fields must be focused');
 assert.ok(teacherForm.includes('Subjects are required for assigned classes.'),'Teacher subjects check missing');
}
// Regression guard: previously delivered teacher actions must not disappear
// when fixing sync, photos or access. Both editable source and hosted bundle
// must expose the header edit shortcut and the existing footer Edit Profile.
for (const body of [source,bundle]) {
 const start=body.indexOf('function _Component10('),end=body.indexOf('function Tr(',start);
 assert.ok(start>=0&&end>start,'Faculty Profile component missing');
 const profile=body.slice(start,end);
 assert.ok(profile.includes('teacher-profile-edit-top'),'Teacher header edit button missing');
 assert.ok(profile.includes('Edit Teacher'),'Teacher header action text missing');
 assert.ok(profile.includes('Edit Profile'),'Existing footer edit action was removed');
 assert.ok(profile.includes('Create / Sync Teacher App Access'),'Teacher App activation action removed');
 assert.ok(profile.includes('Delete Profile'),'Delete action was removed');
 assert.ok(/onClick:\s*n2/.test(profile)||/onClick=\{n\}/.test(profile),'Teacher edit action not wired to handler');
 assert.ok(profile.includes('teacher-profile-modal'),'Profile modal missing');
 assert.ok(profile.includes('student-profile-modal'),'Teacher must share Student Profile layout');
 assert.ok(profile.includes('profile-detail-grid'),'Teacher details must use student-style grid');
 assert.ok(profile.includes('stored-identity-grid'),'Teacher Aadhaar documents must remain');
 assert.ok(!/\[`Teacher Photograph`,\s*e\d*\.photoDataUrl\]/.test(profile),'Duplicate teacher photograph restored');
 assert.ok(profile.includes('Aadhaar Card'),'Aadhaar documents missing');
 assert.ok(profile.includes('photoDataUrl'),'Teacher portrait missing from header');
 assert.ok(profile.includes('maximized')&&profile.includes('Maximize'),'Teacher profile maximize control missing');
}
const dash=utf('school-dashboard-integrity.js');
assert.ok(dash.includes('Teacher App access:'),'Dashboard must label Teacher App logins separately from faculty');
assert.ok(dash.includes("status:'eq.disabled'"),'Dashboard should count disabled teacher logins');
assert.ok(!dash.includes('Supabase active teachers:'),'Misleading teacher count label must not return');
const pkg=JSON.parse(utf('package.json'));
assert.equal(pkg.scripts.build,'node scripts/verify-release-snapshot.cjs','The build script cannot claim success without release checks');
console.log('Release-integrity checks passed: '+verified+' mirrored/precache artifacts, verified cloud-only cross-tab and teacher-save guards.');
