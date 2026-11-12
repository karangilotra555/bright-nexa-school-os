'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
function fixture(){
 const html=`<!doctype html><html><body>
 <article class="settings-card"><h2>Encrypted Google Drive backup</h2><div class="settings-actions">
 <button>Connect Google Drive</button><button>Backup to Google Drive</button><button>Restore latest from Drive</button>
 <button>Download encrypted backup</button><button id="restore">Restore backup file</button></div></article>
 <article class="settings-card"><h2>Software Updates</h2><div class="settings-actions"><button>Check for Updates</button><button>Open Official Releases</button></div></article>
 <article class="settings-card"><h2>Users &amp; role permissions</h2><div class="settings-actions"><button>Add user</button><button>Replace Recovery Key</button></div></article>
 <article class="settings-card"><h2>Recent audit log</h2><div class="settings-actions"></div></article>
 </body></html>`;
 const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://bright-nexa-school-os.onrender.com/index.html'});
 const w=dom.window;w.requestAnimationFrame=cb=>cb();
 w.eval(read('school-web-settings-guard.js'));
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 return dom;
}
test('browser settings cannot misrepresent local backup as Google Drive upload',()=>{
 const dom=fixture(),doc=dom.window.document;
 assert.match(doc.querySelector('[data-bn-web-note="drive"]').textContent,/does not upload/i);
 const link=doc.querySelector('[data-bn-web-link="drive"]');
 assert.equal(link.href,'https://drive.google.com/drive/my-drive');
 assert.equal(link.rel,'noopener noreferrer');
 const labels=[...doc.querySelectorAll('button')].map(b=>b.textContent);
 assert.ok(labels.includes('Download encrypted backup'),'local encryption/download feature preserved');
 assert.equal(doc.querySelector('[data-bn-web-note="audit"]').textContent.includes('not proof of cloud writes'),true);
 dom.window.close();
});
test('browser does not present local user records as Supabase RBAC',()=>{
 const dom=fixture(),doc=dom.window.document;
 assert.equal([...doc.querySelectorAll('button')].find(b=>b.textContent==='Add user').disabled,true);
 assert.equal([...doc.querySelectorAll('button')].find(b=>b.textContent==='Replace Recovery Key').disabled,true);
 assert.equal([...doc.querySelectorAll('button')].find(b=>b.textContent==='Check for Updates').disabled,true);
 assert.match(doc.querySelector('[data-bn-web-link="roles"]').href,/teacher-access.html\?view=roles$/);
 assert.match(doc.querySelector('[data-bn-cloud-status]').textContent,/not verified|no signed-in staff/i);
 dom.window.close();
});
test('restore is blocked unless user confirms possible replacement of live local records',()=>{
 const dom=fixture(),w=dom.window;
 let originalClicked=0;const button=w.document.getElementById('restore');
 button.addEventListener('click',()=>originalClicked++);
 w.confirm=()=>false;button.click();assert.equal(originalClicked,0);
 w.confirm=()=>true;button.click();assert.equal(originalClicked,1);
 dom.window.close();
});
test('published mirrors match root and ERP loads guard once',()=>{
 const s=read('school-web-settings-guard.js');
 for(const prefix of ['docs/','app-extracted/dist/']){
  assert.equal(read(prefix+'school-web-settings-guard.js'),s);
  assert.equal(read(prefix+'index.html'),read('index.html'));
 }
 assert.equal((read('index.html').match(/school-web-settings-guard\.js\?v=20261112-cloud-settings-v1/g)||[]).length,1);
});
