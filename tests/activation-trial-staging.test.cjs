'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');

test('staged registration: verified email, one-time code, atomic trial, owner-scoped status and legacy RPC denial',async t=>{
 const db=new PGlite(); t.after(()=>db.close());
 await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create schema auth; create schema school_private;
 grant usage on schema auth,school_private to authenticated;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.institutions(id uuid primary key default gen_random_uuid(),name text);
 create table public.school_students(id uuid primary key default gen_random_uuid(),institution_id uuid not null references public.institutions(id),name text not null);
 grant select,insert,update,delete on public.school_students to authenticated;
 alter table public.school_students enable row level security;
 create table public.school_users(institution_id uuid references public.institutions,auth_user_id uuid,role text,status text);
 create function school_private.has_role(i uuid,roles text[]) returns boolean language sql stable security definer set search_path='' as
 $$select exists(select 1 from public.school_users u where u.institution_id=i and u.auth_user_id=auth.uid() and u.role=any(roles) and u.status='active')$$;
 create policy fixture_students on public.school_students for all to authenticated using(school_private.has_role(institution_id,array['school_admin'])) with check(school_private.has_role(institution_id,array['school_admin']));
 create function public.fixture_write(p_school uuid,p_name text) returns void language sql security definer set search_path='' as $$insert into public.school_students(institution_id,name) values(p_school,p_name)$$;
 create function public.register_first_school(p_school_name text) returns uuid language plpgsql security definer set search_path='' as $$
 declare s uuid; begin
 if exists(select 1 from public.school_users where auth_user_id=auth.uid()) then raise exception 'Already registered'; end if;
 if p_school_name='FAIL' then raise exception 'Fixture registration failed'; end if;
 insert into public.institutions(name) values(p_school_name) returning id into s;
 insert into public.school_users values(s,auth.uid(),'school_admin','active');
 return s; end $$;
 grant execute on function public.register_first_school(text) to authenticated;
 insert into auth.users values
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','owner@example.test',now()),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','other@example.test',now()),
 ('cccccccc-cccc-cccc-cccc-cccccccccccc','unverified@example.test',null);
 `);
 await db.exec(fs.readFileSync('supabase/patches/activation_trial_staging.sql','utf8'));
 const A='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', B='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', C='cccccccc-cccc-cccc-cccc-cccccccccccc';
 let currentUid=A;
 const login=async(id,role='authenticated')=>{currentUid=id;await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);};
 const issue=async(email)=>{await db.exec('reset role; set role service_role');return (await db.query('select public.bn_issue_school_activation($1) as code',[email])).rows[0].code;};
 const register=async(name,code)=>{
  await db.exec('reset role; set role service_role');
  try{return (await db.query('select public.bn_register_school_for_user($1,$2,$3) as id',[currentUid,name,code])).rows[0].id;}
  finally{await login(currentUid);}
 };
 const status=async(id)=>(await db.query('select public.bn_school_trial_status($1) as s',[id])).rows[0].s;
 const revoked=await issue('OWNER@example.test');
 await db.exec('reset role; set role service_role');
 await db.query('select public.bn_revoke_school_activation($1)',[revoked]);
 const code=await issue('OWNER@example.test'), unverified=await issue('unverified@example.test');
 await login(A); await assert.rejects(db.query("select public.bn_issue_school_activation('owner@example.test')"));
 await assert.rejects(db.query("select public.register_first_school('Bypass')"));
 await assert.rejects(db.query("select school_private.bn_register_first_school_legacy('Bypass')"));
 await assert.rejects(db.query("select public.bn_register_school_for_user($1,'Direct Bypass',$2)",[A,code]),/permission denied/i);
 await assert.rejects(db.query('select * from school_private.bn_activation_codes'));
 await assert.rejects(register('School A','invalid'),/activation/i);
 await assert.rejects(register('School A',revoked),/activation/i);
 await assert.rejects(db.query('select public.bn_revoke_school_activation($1)',[code]));
 await login(B); await assert.rejects(register('Wrong owner',code),/activation/i);
 await login(C); await assert.rejects(register('Unverified',unverified),/verified/i);
 await login(A); await assert.rejects(register('FAIL',code),/Fixture registration failed/);
 const id=await register('School A',code); const s=await status(id);
 assert.equal(s.status,'trial'); assert.equal(Date.parse(s.ends_at)-Date.parse(s.starts_at),30*86400000);
 await assert.rejects(register('Replay',code),/activation/i);
 await db.query('insert into public.school_students(institution_id,name) values($1,$2)',[id,'Original']);
 await login(B); await assert.rejects(status(id),/access/i);
 const second=await issue('other@example.test'); await login(B); const other=await register('School B',second);
 assert.notEqual(id,other);
 await db.exec('reset role');
 const stored=(await db.query('select code_hash from school_private.bn_activation_codes')).rows;
 assert.ok(stored.every(x=>x.code_hash!==code));
 await db.query("update school_private.bn_school_entitlements set starts_at=now()-interval '31 days',ends_at=now()-interval '1 day' where institution_id=$1",[id]);
 await login(A); assert.equal((await status(id)).status,'expired');
 assert.equal((await db.query('select name from public.school_students where institution_id=$1',[id])).rows[0].name,'Original');
 await assert.rejects(db.query('insert into public.school_students(institution_id,name) values($1,$2)',[id,'New']),/read.only/i);
 await assert.rejects(db.query('update public.school_students set name=$2 where institution_id=$1',[id,'Changed']),/read.only/i);
 await assert.rejects(db.query('delete from public.school_students where institution_id=$1',[id]),/read.only/i);
 await assert.rejects(db.query('select public.fixture_write($1,$2)',[id,'RPC bypass']),/read.only/i);
 assert.equal((await db.query('select name from public.school_students where institution_id=$1',[id])).rows[0].name,'Original');
 await db.exec('reset role'); assert.equal((await db.query('select count(*)::int as n from public.institutions')).rows[0].n,2);
 await db.exec('set role service_role'); await db.query("select public.bn_renew_school_entitlement($1,30)",[id]);
 await login(A); assert.equal((await status(id)).status,'active');
 await db.query('update public.school_students set name=$2 where institution_id=$1',[id,'Renewed']);
 assert.equal((await db.query('select name from public.school_students where institution_id=$1',[id])).rows[0].name,'Renewed');
 await login(B); assert.equal((await status(other)).status,'trial');
});

test('staged hardening: storage uploads, WordPress intake, institutions update, 7/3/1 reminders, legacy backfill, and audit log',async t=>{
 const db=new PGlite(); t.after(()=>db.close());
 await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create schema auth; create schema school_private; create schema storage;
 grant usage on schema auth,school_private,storage to authenticated,anon;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table public.institutions(id uuid primary key default gen_random_uuid(),name text,status text default 'active');
 create table public.school_users(id uuid primary key default gen_random_uuid(),institution_id uuid references public.institutions,auth_user_id uuid,role text,status text);
 create table public.school_students(id uuid primary key default gen_random_uuid(),institution_id uuid not null references public.institutions(id),name text not null);
 create table public.school_library_items(id uuid primary key default gen_random_uuid(),institution_id uuid not null references public.institutions(id),title text);
 create table public.school_homework_files(id uuid primary key default gen_random_uuid(),homework_id uuid,institution_id uuid not null references public.institutions(id),storage_path text unique);
 create table storage.buckets(id text primary key,name text,public boolean);
 create table storage.objects(bucket_id text,name text,primary key(bucket_id,name));
 create table school_private.bn_wordpress_connections(institution_id uuid primary key references public.institutions(id),key_hash text);
 create table school_private.bn_wordpress_enquiries(id uuid primary key default gen_random_uuid(),institution_id uuid not null references public.institutions(id),guardian_name text);
 grant select,insert,update,delete on public.institutions,public.school_students,public.school_library_items,public.school_homework_files to authenticated;
 grant select,insert,update,delete on storage.objects to authenticated;
 alter table public.school_students enable row level security;
 alter table public.institutions enable row level security;
 alter table storage.objects enable row level security;
 create function school_private.has_role(i uuid,roles text[]) returns boolean language sql stable security definer set search_path='' as
 $$select exists(select 1 from public.school_users u where u.institution_id=i and u.auth_user_id=auth.uid() and u.role=any(roles) and u.status='active')$$;
 create function school_private.parent_in_school(i uuid) returns boolean language sql stable as $$select false$$;
 create policy allow_inst on public.institutions for all to authenticated using(school_private.has_role(id,array['school_admin'])) with check(school_private.has_role(id,array['school_admin']));
 create policy allow_students on public.school_students for all to authenticated using(school_private.has_role(institution_id,array['school_admin'])) with check(school_private.has_role(institution_id,array['school_admin']));
 create policy allow_storage on storage.objects for all to authenticated using(true) with check(true);
 create function public.register_first_school(p_school_name text) returns uuid language plpgsql security definer set search_path='' as $$
 declare s uuid; begin
 if exists(select 1 from public.school_users where auth_user_id=auth.uid()) then raise exception 'Already registered'; end if;
 insert into public.institutions(name) values(p_school_name) returning id into s;
 insert into public.school_users(institution_id,auth_user_id,role,status) values(s,auth.uid(),'school_admin','active');
 return s; end $$;
 grant execute on function public.register_first_school(text) to authenticated;
 insert into auth.users values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','owner@example.test',now());
 `);
 await db.exec(fs.readFileSync('supabase/patches/activation_trial_staging.sql','utf8'));
 const A='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
 const legacy='99999999-9999-4999-8999-999999999999';
 const login=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);};
 await db.query("insert into public.institutions(id,name,status) values($1,'Legacy School','active')",[legacy]);
 await db.query("insert into public.school_users(institution_id,auth_user_id,role,status) values($1,$2,'school_admin','active')",[legacy,A]);
 await db.exec('set role service_role');
 const code=(await db.query("select public.bn_issue_school_activation('owner@example.test') as code")).rows[0].code;
 // Legacy assignment RPC exists and rejects duplicate direct assignment
 await db.query("select public.bn_assign_school_entitlement($1,'trial',30)",[legacy]);
 await assert.rejects(db.query("select public.bn_assign_school_entitlement($1,'active',30)",[legacy]),/already assigned/i);
 // Rate limiter function exists for service_role edge calls
 const bucket='a'.repeat(64);
 for(let i=0;i<5;i++)assert.equal((await db.query('select public.bn_activation_attempt($1,5) ok',[bucket])).rows[0].ok,true);
 assert.equal((await db.query('select public.bn_activation_attempt($1,5) ok',[bucket])).rows[0].ok,false);

 // Service role call must work without a school user; regular outsiders must not.
 await db.query("select set_config('request.jwt.claim.sub','',false)");
 assert.equal((await db.query('select public.bn_school_writable($1) w',[legacy])).rows[0].w,true);
 await login('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
 await assert.rejects(db.query('select public.bn_school_writable($1)',[legacy]),/access/i);
 await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('school-homework',$1)",[legacy+'/hw1/unauthorized.pdf']));
 await login(A);
 await db.query("insert into storage.objects(bucket_id,name) values('school-homework',$1)",[legacy+'/hw1/active.pdf']);
 await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('school-homework','------------------------------------/bad.pdf')"),/row-level security/i);
 // Milestone 7, 3, 1 reminders recorded once per milestone for a given expiry period
 for(const daysLeft of [7,3,1]){
  await db.exec('reset role');
  await db.query("update school_private.bn_school_entitlements set starts_at=clock_timestamp()-interval '30 days',ends_at=clock_timestamp()+make_interval(hours=>24*$2-1) where institution_id=$1",[legacy,daysLeft]);
  await login(A);
  const first=(await db.query('select public.bn_school_trial_status($1) s',[legacy])).rows[0].s;
  assert.equal(first.milestone_days,daysLeft);
  assert.equal(first.new_reminder_milestone,daysLeft);
  const second=(await db.query('select public.bn_school_trial_status($1) s',[legacy])).rows[0].s;
  assert.equal(second.milestone_days,daysLeft);
  assert.equal(second.new_reminder_milestone,null,'Duplicate check in same window must not re-fire milestone '+daysLeft);
 }

 // Expired school blocks institutions update, extended tables, WordPress table, Storage uploads/deletes, and bn_school_writable=false
 await db.exec('reset role');
 await db.query("update school_private.bn_school_entitlements set ends_at=clock_timestamp()-interval '1 minute' where institution_id=$1",[legacy]);
 await login(A);
 assert.equal((await db.query('select public.bn_school_writable($1) w',[legacy])).rows[0].w,false);
 await assert.rejects(db.query("update public.institutions set name='Renamed' where id=$1",[legacy]),/read-only/i);
 await assert.rejects(db.query("insert into public.school_library_items(institution_id,title) values($1,'Book')",[legacy]),/read-only/i);
 await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('school-student-photos',$1)",[legacy+'/s1/photo-abc12345.webp']));
 await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('school-homework',$1)",[legacy+'/hw1/doc.pdf']),/row-level security/i);
 assert.equal((await db.query("delete from storage.objects where bucket_id='school-homework' and name=$1 returning name",[legacy+'/hw1/active.pdf'])).rows.length,0);
 await db.exec('reset role');
 await assert.rejects(db.query("insert into school_private.bn_wordpress_enquiries(institution_id,guardian_name) values($1,'Blocked Parent')",[legacy]),/read-only/i);
 const audit=(await db.query('select event_type,code_digest_prefix from school_private.bn_platform_audit')).rows;
 assert.ok(audit.some(r=>r.event_type==='activation_issued'));
 assert.ok(audit.some(r=>r.event_type==='entitlement_assigned'));
 assert.ok(audit.some(r=>r.event_type==='trial_reminder_recorded'));
 assert.ok(audit.every(r=>!r.code_digest_prefix||r.code_digest_prefix!==code),'Plaintext code must never enter audit log');

 // Super Admin listing and digest-prefix revocation RPCs are strictly service_role only and never expose plaintext
 await login(A);
 await assert.rejects(db.query('select * from public.bn_list_school_activations(20)'));
 await assert.rejects(db.query('select * from public.bn_list_school_entitlements(20)'));
 await assert.rejects(db.query('select * from public.bn_list_platform_audit(20)'));
 await assert.rejects(db.query("select public.bn_revoke_school_activation_by_prefix('000000000000','owner@example.test')"));

 await db.exec('reset role; set role service_role');
 const listed=(await db.query('select * from public.bn_list_school_activations(20)')).rows;
 assert.equal(listed.length,1);
 assert.equal(listed[0].status,'active');
 assert.equal(listed[0].code_digest_prefix.length,12);
 assert.notEqual(listed[0].code_digest_prefix,code.slice(0,12));
 assert.equal(JSON.stringify(listed).includes(code),false,'Activation listing must never expose plaintext code');
 const entRows=(await db.query('select * from public.bn_list_school_entitlements(20)')).rows;
 assert.equal(entRows[0].effective_status,'expired');
 await db.exec('reset role');
 await db.query('update school_private.bn_school_entitlements set ends_at=(select max(ends_at) from school_private.bn_trial_reminders where institution_id=$1) where institution_id=$1',[legacy]);
 await db.exec('set role service_role');
 const activeEnt=(await db.query('select * from public.bn_list_school_entitlements(20)')).rows;
 assert.ok(activeEnt[0].milestones_sent.includes(7),'Entitlement view should include recorded milestone for matching ends_at window');
 const auditRows=(await db.query('select * from public.bn_list_platform_audit(20)')).rows;
 assert.ok(auditRows.some(r=>r.event_type==='activation_issued'));
 assert.equal((await db.query('select public.bn_revoke_school_activation_by_prefix($1,$2) r',[listed[0].code_digest_prefix,'owner@example.test'])).rows[0].r,true);
 await login(A);
 await assert.rejects(db.query("select public.bn_register_school_for_user($1,'Direct Bypass',$2)",[A,code]),/permission denied/i);
 await db.exec('reset role; set role service_role');
 await assert.rejects(db.query("select public.bn_register_school_for_user($1,'Blocked After Prefix Revoke',$2)",[A,code]),/activation/i);
});

test('TDD RED: bn_school_subscriptions reconciliation, persistent rate limit on failed registration, WhatsApp callbacks, 7-role/parent expired login, and strict rollback',async t=>{
 const patchSql=fs.readFileSync('supabase/patches/activation_trial_staging.sql','utf8');
 // 1. Non-empty bn_school_subscriptions must abort safely instead of discarding rows
 const nonEmptyDb=new PGlite(); t.after(()=>nonEmptyDb.close());
 await nonEmptyDb.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create schema school_private;
  create table public.institutions(id uuid primary key default gen_random_uuid(),name text,status text default 'active');
  create table public.bn_school_subscriptions(institution_id uuid primary key references public.institutions(id),plan text);
  insert into public.institutions(id,name) values('11111111-1111-4111-8111-111111111111','Existing');
  insert into public.bn_school_subscriptions values('11111111-1111-4111-8111-111111111111','active');
  create function public.register_first_school(p_school_name text) returns uuid language sql security definer as $$select null::uuid$$;
 `);
 await assert.rejects(nonEmptyDb.exec(patchSql),/bn_school_subscriptions.*row|reconcile/i);

 // 2. Empty bn_school_subscriptions reconciles into sole source bn_school_entitlements + full behavioral lifecycle
 const db=new PGlite(); t.after(()=>db.close());
 await db.exec(`
  create role anon; create role authenticated; create role service_role;
  create schema auth; create schema school_private; create schema storage;
  grant usage on schema auth,school_private,storage to authenticated,anon;
  create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table public.institutions(id uuid primary key default gen_random_uuid(),name text,status text default 'trial');
  create table public.bn_school_subscriptions(id uuid primary key default gen_random_uuid(),institution_id uuid references public.institutions(id),status text);
  create table public.school_users(id uuid primary key default gen_random_uuid(),institution_id uuid references public.institutions(id),auth_user_id uuid,email text,role text,status text);
  create table public.school_students(id uuid primary key default gen_random_uuid(),institution_id uuid references public.institutions(id),name text);
  create table public.school_guardians(id uuid primary key default gen_random_uuid(),institution_id uuid references public.institutions(id),auth_user_id uuid,status text);
  create table public.school_whatsapp_batches(id uuid primary key default gen_random_uuid(),institution_id uuid references public.institutions(id),kind text);
  create table public.school_whatsapp_recipients(id uuid primary key default gen_random_uuid(),batch_id uuid,institution_id uuid,student_id uuid,phone text,parameters jsonb default '{}'::jsonb,state text default 'queued',attempt_id uuid,provider_message_id text,updated_at timestamptz default now());
  create table public.school_whatsapp_events(provider_message_id text,institution_id uuid,state text,event_time text,primary key(provider_message_id,state,event_time));
  create function public.school_wa_event(p_school uuid,p_message text,p_state text,p_time text) returns void language plpgsql security invoker set search_path='' as $$
  begin
   insert into public.school_whatsapp_events values(p_message,p_school,p_state,p_time) on conflict do nothing;
   update public.school_whatsapp_recipients set state=case when state='read' then 'read' when p_state='delivered' then 'delivered' when p_state='read' then 'read' when p_state='failed' then 'failed' else state end,updated_at=now()
   where institution_id=p_school and provider_message_id=p_message;
  end $$;
  create table storage.objects(bucket_id text,name text,primary key(bucket_id,name));
  grant select,insert,update,delete on public.institutions,public.school_users,public.school_students,public.school_guardians to authenticated;
  create function school_private.has_role(i uuid,roles text[]) returns boolean language sql stable security definer set search_path='' as
  $$select exists(select 1 from public.school_users u where u.institution_id=i and u.auth_user_id=auth.uid() and u.role=any(roles) and u.status='active')$$;
  create function school_private.parent_in_school(i uuid) returns boolean language sql stable security definer set search_path='' as
  $$select exists(select 1 from public.school_guardians g where g.institution_id=i and g.auth_user_id=auth.uid() and g.status='active')$$;
  create function public.register_first_school(p_school_name text) returns uuid language plpgsql security definer set search_path='' as $$
  declare s uuid; begin
   if auth.uid() is null then raise exception 'Auth required'; end if;
   if exists(select 1 from public.school_users where auth_user_id=auth.uid()) then raise exception 'Already registered'; end if;
   if p_school_name='FAIL' then raise exception 'Forced registration abort'; end if;
   insert into public.institutions(name) values(p_school_name) returning id into s;
   insert into public.school_users(institution_id,auth_user_id,email,role,status) values(s,auth.uid(),'owner@example.test','school_admin','active');
   return s;
  end $$;
  grant execute on function public.register_first_school(text) to authenticated;
  insert into auth.users values('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','owner@example.test',now());
 `);
 await db.exec(patchSql);

 // Preflight table reconciled/removed when empty
 assert.equal((await db.query("select to_regclass('public.bn_school_subscriptions') as t")).rows[0].t,null);
 assert.ok((await db.query("select 1 from school_private.bn_platform_audit where event_type='legacy_subscription_table_retired'")).rows.length===1);

 // Rate-limited Edge function connected to PGlite persists failed attempts & blocks direct authenticated SQL bypass
 const {createService}=await import('../supabase/functions/school-register-school/service.mjs');
 const ownerA='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
 await db.exec('reset role; set role authenticated');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ownerA]);
 await assert.rejects(db.query("select public.register_first_school('Bypass','0000000000000000000000000000000000000000000000000000000000000000')"),/does not exist|permission denied/i);

 // Registration Edge Function rejects unauthenticated, disallowed origin, and unconfirmed mailbox
 const authCheckHandler=createService({
  url:'https://fixture.supabase.co',serviceKey:'srv',anonKey:'anon',
  fetcher:async()=>Response.json({id:ownerA,email:'owner@example.test',email_confirmed_at:null})
 });
 assert.equal((await authCheckHandler(new Request('https://fixture.supabase.co/functions/v1/school-register-school',{method:'POST'}))).status,401);
 assert.equal((await authCheckHandler(new Request('https://fixture.supabase.co/functions/v1/school-register-school',{method:'POST',headers:{Origin:'https://evil.example',Authorization:'Bearer jwt'}}))).status,403);
 assert.equal((await authCheckHandler(new Request('https://fixture.supabase.co/functions/v1/school-register-school',{method:'POST',headers:{Authorization:'Bearer jwt'},body:'{}'}))).status,403);

 const regHandler=createService({
  url:'https://fixture.supabase.co',serviceKey:'srv',anonKey:'anon',
  fetcher:async(url,opts={})=>{
   const p=new URL(url).pathname;
   const body=opts.body?JSON.parse(opts.body):null;
   if(p.endsWith('/auth/v1/user'))return Response.json({id:ownerA,email:'owner@example.test',email_confirmed_at:'2026-11-25T00:00:00Z'});
   await db.exec('reset role; set role service_role');
   try{
    if(p.endsWith('/rest/v1/rpc/bn_activation_attempt')){
     return Response.json((await db.query('select public.bn_activation_attempt($1,$2) as ok',[body.p_bucket,body.p_limit])).rows[0].ok);
    }
    if(p.endsWith('/rest/v1/rpc/bn_register_school_for_user')){
     try{
      const id=(await db.query('select public.bn_register_school_for_user($1,$2,$3) as id',[body.p_owner_uid,body.p_school_name,body.p_activation_code])).rows[0].id;
      return Response.json(id);
     }catch(err){
      return Response.json({message:err.message},{status:400});
     }
    }
   }finally{await db.exec('reset role');}
   throw Error('Unexpected '+p);
  }
 });

 await db.exec('reset role; set role service_role');
 const realCode=(await db.query("select public.bn_issue_school_activation('owner@example.test') as code")).rows[0].code;
 await db.exec('reset role');

 // 9 failed attempts (bad codes + forced rollback on FAIL school name) must NOT roll back bn_activation_attempts!
 for(let i=0;i<9;i++){
  const res=await regHandler(new Request('https://fixture.supabase.co/functions/v1/school-register-school',{
   method:'POST',headers:{Authorization:'Bearer jwt','x-forwarded-for':'203.0.113.1'},
   body:JSON.stringify({schoolName:i===8?'FAIL':'School A',activationCode:i===8?realCode:'b'.repeat(64)})
  }));
  assert.ok([400,403].includes(res.status),'Attempt '+(i+1)+' must fail cleanly');
 }
 const savedAttempts=(await db.query('select sum(attempts)::int as n from school_private.bn_activation_attempts')).rows[0].n;
 assert.equal(savedAttempts,18,'Both IP and user attempt counters must commit even when registration fails');

 // Reset counter for clean valid registration, then verify 10th valid attempt fails with 429 when limit reached
 const ok10=await regHandler(new Request('https://fixture.supabase.co/functions/v1/school-register-school',{
  method:'POST',headers:{Authorization:'Bearer jwt','x-forwarded-for':'203.0.113.1'},
  body:JSON.stringify({schoolName:'School A',activationCode:realCode})
 }));
 assert.equal(ok10.status,200);
 const schoolId=(await ok10.json()).schoolId;
 const blocked11=await regHandler(new Request('https://fixture.supabase.co/functions/v1/school-register-school',{
  method:'POST',headers:{Authorization:'Bearer jwt','x-forwarded-for':'203.0.113.1'},
  body:JSON.stringify({schoolName:'School A',activationCode:'b'.repeat(64)})
 }));
 assert.equal(blocked11.status,429);

 // Set up all 7 staff roles + parent + sent & queued WhatsApp recipients, then expire school
 await db.query('insert into public.school_students(institution_id,name) values($1,$2)',[schoolId,'Student One']);
 const roles=['principal','teacher','accountant','librarian','receptionist','transport_staff'];
 const roleUids={};
 for(const r of roles){
  const uid=crypto.randomUUID(); roleUids[r]=uid;
  await db.query('insert into auth.users values($1,$2,now())',[uid,r+'@example.test']);
  await db.query('insert into public.school_users(institution_id,auth_user_id,email,role,status) values($1,$2,$3,$4,$5)',[schoolId,uid,r+'@example.test',r,'active']);
 }
 const parentUid=crypto.randomUUID();
 await db.query('insert into auth.users values($1,$2,now())',[parentUid,'parent@example.test']);
 await db.query('insert into public.school_guardians(institution_id,auth_user_id,status) values($1,$2,$3)',[schoolId,parentUid,'active']);
 const batchId=crypto.randomUUID();
 await db.query("insert into public.school_whatsapp_batches(id,institution_id,kind) values($1,$2,'fee')",[batchId,schoolId]);
 await db.query("insert into public.school_whatsapp_recipients(batch_id,institution_id,student_id,phone,state,provider_message_id) values($1,$2,$1,'919876543210','accepted','wamid.1')", [batchId,schoolId]);
 await db.query("insert into public.school_whatsapp_recipients(batch_id,institution_id,student_id,phone,state) values($1,$2,$3,'919876543211','queued')", [batchId,schoolId,crypto.randomUUID()]);

 // Expire school
 await db.query("update school_private.bn_school_entitlements set starts_at=clock_timestamp()-interval '31 days',ends_at=clock_timestamp()-interval '1 hour' where institution_id=$1",[schoolId]);

 // Incoming Meta WhatsApp delivery callback on expired school MUST succeed while queued claim & new batch MUST fail!
 await db.query("select public.school_wa_event($1,'wamid.1','delivered','1700000001')",[schoolId]);
 assert.equal((await db.query("select state from public.school_whatsapp_recipients where provider_message_id='wamid.1'")).rows[0].state,'delivered');
 await assert.rejects(db.query("insert into public.school_whatsapp_batches(id,institution_id,kind) values($1,$2,'absent')",[crypto.randomUUID(),schoolId]),/read-only/i);
 await assert.rejects(db.query("update public.school_whatsapp_recipients set state='processing' where phone='919876543211'"),/read-only/i);

 // Expired-school read-only login check for all 7 staff roles + parent
 const login=async(uid)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid]);await db.exec('set role authenticated');};
 for(const uid of [ownerA,...Object.values(roleUids),parentUid]){
  await login(uid);
  assert.equal((await db.query('select public.bn_school_writable($1) w',[schoolId])).rows[0].w,false);
  assert.equal((await db.query('select count(*)::int as n from public.institutions where id=$1',[schoolId])).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int as n from public.school_students where institution_id=$1',[schoolId])).rows[0].n,1);
  await assert.rejects(db.query('insert into public.school_students(institution_id,name) values($1,$2)',[schoolId,'Blocked']),/read-only/i);
 }

 // Strict dependency-ordered SQL rollback (NO CASCADE) restores pre-migration registration & writes cleanly
 await db.exec('reset role');
 await db.exec(`
  BEGIN;
  DROP TRIGGER IF EXISTS bn_trial_institution_guard ON public.institutions;
  DROP TRIGGER IF EXISTS bn_trial_wa_recipient_guard ON public.school_whatsapp_recipients;
  DO $$ DECLARE r record; BEGIN
   FOR r IN SELECT n.nspname,c.relname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE t.tgname='bn_trial_write_guard'
   LOOP EXECUTE format('DROP TRIGGER IF EXISTS bn_trial_write_guard ON %I.%I',r.nspname,r.relname); END LOOP;
  END $$;
  DROP POLICY IF EXISTS bn_trial_storage_insert_guard ON storage.objects;
  DROP POLICY IF EXISTS bn_trial_storage_update_guard ON storage.objects;
  DROP POLICY IF EXISTS bn_trial_storage_delete_guard ON storage.objects;
  DROP FUNCTION public.bn_register_school_for_user(uuid,text,text);
  DROP FUNCTION IF EXISTS public.register_first_school(text,text);
  ALTER FUNCTION school_private.bn_register_first_school_legacy(text) SET SCHEMA public;
  ALTER FUNCTION public.bn_register_first_school_legacy(text) RENAME TO register_first_school;
  GRANT EXECUTE ON FUNCTION public.register_first_school(text) TO authenticated;
  DROP FUNCTION public.bn_school_trial_status(uuid);
  DROP FUNCTION public.bn_school_writable(uuid);
  DROP FUNCTION public.bn_activation_attempt(text,integer);
  DROP FUNCTION public.bn_issue_school_activation(text,uuid);
  DROP FUNCTION public.bn_revoke_school_activation(text,uuid);
  DROP FUNCTION public.bn_revoke_school_activation_by_prefix(text,text,uuid);
  DROP FUNCTION public.bn_list_school_activations(integer);
  DROP FUNCTION public.bn_assign_school_entitlement(uuid,text,integer,uuid);
  DROP FUNCTION public.bn_renew_school_entitlement(uuid,integer,uuid);
  DROP FUNCTION public.bn_list_school_entitlements(integer);
  DROP FUNCTION public.bn_list_platform_audit(integer);
  DROP FUNCTION school_private.bn_storage_school_writable(text);
  DROP FUNCTION school_private.bn_school_is_writable(uuid);
  DROP FUNCTION school_private.bn_assert_school_writable(uuid);
  DROP FUNCTION school_private.bn_guard_trial_write();
  DROP FUNCTION school_private.bn_guard_whatsapp_recipient_write();
  DROP FUNCTION school_private.bn_guard_institution_write();
  COMMIT;
 `);
 await login(ownerA);
 await db.query('insert into public.school_students(institution_id,name) values($1,$2)',[schoolId,'Restored After Rollback']);
 assert.equal((await db.query('select count(*)::int as n from public.school_students where institution_id=$1',[schoolId])).rows[0].n,2);
});
