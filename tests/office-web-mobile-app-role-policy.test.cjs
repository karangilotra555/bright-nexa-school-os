'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('teacher portal avoids loading records on desktop after verified teacher membership',()=>{
 const s=read('teacher-access.js');
 const guard=s.indexOf("if(me.role==='teacher'&&!isMobileAppContext())");
 const load=s.indexOf('    await reload();',guard);
 assert.ok(guard>0&&load>guard,'device policy checked before loading teacher records');
 assert.match(s,/showMobileOnlyNotice\(\)/);
 assert.match(s,/if\(me\.role==='teacher'&&\!isMobileAppContext\(\)\)/);
 assert.match(s,/if\(tabName==='fees'\)return role==='school_admin'\|\|role==='accountant'/);
 assert.match(s,/const isAdmin=\(\)=>me\?\.role==='school_admin'/);
 assert.equal(s,read('docs/teacher-access.js'));
});
test('mobile app policy permits standalone mobile and Android WebView, not ordinary desktop or mobile browser',()=>{
 const s=read('teacher-access.js');
 const match=s.match(/function isMobileAppContext\(win=window\)\{[\s\S]*?\n  \}/);
 assert.ok(match);
 const verify=new Function('return ('+match[0]+')')();
 const env=(ua,standalone=false,display=false)=>({navigator:{userAgent:ua,standalone},matchMedia:()=>({matches:display})});
 assert.equal(verify(env('Mozilla/5.0 Windows NT 10.0')),false);
 assert.equal(verify(env('Mozilla/5.0 Android Chrome Mobile')),false);
 assert.equal(verify(env('Mozilla/5.0 Android Chrome Mobile',false,true)),true);
 assert.equal(verify(env('Mozilla/5.0 (Linux; Android 14; Pixel; wv) AppleWebKit')),true);
 assert.equal(verify(env('Mozilla/5.0 iPhone Safari',true)),true);
 assert.equal(verify(env('Mozilla/5.0 Windows NT 10.0',false,true)),false);
});
test('parent portal hides its desktop login without running cloud authentication',()=>{
 const html=read('parents.html');
 assert.equal(html,read('docs/parents.html'));
 const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://school.invalid/parents.html'});
 let source=[...dom.window.document.querySelectorAll('script')].find(x=>x.textContent.includes('parentMobileAppContext'))?.textContent;
 assert.ok(source);
 dom.window.eval(source);
 const notice=dom.window.document.querySelector('#parentMobileOnlyNotice');
 assert.ok(notice);
 assert.match(notice.textContent,/mobile app/i);
 assert.ok(!dom.window.document.querySelector('#loginForm'));
 assert.match(source,/mobile&&\(installed\|\|appWebView\)/);
 dom.window.close();
});
test('full cloud ERP remains school-admin only; accountant stays fee-only in verified staff portal',()=>{
 const erp=read('school-erp-entry.js');
 assert.match(erp,/m\.role==='school_admin'/);
 assert.match(erp,/Only a verified School Admin can open Full ERP/);
 const staff=read('teacher-access.js');
 assert.match(staff,/if\(tabName==='fees'\)return role==='school_admin'\|\|role==='accountant'/);
});
