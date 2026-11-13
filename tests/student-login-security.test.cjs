'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');

// All student fixtures live in an isolated disposable SQLite test database.
// No production auth, student details, or cloud tables are touched.
test('retired DOB-only student login never issues tokens, and even valid old student JWTs cannot access records',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bn-student-auth-'));
 let child;
 try{
  for(const file of ['server.js','parent-portal.cjs','scripts/crypto-authority.cjs','src/smart-tools/teacher-ai.cjs']){
   const dest=path.join(tmp,file);fs.mkdirSync(path.dirname(dest),{recursive:true});
   fs.copyFileSync(path.join(__dirname,'..',file),dest);
  }
  const portServer=net.createServer();
  await new Promise((resolve,reject)=>portServer.once('error',reject).listen(0,'127.0.0.1',resolve));
  const port=portServer.address().port;await new Promise(resolve=>portServer.close(resolve));
  const secret='test-isolated-student-secret',apiKey='test-isolated-student-api-key';
  child=spawn(process.execPath,['server.js'],{cwd:tmp,
   env:{...process.env,PORT:String(port),SESSION_SECRET:secret,ADMIN_API_KEY:apiKey},
   stdio:['ignore','pipe','pipe']});
  let logs='';child.stderr.on('data',b=>{logs+=String(b).slice(0,500)});
  const base='http://127.0.0.1:'+port;
  let ready=false;
  for(let i=0;i<60;i++){
   if(child.exitCode!==null)break;
   try{const r=await fetch(base+'/api/health',{signal:AbortSignal.timeout(350)});if(r.ok){ready=true;break;}}catch(_){}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(ready,'Isolated API failed to start: '+logs.slice(-500));
  const seeded=await fetch(base+'/api/sync/snapshot',{method:'POST',
   headers:{'Content-Type':'application/json','X-Admin-Key':apiKey},
   body:JSON.stringify({students:[{id:'1',admissionNumber:'TEST-LOGIN-001',name:'Temporary Student',
    dob:'12-03-2014',status:'Active'}]})});
  assert.equal(seeded.status,200);
  for(const [admissionNumber,dob] of [
   ['TEST-LOGIN-001','12-03-2014'],
   ['TEST-LOGIN-001','01-01-2010'],
   ['UNKNOWN-2026-X','12-03-2014'],
   ['1','12-03-2014']
  ]){
   const r=await fetch(base+'/api/auth/login',{method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({admissionNumber,dob})});
   assert.equal(r.status,410,'DOB-only authentication must be retired for every identity');
   const body=await r.json();
   assert.equal(body.token,undefined);
   assert.equal(body.student,undefined);
   assert.equal(body.loginUrl,'/parents.html');
  }
  // Sign a real legacy token with the exact test server secret so an old
  // verifier WOULD accept it. A random invalid signature proves nothing.
  const header=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
  const payload=Buffer.from(JSON.stringify({
   sub:'TEST-LOGIN-001',role:'STUDENT',
   exp:Math.floor(Date.now()/1000)+3600
  })).toString('base64url');
  const sig=crypto.createHmac('sha256',secret).update(header+'.'+payload).digest('base64url');
  const token=header+'.'+payload+'.'+sig;
  for(const route of ['/api/portal/me','/api/parent/dashboard']){
   const response=await fetch(base+route,{headers:{Authorization:'Bearer '+token}});
   assert.equal(response.status,401,'Previously valid student token must be rejected: '+route);
  }
 }finally{
  if(child&&child.exitCode===null)child.kill();
  fs.rmSync(tmp,{recursive:true,force:true});
 }
});
