'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const core=require('../docs/platform-admin-core.js');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const schoolA='11111111-1111-4111-8111-111111111111';
const schoolB='22222222-2222-4222-8222-222222222222';
const admin='33333333-3333-4333-8333-333333333333';
const inst=[{id:schoolA,name:'School A',status:'active'},{id:schoolB,name:'School B',status:'trial'}];
const plans=[{code:'pilot',name:'Pilot',visible:true},{code:'standard',name:'Standard',visible:true},
 {code:'hidden',name:'Hidden',visible:false}];
const valid={institution_id:schoolA,plan_code:'pilot',status:'trial',
 starts_on:'2026-11-04',ends_on:'2027-05-04',admin_note:'New school registered'};
test('platform onboarding requires tenant from verified portfolio, approved plan, owner UUID and allowed state',()=>{
 const x=core.formInput(valid,{institutions:inst,plans,ownerId:admin});
 assert.equal(x.institution_id,schoolA);assert.equal(x.updated_by,admin);
 assert.equal(x.ends_on,'2027-05-04');
 assert.throws(()=>core.formInput({...valid,institution_id:'foreign'}, {institutions:inst,plans,ownerId:admin}),/authorized platform list/);
 assert.throws(()=>core.formInput({...valid,plan_code:'hidden'}, {institutions:inst,plans,ownerId:admin}),/published plan/);
 assert.throws(()=>core.formInput({...valid,status:'paid'}, {institutions:inst,plans,ownerId:admin}),/allowed subscription status/);
 assert.throws(()=>core.formInput(valid,{institutions:inst,plans,ownerId:'invalid'}),/Verified platform administrator/);
});
test('subscription identity cannot move to another school and stale dates are rejected',()=>{
 const prior={institution_id:schoolA};
 assert.throws(()=>core.formInput({...valid,institution_id:schoolB},{institutions:inst,plans,ownerId:admin,existing:prior}),/Cannot move/);
 assert.throws(()=>core.formInput({...valid,starts_on:'2026-02-30'},{institutions:inst,plans,ownerId:admin}),/valid start date/);
 assert.throws(()=>core.formInput({...valid,ends_on:'2026-11-03'},{institutions:inst,plans,ownerId:admin}),/End date cannot precede/);
 assert.throws(()=>core.formInput({...valid,admin_note:'x'.repeat(301)},{institutions:inst,plans,ownerId:admin}),/300/);
});
test('cloud plan write requires exactly one returned row matching institution, plan, status and actor',()=>{
 const payload=core.formInput(valid,{institutions:inst,plans,ownerId:admin});
 assert.equal(core.confirm([{...payload,updated_at:'2026-11-04T10:00:00Z'}],payload).plan_code,'pilot');
 assert.throws(()=>core.confirm([],payload),/not confirmed/);
 assert.throws(()=>core.confirm([{...payload},{...payload}],payload),/not confirmed/);
 assert.throws(()=>core.confirm([{...payload,status:'active'}],payload),/different subscription value/);
 assert.throws(()=>core.confirm([{...payload,institution_id:schoolB}],payload),/different subscription value/);
 assert.throws(()=>core.confirm([{...payload,updated_by:schoolB}],payload),/different subscription value/);
});
test('portfolio joins only explicit subscriptions; missing plan is not silently invented',()=>{
 const overview=core.overview(inst,[{institution_id:schoolA,plan_code:'pilot',status:'trial'}]);
 assert.equal(overview.total,2);assert.equal(overview.assigned,1);assert.equal(overview.unassigned,1);
 assert.equal(overview.administrativelyActive,0);
 assert.equal(overview.schools.find(s=>s.id===schoolB).subscription,null);
 assert.match(overview.note,/NOT connected/);
 assert.throws(()=>core.overview(inst,[{institution_id:schoolB},{institution_id:schoolB}]),/Duplicate/);
 assert.throws(()=>core.overview(inst,[{institution_id:admin}]),/inaccessible school/);
});
test('audit selection is tenant-scoped and retains latest history first',()=>{
 const events=[
  {id:1,institution_id:schoolA,recorded_at:'2026-11-04T10:00:00Z'},
  {id:2,institution_id:schoolB,recorded_at:'2026-11-04T11:00:00Z'},
  {id:3,institution_id:schoolA,recorded_at:'2026-11-04T12:00:00Z'}
 ];
 assert.deepEqual(core.auditForSchool(events,schoolA).map(x=>x.id),[3,1]);
 assert.throws(()=>core.auditForSchool(events,'not-a-school'),/real school/);
});
test('platform console uses verified Supabase Auth, separate session, server RLS and fails closed for non-admin',()=>{
 const html=read('docs/platform-admin.html'),js=read('docs/platform-admin.js');
 assert.match(html,/id="loginForm"/);
 assert.match(html,/id="platformView" class="hidden"/);
 assert.match(html,/meta http-equiv="Content-Security-Policy"/);
 assert.match(html,/name="robots" content="noindex,nofollow"/);
 assert.match(js,/authRequest\('token\?grant_type=password'/);
 assert.match(js,/bn_platform_admin_session_v1/);
 assert.match(js,/bn_platform_admins/);
 assert.match(js,/adminRows\.length!==1/);
 assert.match(js,/adminRows\[0\]\.active!==true/);
 assert.match(js,/await authorize\(\)/);
 assert.match(js,/updated_at:'eq\.'\+prior\.updated_at/);
 assert.match(js,/domain\.confirm\(result,planned\)/);
 assert.ok(!js.includes('bn_school_staff_session_v1'),'school-owner login must not bypass platform admin');
 assert.doesNotMatch(js,/service_role|sb_secret_|auth\/v1\/admin|localStorage\.setItem/);
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.doesNotThrow(()=>new vm.Script(read('docs/platform-admin-core.js')));
});
test('SQL migration is least-privilege, prohibits self-granted platform admin and audits every plan change',()=>{
 const sql=read('supabase/migrations/20261104153000_phase_d1_platform_admin.sql');
 for(const table of ['bn_platform_admins','bn_saas_plans','bn_school_subscriptions','bn_subscription_events']){
   assert.match(sql,new RegExp('alter table public\\.'+table+' enable row level security','i'));
   assert.match(sql,new RegExp('revoke all on table public\\.'+table+' from anon,authenticated','i'));
 }
 assert.match(sql,/grant select on table public\.bn_platform_admins to authenticated/i);
 assert.doesNotMatch(sql,/grant (insert|update|delete).*bn_platform_admins to authenticated/i);
 assert.match(sql,/auth_user_id=\(select auth\.uid\(\)\)/i);
 assert.match(sql,/create policy bn_platform_institutions_read/i);
 assert.match(sql,/create policy bn_subscriptions_platform_update/i);
 assert.match(sql,/updated_by=\(select auth\.uid\(\)\)/i);
 assert.match(sql,/grant update\(plan_code,status,starts_on,ends_on,admin_note,updated_by,updated_at\)/i);
 assert.match(sql,/create trigger bn_subscription_event_write/i);
 assert.match(sql,/security definer/i);
 assert.match(sql,/revoke all on function school_private\.bn_subscription_event_guard\(\) from public,anon,authenticated/i);
 assert.doesNotMatch(sql,/grant (insert|update|delete) on table public\.bn_subscription_events to authenticated/i);
 assert.doesNotMatch(sql,/alter table public\.school_students|alter table public\.school_fee_entries|update public\.institutions set|create policy .*school_students/i);
});
test('Phase D is separate from school owner shell; no fabricated payments, plans, or service secrets',()=>{
 const owner=read('docs/real-owner-workspace.js'),sw=read('docs/owner-offline-sw.js'),console=read('docs/platform-admin.js');
 assert.ok(!owner.includes('BrightNexaPlatformCore'));
 assert.ok(!sw.includes('platform-admin.html'));
 assert.ok(!sw.includes('platform-admin.js'));
 assert.match(console,/Billing, payment settlement|no payment|billing|collect a payment/i);
 assert.ok(console.includes("allRows('institutions'"));
 assert.ok(console.includes("allRows('bn_school_subscriptions'"));
 assert.ok(console.includes("allRows('bn_saas_plans'"));
 assert.match(console,/bn_subscription_events/);
 const html=read('docs/platform-admin.html');
 assert.doesNotMatch(html,/value=".*12345|demo.*password|actual payment received/i);
 assert.match(html,/no gateway billing|no gateway billing/i);
});
