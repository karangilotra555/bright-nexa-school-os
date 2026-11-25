'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');

// Deliberately isolates the API and its SQLite database from every real school.
// No production login, student record or cloud API is ever used.
test('retired DOB login never authenticates active, inactive or unknown students',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bn-student-auth-'));
 let child;
 try{
  for(const file of ['server.js','parent-portal.cjs','scripts/crypto-authority.cjs','src/smart-tools/teacher-ai.cjs']){
   const dest=path.join(tmp,file);
   fs.mkdirSync(path.dirname(dest),{recursive:true});
   fs.copyFileSync(path.join(__dirname,'..',file),dest);
  }
  const portServer=net.createServer();
  await new Promise((resolve,reject)=>portServer.once('error',reject).listen(0,'127.0.0.1',resolve));
  const port=portServer.address().port;
  await new Promise(resolve=>portServer.close(resolve));
  child=spawn(process.execPath,['server.js'],{cwd:tmp,
    env:{...process.env,PORT:String(port),SESSION_SECRET:'test-isolated-student-secret',ADMIN_API_KEY:'test-isolated-student-api-key'},
    stdio:['ignore','pipe','pipe']});
  let errorLog='';
  child.stderr.on('data',b=>{errorLog+=String(b).slice(0,400)});
  const base='http://127.0.0.1:'+port;
  let ready=false;
  for(let i=0;i<60;i++){
   if(child.exitCode!==null)break;
   try{const r=await fetch(base+'/api/health',{signal:AbortSignal.timeout(350)});if(r.ok){ready=true;break}}catch(_){}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.ok(ready,'Isolated API failed to start: '+errorLog.slice(-400));
  const fixture=await fetch(base+'/api/sync/snapshot',{method:'POST',
    headers:{'Content-Type':'application/json','X-Admin-Key':'test-isolated-student-api-key'},
    body:JSON.stringify({students:[{id:'1',admissionNumber:'TEST-LOGIN-001',name:'Isolated Login Fixture',dob:'12-03-2014',status:'Active'}]})});
  assert.equal(fixture.status,200,'Auth test must explicitly seed its disposable database');
  async function login(admissionNumber,dob){
   const response=await fetch(base+'/api/auth/login',{method:'POST',
     headers:{'Content-Type':'application/json'},body:JSON.stringify({admissionNumber,dob})});
   return {status:response.status,body:await response.json()};
  }
  const unknown=await login('UNKNOWN-2026-X','12-03-2014');
  const wrongDob=await login('TEST-LOGIN-001','01-01-2010');
  assert.equal(unknown.status,410);
  assert.equal(wrongDob.status,410);
  assert.equal(unknown.body.error,wrongDob.body.error,'Student existence or DOB registration must not be disclosed');
  const internalId=await login('1','12-03-2014');
  assert.equal(internalId.status,410,'Internal student ID must not be a valid login identifier');
  const valid=await login('TEST-LOGIN-001','12-03-2014');
  assert.equal(valid.status,410,'DOB knowledge must never authenticate');
  assert.equal(valid.body.token,undefined);assert.equal(valid.body.loginUrl,'/parents.html');
  // Only mutate the fresh *temporary test database*. Existing school records
  // and production SQLite are not touched.
  const db=new DatabaseSync(path.join(tmp,'data','school.db'));
  try{db.prepare("UPDATE students SET enrollmentStatus = 'INACTIVE' WHERE admissionNumber = ?").run('TEST-LOGIN-001')}finally{db.close()}
  const inactive=await login('TEST-LOGIN-001','12-03-2014');
  assert.equal(inactive.status,410);
  assert.equal(inactive.body.error,wrongDob.body.error);
  assert.equal(inactive.body.token,undefined);
 }finally{
  if(child && child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;}
  fs.rmSync(tmp,{recursive:true,force:true});
 }
});

test('TDD RED: school-student-login does not write school_guardian_students when student link already exists',async()=>{
 const ts=fs.readFileSync(path.join(__dirname,'../supabase/functions/school-student-login/index.ts'),'utf8');
 assert.match(ts,/from\('school_guardian_students'\)\.select\(/,'linkUser should check existing guardian-student link before mutating DB');
});
