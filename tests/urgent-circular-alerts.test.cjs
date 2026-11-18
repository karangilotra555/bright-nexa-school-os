'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');

const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const school=id(1),outside=id(2),principal=id(3),teacher=id(4),parent=id(5),otherParent=id(6);
const student=id(7),otherStudent=id(8),notice=id(9),teacherDevice=id(10),parentDevice=id(11),otherDevice=id(12);
const title='Official weather closure';
const body='The school is closed today due to severe weather.';
const migration='supabase/migrations/20261118110000_urgent_circular_android_alerts.sql';

test('urgent notices queue one authorized Parent and Teacher delivery, with scoped leases and stale binding protection',async()=>{
 const db=new PGlite();
 try{
  const sql=(q,values)=>db.query(q,values);
  const rpc=async(name,...args)=>(await sql(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
  const role=async(which,user='')=>{
   await db.exec(`reset role; set role ${which}`);
   await sql("select set_config('request.jwt.claim.sub',$1,false)",[user]);
  };
  await db.exec(`
   create schema auth; create schema school_private;
   create role anon; create role authenticated; create role service_role;
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
   create table auth.users(id uuid primary key, raw_app_meta_data jsonb, email_confirmed_at timestamptz default now(), banned_until timestamptz, deleted_at timestamptz);
   create table public.institutions(id uuid primary key,status text);
   create table public.school_users(id uuid primary key, institution_id uuid, auth_user_id uuid, role text, status text);
   create table public.school_students(id uuid primary key,institution_id uuid,status text);
   create table public.school_guardians(id uuid primary key,institution_id uuid,auth_user_id uuid,status text);
   create table public.school_guardian_students(institution_id uuid,guardian_id uuid,student_id uuid);
   create table public.school_notices(id uuid primary key,institution_id uuid,title text,body text,created_by uuid);
   create table public.school_audit_events(institution_id uuid,actor_id uuid,action text,entity text,entity_id uuid);
   create function school_private.has_role(s uuid,roles text[]) returns boolean language sql stable as $$
    select exists(select 1 from public.school_users u where u.institution_id=s and u.auth_user_id=auth.uid() and u.status='active' and u.role=any(roles)) $$;
   create function school_private.bn_teacher_auth_ready(u uuid) returns boolean language sql stable as $$
    select exists(select 1 from auth.users where id=u and deleted_at is null) $$;
  `);
  await sql("insert into institutions values ($1,'active'),($2,'active')",[school,outside]);
  await sql("insert into auth.users(id,raw_app_meta_data) values ($1,'{}'),($2,'{}'),($3,jsonb_build_object('bn_student_id',$5::text,'bn_institution_id',$7::text)),($4,jsonb_build_object('bn_student_id',$6::text,'bn_institution_id',$8::text))",[principal,teacher,parent,otherParent,student,otherStudent,school,outside]);
  await sql("insert into school_users values ($1,$3,$1,'principal','active'),($2,$3,$2,'teacher','active')",[principal,teacher,school]);
  await sql("insert into school_students values ($1,$3,'active'),($2,$4,'active')",[student,otherStudent,school,outside]);
  await sql("insert into school_guardians values ($1,$3,$1,'active'),($2,$4,$2,'active')",[parent,otherParent,school,outside]);
  await sql('insert into school_guardian_students values ($1,$2,$3),($4,$5,$6)',[school,parent,student,outside,otherParent,otherStudent]);
  await db.exec(fs.readFileSync('supabase/migrations/20261118100000_leadership_pulse_notice_finance.sql','utf8'));
  await db.exec(fs.readFileSync(migration,'utf8'));
  const registration=id(15), oldRegistration=id(16);
  const enable=(s,p,d,t,r=registration)=>rpc('bn_enable_urgent_circular_alerts',s,p,d,t.repeat(30),r);
  await role('authenticated',teacher);
  const setJwt=claims=>sql("select set_config('request.jwt.claims',$1,false)",[JSON.stringify(claims)]);
  await setJwt({app_metadata:{bn_teacher_mobile_pending:true}});
  await assert.rejects(enable(school,'teacher',teacherDevice,'t'),/access required/i);
  await setJwt({});
  const teacherBinding=await enable(school,'teacher',teacherDevice,'t');
  assert.equal(await enable(school,'teacher',teacherDevice,'t'),teacherBinding);
  await assert.rejects(enable(school,'parent',teacherDevice,'t'),/access required/i);
  await assert.rejects(rpc('bn_leadership_publish_urgent_notice',school,notice,title,body),/Owner or Principal/);
  await role('authenticated',parent);
  await setJwt({app_metadata:{bn_password_pending:true}});
  await assert.rejects(enable(school,'parent',parentDevice,'p'),/access required/i);
  await setJwt({});
  const parentBinding=await enable(school,'parent',parentDevice,'p',oldRegistration);
  assert.equal(await enable(school,'parent',parentDevice,'p'),parentBinding);
  await rpc('bn_disable_urgent_circular_alerts',school,'parent',parentDevice,parentBinding,oldRegistration);
  await assert.rejects(enable(outside,'parent',parentDevice,'p'),/access required/i);
  await role('authenticated',otherParent);
  await enable(outside,'parent',otherDevice,'u');
  await role('authenticated',principal);
  assert.equal(await rpc('bn_leadership_publish_urgent_notice',school,notice,title,body),notice);
  assert.equal(await rpc('bn_leadership_publish_urgent_notice',school,notice,title,body),notice);
  await assert.rejects(rpc('bn_leadership_publish_urgent_notice',school,notice,title,body+' Again.'),/conflict/i);
  assert.deepEqual(await rpc('bn_leadership_urgent_delivery_status',school,notice),{waiting:2,accepted:0,expired:0,unavailable:0});
  await assert.rejects(rpc('bn_leadership_urgent_delivery_status',outside,notice),/Owner or Principal/);
  const at=new Date(Date.now()+1000);
  const claim=clock=>rpc('bn_claim_urgent_circular_alerts',clock.toISOString());
  await assert.rejects(claim(at),/permission denied/i);
  await role('service_role');
  const initial=await claim(at);
  assert.deepEqual(initial.map(row=>row.installation).sort(),[teacherDevice,parentDevice].sort());
  assert.deepEqual(initial.map(row=>row.binding).sort(),[teacherBinding,parentBinding].sort());
  assert.ok(initial.every(row=>row.event_id===notice && !('title' in row) && !('body' in row)));
  assert.deepEqual(await claim(at),[],'leases prevent another cron from resending the same batch');
  const parentClaim=initial.find(row=>row.portal==='parent');
  const stillAllowed=claim=>rpc('bn_urgent_circular_alert_still_allowed',claim.installation,claim.portal,claim.binding,claim.token,claim.event_id,claim.claim_until);
  assert.equal(await stillAllowed(parentClaim),true);
  await rpc('bn_finish_urgent_circular_alert',teacherDevice,'teacher',teacherBinding,'t'.repeat(30),notice,false);
  await db.exec('reset role');
  await sql("update school_guardians set status='disabled' where id=$1",[parent]);
  await role('service_role');
  assert.equal(await stillAllowed(parentClaim),false,'revoke immediately invalidates an active lease');
  const later=new Date(at.getTime()+180000);
  assert.deepEqual(await claim(later),[],'a disabled guardian is excluded from the retry');
  await db.exec('reset role');
  await sql("update school_guardians set status='active' where id=$1",[parent]);
  await role('service_role');
  const retry=await claim(later);
  assert.equal(retry.length,1);
  assert.equal(retry[0].installation,parentDevice);
  assert.equal(await stillAllowed(parentClaim),false,'a renewed lease invalidates the old claim');
  await rpc('bn_finish_urgent_circular_alert',parentDevice,'parent',teacherBinding,'p'.repeat(30),notice,false);
  const retryAfterBadBinding=await claim(new Date(later.getTime()+180000));
  assert.equal(retryAfterBadBinding[0].binding,parentBinding);
  await role('authenticated',parent);
  await rpc('bn_disable_urgent_circular_alerts',school,'parent',parentDevice,parentBinding,registration);
  await role('service_role');
  assert.deepEqual(await claim(new Date(later.getTime()+360000)),[]);
  await role('authenticated',teacher);
  await rpc('bn_disable_urgent_circular_alerts',school,'teacher',teacherDevice,teacherBinding,registration);
  await role('authenticated',principal);
  assert.deepEqual(await rpc('bn_leadership_urgent_delivery_status',school,notice),{waiting:0,accepted:1,expired:0,unavailable:1});
 }finally{await db.close();}
});

test('an Android enrollment response cannot bind the previous recipient after sign-out',async()=>{
 const {create}=require('../school-urgent-circular-alerts');
 const {JSDOM}=require('jsdom');
 const {document}=new JSDOM('<button></button><p></p>').window;
 const sent=[];
 const bridge={postMessage:message=>sent.push(JSON.parse(message))};
 let release,start;
 const registration=new Promise(resolve=>{release=resolve;});
 const registered=new Promise(resolve=>{start=resolve;});
 let removed=false;
 const button=document.querySelector('button'),status=document.querySelector('p');
 const alerts=create({bridge,register:()=>{start();return registration;},button,status,uuid:()=>id(13)});
 alerts.setScope({school,member:parent});
 assert.equal(sent.at(-1).action,'resume');
 const notify=async payload=>bridge.onmessage({data:JSON.stringify({nonce:id(13),...payload})});
 await notify({status:'off'});
 button.click();
 assert.equal(sent.at(-1).action,'enable');
 const enable=notify({status:'ready',installation:parentDevice,token:'mock-fcm-token'});
 await registered;
 alerts.clear();release({binding:id(14),revoke:async()=>{removed=true;}});
 await enable;
 assert.equal(sent.at(-1).action,'clear');
 assert.equal(button.hidden,true);
 assert.equal(status.textContent,'');
 assert.equal(removed,true);
});

test('the worker rechecks each recipient just before FCM, omits circular content and preserves period messages',async()=>{
 const {transformSync}=require('esbuild');
 const {runInNewContext}=require('node:vm');
 const {webcrypto}=require('node:crypto');
 const source=fs.readFileSync('supabase/functions/school-teacher-period-alerts/index.ts','utf8');
 const signer=await webcrypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const privateKey=await webcrypto.subtle.exportKey('pkcs8',signer.privateKey);
 const nonce=id(20),lease=new Date(Date.now()+120000).toISOString(),expires=new Date(Date.now()+180000).toISOString();
 const period={installation:teacherDevice,token:'unit-teacher-period',binding:nonce,event_id:'period-end',title:'Next class',body:'Room 2',expires};
 const allowed={installation:parentDevice,token:'unit-parent-allowed',binding:nonce,event_id:notice,portal:'parent',expires,claim_until:lease};
 const revoked={...allowed,installation:otherDevice,token:'unit-parent-revoked'};
 const environment={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-service-role',
  TEACHER_PERIOD_SCHEDULER_SECRET:'test-scheduler-secret',TEACHER_PERIOD_FCM_SERVICE_ACCOUNT:JSON.stringify({
   project_id:'test-project',client_email:'worker@example.invalid',private_key:Buffer.from(privateKey).toString('base64')
  })};
 const calls=[];let handler;
 runInNewContext(transformSync(source,{loader:'ts'}).code,{
  Deno:{env:{get:key=>environment[key]},serve:fn=>{handler=fn;}},
  TextEncoder,Response,URLSearchParams,AbortSignal,btoa,atob,crypto:webcrypto,console,
  fetch:async(url,settings)=>{
   const endpoint=new URL(url),action=endpoint.pathname.split('/').at(-1);
   const body=settings.body instanceof URLSearchParams?null:JSON.parse(settings.body);
   calls.push({action,body});
   if(endpoint.hostname==='oauth2.googleapis.com')return Response.json({access_token:'test-oauth',expires_in:3600});
   if(action==='bn_claim_teacher_period_alerts')return Response.json([period]);
   if(action==='bn_claim_urgent_circular_alerts')return Response.json([allowed,revoked]);
   if(action==='bn_urgent_circular_alert_still_allowed')return Response.json(body.p_installation===parentDevice);
   if(action==='messages:send')return Response.json({name:'test-message'});
   if(action.startsWith('bn_finish_'))return Response.json(null);
   throw Error('Unexpected worker action '+action);
  }
 });
 let result=await handler(new Request('https://test.supabase.co',{method:'POST',headers:{'x-scheduler-secret':'different'}}));
 assert.equal(result.status,401);assert.equal(calls.length,0);
 result=await handler(new Request('https://test.supabase.co',{method:'POST',headers:{'x-scheduler-secret':'test-scheduler-secret'}}));
 assert.equal(result.status,200);assert.deepEqual(await result.json(),{claimed:1,sent:1,urgent:{claimed:2,accepted:1}});
 const urgent=calls.find(call=>call.action==='messages:send'&&call.body.message.token===allowed.token);
 const preflight=calls.find(call=>call.action==='bn_urgent_circular_alert_still_allowed'&&call.body.p_token===allowed.token);
 assert.equal(preflight.body.p_claim_until,lease);
 assert.ok(calls.indexOf(preflight)<calls.indexOf(urgent));
 assert.equal(urgent.body.message.android.priority,'high');
 assert.deepEqual(Object.keys(urgent.body.message.data).sort(),['binding','event','expires','kind','portal']);
 assert.equal(calls.some(call=>call.action==='messages:send'&&call.body.message.token===revoked.token),false);
 const teacher=calls.find(call=>call.action==='messages:send'&&call.body.message.token===period.token);
 assert.equal(teacher.body.message.data.title,period.title);
 assert.equal(teacher.body.message.data.body,period.body);
 assert.equal(calls.filter(call=>call.action==='bn_finish_urgent_circular_alert').length,1);
});
