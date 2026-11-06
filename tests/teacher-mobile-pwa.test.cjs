const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
test('Teacher install entry keeps approved UI and both deployed mirrors',()=>{
 const html=read('teacher-access.html');assert.equal(html,read('docs/teacher-access.html'));
 assert.match(html,/rel="manifest" href="\.\/teacher\.webmanifest"/);
 assert.match(html,/id="installTeacherApp"[^>]+class="light hidden"/);
 assert.match(html,/teacher-install\.js/);
 assert.equal(read('teacher-install.js'),read('docs/teacher-install.js'));
 assert.match(read('teacher-install.js'),/beforeinstallprompt/);
 assert.doesNotMatch(read('teacher-install.js'),/localStorage|indexedDB|cache\.put|sessionStorage/);
});
test('PWA shortcuts respect portal roles and separate parent identity',()=>{
 const manifest=JSON.parse(read('teacher.webmanifest'));
 assert.deepEqual(manifest,JSON.parse(read('docs/teacher.webmanifest')));
 assert.notEqual(manifest.id,'/parents.html');
 assert.equal(manifest.start_url,'/teacher-access.html?view=attendance');
 assert.equal(manifest.shortcuts[1].url,'/teacher-access.html?view=homework');
 const src=read('teacher-access.js');assert.equal(src,read('docs/teacher-access.js'));
 assert.match(src,/const requested=new URLSearchParams\(location\.search\)\.get\('view'\)/);
 assert.match(src,/allowedViews\.includes\(requested\)\&\&isTabVisibleForRole\(requested,me\.role\)/);
});
