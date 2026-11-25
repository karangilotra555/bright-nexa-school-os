'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../app-extracted/src/BrightNexaApp.jsx'),'utf8');
const start=source.indexOf('async function bnInviteTeacherAppAccount(');
const end=source.indexOf('function _Component10(', start);
assert.ok(start>=0 && end>start, 'Faculty account invitation function must exist');
const isolated=source.slice(start,end);
const goodSession={
  'bn_school_staff_session_v1':JSON.stringify({access_token:'owner-token',expires_at:Math.floor(Date.now()/1000)+900}),
  'bright-nexa-school-os:session:v2':JSON.stringify({cloudVerified:true,institutionId:'school-id'}),
  'bn_school_staff_selected_school_v1':'school-id'
};
function harness({storage=goodSession,response={ok:true,role:'teacher',status:'invited',assignments:0,email:'mkbmony@gmail.com'},status=201}={}){
  const calls=[];
  const context={
    sessionStorage:{getItem:(key)=>storage[key]??null},
    fetch:async(...args)=>{calls.push(args);return {ok:status>=200&&status<300,json:async()=>response}},
    Date,Error,JSON,String,Number
  };
  vm.runInNewContext(isolated+'\nthis.invite=bnInviteTeacherAppAccount;',context);
  return {invite:context.invite,calls};
}
test('faculty profile keeps manual access recovery available',()=>{
 assert.ok(source.includes('Create / Sync Teacher App Access'));
 assert.ok(source.includes('onClick={inviteTeacher}'));
});
test('invitation only uses authenticated school admin and teacher role',async()=>{
 const h=harness();const r=await h.invite({id:'faculty-1',status:'Active',email:'MKBMONY@GMAIL.COM'});
 assert.equal(r.email,'mkbmony@gmail.com');
 assert.equal(r.status,'invited');
 assert.equal(h.calls.length,1);
 const [url,request]=h.calls[0];
 assert.ok(url.endsWith('/functions/v1/school-invite-staff'));
 assert.equal(request.method,'POST');
 assert.equal(request.headers.Authorization,'Bearer owner-token');
 assert.deepEqual(JSON.parse(request.body),{email:'mkbmony@gmail.com',role:'teacher',facultyId:'faculty-1'});
});
test('does not invite when not in cloud-verified school or missing email',async()=>{
 const h=harness({storage:{}});
 await assert.rejects(h.invite({id:'faculty-1',status:'Active',email:'mkbmony@gmail.com'}),/verified School Admin/);
 assert.equal(h.calls.length,0);
 await assert.rejects(h.invite({id:'faculty-1',status:'Active',email:''}),/valid teacher email/);
 assert.equal(h.calls.length,0);
});
test('does not report success on edge function or membership failure',async()=>{
 const h=harness({status:422,response:{error:'Invitation not sent. Verify email settings.'}});
 await assert.rejects(h.invite({id:'faculty-1',status:'Active',email:'mkbmony@gmail.com'}),/Invitation not sent/);
});
test('does not confuse request acceptance with email delivery',()=>{
 assert.ok(source.includes('delivery and activation are not yet confirmed.'));
});

test('saving a teacher provisions the app account after Supabase confirms the faculty profile',async()=>{
 const slice=source.slice(source.indexOf('  let d = async (n) => {',source.indexOf('function Sr({ data:')),source.indexOf('  let f = async (teacher) => {'));
 const teacher={id:'faculty-1',name:'Test teacher',status:'Active',email:'teacher@example.test',mobile:'9000000000'};
 const events=[];
 let result={status:'local',pending:true};
 const context={e:{teachers:[]},t:async()=>{events.push('profile');return result;},
  bnEnsureTeacherAppAccount:async()=>{events.push('account');return 'Teacher App access created.';},
  setTeacherSaveFeedback:()=>{},r:()=>events.push('close'),s:()=>{}};
 vm.runInNewContext(slice+'\nthis.save=d;',context);
 await assert.rejects(context.save(teacher),/not confirmed/);
 assert.deepEqual(events,['profile']);
 events.length=0;result={status:'synced',pending:false};
 await context.save(teacher);
 assert.deepEqual(events,['profile','account','close']);
 context.bnEnsureTeacherAppAccount=async()=>{throw Error('Account setup temporarily unavailable');};
 events.length=0;
 await assert.rejects(context.save(teacher),/profile saved.*Account setup temporarily unavailable/i);
 assert.deepEqual(events,['profile']);
});

function edgeFixture({existing=null,authUsers=[],facultyLink=null,interrupt=false,writable=true}={}){
 const writes=[];
 const source=fs.readFileSync(path.join(__dirname,'../supabase/functions/school-invite-staff/index.ts'),'utf8').replace(/^import[^\n]+\n/,'');
 const {transformSync}=require('esbuild');
 const teacher={id:'faculty-1',email:'teacher@example.test',name:'Test Teacher',status:'Active',joiningDate:'2026-11-01',employmentType:'Permanent',mobile:'9000000000',assignedClasses:[],subjects:[]};
 const admin={async rpc(name,data){
  if(name==='bn_school_writable')return {data:writable};
  assert.equal(name,'bn_create_teacher_app_membership');
  writes.push(['database','provision',data]);
  if(interrupt){interrupt=false;return {error:{message:'write failed'}};}
  return {data:'new-member'};
 },from(table){
  const filter={};let mode='select',record;
  const query={select(){return query;},eq(k,v){filter[k]=v;return query;},
   insert(data){mode='insert';record=data;writes.push([table,mode,data]);return query;},
   update(data){mode='update';writes.push([table,mode,data]);return query;},
   upsert(data){mode='upsert';writes.push([table,mode,data]);return query;},
   async maybeSingle(){
    if(table==='school_users'&&filter.role==='school_admin')return {data:{id:'admin',institution_id:'school',role:'school_admin',status:'active'}};
    if(table==='school_users'&&filter.id)return {data:existing?.id===filter.id?existing:null};
    if(table==='school_users')return {data:existing};
    return {data:facultyLink};
   },
   async single(){
    if(table==='school_workspaces')return {data:{revision:7,snapshot:{operations:{teachers:[teacher]}}}};
    assert.equal(mode,'insert');return {data:{id:'member',...record}};
   },
   then(resolve){resolve({data:[]});}
  };return query;
 },auth:{admin:{
  async listUsers(){return {data:{users:authUsers}};},
  async createUser(data){writes.push(['auth','create',data]);authUsers.push({id:'new-auth',...data});return {data:{user:{id:'new-auth'}}};},
  async inviteUserByEmail(email){writes.push(['auth','invite',email]);return {data:{user:{id:'invited-auth'}}};},
  async getUserById(id){return {data:{user:authUsers.find(user=>user.id===id)}};}
 }}};
 const context={Deno:{env:{get:key=>key},serve:h=>{context.handler=h;}},Response,crypto,TextEncoder,
  createClient:(_url,key)=>key==='SUPABASE_ANON_KEY'?{auth:{getUser:async()=>({data:{user:{id:'admin-auth'}}})}}:admin};
 vm.runInNewContext(transformSync(source,{loader:'ts'}).code,context);
 return {writes,handler:context.handler,async ensure(){
  const answer=await context.handler(new Request('https://test.invalid',{method:'POST',headers:{authorization:'Bearer test'},
   body:JSON.stringify({action:'ensure_teacher_account',role:'teacher',facultyId:teacher.id,email:teacher.email})}));
  return {status:answer.status,body:await answer.json()};
 }};
}

test('TDD RED: expired school blocks staff invites before creating auth users or sending emails',async()=>{
 const f=edgeFixture({writable:false});
 const inviteRes=await f.handler(new Request('https://test.invalid',{method:'POST',headers:{authorization:'Bearer test'},
  body:JSON.stringify({email:'acc@example.test',role:'accountant'})}));
 assert.equal(inviteRes.status,403);
 assert.match((await inviteRes.json()).error,/read-only/i);
 assert.deepEqual(f.writes,[],'Expired school must not create Auth accounts or send invite emails');
});
test('automatic provisioning preserves existing active and disabled accounts and their assignments',async()=>{
 for(const status of ['active','disabled']){
  const f=edgeFixture({existing:{id:'member',role:'teacher',status,email:'teacher@example.test',auth_user_id:'prior-auth'},authUsers:[{id:'prior-auth',email:'teacher@example.test'}]});
  const result=await f.ensure();
  assert.equal(result.status,200);
  assert.equal(result.body.status,status==='active'?'existing-unlinked':'disabled');
  assert.deepEqual(f.writes,[]);
 }
});
test('automatic provisioning creates a new teacher account without sending mail or repurposing an existing identity',async()=>{
 const existing=edgeFixture({authUsers:[{id:'prior-auth',email:'teacher@example.test',app_metadata:{}}]});
 const rejected=await existing.ensure();
 assert.equal(rejected.status,409);
 assert.deepEqual(existing.writes,[]);
 const f=edgeFixture(),result=await f.ensure();
 assert.equal(result.status,201);
 assert.equal(result.body.initialMobilePassword,true);
 assert.equal(result.body.emailSent,false);
 assert.equal(f.writes[0][0],'auth');
 assert.equal(f.writes[0][2].app_metadata.bn_teacher_mobile_pending,true);
 assert.equal(f.writes[1][2].p_staff.designation,'');
 assert.equal(f.writes[1][2].p_staff.notes,'ERP faculty ref: faculty-1');
 assert.equal(f.writes[1][2].p_revision,7);
});

test('an interrupted automatic membership retries the scoped identity without creating a duplicate',async()=>{
 const f=edgeFixture({interrupt:true});
 assert.equal((await f.ensure()).status,503);
 assert.equal((await f.ensure()).status,201);
 assert.deepEqual(f.writes.map(w=>w[0]),['auth','database','database']);
});

test('teacher membership, faculty link and assignments commit together and the RPC is service-only',async t=>{
 const {PGlite}=require('@electric-sql/pglite');
 const db=new PGlite();
 t.after(()=>db.close());
 const ids=Array.from({length:5},(_,i)=>'00000000-0000-0000-0000-'+String(i+1).padStart(12,'0'));
 const [school,actor,auth,otherClass,member]=ids;
 await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create table school_users(id uuid default '${member}' primary key,institution_id uuid,email text,role text,status text,auth_user_id uuid unique,display_name text);
  create table school_workspaces(institution_id uuid primary key,revision bigint);
  create table school_staff_profiles(institution_id uuid,school_user_id uuid,display_name text,staff_category text,designation text not null,employment_type text,contact_email text,contact_mobile text,contract_end_on date,days_per_week int,hours_per_day numeric,visits_per_month int,notes text);
  create table school_teacher_assignments(institution_id uuid,school_user_id uuid,class_id uuid,subject text check(subject<>'reject'),assignment_type text,active bool,can_view_roster bool,can_take_attendance bool,can_assign_homework bool,can_enter_marks bool);
  create table school_audit_events(institution_id uuid,actor_id uuid,action text,entity text,entity_id uuid);
  insert into school_users values ('${actor}','${school}','admin@example.test','school_admin','active',null,'School Admin');
  insert into school_workspaces values ('${school}',7);
 `);
 await db.exec(fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261116165100_ensure_teacher_app_account.sql'),'utf8'));
 const call=(subject,revision=7)=>db.query('select public.bn_create_teacher_app_membership($1,$2,$3,$4,$5,$6,$7) as id',
  [school,actor,auth,revision,'teacher@example.test',JSON.stringify({display_name:'Teacher',designation:'',employment_type:'permanent',contact_mobile:'9000000000',notes:'ERP faculty ref: faculty-1'}),JSON.stringify([{class_id:otherClass,subject}])]);
 await db.exec('set role authenticated');
 await assert.rejects(call('Math'),/permission denied/);
 await db.exec('reset role');
 await assert.rejects(call('Math',6),/faculty record changed/i);
 await assert.rejects(call('reject'),/check constraint/i);
 assert.equal((await db.query("select count(*)::int as n from school_users where role='teacher'")).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int as n from school_staff_profiles')).rows[0].n,0);
 assert.equal((await call('Math')).rows[0].id,member);
 assert.equal((await db.query("select count(*)::int as n from school_users where role='teacher' and status='active'")).rows[0].n,1);
 assert.equal((await db.query('select subject from school_teacher_assignments')).rows[0].subject,'Math');
});
