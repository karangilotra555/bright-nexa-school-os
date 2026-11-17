'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const read=p=>fs.readFileSync(require('node:path').join(__dirname,'..',p),'utf8');
const {create}=require('../leadership-app.js');
const school='00000000-0000-4000-8000-000000000001',person='00000000-0000-4000-8000-000000000002';
const leave='00000000-0000-4000-8000-000000000003';
function backend(role='principal'){
 const calls=[];
 const token={access_token:'test-access',refresh_token:'test-refresh',expires_in:3600};
 const response=(data,headers={})=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json',...headers}});
 const fetcher=async(url,request={})=>{
  const path=new URL(url).pathname;
  calls.push({path,body:request.body?JSON.parse(request.body):null,headers:request.headers});
  if(path==='/auth/v1/token')return response(token);
  if(path==='/auth/v1/user')return response({id:person});
  if(path==='/rest/v1/school_users'&&url.includes('auth_user_id='))return response([{id:person,institution_id:school,role,status:'active',display_name:'Head of school'}]);
  if(path==='/rest/v1/institutions')return response([{id:school,name:'Verified school',status:'active'}]);
  if(path==='/rest/v1/school_users')return response([{id:person}],{'content-range':'0-0/7'});
  if(path==='/rest/v1/school_students')return response([{id:'student'}],{'content-range':'0-0/30'});
  if(path==='/rest/v1/rpc/bn_list_teacher_leaves')return response([
   {id:leave,teacher_name:'Teacher A',status:'pending',kind:'emergency'},
   {id:leave.replace(/3$/,'4'),teacher_name:'Teacher B',status:'approved',kind:'planned'}
  ]);
  if(path==='/rest/v1/rpc/bn_review_teacher_leave')return response(null);
  if(path==='/rest/v1/rpc/bn_teacher_leave_cover_plan')return response([{slot_id:'slot',class_id:'class',candidates:[]}]);
  if(path==='/rest/v1/rpc/bn_publish_teacher_covers')return response(null);
  throw Error('Unexpected request: '+url);
 };
 return {fetcher,calls};
}
test('Owner and Principal enter only through live verified Supabase memberships',async()=>{
 for(const role of ['principal','school_admin']){
  const mock=backend(role),client=create(mock.fetcher,null);
  const result=await client.login('principal@example.com','correct password');
  assert.equal(result.selected.role,role);
  assert.equal(result.selected.name,'Verified school');
  const stats=await client.overview();
  assert.equal(stats.students,30);
  assert.equal(stats.teachers,7);
  assert.equal(stats.pending,1);
  assert.equal(stats.emergency,1);
  await client.review(leave,'approved');
  assert.deepEqual(mock.calls.find(x=>x.path.endsWith('bn_review_teacher_leave')).body,
    {p_school:school,p_leave:leave,p_status:'approved'});
  await assert.rejects(client.review(leave,'cancelled'),/Invalid leave decision/);
  assert.throws(()=>client.choose('other-school'),/verified school/);
  await client.logout();
  await assert.rejects(client.overview(),/verified school/);
 }
});
test('Teacher and accountant credentials cannot access the leadership app',async()=>{
 for(const role of ['teacher','accountant','librarian']){
  const mock=backend(role),client=create(mock.fetcher,null);
  await assert.rejects(client.login('other@example.com','password'),/Owner or Principal/);
  await assert.rejects(client.overview(),/verified school/);
 }
});
test('Leadership mobile assets are mirrored and preserve ERP navigation',()=>{
 assert.equal(read('leadership.html'),read('docs/leadership.html'));
 assert.equal(read('leadership-app.js'),read('docs/leadership-app.js'));
 assert.equal(read('leadership.webmanifest'),read('docs/leadership.webmanifest'));
 const html=read('leadership.html');
 assert.match(html,/id="metricPending"/);
 assert.match(html,/id="leaveList"/);
 assert.match(html,/id="coverRows"/);
 assert.match(html,/school-mobile-session\.js/);
 for(const path of ['sw.js','docs/sw.js','app-extracted/dist/sw.js'])
   assert.match(read(path),/leadership\\\.html/);
});
test('Principal approval migration is narrowly scoped to leave and cover RPCs',()=>{
 const sql=read('supabase/migrations/20261118093000_principal_leave_approvals.sql');
 for(const fn of ['bn_list_teacher_leaves','bn_review_teacher_leave','bn_teacher_leave_cover_plan','bn_publish_teacher_covers'])
   assert.match(sql,new RegExp('create or replace function public\\.'+fn+'\\('));
 assert.equal((sql.match(/array\['school_admin','principal'\]/g)||[]).length,4);
 assert.doesNotMatch(sql,/grant .*all|drop table|truncate|delete from|school_fee_entries/i);
});
