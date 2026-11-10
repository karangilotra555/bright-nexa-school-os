'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const loader=require('../school-erp-entry.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const SCHOOL='bc80e32d-485d-48a8-903a-92338aa61005';
const ADMIN='35c83b14-117e-4bb3-aac6-b2c7ab73c29a';
const STAFF='bn_school_staff_session_v1';
const ERP='bright-nexa-school-os:session:v2';
const SELECTED='bn_school_staff_selected_school_v1';
function store(values={}){
 const m=new Map(Object.entries(values));
 return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};
}
function response(payload,ok=true){return {ok,status:ok?200:401,json:async()=>payload};}
function fixture({role='school_admin',memberActive=true,schoolActive=true,pullNull=true,userId=ADMIN,crossSchool=false,denyAuth=false}={}){
 const storeObj=store({
  [STAFF]:JSON.stringify({access_token:'fake-jwt',refresh_token:'fake-refresh',expires_at:Math.floor(Date.now()/1000)+3600}),
  [SELECTED]:SCHOOL
 });
 const calls=[];
 const fetcher=async(url,args={})=>{
  calls.push({url,headers:args.headers,body:args.body});
  if(url.endsWith('/auth/v1/user'))return response(denyAuth?{message:'invalid token'}:{id:userId},!denyAuth);
  if(url.includes('/rest/v1/school_users?'))return response([{id:'11111111-1111-4111-8111-111111111111',
    auth_user_id:userId,institution_id:crossSchool?'11111111-2222-4333-8444-555555555555':SCHOOL,role,
    status:memberActive?'active':'disabled',display_name:'School Admin',email:'admin@school.test'}]);
  if(url.includes('/rest/v1/institutions?'))return response([{id:SCHOOL,name:'Haridwar Public School',status:schoolActive?'trial':'disabled'}]);
  if(url.endsWith('school_workspace_pull'))return response({school:{id:SCHOOL},revision:0,snapshot:pullNull?null:{institution:{institution:{name:'Haridwar Public School'}}}});
  if(url.endsWith('bn_initialize_school_workspace'))return response({school:{id:SCHOOL},revision:0,
    snapshot:{institution:{institution:{name:'Haridwar Public School'}},students:[],operations:{}}});
  throw Error('Unexpected cloud call '+url);
 };
 return {storeObj,calls,fetcher};
}
test('existing-school handoff requires staff session and not merely URL parameters',()=>{
 assert.equal(loader.cloudEntryRequired({search:'?openSchool=true'}),true);
 assert.equal(loader.cloudEntryRequired({search:'',staffSession:{access_token:'x'}}),true);
 assert.equal(loader.cloudEntryRequired({search:'',erpSession:{cloudVerified:true}}),true);
 assert.equal(loader.cloudEntryRequired({search:''}),false);
 assert.match(read('teacher-access.js'),/roleDestination/);
});
test('verified active school_admin initializes missing workspace and establishes ERP UI bridge',async()=>{
 const x=fixture();
 const result=await loader.verify({store:x.storeObj,fetcher:x.fetcher});
 assert.equal(result.schoolId,SCHOOL);
 assert.equal(result.name,'Haridwar Public School');
 assert.equal(JSON.parse(x.storeObj.getItem(ERP)).role,'OWNER');
 assert.equal(JSON.parse(x.storeObj.getItem(ERP)).cloudVerified,true);
 assert.equal(x.calls.filter(c=>c.url.includes('/auth/v1/user')).length,1);
 assert.equal(x.calls.filter(c=>c.url.endsWith('bn_initialize_school_workspace')).length,1);
 assert.equal(x.calls.filter(c=>c.url.endsWith('school_workspace_pull')).length,1);
 for(const c of x.calls.filter(c=>c.url.includes('/rest/v1/')))assert.match(c.headers.Authorization,/^Bearer /);
});
test('existing initialized workspace does not get overwritten or reinitialized',async()=>{
 const x=fixture({pullNull:false});
 await loader.verify({store:x.storeObj,fetcher:x.fetcher});
 assert.equal(x.calls.some(c=>c.url.endsWith('bn_initialize_school_workspace')),false);
});
test('teacher, disabled admin, suspended school and unauthorized identity fail closed',async()=>{
 for(const scenario of [{role:'teacher'},{memberActive:false},{schoolActive:false},{crossSchool:true},{denyAuth:true}]){
  const x=fixture(scenario);
  await assert.rejects(loader.verify({store:x.storeObj,fetcher:x.fetcher}));
  assert.equal(x.storeObj.getItem(ERP),null);
 }
});
test('missing staff session cannot create ERP admin login on its own',async()=>{
 const x=fixture();x.storeObj.removeItem(STAFF);
 await assert.rejects(loader.verify({store:x.storeObj,fetcher:x.fetcher}),/session not found/i);
 assert.equal(x.storeObj.getItem(ERP),null);
});
test('bad school and non-UUID user IDs are rejected',async()=>{
 const x=fixture({userId:'stranger'});
 await assert.rejects(loader.verify({store:x.storeObj,fetcher:x.fetcher}),/Unverified/);
});
test('current root, docs and PWA distribution load verification bootstrap instead of the old unconditional module tag',()=>{
 for(const prefix of ['', 'docs/','app-extracted/dist/']){
  const html=read(prefix+'index.html');
  assert.match(html,/school-erp-entry\.js\?v=20261110-class-setup-cloud-v1/);
  assert.doesNotMatch(html,/<script type="module" crossorigin src="\.\/assets\/index-brightnexa-v2\.js/);
  assert.ok(read(prefix+'school-erp-entry.js').includes("school_workspace_pull"),prefix);
 }
 assert.equal(read('school-erp-entry.js'),read('docs/school-erp-entry.js'));
 assert.equal(read('school-erp-entry.js'),read('app-extracted/dist/school-erp-entry.js'));
});
test('workspace bootstrap migration is admin-only and non-destructive',()=>{
 const sql=read('supabase/migrations/20261107191500_bn_initialize_school_workspace.sql');
 assert.match(sql,/school_private\.has_role\(p_institution_id, ARRAY\['school_admin'\]\)/);
 assert.match(sql,/UPDATE public\.school_workspaces[\s\S]*snapshot IS NULL/);
 assert.match(sql,/RETURN public\.school_workspace_pull\(p_institution_id\)/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.bn_initialize_school_workspace\(uuid\) FROM PUBLIC, anon/);
 assert.doesNotMatch(sql,/DELETE FROM public\.school_/);
});
