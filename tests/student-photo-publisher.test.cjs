'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {create,decodePhoto}=require('../school-student-photo-publisher.js');
const SCHOOL='11111111-1111-4111-8111-111111111111';
const STUDENT='22222222-2222-4222-8222-222222222222';
const LOCAL='local-student-1';
const PHOTO='data:image/jpeg;base64,'+Buffer.from('jpeg fixture bytes').toString('base64');
const VERIFIED_PATH=SCHOOL+'/'+STUDENT+'/photo-0123456789abcdef.jpg';
function context({authorized=true,alreadyLinked=false,wrongSchool=false,withImage=true,unconfirmed=false}={}){
 const tokens=new Map([
  ['bright-nexa-school-os:session:v2',JSON.stringify({role:'OWNER',cloudVerified:authorized,institutionId:SCHOOL})],
  ['bn_school_staff_session_v1',JSON.stringify({access_token:'owner-test-jwt'})]
 ]);
 const storage={getItem:key=>tokens.get(key)||null};
 let published=alreadyLinked?VERIFIED_PATH:null,uploads=0,readbacks=0,workspaceReads=0;
 const snapshots=[{revision:8,snapshot:{institution:{institution:{id:wrongSchool?
   '99999999-9999-4999-8999-999999999999':SCHOOL}},students:[{
   id:LOCAL,photoDataUrl:withImage?PHOTO:''}],operations:{}}}];
 const fetcher=async(uri,options)=>{
   const url=new URL(uri);
   assert.equal(options.method,'GET');
   assert.equal(options.headers.Authorization,'Bearer owner-test-jwt');
   let data=[];
   if(url.pathname.endsWith('/school_students'))
     data=[{id:STUDENT,status:'active'}];
   else if(url.pathname.endsWith('/school_student_profiles')){
     readbacks++;
     data=[{student_id:STUDENT,details:published?{photo_path:published}:{}}];
   } else if(url.pathname.endsWith('/school_workspace_links'))
     data=[{local_id:LOCAL,cloud_id:STUDENT}];
   else if(url.pathname.endsWith('/school_workspaces')){
     workspaceReads++;
     data=snapshots;
   }else throw Error('Unknown read request: '+url);
   return {ok:true,status:200,async json(){return data}};
 };
 const photos={upload:async(school,student,file)=>{
   assert.equal(school,SCHOOL);
   assert.equal(student,STUDENT);
   assert.equal(file.type,'image/jpeg');
   assert.ok(file.size>0);
   uploads++;if(!unconfirmed)published=VERIFIED_PATH;
   return {path:VERIFIED_PATH};
 }};
 const client=create({storage,fetcher,photos});
 return {client,tokens,get uploads(){return uploads},get workspaceReads(){return workspaceReads},
 get readbacks(){return readbacks},get published(){return published}};
}
test('only a verified owner session can read student photo data',async()=>{
 const t=context({authorized:false});
 assert.equal((await t.client.run()).status,'not-authorized');
 assert.equal(t.workspaceReads,0);assert.equal(t.uploads,0);
});
test('existing published private photo skips large workspace download',async()=>{
 const t=context({alreadyLinked:true});
 assert.equal((await t.client.run()).status,'up-to-date');
 assert.equal(t.workspaceReads,0);assert.equal(t.uploads,0);
});
test('authenticated class/student link publishes missing photo and checks profile readback',async()=>{
 const t=context();
 const r=await t.client.run();
 assert.equal(r.status,'verified');assert.equal(r.published,1);
 assert.equal(t.uploads,1);assert.equal(t.published,VERIFIED_PATH);
 assert.ok(t.readbacks>=3);
});
test('fresh remote photo readback prevents duplicate storage upload',async()=>{
 const t=context();
 assert.equal((await t.client.run()).status,'verified');
 assert.equal((await t.client.run()).status,'retry-later');
 assert.equal(t.uploads,1);
});
test('workspace must match the selected tenant before publishing',async()=>{
 const t=context({wrongSchool:true});
 const r=await t.client.run();
 assert.equal(r.status,'failed');assert.equal(t.uploads,0);
 assert.match(r.message,/Verified school photo workspace/);
});
test('no embedded photo means no upload and no destructive writes',async()=>{
 const t=context({withImage:false});
 assert.equal((await t.client.run()).status,'verified');
 assert.equal(t.uploads,0);
});
test('decode rejects arbitrary URLs and oversized files',()=>{
 assert.throws(()=>decodePhoto('https://example.com/student.jpg'),/valid JPEG/);
 assert.throws(()=>decodePhoto('data:image/svg+xml;base64,AAAA'),/valid JPEG/);
 assert.throws(()=>decodePhoto('data:image/jpeg;base64,'+'A'.repeat(7000001)),/supported private JPEG/);
 assert.equal(decodePhoto(PHOTO).type,'image/jpeg');
});
test('upload is never declared successful without matching Supabase profile readback',async()=>{
 const t=context({unconfirmed:true});
 const r=await t.client.run();
 assert.equal(r.status,'failed');
 assert.match(r.message,/not verified/);
 assert.equal(t.uploads,1);
 assert.equal(t.published,null);
});

test('all ERP release entrypoints load the private photo publisher before ERP entry and precache matching bytes',()=>{
 const fs=require('node:fs');
 const path=require('node:path');
 const crypto=require('node:crypto');
 const root=path.resolve(__dirname,'..');
 const files=['school-student-photo-cloud.js','school-student-photo-publisher.js'];
 const version=['20261112-erp-private-photo-v1','20261113-photo-auth-refresh-v2'];
 const read=pathPart=>fs.readFileSync(path.join(root,pathPart),'utf8');
 for(const prefix of ['','docs/','app-extracted/dist/']){
   const html=read(prefix+'index.html');
   const sw=read(prefix+'sw.js');
   const entry=html.indexOf('school-erp-entry.js?v=');
   let prev=-1;
   for(let i=0;i<files.length;i++){
     const tag=files[i]+'?v='+version[i];
     const pos=html.indexOf(tag);
     assert.ok(pos>prev&&pos<entry,tag+' must load before ERP entry');
     prev=pos;
     assert.equal(read(prefix+files[i]),read(files[i]));
     const digest=crypto.createHash('sha256').update(read(files[i])).digest('hex');
     assert.ok(sw.includes('"url":"'+tag+'","revision":"'+digest+'"'),tag+' must be precached with exact SHA256');
   }
   assert.equal(read(prefix+'index.html'),read('index.html'));
 }
});
