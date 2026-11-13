'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {create}=require('../school-student-photo-publisher.js');
const SCHOOL='11111111-1111-4111-8111-111111111111';
const STUDENT='22222222-2222-4222-8222-222222222222';
const STAFF='bn_school_staff_session_v1';
const ERP='bright-nexa-school-os:session:v2';
function harness({denied=false,wrongSchool=false,readback401=false}={}){
 const data=new Map([
  [ERP,JSON.stringify({cloudVerified:true,role:'OWNER',institutionId:SCHOOL})],
  [STAFF,JSON.stringify({access_token:'expired-token',refresh_token:'recovery-token',expires_at:1})]
 ]);
 const storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};
 let cloudCalls=0,apiReads=0,uploads=0;
 const client=create({
  storage,
  schoolClient:{connect:async()=>{
   cloudCalls++;
   if(denied)throw Error('School session expired; sign in again');
   const staff=JSON.parse(storage.getItem(STAFF));
   storage.setItem(STAFF,JSON.stringify({...staff,access_token:'fresh-token',expires_at:Date.now()/1000+3600}));
   return [{id:wrongSchool?'99999999-9999-4999-8999-999999999999':SCHOOL}];
  }},
  fetcher:async(url,init)=>{
   apiReads++;
   assert.equal(init.headers.Authorization,'Bearer fresh-token','Readback must use refreshed JWT');
   if(readback401)return {ok:false,status:401};
   const p=new URL(url).pathname;
   let rows=[];
   if(p.endsWith('/school_students'))rows=[{id:STUDENT,status:'active'}];
   if(p.endsWith('/school_student_profiles'))rows=[{student_id:STUDENT,details:{photo_path:SCHOOL+'/'+STUDENT+'/photo-abc.jpg'}}];
   if(p.endsWith('/school_workspace_links'))rows=[{local_id:'saved-student',cloud_id:STUDENT}];
   return {ok:true,status:200,json:async()=>rows};
  },
  photos:{upload:async()=>{uploads++;throw Error('Duplicate private photo upload was not expected');}}
 });
 return {client,get cloudCalls(){return cloudCalls},get apiReads(){return apiReads},get uploads(){return uploads}};
}
test('expired owner token is renewed before private photo readback; already-published photo never uploaded twice',async()=>{
 const x=harness();const r=await x.client.run();
 assert.equal(r.status,'up-to-date');
 assert.equal(x.cloudCalls,1);
 assert.equal(x.apiReads,3);
 assert.equal(x.uploads,0);
});
test('expired session or cross-school membership fails closed without touching images',async()=>{
 for(const kind of [{denied:true},{wrongSchool:true}]){
  const x=harness(kind);const r=await x.client.run();
  assert.equal(r.status,'failed');
  assert.equal(x.apiReads,0);
  assert.equal(x.uploads,0);
 }
});
test('401 photo readback is reported as unverified, never proof that image is missing',async()=>{
 const x=harness({readback401:true}),r=await x.client.run();
 assert.equal(r.status,'failed');
 assert.match(r.message,/HTTP 401/);
 assert.equal(x.uploads,0);
 const source=fs.readFileSync(path.join(__dirname,'../school-student-photo-publisher.js'),'utf8');
 assert.match(source,/This does not mean the photo is missing/);
 assert.equal(source,fs.readFileSync(path.join(__dirname,'../docs/school-student-photo-publisher.js'),'utf8'));
 assert.equal(source,fs.readFileSync(path.join(__dirname,'../app-extracted/dist/school-student-photo-publisher.js'),'utf8'));
});
