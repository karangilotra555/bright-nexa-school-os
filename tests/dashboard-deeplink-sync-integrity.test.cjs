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
test('Settings navigation updates route without touching workspace data',async()=>{
 const {dom,w,doc}=fixture();const dashboard=doc.querySelector('button');
 dashboard.classList.add('active');doc.querySelectorAll('button')[1].classList.remove('active');
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 dashboard.classList.remove('active');doc.querySelectorAll('button')[1].classList.add('active');
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(new URL(w.location.href).searchParams.get('tab'),'Settings');
 assert.equal(source.includes('localStorage.setItem'),false);
 assert.equal(source.includes("method:'POST'"),false);
 dom.window.close();
});
test('conflict warning suppresses green Supabase saved badge',()=>{
 const {dom,w,doc}=fixture();
 const panel=doc.createElement('section');panel.id='bn-cloud-publish-status';panel.setAttribute('role','alert');panel.style.display='block';panel.textContent='School sync conflict — not published';doc.body.append(panel);
 w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
 assert.match(doc.querySelector('.bn-sync-status-badge').getAttribute('aria-label'),/Sync conflict — not published/);
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
 assert.equal(doc.querySelectorAll('.metric-card')[0].dataset.bnAttendanceNote,'true');
 assert.equal(doc.querySelectorAll('.metric-card')[1].dataset.bnFeesNote,'true');
 assert.match(doc.getElementById('bn-dashboard-integrity-styles').textContent,/Recorded entries only/);
 assert.match(doc.getElementById('bn-dashboard-integrity-styles').textContent,/Current-month receipts/);
 dom.window.close();
});

test('Dashboard compares local KPI cards with authenticated Supabase counts without writing data',async()=>{
 const {dom,w,doc}=fixture();
 const dashboard=doc.querySelector('.navigation button');dashboard.classList.add('active');doc.querySelectorAll('.navigation button')[1].classList.remove('active');
 doc.querySelector('.metric-grid').innerHTML='<article class="metric-card">Total students <strong>1</strong></article><article class="metric-card">Teachers <strong>1</strong></article>';
 w.sessionStorage.setItem('bright-nexa-school-os:session:v2',JSON.stringify({cloudVerified:true,role:'OWNER',institutionId:'11111111-1111-4111-8111-111111111111'}));
 w.sessionStorage.setItem('bn_school_staff_session_v1',JSON.stringify({access_token:'fixture-token'}));
 const requests=[];
 w.fetch=async(url,opts)=>{
  requests.push({url,opts});
  return {ok:true,headers:{get:()=>url.includes('school_students')?'*/1':'*/0'}};
 };
 doc.dispatchEvent(new w.Event('DOMContentLoaded'));
 await new Promise(resolve=>setTimeout(resolve,5));
 assert.equal(doc.querySelectorAll('.metric-card')[0].dataset.bnCloudCount,'Supabase active students: 1');
 assert.equal(doc.querySelectorAll('.metric-card')[1].dataset.bnCloudCount,'Supabase active teachers: 0');
 assert.equal(requests.length,2);
 assert.ok(requests.every(x=>x.opts.method==='HEAD'&&x.opts.headers.Authorization==='Bearer fixture-token'));
 assert.ok(requests.every(x=>x.url.includes('institution_id=eq.11111111-1111-4111-8111-111111111111')));
 assert.ok(requests.every(x=>x.opts.cache==='no-store'));
 dom.window.close();
});
test('dashboard guard and ERP entry are identical in root, docs, and distribution files',()=>{
 for(const prefix of ['docs/','app-extracted/dist/']){
  assert.equal(read(prefix+'school-dashboard-integrity.js'),source);
  assert.equal(read(prefix+'index.html'),read('index.html'));
 }
 assert.equal((read('index.html').match(/school-dashboard-integrity\.js\?v=20261112-dashboard-route-v2/g)||[]).length,1);
});
