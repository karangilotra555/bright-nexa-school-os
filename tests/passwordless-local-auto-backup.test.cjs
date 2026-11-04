'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const app=require('../docs/school-auto-backup.js');
const backupCore=require('../docs/school-backup-core.js');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const schoolId='11111111-1111-4111-8111-111111111111';
const ownerId='22222222-2222-4222-8222-222222222222';
const school={id:schoolId,name:'Authorized School'};
class FakeFolder {
  constructor(permission='granted'){
    this.name='My Safe School Backups';
    this.permission=permission;this.files=new Map();this.writes=0;
  }
  async queryPermission(){return this.permission}
  async requestPermission(){return this.permission}
  async getFileHandle(name,{create}={}){
    if(!this.files.has(name)){
      if(!create)throw Error('File does not exist.');
      this.files.set(name,{contents:null});
    }
    const file=this.files.get(name),folder=this;
    return {
      async createWritable(){
        let text;
        return {
          async write(value){text=value},
          async close(){file.contents=text;folder.writes++},
          async abort(){text=null}
        };
      },
      async getFile(){return {text:async()=>file.contents}}
    };
  }
}
test('local backup folder is scoped to one verified school and owner',()=>{
 assert.equal(app.scope(schoolId,ownerId),schoolId+':'+ownerId);
 assert.throws(()=>app.scope('wrong',ownerId),/Verified/);
 assert.throws(()=>app.scope(schoolId,'wrong'),/Verified/);
});
test('passwordless AES-GCM envelope excludes student names and decrypts on this device',async()=>{
 const {key,keyId}=await app.makeKey();
 const manifest=await backupCore.collect(async()=>[],school);
 manifest.tables.school_students=[{id:'child',institution_id:schoolId,name:'Private Student'}];
 const encrypted=await app.encrypt(manifest,key,keyId,schoolId);
 assert.equal(encrypted.version,2);assert.equal(encrypted.algorithm,'AES-256-GCM');
 assert.ok(!JSON.stringify(encrypted).includes('Private Student'));
 assert.deepEqual(await app.decrypt(encrypted,key,schoolId,keyId),manifest);
 await assert.rejects(()=>app.decrypt(encrypted,key,'33333333-3333-4333-8333-333333333333',keyId),/does not match/);
 await assert.rejects(()=>app.decrypt(encrypted,key,schoolId,'wrong-key'),/does not match/);
 const broken={...encrypted,ciphertext:encrypted.ciphertext.slice(0,-3)+'!!!'};
 await assert.rejects(()=>app.decrypt(broken,key,schoolId,keyId),/could not be decrypted/);
});
test('recovery key file decrypts encrypted backup on another browser without password',async()=>{
 const {key,keyId}=await app.makeKey();
 const manifest=await backupCore.collect(async()=>[],school);
 const file=await app.encrypt(manifest,key,keyId,schoolId);
 const exported=await app.makeRecoveryKey(schoolId,keyId,key);
 assert.equal(exported.format,'bright-nexa-local-recovery-key');
 assert.ok(exported.key.length>32);
 const recovered=await app.readRecoveryKey(exported,schoolId);
 assert.equal(recovered.keyId,keyId);
 assert.deepEqual(await app.decrypt(file,recovered.key,schoolId,keyId),manifest);
 await assert.rejects(()=>app.readRecoveryKey(exported,'44444444-4444-4444-8444-444444444444'),/Wrong school/);
});
test('automatic local backup writes one daily and one latest file, then verifies disk read-back',async()=>{
 const directory=new FakeFolder();
 const {key,keyId}=await app.makeKey();
 const settings={schoolId,userId:ownerId,directory,key,keyId,lastBackupAt:0};
 const asked=[];
 const date=new Date(2026,10,4,13,20,30);
 const result=await app.writeBackup({settings,schoolId,userId:ownerId,allSchool:async(table,select)=>{
   asked.push(table);assert.equal(select,'*');
   return [{id:'test',institution_id:schoolId}];
 },school,backupCore,now:date});
 assert.equal(asked.length,backupCore.TABLES.length);
 assert.equal(directory.files.size,2);assert.equal(directory.writes,2);
 assert.match(result.names.latest,/latest\.bnbackup$/);
 assert.match(result.names.daily,/20261104\.bnbackup$/);
 const saved=JSON.parse(directory.files.get(result.names.latest).contents);
 const decrypted=await app.decrypt(saved,key,schoolId,keyId);
 assert.equal(decrypted.tables.school_students.length,1);
 assert.equal(result.counts.school_students,1);
});
test('mismatched owner, revoked permissions and RLS reads fail closed without backup write',async()=>{
 const folder=new FakeFolder('prompt');
 const {key,keyId}=await app.makeKey();
 const settings={schoolId,userId:ownerId,directory:folder,key,keyId,lastBackupAt:0};
 const args={settings,schoolId,userId:ownerId,allSchool:async()=>[],school,backupCore};
 await assert.rejects(()=>app.writeBackup(args),/Folder access needs/);
 assert.equal(folder.writes,0);
 folder.permission='granted';
 await assert.rejects(()=>app.writeBackup({...args,userId:'55555555-5555-4555-8555-555555555555'}),/not configured/);
 await assert.rejects(()=>app.writeBackup({...args,allSchool:async()=>{throw Error('RLS denied')}}),/RLS denied/);
 assert.equal(folder.writes,0);
});
test('backup file rejects foreign-school and malformed records',async()=>{
 const {key,keyId}=await app.makeKey();
 const manifest=await backupCore.collect(async()=>[],school);
 manifest.tables.school_students=[{id:'private',institution_id:'external-school',name:'Wrong Tenant'}];
 await assert.rejects(()=>app.encrypt(manifest,key,keyId,schoolId),/foreign-school table/);
});
test('live owner page contains folder picker, change folder, recovery key and scheduled backup wiring',()=>{
 const html=read('docs/real-owner-workspace.html');
 const js=read('docs/real-owner-workspace.js');
 const ui=read('docs/school-auto-backup-ui.js');
 const core=read('docs/school-auto-backup.js');
 const sw=read('docs/owner-offline-sw.js');
 for(const marker of ['backupFolder','backupReauthorize','backupNow','backupVerify','backupRecovery','backupImportKey','backupStatus'])assert.ok(html.includes(marker),marker);
 assert.ok(html.indexOf('school-auto-backup.js')<html.indexOf('school-auto-backup-ui.js'));
 assert.ok(html.indexOf('school-auto-backup-ui.js')<html.indexOf('real-owner-workspace.js'));
 assert.match(ui,/showDirectoryPicker/);
 assert.match(ui,/Change backup folder/);
 assert.match(ui,/30\*60\*1000/);
 assert.match(ui,/afterReload/);
 assert.match(js,/BrightNexaAutoBackup\?\.queue/);
 assert.match(js,/BrightNexaAutoBackup\?\.attach/);
 assert.match(js,/BrightNexaAutoBackup\?\.afterReload/);
 assert.doesNotMatch(html,/backupDownload|Create backup passphrase|school-backup-ui\.js/);
 assert.doesNotMatch(ui,/passphraseDialog|prompt\(|localStorage\.setItem|service_role|sb_secret_/);
 for(const file of ['school-auto-backup.js','school-auto-backup-ui.js'])assert.ok(sw.includes(file));
 assert.match(sw,/bright-nexa-owner-shell-v5/);
 for(const code of [js,ui,core])assert.doesNotThrow(()=>new vm.Script(code));
});