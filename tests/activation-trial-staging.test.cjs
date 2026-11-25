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
 create table public.school_users(institution_id uuid references public.institutions,auth_user_id uuid,role text,status text);
 create function school_private.has_role(i uuid,roles text[]) returns boolean language sql stable security definer set search_path='' as
 $$select exists(select 1 from public.school_users u where u.institution_id=i and u.auth_user_id=auth.uid() and u.role=any(roles) and u.status='active')$$;
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
 const code=await issue('OWNER@example.test'), unverified=await issue('unverified@example.test');
 await login(A); await assert.rejects(db.query("select public.bn_issue_school_activation('owner@example.test')"));
 await assert.rejects(db.query("select public.register_first_school('Bypass')"));
 await assert.rejects(db.query("select school_private.bn_register_first_school_legacy('Bypass')"));
 await assert.rejects(db.query('select * from school_private.bn_activation_codes'));
 await assert.rejects(register('School A','invalid'),/activation/i);
 await login(B); await assert.rejects(register('Wrong owner',code),/activation/i);
 await login(C); await assert.rejects(register('Unverified',unverified),/verified/i);
 await login(A); await assert.rejects(register('FAIL',code),/Fixture registration failed/);
 const id=await register('School A',code); const s=await status(id);
 assert.equal(s.status,'trial'); assert.equal(Date.parse(s.ends_at)-Date.parse(s.starts_at),30*86400000);
 await assert.rejects(register('Replay',code),/activation/i);
 await login(B); await assert.rejects(status(id),/access/i);
 const second=await issue('other@example.test'); await login(B); const other=await register('School B',second);
 assert.notEqual(id,other);
 await db.exec('reset role');
 const stored=(await db.query('select code_hash from school_private.bn_activation_codes')).rows;
 assert.ok(stored.every(x=>x.code_hash!==code));
 await db.query("update school_private.bn_school_entitlements set starts_at=now()-interval '31 days',ends_at=now()-interval '1 day' where institution_id=$1",[id]);
 await login(A); assert.equal((await status(id)).status,'expired');
 await db.exec('reset role'); assert.equal((await db.query('select count(*)::int as n from public.institutions')).rows[0].n,2);
 await db.exec('set role service_role'); await db.query("select public.bn_renew_school_entitlement($1,30)",[id]);
 await login(A); assert.equal((await status(id)).status,'active');
 await login(B); assert.equal((await status(other)).status,'trial');
});
