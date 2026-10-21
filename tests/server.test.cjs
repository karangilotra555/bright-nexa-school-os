const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {spawn}=require('node:child_process');
let child,dir,base;
before(async()=>{
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'bn-portal-test-'));
 fs.copyFileSync('server.js',path.join(dir,'server.js'));
 fs.cpSync('scripts',path.join(dir,'scripts'),{recursive:true});
 fs.copyFileSync('student-portal.html',path.join(dir,'student-portal.html'));
 fs.copyFileSync('index.html',path.join(dir,'index.html'));
 child=spawn(process.execPath,['server.js'],{cwd:dir,env:{...process.env,PORT:'0',ADMIN_API_KEY:'test-only-admin',SESSION_SECRET:'test-only-session'}});
 base=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('server start timeout')),10000);child.stdout.on('data',chunk=>{const match=chunk.toString().match(/running on port (\d+)/);if(match){clearTimeout(timer);resolve('http://127.0.0.1:'+match[1]);}});child.on('exit',code=>{clearTimeout(timer);reject(new Error('server exited '+code));});});
});
after(async()=>{if(child){child.kill();await new Promise(r=>child.once('exit',r));} if(dir)fs.rmSync(dir,{recursive:true,force:true});});
test('school profile API exposes public institution fields',async()=>{const r=await fetch(base+'/api/school-profile');assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/json/);const data=await r.json();assert.equal(typeof data.institution.name,'string');assert.equal(data.students,undefined);});
test('database cannot be downloaded as a static asset',async()=>{const r=await fetch(base+'/data/school.db');assert.equal(r.status,403);});
test('server source cannot be downloaded',async()=>{const r=await fetch(base+'/server.js');assert.equal(r.status,403);});
test('unknown API returns JSON 404 instead of the application HTML',async()=>{const r=await fetch(base+'/api/missing');assert.equal(r.status,404);assert.match(r.headers.get('content-type'),/json/);});

test('server-issued signature verifies with its own active key',async()=>{const student={id:'TEST-SIGN',name:'Test',admissionNumber:'TEST-SIGN',rollNumber:'1',dob:'01-01-2010'};const sync=await fetch(base+'/api/sync/snapshot',{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Key':'test-only-admin'},body:JSON.stringify({students:[student]})});assert.equal(sync.status,200);const signed=await fetch(base+'/api/sign',{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Key':'test-only-admin'},body:JSON.stringify({student})}).then(r=>r.json());const result=await fetch(base+'/api/verify?adm=TEST-SIGN&sig='+encodeURIComponent(signed.signature)).then(r=>r.json());assert.equal(result.verified,true);});
test('publicly known legacy HMAC cannot verify credentials',async()=>{const crypto=require('node:crypto');const payload='BRIGHT NEXA INTERNATIONAL ACADEMY|2026-2027|TEST-SIGN|01|2010-01-01';const sig=crypto.createHmac('sha256','bn_sec_key_7500058655_brightnexa_2026_cbse_v1').update(payload).digest('hex').slice(0,16).toUpperCase();const result=await fetch(base+'/api/verify?adm=TEST-SIGN&sig='+sig).then(r=>r.json());assert.equal(result.verified,false);});

test('mixed-case protected paths stay blocked',async()=>{for(const route of ['/SERVER.JS','/Data/school.db']){const response=await fetch(base+route);assert.equal(response.status,403);}});
