'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const nav=require('../docs/school-owner-navigation.js');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const html=read('docs/real-owner-workspace.html');
const owner=read('docs/real-owner-workspace.js');
const settings=read('docs/school-owner-settings.js');
const css=read('docs/school-owner-shell.css');
function count(id){return (html.match(new RegExp('id="'+id+'"','g'))||[]).length;}
test('grouped sidebar retains all 24 original school module names exactly once',()=>{
 const match=owner.match(/const menus=\[([^\]]+)\];/);
 assert.ok(match,'original school menu missing');
 const original=[...match[1].matchAll(/'([^']+)'/g)].map(x=>x[1]);
 assert.equal(original.length,24);
 assert.equal(nav.ALL.length,24);
 assert.equal(new Set(nav.ALL).size,24);
 assert.deepEqual(new Set(nav.ALL),new Set(original));
 assert.equal(nav.GROUPS.length,8);
 assert.deepEqual(nav.GROUPS[nav.GROUPS.length-1].items,['Settings','Contact & Support']);
 assert.deepEqual(nav.matching('fee').flatMap(x=>x.items),['Fees']);
 assert.deepEqual(nav.matching('academics').flatMap(x=>x.items),nav.GROUPS.find(x=>x.title==='Academics').items);
 assert.equal(nav.matching('invalid element').length,0);
});
test('school-scoped personal preferences validate values and never grant permissions',()=>{
 assert.deepEqual(nav.prefs(null),{density:'comfortable',landing:'Dashboard'});
 assert.deepEqual(nav.prefs({density:'compact',landing:'Fees'}),{density:'compact',landing:'Fees'});
 assert.deepEqual(nav.prefs({density:'super-user',landing:'Administration'}),{density:'comfortable',landing:'Dashboard'});
 assert.notEqual(nav.preferenceKey('school-one','owner-one'),nav.preferenceKey('school-two','owner-one'));
 assert.throws(()=>nav.preferenceKey(null,'owner-one'),/Verified/);
});
test('backup and offline buttons live in Settings, not in header or dashboard',()=>{
 const topbar=html.slice(html.indexOf('<div class="topbar">'),html.indexOf('<div class="content">'));
 const dashboard=html.slice(html.indexOf('<div id="dash">'),html.indexOf('<section id="settingsWorkspace"'));
 for(const id of ['backupFolder','backupNow','backupVerify','backupRecovery','backupReauthorize','backupImportKey','enableOffline','backupStatus','localStatus']){
   assert.equal(count(id),1,id+' must have a single stable ID');
   assert.ok(!topbar.includes('id="'+id+'"'),id+' was wrongly placed in topbar');
   assert.ok(!dashboard.includes('id="'+id+'"'),id+' was wrongly placed in dashboard');
 }
 const backup=html.slice(html.indexOf('data-settings-page="backup"'),html.indexOf('data-settings-page="offline"'));
 const offline=html.slice(html.indexOf('data-settings-page="offline"'),html.indexOf('data-settings-page="appearance"'));
 for(const id of ['backupFolder','backupNow','backupVerify','backupRecovery','backupReauthorize','backupImportKey','backupStatus'])assert.ok(backup.includes('id="'+id+'"'));
 assert.ok(offline.includes('id="enableOffline"'));
 assert.ok(offline.includes('id="localStatus"'));
 assert.ok(topbar.includes('id="openSettings"'));
 assert.ok(!html.includes('id="backupPanel"'));
});
test('Settings offers six working sections, real role/password links, school editing and browser preferences',()=>{
 const tabs=['school','access','backup','offline','appearance','help'];
 for(const tab of tabs){
   assert.equal((html.match(new RegExp('data-settings-tab="'+tab+'"','g'))||[]).length,1);
   assert.equal((html.match(new RegExp('data-settings-page="'+tab+'"','g'))||[]).length,1);
 }
 for(const id of ['settingsIdentityForm','settingsSchoolName','settingsSaveSchoolName',
   'settingsContactForm','settingsPhone','settingsSavePhone','settingsOwnerEmail',
   'settingsLanding','settingsDensity','settingsAppearanceStatus','settingsSchoolId']){
    assert.equal(count(id),1,id);
 }
 assert.ok(html.includes('./index.html?view=roles'));
 assert.ok(html.includes('./index.html?view=account'));
 assert.ok(settings.includes("context.req('institutions?'"));
 assert.ok(settings.includes("context.req('school_contact_profiles?'"));
 assert.ok(settings.includes('rows.length!==1'),'confirmed cloud updates required');
 assert.ok(settings.includes('localStorage.setItem(preferenceKey'));
 assert.ok(settings.includes('data-settings-tab'));
 assert.doesNotMatch(settings,/service_role|sb_secret_|password:|hardcodedPassword/);
});
test('responsive group navigation, module search and settings trigger are wired into owner app',()=>{
 for(const id of ['ownerSidebar','mobileMenuToggle','menuSearch','menu','settingsWorkspace','openSettings','refresh','logout'])assert.equal(count(id),1,id);
 assert.match(owner,/navigation\?\.matching\(search\)/);
 assert.match(owner,/\$\('menuSearch'\)\.addEventListener\('input'/);
 assert.match(owner,/\$\('openSettings'\)\.addEventListener\('click'/);
 assert.match(owner,/view\('settingsWorkspace',name==='Settings'\)/);
 assert.match(owner,/BrightNexaSettings\?\.attach/);
 assert.match(owner,/BrightNexaSettings\?\.refresh/);
 assert.match(owner,/BrightNexaAutoBackup\?\.attach/);
 assert.match(owner,/BrightNexaAutoBackup\?\.afterReload/);
 assert.match(css,/@media\(max-width:850px\)/);
 assert.match(css,/owner-density="compact"/);
 assert.match(css,/\.settings-layout/);
});
test('settings and nav scripts load before owner, offline cache covers assets, all modules parse',()=>{
 const source=html.indexOf('school-owner-navigation.js'),screen=html.indexOf('school-owner-settings.js'),ownerFile=html.indexOf('real-owner-workspace.js');
 assert.ok(source>=0&&screen>source&&ownerFile>screen);
 assert.ok(html.includes('school-owner-shell.css'));
 const serviceWorker=read('docs/owner-offline-sw.js');
 for(const item of ['school-owner-shell.css','school-owner-navigation.js','school-owner-settings.js'])assert.ok(serviceWorker.includes(item));
 assert.match(serviceWorker,/bright-nexa-owner-shell-v6/);
 for(const source of [owner,settings,read('docs/school-owner-navigation.js')])assert.doesNotThrow(()=>new vm.Script(source));
});
test('profile update migration only exposes contact phone and name to verified owner, not status',()=>{
 const sql=read('supabase/migrations/20261104082500_owner_profile_settings.sql');
 assert.match(sql,/revoke update on table public\.institutions from authenticated/i);
 assert.match(sql,/grant update \(name\) on table public\.institutions to authenticated/i);
 assert.match(sql,/grant update \(contact_mobile\) on table public\.school_contact_profiles to authenticated/i);
 assert.match(sql,/school_private\.has_role\(id,ARRAY\['school_admin'/);
 assert.match(sql,/school_private\.has_role\(institution_id,ARRAY\['school_admin'/);
 assert.doesNotMatch(sql,/grant update \(status\)|service_role/);
});
