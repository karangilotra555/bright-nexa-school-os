'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const link='https://github.com/karangilotra555/bright-nexa-school-os/releases/download/parents-demo-v0.3.0/Bright-Nexa-Parents-Demo-v0.3.0.apk';

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
   assert.match(html,/Demo build only/);
   assert.match(html,/navigator\.share/);
   assert.match(html,/navigator\.clipboard/);
 }
});
test('Android demo identifies school separately and does not claim real sync',()=>{
 const html=read('android-parents/app/src/main/assets/demo.html');
 assert.match(html,/BRIGHT NEXA DEMO ACADEMY/);
 assert.match(html,/No school is connected/);
 assert.match(html,/DEMO PREVIEW/);
 const wf=read('.github/workflows/build-parents-apk.yml');
 assert.match(wf,/gh release create/);
 assert.match(wf,/--prerelease/);
 assert.match(wf,/parents-demo-v0\.3\.0/);
});
