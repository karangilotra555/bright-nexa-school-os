'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {fetchRoster}=require('../school-phase4-roster.js');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const store={token:JSON.stringify({access_token:'jwt-test',refresh_token:'refresh-test',expires_at:4000000000}),
 getItem(){return this.token},setItem(_,v){this.token=v}};
function response(v,ok=true){return {ok,async json(){return v}}}
function server({role='school_admin',status='active',wrongTenant=false}={}){
 const requests=[];
 const request=async(url,opts)=>{
  requests.push({url,opts});
  if(url.includes('/auth/v1/user'))return response({id:'verified-auth-user'});
  if(url.includes('/rest/v1/school_users'))return response([{id:'staff-1',institution_id:'school-A',role,status:'active'}]);
  if(url.includes('/rest/v1/institutions'))return response([{id:'school-A',status}]);
  if(url.includes('/rest/v1/school_classes'))return response([{id:'class-1',institution_id:wrongTenant?'school-B':'school-A',name:'Class 1',section:'A',academic_year:'2026-2027'}]);
  if(url.includes('/rest/v1/school_staff_profiles'))return response([{id:'staff-2',institution_id:'school-A',display_name:'Teacher One',staff_category:'teaching',is_seeded_test:false}]);
  throw Error('Unknown API '+url);
 };
 return {request,requests};
}
test('school timetable roster requires verified admin/principal and uses only tenant-filtered read-only GETs',async()=>{
 const mock=server();
 const r=await fetchRoster({storage:store,fetcher:mock.request,now:1000000000});
 assert.equal(r.institution_id,'school-A');assert.equal(r.classes.length,1);
 assert.equal(r.classes[0].label,'Class 1 A (2026-2027)');
 assert.equal(r.teachers[0].name,'Teacher One');
 assert.ok(mock.requests.every(x=>!x.opts.method||x.opts.method==='GET'));
 assert.ok(mock.requests.filter(x=>x.url.includes('/rest/v1/school_')).every(x=>x.url.includes('auth_user_id=eq.')||x.url.includes('institution_id=eq.')));
 assert.ok(mock.requests.every(x=>x.opts.headers.Authorization==='Bearer jwt-test'));
});
test('teachers and accountants cannot use the all-school roster endpoint via UI helper',async()=>{
 for(const role of ['teacher','accountant']){
  const mock=server({role});
  await assert.rejects(()=>fetchRoster({storage:store,fetcher:mock.request,now:1000000000}),/admin or principal/);
  assert.equal(mock.requests.some(x=>x.url.includes('school_classes')),false);
 }
});
test('inactive school is denied and cross-tenant rows fail closed',async()=>{
 await assert.rejects(()=>fetchRoster({storage:store,fetcher:server({status:'suspended'}).request,now:1000000000}),/inactive or access was revoked/);
 await assert.rejects(()=>fetchRoster({storage:store,fetcher:server({wrongTenant:true}).request,now:1000000000}),/another school/);
});
test('missing or expired session cannot be overridden by a sample-mode flag',async()=>{
 await assert.rejects(()=>fetchRoster({storage:{getItem:()=>null},fetcher:server().request}),/Sign in as school admin/);
 await assert.rejects(()=>fetchRoster({storage:{getItem:()=>JSON.stringify({access_token:'expired',expires_at:0})},fetcher:server().request}),/session expired/);
});
test('cloud class/staff picker exists in both Smart Tools page copies and starts without fictional teachers',()=>{
 const html=read('smart-tools.html'),ui=read('smart-tools-ui.js');
 assert.equal(html,read('docs/smart-tools.html'));
 assert.equal(ui,read('docs/smart-tools-ui.js'));
 assert.equal(read('school-phase4-roster.js'),read('docs/school-phase4-roster.js'));
 assert.match(html,/id="loadCloudRoster"/);
 assert.ok(html.indexOf('school-phase4-roster.js')<html.indexOf('smart-tools-ui.js'));
 assert.match(ui,/BrightNexaSchoolRoster\.fetchRoster/);
 assert.match(ui,/editor\.demands=roster\.classes\.map/);
 assert.match(ui,/editor\.teachers=roster\.teachers\.map/);
 assert.doesNotMatch(ui,/^loadEditorCsv\(DEMO\.teachers,DEMO\.demands\);/m);
 for(const s of ['school-phase4-roster.js','smart-tools-ui.js'])assert.doesNotThrow(()=>new vm.Script(read(s)));
});

test('multiple admin memberships must not silently select one school',async()=>{
 const m=server();
 const multi=async(url,opts)=>url.includes('/rest/v1/school_users')
   ?response([{id:'one',role:'school_admin',institution_id:'school-A',status:'active'},
              {id:'two',role:'school_admin',institution_id:'school-B',status:'active'}])
   :m.request(url,opts);
 await assert.rejects(()=>fetchRoster({storage:store,fetcher:multi,now:1000000000}),/more than one school/);
});
