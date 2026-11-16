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
const guardianPhone='9000012345';
const legacyStudentId='44444444-4444-4444-8444-444444444444';
const shadowEmail=createHash('sha256').update('student:'+school+':'+studentId).digest('hex')+'@student.brightnexa.invalid';
function fixture({duplicate=false,origin='https://bright-nexa-school-os.onrender.com',githubPagesRecovery=false,admission='ADM-1',otherAdmission,alias}={}){
 let email='verified-guardian@example.com',pending=false,resetMs=0,firstLoginUser;
 const sent=[],updates=[];
 const source=fs.readFileSync(path.join(__dirname,'../supabase/functions/school-student-login/index.ts'),'utf8')
   .replace(/^import[^\n]*\n/,'')
   .replace('export function handler','function handler')
   .replace(/Deno\.serve\(handler\(\)\);\s*$/,'globalThis.__edgeHandler=handler;');
 assert.ok(source.includes('__edgeHandler=handler'));
 const compiled=transformSync(source,{loader:'ts',target:'es2022',format:'iife'}).code;
 const context={
   Deno:{env:{get:name=>({SUPABASE_URL:'https://school.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',SUPABASE_ANON_KEY:'public',BN_GITHUB_PAGES_RECOVERY:githubPagesRecovery?'true':'false'})[name]||''}},
   crypto:webcrypto,TextEncoder,Request,Response,URLSearchParams,atob,console:{warn(){}}
 };
 vm.createContext(context);
 vm.runInContext(compiled,context);
 const admin={
  rpc:async()=>({data:true,error:null}),
  from:table=>{
   const filters={};
   let admissionPattern;
   const query={
    select(){return query},
    eq(key,value){filters[key]=value;return query},
    ilike(key,value){if(key==='admission_number')admissionPattern=value;return query},
    async limit(count){
     if(table!=='school_students'||filters.status!=='active')return {data:[]};
     const candidates=[{id:studentId,institution_id:school,admission_number:admission}];
     if(duplicate||otherAdmission)candidates.push({id:'22222222-2222-4222-8222-222222222222',institution_id:'33333333-3333-4333-8333-333333333333',admission_number:otherAdmission||admission});
     const matches=admissionPattern===undefined?value=>value===filters.admission_number:
       value=>new RegExp('^'+admissionPattern.replace(/\\_|_/g,part=>part==='_'?'.':'_')+'$','i').test(value);
     return {data:candidates.filter(row=>(!filters.institution_id||row.institution_id===filters.institution_id)&&matches(row.admission_number)).slice(0,count)};
    },
    async maybeSingle(){
     if(table==='school_students')return {data:filters.institution_id===school&&(filters.id===studentId||(alias&&filters.id===legacyStudentId))&&filters.status==='active'?{id:filters.id,institution_id:school}:null};
     if(table==='institutions')return {data:filters.id===school?{status:'trial'}:null};
     if(table==='school_student_profiles'){
      if(filters.admission_login_alias)return {data:filters.admission_login_alias===alias&&filters.institution_id===school?{student_id:legacyStudentId}:null};
      return {data:filters.student_id===studentId||(alias&&filters.student_id===legacyStudentId)?{guardian_email:email,guardian_phone:guardianPhone}:null};
     }
     if(table==='school_guardians')return {data:filters.email===shadowEmail&&filters.status==='active'?{auth_user_id:'synthetic-student'}:null};
     return {data:null};
    }
   };
   return query;
  },
  auth:{admin:{
   async createUser({email,password,app_metadata}){
    firstLoginUser={id:'synthetic-student',email,password,app_metadata};
    return {data:{user:firstLoginUser},error:null};
   },
   async getUserById(id){return {data:{user:id==='synthetic-student'?{
    id,email:shadowEmail,app_metadata:{bn_student_id:studentId,bn_institution_id:school,bn_password_pending:pending,bn_last_email_reset_ms:resetMs}
   }:null},error:null}},
   async updateUserById(id,payload){updates.push({id,payload});resetMs=payload.app_metadata.bn_last_email_reset_ms;return {data:{user:{id}},error:null}}
  }}
 };
 const auth={auth:{
  async signInWithPassword({email,password}){
   if(firstLoginUser?.email===email&&firstLoginUser.password===password)
    return {data:{session:{access_token:firstLoginUser.app_metadata.bn_student_id},user:firstLoginUser},error:null};
   return {data:{session:null,user:null},error:{message:'Invalid credentials'}};
  },
  async signInWithOtp(args){sent.push(args);return {data:{},error:null}},
  async getUser(){return {data:{user:{id:'verified-guardian',email,email_confirmed_at:'2026-11-07',is_anonymous:false}},error:null}}
 }};
 const edge=context.__edgeHandler((_url,key)=>key==='service'?admin:auth);
 const call=async(body,token)=>{
  const payload=JSON.stringify(body),headers={'Content-Type':'application/json',Origin:origin};
  if(token)headers.Authorization='Bearer '+token;
  const response=await edge(new Request('https://school.supabase.co/functions/v1/school-student-login',{method:'POST',headers,body:payload}));
  return {status:response.status,body:await response.json()};
 };
 return {call,sent,updates,setEmail(v){email=v},setPending(v){pending=v}};
}
test('plain recovery entry resolves a unique school and carries it through the email link',async()=>{
 const f=fixture();
 await f.call({action:'request-reset',admissionNumber:'ADM-1',guardianEmail:'verified-guardian@example.com'});
 assert.equal(new URL(f.sent[0].options.emailRedirectTo).searchParams.get('school'),school);
 const ambiguous=fixture({duplicate:true});
 await ambiguous.call({action:'request-reset',admissionNumber:'ADM-1',guardianEmail:'verified-guardian@example.com'});
 assert.equal(ambiguous.sent.length,0);
});
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
 assert.equal(new URL(f.sent[0].options.emailRedirectTo).pathname,'/parent-password-recovery.html');
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

test('guardian recovery link stays on the approved GitHub Pages deployment',async()=>{
 const f=fixture({origin:'https://karangilotra555.github.io',githubPagesRecovery:true});
 await f.call({action:'request-reset',admissionNumber:'ADM-1',guardianEmail:'verified-guardian@example.com'});
 const redirect=new URL(f.sent[0].options.emailRedirectTo);
 assert.equal(redirect.origin,'https://karangilotra555.github.io');
 assert.equal(redirect.pathname,'/bright-nexa-school-os/parent-password-recovery.html');
 assert.equal(redirect.searchParams.get('school'),school);
});

test('guardian recovery uses Render while the GitHub Pages recovery page is unpublished',async()=>{
 const f=fixture({origin:'https://karangilotra555.github.io'});
 await f.call({action:'request-reset',admissionNumber:'ADM-1',guardianEmail:'verified-guardian@example.com'});
 const redirect=new URL(f.sent[0].options.emailRedirectTo);
 assert.equal(redirect.origin,'https://bright-nexa-school-os.onrender.com');
 assert.equal(redirect.pathname,'/parent-password-recovery.html');
 assert.equal(redirect.searchParams.get('school'),school);
});

test('first login accepts lowercase admission numbers and still requires the registered guardian mobile',async()=>{
 const f=fixture({admission:'HPS001'});
 const request={action:'login',admissionNumber:'hps001'};
 assert.equal((await f.call({...request,password:'9000012346'})).status,401);
 const result=await f.call({...request,password:guardianPhone});
 assert.equal(result.status,200);
 assert.equal(result.body.mustChangePassword,true);
 assert.deepEqual(result.body.links,[]);
});

test('case-insensitive lookup preserves literal underscores and rejects ambiguous admissions',async()=>{
 const literal=fixture({admission:'ABC_1',otherAdmission:'ABCX1'});
 const login={action:'login',admissionNumber:'abc_1',password:guardianPhone};
 assert.equal((await literal.call(login)).status,200);
 const ambiguous=fixture({admission:'ABC_1',otherAdmission:'abc_1'});
 assert.equal((await ambiguous.call(login)).status,401);
 assert.equal((await ambiguous.call({...login,schoolId:school})).status,200);
});

test('existing school-scoped exact login aliases keep working alongside lowercase canonical lookup',async()=>{
 const f=fixture({admission:'ADM-1',alias:'adm-1'});
 const login={action:'login',schoolId:school,password:guardianPhone};
 const alias=await f.call({...login,admissionNumber:'adm-1'});
 const canonical=await f.call({...login,admissionNumber:'ADM-1'});
 assert.equal(alias.body.session?.access_token,legacyStudentId);
 assert.equal(canonical.body.session?.access_token,studentId);
});
