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
 const login=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role '+role);};
 const issue=async(email)=>{await db.exec('reset role; set role service_role');return (await db.query('select public.bn_issue_school_activation($1) as code',[email])).rows[0].code;};
 const register=async(name,code)=>(await db.query('select public.register_first_school($1,$2) as id',[name,code])).rows[0].id;
 const status=async(id)=>(await db.query('select public.bn_school_trial_status($1) as s',[id])).rows[0].s;
 const revoked=await issue('OWNER@example.test');
 await db.exec('reset role; set role service_role');
 await db.query('select public.bn_revoke_school_activation($1)',[revoked]);
 const code=await issue('OWNER@example.test'), unverified=await issue('unverified@example.test');
 await login(A); await assert.rejects(db.query("select public.bn_issue_school_activation('owner@example.test')"));
 await assert.rejects(db.query("select public.register_first_school('Bypass')"));
 await assert.rejects(db.query("select school_private.bn_register_first_school_legacy('Bypass')"));
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
 await assert.rejects(db.query("select public.register_first_school('Blocked After Prefix Revoke',$1)",[code]),/activation/i);
});
