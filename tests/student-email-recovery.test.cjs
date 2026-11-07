'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createHash,webcrypto}=require('node:crypto');
const {transformSync}=require('esbuild');
const school='bc80e32d-485d-48a8-903a-92338aa61005';
const studentId='11111111-1111-1111-1111-111111111111';
const shadowEmail=createHash('sha256').update('student:'+school+':'+studentId).digest('hex')+'@student.brightnexa.invalid';
function fixture(){
 let email='verified-guardian@example.com',pending=false,resetMs=0;
 const sent=[],updates=[];
 const source=fs.readFileSync(path.join(__dirname,'../supabase/functions/school-student-login/index.ts'),'utf8')
   .replace(/^import[^\n]*\n/,'')
   .replace('export function handler','function handler')
   .replace(/Deno\.serve\(handler\(\)\);\s*$/,'globalThis.__edgeHandler=handler;');
 assert.ok(source.includes('__edgeHandler=handler'));
 const compiled=transformSync(source,{loader:'ts',target:'es2022',format:'iife'}).code;
 const context={
   Deno:{env:{get:name=>({SUPABASE_URL:'https://school.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',SUPABASE_ANON_KEY:'public'})[name]||''}},
   crypto:webcrypto,TextEncoder,Request,Response,URLSearchParams,atob,console:{warn(){}}
 };
 vm.createContext(context);
 vm.runInContext(compiled,context);
 const admin={
  rpc:async()=>({data:true,error:null}),
  from:table=>{
   const filters={};
   const query={
    select(){return query},
    eq(key,value){filters[key]=value;return query},
    async maybeSingle(){
     if(table==='school_students')return {data:filters.institution_id===school&&filters.admission_number==='ADM-1'&&filters.status==='active'?{id:studentId,institution_id:school}:null};
     if(table==='school_student_profiles')return {data:filters.student_id===studentId?{guardian_email:email,guardian_phone:'9000012345'}:null};
     if(table==='school_guardians')return {data:filters.email===shadowEmail&&filters.status==='active'?{auth_user_id:'synthetic-student'}:null};
     return {data:null};
    }
   };
   return query;
  },
  auth:{admin:{
   async getUserById(id){return {data:{user:id==='synthetic-student'?{
    id,email:shadowEmail,app_metadata:{bn_student_id:studentId,bn_institution_id:school,bn_password_pending:pending,bn_last_email_reset_ms:resetMs}
   }:null},error:null}},
   async updateUserById(id,payload){updates.push({id,payload});resetMs=payload.app_metadata.bn_last_email_reset_ms;return {data:{user:{id}},error:null}}
  }}
 };
 const auth={auth:{
  async signInWithOtp(args){sent.push(args);return {data:{},error:null}},
  async getUser(){return {data:{user:{id:'verified-guardian',email,email_confirmed_at:'2026-11-07',is_anonymous:false}},error:null}}
 }};
 const edge=context.__edgeHandler((_url,key)=>key==='service'?admin:auth);
 const call=async(body,token)=>{
  const payload=JSON.stringify(body),headers={'Content-Type':'application/json',Origin:'https://bright-nexa-school-os.onrender.com'};
  if(token)headers.Authorization='Bearer '+token;
  const response=await edge(new Request('https://school.supabase.co/functions/v1/school-student-login',{method:'POST',headers,body:payload}));
  return {status:response.status,body:await response.json()};
 };
 return {call,sent,updates,setEmail(v){email=v},setPending(v){pending=v}};
}
test('student recovery sends email only to school-registered guardian',async()=>{
 const f=fixture();
 const base={action:'request-reset',admissionNumber:'ADM-1',schoolId:school};
 const unknown=await f.call({...base,guardianEmail:'unknown@example.com'});
 const valid=await f.call({...base,guardianEmail:'verified-guardian@example.com'});
 assert.equal(unknown.status,200);assert.equal(valid.status,200);
 assert.equal(unknown.body.message,valid.body.message);
 assert.equal(f.sent.length,1);
 assert.equal(f.sent[0].email,'verified-guardian@example.com');
 assert.equal(f.sent[0].options.shouldCreateUser,true);
 assert.ok(f.sent[0].options.emailRedirectTo.endsWith('parent-password-recovery.html'));
 f.setPending(true);
 await f.call({...base,guardianEmail:'verified-guardian@example.com'});
 assert.equal(f.sent.length,1,'Pending initial password must not email a reset link');
});
test('verified guardian token can reset only existing linked child and cannot replay',async()=>{
 const f=fixture();
 const jwt='header.'+Buffer.from(JSON.stringify({sub:'verified-guardian',iat:Math.floor(Date.now()/1000)})).toString('base64url')+'.sig';
 const base={action:'complete-reset',schoolId:school,admissionNumber:'ADM-1',newPassword:'SecurePass12345'};
 const bad=await f.call({...base,admissionNumber:'NOT-MY-CHILD'},jwt);
 assert.equal(bad.status,403);
 assert.equal(f.updates.length,0);
 const good=await f.call(base,jwt);
 assert.equal(good.status,200);
 assert.equal(f.updates.length,1);
 assert.equal(f.updates[0].id,'synthetic-student');
 assert.equal(f.updates[0].payload.password,'SecurePass12345');
 const repeated=await f.call(base,jwt);
 assert.equal(repeated.status,403,'Consumed guardian email login must not reset a second time');
 assert.equal(f.updates.length,1);
});
test('guardian email reset pages mirror and avoid credential persistence',()=>{
 const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
 const page=read('parent-password-recovery.html');
 assert.equal(page,read('docs/parent-password-recovery.html'));
 assert.ok(page.includes("action:'complete-reset'"));
 assert.ok(page.includes('history.replaceState'));
 assert.ok(!page.includes('localStorage.setItem'));
 assert.ok(!page.includes('sessionStorage.setItem'));
 assert.equal(read('parents.html'),read('docs/parents.html'));
 assert.equal(read('parents-cloud.js'),read('docs/parents-cloud.js'));
 assert.ok(read('parents.html').includes('id="forgotStudentForm"'));
 assert.ok(read('parents-cloud.js').includes("action:'request-reset'"));
});
