const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../supabase/functions/school-whatsapp/core.mjs');
const student={id:'s1',institution_id:'school1',name:'Fixture Student',admission_number:'ADM-1',status:'active',guardian_phone:'+91 98765 43210',admission_login_alias:'OLD-1'};
const input={studentId:'s1',admissionNumber:'ADM-1',phone:'9876543210',values:{amount:2500,dueDate:'2026-11-10'}};
test('official queue matches canonical ID/admission and phone, never a name',async()=>{const c=await load();const r=c.resolveRecipients('fee',[input],[student],'Fixture School');assert.equal(r[0].state,'ready');assert.equal(r[0].phone,'919876543210');assert.equal(r[0].parameters[0],'Fixture Student');const bad=c.resolveRecipients('fee',[{...input,studentId:'unknown',admissionNumber:'unknown',name:student.name}],[student],'Fixture School');assert.equal(bad[0].state,'blocked');});
test('phone mismatch, duplicate recipient, inactive record and ambiguity block',async()=>{const c=await load();assert.equal(c.resolveRecipients('fee',[{...input,phone:'9123456789'}],[student],'S')[0].state,'blocked');assert.throws(()=>c.resolveRecipients('fee',[input,input],[student],'S'),/duplicate/i);assert.equal(c.resolveRecipients('fee',[input],[{...student,status:'inactive'}],'S')[0].state,'blocked');assert.equal(c.resolveRecipients('fee',[{...input,studentId:'',admissionNumber:'ADM-1'}],[student,{...student,id:'s2'}],'S')[0].state,'blocked');});
test('invalid and missing numbers and more than 50 rows fail closed',async()=>{const c=await load();for(const p of ['', '123','5555555555'])assert.equal(c.normalizePhone(p),'');assert.throws(()=>c.resolveRecipients('fee',Array(51).fill(input),[student],'S'),/50/);});
test('approved template receives exact positional parameters and Meta acceptance is not sent',async()=>{const c=await load();const template={name:'school_fees',language:'en',status:'APPROVED',components:[{type:'BODY',text:'{{1}} owes {{2}} by {{3}} at {{4}}'}]};assert.equal(c.validateTemplate('fee',template).name,'school_fees');const r=c.resolveRecipients('fee',[input],[student],'S')[0];const p=c.templatePayload(r,template);assert.equal(p.to,'919876543210');assert.equal(p.template.components[0].parameters.length,4);assert.equal(c.providerResult(200,{messages:[{id:'wamid.fixture'}]}).state,'accepted');assert.equal(c.providerResult(200,{}).state,'unknown');assert.equal(c.providerResult(400,{error:{code:132001}}).state,'failed');});
test('template status, buttons and parameter count are validated',async()=>{const c=await load();assert.throws(()=>c.validateTemplate('fee',{status:'PENDING'}),/approved/i);assert.throws(()=>c.validateTemplate('fee',{name:'x',language:'en',status:'APPROVED',components:[{type:'BODY',text:'{{1}}'}]}),/parameter/i);});
test('late and duplicate status events cannot downgrade delivered/read',async()=>{const c=await load();assert.equal(c.nextStatus('read','sent'),'read');assert.equal(c.nextStatus('delivered','failed'),'delivered');assert.equal(c.nextStatus('accepted','sent'),'sent');assert.equal(c.nextStatus('sent','failed'),'failed');});
test('webhook requires HMAC signature over the exact raw body',async()=>{const c=await load();const raw='{"fixture":true}',secret='fixture-only-app-secret';const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const mac=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(raw));const sig='sha256='+Buffer.from(mac).toString('hex');assert.equal(await c.verifySignature(raw,sig,secret),true);assert.equal(await c.verifySignature(raw+' ',sig,secret),false);assert.equal(await c.verifySignature(raw,'',secret),false);});
test('service rejects unauthenticated requests without touching the database',async()=>{const {createService}=await import('../supabase/functions/school-whatsapp/service.mjs');let calls=0;const handler=createService({url:'https://fixture.test',serviceKey:'server-only',anonKey:'public',fetcher:async()=>{calls++;throw Error('No fetch expected');}});const response=await handler(new Request('https://fixture.test/functions/v1/school-whatsapp/connection'));assert.equal(response.status,401);assert.equal(calls,0);});
test('service validates real auth identity and administrator role',async()=>{const {createService}=await import('../supabase/functions/school-whatsapp/service.mjs');const calls=[];const handler=createService({url:'https://fixture.test',serviceKey:'server-only',anonKey:'public',fetcher:async(url,options)=>{calls.push({url,options});return Response.json(url.includes('/auth/')?{id:'11111111-1111-4111-8111-111111111111'}:[]);}});const response=await handler(new Request('https://fixture.test/functions/v1/school-whatsapp/connection',{headers:{Authorization:'Bearer fixture'}}));assert.equal(response.status,403);assert.equal(calls.length,2);assert.match(calls[1].url,/role=eq.school_admin&status=eq.active/);});
test('cross-origin callers cannot reach auth or storage',async()=>{const {createService}=await import('../supabase/functions/school-whatsapp/service.mjs');const handler=createService({url:'https://fixture.test',serviceKey:'server-only',anonKey:'public',fetcher:()=>{throw Error('No network');}});assert.equal((await handler(new Request('https://fixture.test/functions/v1/school-whatsapp/batches',{method:'POST',headers:{Origin:'https://other.test'}}))).status,403);});

test('TDD RED: WhatsApp browser client refreshes malformed expiry, rejects missing refresh_token and times out stalled fetches',async()=>{
 const vm=require('node:vm'),fs=require('node:fs');
 const code=fs.readFileSync('school-whatsapp-client.js','utf8');
 function makeEnv(session,fetcher){
  const store=new Map(session?[['bn_school_staff_session_v1',JSON.stringify(session)]]:[]);
  const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
  const window={fetch:fetcher,sessionStorage:storage};
  vm.runInNewContext(code,{window,globalThis:window,sessionStorage:storage,fetch:fetcher,JSON,Date,Number,Error,AbortController,setTimeout,clearTimeout});
  return {api:window.BNSchoolWhatsApp,store};
 }
 let refreshed=0;
 const {api:badExpApi}=makeEnv({access_token:'stale',refresh_token:'rt-1',expires_at:'not-a-number'},async url=>{
  if(url.includes('/auth/v1/token')){refreshed++;return {ok:true,json:async()=>({access_token:'fresh-token',refresh_token:'rt-2',expires_in:3600})};}
  return {ok:true,json:async()=>({connected:true})};
 });
 await badExpApi.request('/connection');
 assert.equal(refreshed,1,'Malformed expires_at must trigger token refresh');

 const {api:noRtApi}=makeEnv({access_token:'expired',expires_at:0},async()=>{throw Error('Should not call network without refresh_token');});
 await assert.rejects(noRtApi.request('/connection'),/sign in again/i);

 const {api:abortApi}=makeEnv({access_token:'ok',refresh_token:'rt',expires_at:Math.floor(Date.now()/1000)+3600},async(_url,opts)=>{
  assert.ok(opts.signal,'WhatsApp fetch must attach AbortSignal timeout');
  const err=Error('Timed out');err.name='AbortError';throw err;
 });
 await assert.rejects(abortApi.request('/connection'),/timed out/i);
});

test('TDD RED: official WhatsApp service denies batch mutations when school trial is expired',async()=>{
 const {createService}=await import('../supabase/functions/school-whatsapp/service.mjs');
 const handler=createService({url:'https://fixture.test',serviceKey:'server-only',anonKey:'public',fetcher:async url=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'11111111-1111-4111-8111-111111111111'});
  if(url.includes('/school_users?'))return Response.json([{id:'u1',institution_id:'22222222-2222-4222-8222-222222222222',role:'school_admin',status:'active'}]);
  if(url.includes('/institutions?'))return Response.json([{id:'22222222-2222-4222-8222-222222222222',name:'School',status:'trial'}]);
  if(url.includes('/rpc/bn_school_writable'))return Response.json(false);
  throw Error('Unexpected write query on expired school: '+url);
 }});
 const response=await handler(new Request('https://fixture.test/functions/v1/school-whatsapp/batches',{
  method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({confirmed:true,consentConfirmed:true})
 }));
 assert.equal(response.status,403);
 assert.match((await response.json()).error,/expired|read-only/i);
});

test('TDD RED: official WhatsApp worker halts queued claims upon mid-batch expiry while Meta delivery webhook still commits',async()=>{
 const {createService}=await import('../supabase/functions/school-whatsapp/service.mjs');
 const events=[];
 let claimed=false;
 const secret='fixture-only-app-secret';
 const rawPayload=JSON.stringify({object:'whatsapp_business_account',entry:[{id:'987654321',changes:[{value:{metadata:{phone_number_id:'123456789'},statuses:[{id:'wamid.1',status:'delivered',timestamp:'1700000000'}]}}]}]});
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const mac=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(rawPayload));
 const sig='sha256='+Buffer.from(mac).toString('hex');
 let writableChecks=0;
 const handler=createService({url:'https://fixture.test',serviceKey:'server-only',anonKey:'public',fetcher:async(url,opts={})=>{
  const p=new URL(url).pathname;
  if(p.endsWith('/school_whatsapp_connections'))return Response.json([{institution_id:'22222222-2222-4222-8222-222222222222',phone_number_id:'123456789',waba_id:'987654321'}]);
  if(p.endsWith('/rpc/school_wa_secret'))return Response.json(JSON.stringify({token:'tok',appSecret:secret}));
  if(p.endsWith('/rpc/school_wa_event')){events.push(JSON.parse(opts.body));return Response.json(null);}
  if(p.endsWith('/rpc/bn_school_writable')){writableChecks++;return Response.json(false);}
  if(p.endsWith('/rpc/school_wa_claim')){claimed=true;return Response.json([]);}
  throw Error('Unexpected '+p);
 }});
 const hookRes=await handler(new Request('https://fixture.test/functions/v1/school-whatsapp/webhook',{
  method:'POST',headers:{'x-hub-signature-256':sig},body:rawPayload
 }));
 assert.equal(hookRes.status,200);
 assert.equal(events.length,1);
 assert.equal(events[0].p_state,'delivered');

 // Resume on newly expired school must recheck writable inside work() and stop before claiming queued rows
 const tasks=[];
 const batchRes=createService({url:'https://fixture.test',serviceKey:'server-only',anonKey:'public',waitUntil:p=>tasks.push(p),fetcher:async url=>{
  const p=new URL(url).pathname;
  if(p.endsWith('/auth/v1/user'))return Response.json({id:'11111111-1111-4111-8111-111111111111'});
  if(p.endsWith('/school_users'))return Response.json([{id:'u1',institution_id:'22222222-2222-4222-8222-222222222222'}]);
  if(p.endsWith('/institutions'))return Response.json([{id:'22222222-2222-4222-8222-222222222222',name:'School',status:'trial'}]);
  if(p.endsWith('/school_whatsapp_connections'))return Response.json([{institution_id:'22222222-2222-4222-8222-222222222222',phone_number_id:'123456789',waba_id:'987654321',api_version:'v24.0',webhook_verified_at:'2026-11-01',template_map:{}}]);
  if(p.endsWith('/school_whatsapp_batches'))return Response.json([{id:'44444444-4444-4444-8444-444444444444',kind:'fee',template:{name:'t',language:'en',components:[{type:'BODY',text:'{{1}}'}]}}]);
  if(p.endsWith('/rpc/school_wa_secret'))return Response.json(JSON.stringify({token:'tok',appSecret:secret}));
  if(p.endsWith('/message_templates'))return Response.json({data:[{name:'t',language:'en',status:'APPROVED',components:[{type:'BODY',text:'{{1}}'}]}]});
  if(p.endsWith('/rpc/bn_school_writable')){writableChecks++;return Response.json(writableChecks<3);}
  if(p.endsWith('/rpc/school_wa_claim')){claimed=true;return Response.json([]);}
  throw Error('Unexpected '+p);
 }});
 await batchRes(new Request('https://fixture.test/functions/v1/school-whatsapp/batches/44444444-4444-4444-8444-444444444444/resume',{
  method:'POST',headers:{Authorization:'Bearer tok'},body:JSON.stringify({})
 }));
 await Promise.all(tasks);
 assert.equal(claimed,false,'Worker must check bn_school_writable before claiming messages');
});
