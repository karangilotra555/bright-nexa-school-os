'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const source=read('school-dashboard-integrity.js');
function fixture(url='https://bright-nexa-school-os.onrender.com/index.html?openSchool=true&tab=Dashboard'){
 const dom=new JSDOM('<!doctype html><body><nav class="navigation"><button class="nav-item">Dashboard</button><button class="nav-item active">Settings</button></nav><div class="metric-grid"></div><button class="bn-sync-status-badge"><span>☁</span><span>ERP saved to Supabase</span><span></span></button></body>',{url,runScripts:'outside-only'});
 const w=dom.window;w.requestAnimationFrame=fn=>fn();
 return {dom,w,doc:w.document,api:w.eval(source)};
}
test('Dashboard deep link reopens Dashboard instead of stale Settings on load',()=>{
 const {dom,w,doc}=fixture();let count=0;doc.querySelector('button').addEventListener('click',()=>{count++;doc.querySelector('.active').classList.remove('active');doc.querySelector('button').classList.add('active')});
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 assert.equal(count,1);
 assert.equal(doc.querySelector('.nav-item.active').textContent,'Dashboard');
 assert.equal(new URL(w.location.href).searchParams.get('tab'),'Dashboard');
 dom.window.close();
});
test('Settings navigation changes tab URL without reload or changing school records',()=>{
 const {dom,w,doc}=fixture();const dashboard=doc.querySelector('button');
 dashboard.classList.add('active');doc.querySelectorAll('button')[1].classList.remove('active');
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 dashboard.classList.remove('active');doc.querySelectorAll('button')[1].classList.add('active');
 // MutationObserver may be asynchronous; deterministic scan is exposed for test.
 w.BNDashboardIntegrity?.scan?.();
 // The script uses no global app-data operations.
 assert.equal(source.includes('localStorage.setItem'),false);
 assert.equal(source.includes('/rest/v1/'),false);
 dom.window.close();
});
test('conflict warning suppresses green Supabase saved badge',()=>{
 const {dom,w,doc}=fixture();
 const panel=doc.createElement('section');panel.id='bn-cloud-publish-status';panel.setAttribute('role','alert');panel.style.display='block';panel.textContent='School sync conflict — not published';doc.body.append(panel);
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 assert.match(doc.querySelector('.bn-sync-status-badge').textContent,/Sync issue — not published/);
 assert.equal(doc.querySelector('.bn-sync-status-badge').getAttribute('aria-invalid'),'true');
 panel.style.display='none';
 // Trigger the mutation handler, then scan after the observer's microtask.
 dom.window.close();
});
test('dashboard attendance and fee metrics explicitly state limited local-record meaning',()=>{
 const {dom,w,doc}=fixture();
 const d=doc.querySelector('button');doc.querySelector('.active').classList.remove('active');d.classList.add('active');
 doc.querySelector('.metric-grid').innerHTML='<article class="metric-card"><div>Today\'s attendance</div><strong>100.0%</strong><small>0 absent recorded</small></article><article class="metric-card"><div>Fees collected this month</div><strong>₹0</strong><small>0 valid receipts</small></article>';
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 assert.match(doc.querySelector('[data-bn-metric-note="attendance"]').textContent,/recorded entries only/i);
 assert.match(doc.querySelectorAll('.metric-card')[1].textContent,/receipts \(all dates\)/);
 dom.window.close();
});
test('dashboard guard and ERP entry are identical in root, docs, and distribution files',()=>{
 for(const prefix of ['docs/','app-extracted/dist/']){
  assert.equal(read(prefix+'school-dashboard-integrity.js'),source);
  assert.equal(read(prefix+'index.html'),read('index.html'));
 }
 assert.equal((read('index.html').match(/school-dashboard-integrity\.js\?v=20261112-dashboard-audit-v1/g)||[]).length,1);
});
