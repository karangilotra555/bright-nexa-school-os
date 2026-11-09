'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const link='https://github.com/karangilotra555/bright-nexa-school-os/releases/download/school-app-v0.5.0/Bright-Nexa-School-v0.5.0.apk';

test('School OS has parents download entry on app server and static docs',()=>{
 for(const root of ['', 'docs/']){
   const index=read(root+'index.html');
   assert.match(index,/parents-download-menu\.js/);
   const menu=read(root+'parents-download-menu.js');
   assert.match(menu,/\.navigation/);
   assert.match(menu,/\.topbar-actions/);
   assert.match(menu,/parent-app-download\.html/);
   const html=read(root+'parent-app-download.html');
   assert.ok(html.includes(link),'Share link must point to public GitHub release');
   assert.match(html,/Teacher.*Student/);
   assert.match(html,/navigator\.share/);
   assert.match(html,/navigator\.clipboard/);
 }
});
test('Android parents app has no fictional demo data or offline preview',()=>{
 assert.equal(fs.existsSync(path.join(__dirname,'../android-parents/app/src/main/assets/demo.html')),false);
 const java=read('android-parents/app/src/main/java/com/brightnexa/parents/MainActivity.java');
 assert.doesNotMatch(java,/openPreview|DEMO MODE|demo\\.html/);
 assert.ok(java.includes('openSchool(configuredUrl)'));
 assert.ok(java.includes('parents.html'));
 const wf=read('.github/workflows/build-parents-apk.yml');
 assert.match(wf,/gh release create/);
 assert.match(wf,/--prerelease/);
 assert.match(wf,/school-app-v0\.5\.0/);
});
