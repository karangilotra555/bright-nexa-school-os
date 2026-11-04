'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const core=require('../docs/platform-onboarding-core.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const reqId='11111111-1111-4111-8111-111111111111';
const institution='22222222-2222-4222-8222-222222222222';
const owner='33333333-3333-4333-8333-333333333333';
const payload={school_name:' New    School ',owner_email:' PRINCIPAL@School.IN ',contact_phone:'+91 98765 43210',notes:'  Verified   representative '};
test('D2 create request validation normalizes owner email, official name and optional fields',()=>{
 const valid=core.requestInput(payload);
 assert.deepEqual(valid,{school_name:'New School',owner_email:'principal@school.in',
   contact_phone:'+91 98765 43210',notes:'Verified representative'});
 assert.equal(core.requestInput({...payload,contact_phone:'',notes:''}).contact_phone,null);
 assert.throws(()=>core.requestInput({...payload,school_name:'N'}),/3–120/);
 assert.throws(()=>core.requestInput({...payload,owner_email:'not-an-email'}),/valid school owner email/);
 assert.throws(()=>core.requestInput({...payload,contact_phone:'111'}),/valid school contact phone/);
 assert.throws(()=>core.requestInput({...payload,notes:'x'.repeat(301)}),/300/);
});
test('only a confirmed valid onboarding response with matching values is accepted',()=>{
 const expected={school_name:'School',owner_email:'owner@school.in',status:'draft'};
 const valid={ok:true,id:reqId,...expected};
 assert.equal(core.exactResponse(valid,expected).id,reqId);
 assert.throws(()=>core.exactResponse({ok:false,id:reqId,...expected},expected),/did not confirm/);
 assert.throws(()=>core.exactResponse({...valid,id:'bad'},expected),/did not confirm/);
 assert.throws(()=>core.exactResponse({...valid,owner_email:'other@school.in'},expected),/different onboarding record/);
});
test('stage transitions require manual owner invite and never treat draft as activated',()=>{
 const draft={id:reqId,school_name:'School',status:'draft',institution_id:null,owner_auth_user_id:null};
 assert.equal(core.canInvite(draft),true);
 for(const status of ['inviting','invited','needs_attention'])
   assert.equal(core.canInvite({...draft,status}),false);
 assert.equal(core.canInvite({...draft,status:'activated',institution_id:institution,owner_auth_user_id:owner}),false);
 assert.throws(()=>core.validOnboarding({...draft,status:'activated'}),/lacks school or owner/);
 assert.equal(core.validOnboarding({...draft,status:'activated',institution_id:institution,owner_auth_user_id:owner}).status,'activated');
 assert.throws(()=>core.validOnboarding({...draft,status:'error'}),/Malformed/);
 assert.equal(core.planSteps.length,5);
});
test('activation readiness fails closed until all six real checks pass',()=>{
 const ready={invite_sent:true,owner_verified:true,institution_id:institution,
   classes:1,teacher_accounts:1,teacher_assignments:1};
 assert.equal(core.readiness(ready).ready,true);
 for(const key of Object.keys(ready)){
   const changed={...ready,[key]:key==='institution_id'?null:0};
   assert.equal(core.readiness(changed).ready,false,key);
 }
 assert.match(core.readiness(ready).message,/No sample records/);
 assert.equal(core.readiness({...ready,classes:'1'}).ready,false);
});
test('onboarding list rejects duplicate rows and malformed activated records',()=>{
 const list=[{id:reqId,school_name:'Alpha',status:'draft',created_at:'2026-11-04T08:00:00Z'},
  {id:institution,school_name:'Beta',status:'invited',created_at:'2026-11-04T09:00:00Z'}];
 assert.deepEqual(core.summarize(list).rows.map(x=>x.school_name),['Beta','Alpha']);
 assert.equal(core.summarize(list).byState.draft,1);
 assert.throws(()=>core.summarize([...list,list[0]]),/Duplicate/);
 assert.throws(()=>core.summarize([{...list[0],id:'bad'}]),/Malformed/);
});
test('migration is staged, owner cannot self-elevate or mutate onboarding tables through browser',()=>{
 const sql=read('supabase/migrations/20261104161500_phase_d2_school_onboarding.sql');
 for(const table of ['bn_school_onboarding_requests','bn_school_onboarding_events']){
   assert.match(sql,new RegExp('alter table public\\.'+table+' enable row level security','i'));
   assert.match(sql,new RegExp('revoke all on table public\\.'+table+' from public,anon,authenticated','i'));
   assert.match(sql,new RegExp('grant select on table public\\.'+table+' to authenticated','i'));
   assert.doesNotMatch(sql,new RegExp('grant (insert|update|delete) on table public\\.'+table+' to authenticated','i'));
 }
 assert.match(sql,/create policy bn_onboarding_platform_read/i);
 assert.match(sql,/bn_platform_admins a where a\.auth_user_id=\(select auth\.uid\(\)\) and a\.active/i);
 assert.match(sql,/create unique index bn_onboarding_email_once/i);
 assert.match(sql,/bn_onboarding_consistent_status/);
});
test('trial creation is atomic and only server-role RPC; normal owners cannot assign owner privileges',()=>{
 const sql=read('supabase/migrations/20261104161500_phase_d2_school_onboarding.sql');
 assert.match(sql,/create function public\.bn_complete_school_invitation/i);
 assert.match(sql,/where id=p_request_id for update/i);
 assert.match(sql,/if not found or v_request\.status<>'inviting'/i);
 assert.match(sql,/lower\(email\)=v_request\.owner_email/i);
 assert.match(sql,/insert into public\.institutions\(name,status\)/i);
 assert.match(sql,/values\(v_request\.school_name,'trial'\)/i);
 assert.match(sql,/insert into public\.school_users\(institution_id,auth_user_id,email,role,status\)/i);
 assert.match(sql,/values\(v_school,p_owner_id,v_request\.owner_email,'school_admin','active'\)/i);
 assert.match(sql,/insert into public\.school_contact_profiles/i);
 assert.match(sql,/revoke all on function public\.bn_complete_school_invitation\(uuid,uuid,uuid,text\) from public,anon,authenticated/i);
 assert.match(sql,/grant execute on function public\.bn_complete_school_invitation\(uuid,uuid,uuid,text\) to service_role/i);
 assert.match(sql,/security invoker/i);
});
test('activation requires verified invited owner, a genuine class and active teacher assignment',()=>{
 const sql=read('supabase/migrations/20261104161500_phase_d2_school_onboarding.sql');
 assert.match(sql,/create function public\.bn_activate_invited_school/i);
 assert.match(sql,/v_request\.owner_verified_at is null/i);
 assert.match(sql,/from public\.school_classes c where c\.institution_id=v_request\.institution_id/i);
 assert.match(sql,/from public\.school_teacher_assignments a/i);
 assert.match(sql,/join public\.school_users u/i);
 assert.match(sql,/a\.active=true/i);
 assert.match(sql,/u\.role='teacher' and u\.status='active'/i);
 assert.match(sql,/where id=v_request\.institution_id and status='trial'/i);
 assert.match(sql,/set status='activated',activated_at=now\(\)/i);
 assert.match(sql,/grant execute on function public\.bn_activate_invited_school\(uuid,uuid\) to service_role/i);
 assert.match(sql,/grant execute on function public\.bn_onboarding_readiness\(uuid,uuid\) to service_role/i);
 assert.doesNotMatch(sql,/insert into public\.school_students|insert into public\.school_staff_profiles|delete from public\.institutions/i);
});
test('Edge function verifies JWT and active platform membership before privileged actions',()=>{
 const src=read('supabase/functions/platform-school-onboarding/index.ts');
 assert.match(src,/auth\.auth\.getUser\(match\[1\]\)/);
 assert.match(src,/\.from\("bn_platform_admins"\)/);
 assert.match(src,/\.eq\("active",true\)\.maybeSingle\(\)/);
 assert.match(src,/if\(membershipErr\|\|!membership/);
 assert.match(src,/Deno\.env\.get\("SUPABASE_SECRET_KEY"\)/);
 assert.match(src,/createClient\(URL,PRIVILEGED_KEY/);
 assert.match(src,/ALLOWED_ORIGINS/);
 assert.match(src,/req\.method!=="POST"/);
 assert.match(src,/bn_complete_school_invitation/);
 assert.match(src,/bn_activate_invited_school/);
 assert.match(src,/bn_onboarding_readiness/);
 assert.match(src,/admin\.auth\.admin\.getUserById/);
 assert.match(src,/admin\.auth\.admin\.inviteUserByEmail/);
 assert.match(src,/needs_attention/);
 assert.doesNotMatch(src,/const PRIVILEGED_KEY = ['"]|createUser\(\{\s*password/);
});
test('platform UI has explicit create/invite/verify/activate actions and no hardcoded account secrets',()=>{
 const html=read('docs/platform-admin.html'),js=read('docs/platform-onboarding.js'),
   platform=read('docs/platform-admin.js');
 assert.equal((html.match(/id="onboardingPanel"/g)||[]).length,1);
 for(const id of ['onboardingForm','newSchoolName','newOwnerEmail','newSchoolPhone','onboardingList',
   'onboardingCurrent','onboardingReadiness','onboardingActions','onboardingActionStatus'])
   assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.ok(html.indexOf('platform-onboarding-core.js')<html.indexOf('platform-onboarding.js'));
 assert.ok(html.indexOf('platform-onboarding.js')<html.indexOf('platform-admin.js'));
 assert.match(js,/crypto\.randomUUID\(\)/);
 assert.match(js,/confirm\('Send a real Supabase email invitation/);
 assert.match(js,/confirm\('Activate "/);
 assert.match(js,/call\('check'/);
 assert.match(js,/call\('create'/);
 assert.match(js,/perform\('invite'/);
 assert.match(js,/perform\('activate'/);
 assert.match(platform,/BrightNexaPlatformOnboarding\?\.refresh/);
 assert.match(platform,/BrightNexaPlatformOnboarding\?\.reset/);
 assert.doesNotMatch(js,/service_role|sb_secret_|localStorage\.setItem|demoPassword/);
 for(const code of [js,platform,read('docs/platform-onboarding-core.js')])
   assert.doesNotThrow(()=>new vm.Script(code));
});
test('D2 does not rewrite existing school owner modules, bypass backups or secretly publish anything',()=>{
 const sql=read('supabase/migrations/20261104161500_phase_d2_school_onboarding.sql');
 assert.doesNotMatch(sql,/drop table public\.(institutions|school_users|school_students)|update public\.school_students/i);
 const html=read('docs/platform-admin.html');
 assert.match(html,/No seeded\/example students or staff/i);
 const src=read('supabase/functions/platform-school-onboarding/index.ts');
 assert.doesNotMatch(src,/from\("school_students"\)|from\("school_fee_entries"\)|from\("school_guardians"\)/);
 const owner=read('docs/real-owner-workspace.js'),sw=read('docs/owner-offline-sw.js');
 assert.ok(!owner.includes('BrightNexaPlatformOnboarding'));
 assert.ok(!sw.includes('platform-onboarding.js'));
});

test('2026 Supabase secret maps are read server-side and local admin API keys are not embedded',()=>{
 const edge=read('supabase/functions/platform-school-onboarding/index.ts');
 assert.match(edge,/defaultKey\("SUPABASE_SECRET_KEYS","SUPABASE_SECRET_KEY","SUPABASE_SERVICE_ROLE_KEY"\)/);
 assert.match(edge,/defaultKey\("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_PUBLISHABLE_KEY","SUPABASE_ANON_KEY"\)/);
 assert.match(edge,/JSON\.parse\(raw\)/);
 assert.match(edge,/auth\.auth\.getUser\(match\[1\]\)/);
 const sql=read('supabase/migrations/20261104161500_phase_d2_school_onboarding.sql');
 assert.match(sql,/grant select,insert,update on table public\.bn_school_onboarding_requests to service_role/i);
 assert.match(sql,/grant select,insert on table public\.bn_school_onboarding_events to service_role/i);
 assert.match(sql,/grant usage,select on sequence public\.bn_school_onboarding_events_id_seq to service_role/i);
});
test('readiness is never fabricated following a successful activate action',()=>{
 const src=read('docs/platform-onboarding.js');
 assert.match(src,/const actual=await call\('check',\{request_id:current\.id\}\)/);
 assert.doesNotMatch(src,/displayReadiness\(\{\.\.\.data,invite_sent:true/);
 assert.match(src,/status\('onboardingActionStatus',successMessage\)/);
});
