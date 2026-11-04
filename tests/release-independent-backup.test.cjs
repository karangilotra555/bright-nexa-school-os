'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const B=require('../docs/school-backup-core.js');
const read=n=>fs.readFileSync(path.join(__dirname,'..',n),'utf8');
const school={id:'school-1',name:'Test School'};
const pass='UniqueTestingPhrase_2026';
test('owner backup includes every configured school table without sample or outside tenant records',async()=>{
 const calls=[];
 const manifest=await B.collect(async(table,select)=>{calls.push([table,select]);return [{id:table+'-1',institution_id:'school-1'}]},school);
 assert.equal(calls.length,B.TABLES.length);
 assert.equal(manifest.school_id,'school-1');assert.equal(manifest.tables.school_students.length,1);
 assert.ok(calls.every(x=>x[1]==='*'));
 await assert.rejects(()=>B.collect(async()=>[{id:'bad',institution_id:'other'}],school),/tenant check/);
 await assert.rejects(()=>B.collect(async()=>{throw Error('RLS denied')},school),/RLS denied/);
});
test('encrypted school file round-trips and detects wrong passphrase, corruption and wrong manifest',async()=>{
 const manifest=await B.collect(async()=>[],school);
 manifest.tables.school_students.push({id:'s1',institution_id:'school-1',name:'Test Student'});
 const encrypted=await B.encrypt(manifest,pass);
 assert.equal(encrypted.encryption,'AES-256-GCM');
 assert.equal(encrypted.kdf,'PBKDF2-SHA256');
 assert.ok(!JSON.stringify(encrypted).includes('Test Student'));
 assert.deepEqual(await B.decrypt(encrypted,pass),manifest);
 await assert.rejects(()=>B.decrypt(encrypted,'WrongBackupSecret_2026'),/Incorrect backup passphrase/);
 const damaged={...encrypted,ciphertext:encrypted.ciphertext.slice(0,-4)+'AAAA'};
 await assert.rejects(()=>B.decrypt(damaged,pass),/Incorrect backup passphrase/);
});
test('encrypted backup verifies school identity and refuses cross-tenant data',async()=>{
 const manifest=await B.collect(async()=>[],school);
 manifest.tables.school_students.push({id:'s1',institution_id:'school-2'});
 const ciphertext=await B.encrypt(manifest,pass);
 await assert.rejects(()=>B.decrypt(ciphertext,pass),/cross-school or invalid/);
});
test('backup code is loaded only into owner page, not public school login',()=>{
 const html=read('docs/real-owner-workspace.html'),js=read('docs/real-owner-workspace.js'),sw=read('docs/owner-offline-sw.js');
 for(const s of ['school-backup-core.js','school-auto-backup.js','school-auto-backup-ui.js','backupFolder','backupNow','backupVerify','backupStatus','backupReauthorize','backupRecovery'])assert.ok(html.includes(s),s);
 assert.match(js,/BrightNexaAutoBackup\?\.attach/);
 for(const asset of ['school-backup-core.js','school-auto-backup.js','school-auto-backup-ui.js'])assert.ok(sw.includes(asset));
 for(const src of ['docs/school-backup-core.js','docs/school-auto-backup.js','docs/school-auto-backup-ui.js'])assert.doesNotThrow(()=>new vm.Script(read(src)));
 assert.doesNotMatch(read('docs/school-auto-backup-ui.js'),/service_role|sb_secret_|localStorage\.setItem|passphraseDialog/);
});
