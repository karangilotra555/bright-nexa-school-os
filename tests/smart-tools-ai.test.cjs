'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const svc=require('../src/smart-tools/teacher-ai.cjs');

const base={tool:'Question Paper Generator',className:'6',subject:'Hindi',topic:'all',language:'English',difficulty:'Medium',duration:'3 Hours',totalMarks:40,count:14};

function mockFetch({role='teacher',school='school-a',failProvider=false,output}={}){
 const requests=[];
 const fetcher=async(url,opts={})=>{
  requests.push({url,opts});
  let data,status=200;
  if(url.endsWith('/auth/v1/user'))data={id:'user-1'};
  else if(url.includes('/rest/v1/school_users?'))data=[{id:'staff-1',auth_user_id:'user-1',institution_id:school,role,status:'active'}];
  else if(url.includes('/rest/v1/institutions?'))data=[{id:school,status:'active'}];
  else if(url.includes('generativelanguage.googleapis.com')){
   if(failProvider){status=429;data={error:{message:'Rate limit'}}}
   else data={candidates:[{content:{parts:[{text:JSON.stringify(output)}]}}]};
  } else throw Error('Unexpected request '+url);
  return {ok:status===200,status,json:async()=>data};
 };
 return {fetcher,requests};
}
function config(fetcher,key='server-key'){
 return svc.createService({fetcher,env:{GEMINI_API_KEY:key,SCHOOL_SUPABASE_URL:'https://example.supabase.co',SCHOOL_SUPABASE_PUBLISHABLE_KEY:'public-key'}});
}
test('TDD: each supported Smart Tool has a specific contract and rejects blank/generic input',()=>{
 assert.equal(svc.TOOLS.length,10);
 assert.equal(new Set(svc.TOOLS).size,10);
 for(const tool of svc.TOOLS)assert.equal(typeof svc.contractFor(tool),'object',tool);
 assert.equal(svc.validateInput({...base,topic:'',tool:'Activity Ideas Generator'}).topic,'all');
 assert.throws(()=>svc.validateInput({...base,tool:'School Notice Generator',topic:'all'}),/specific|topic/i);
 assert.throws(()=>svc.validateInput({...base,tool:'Student Remark Generator'}),/evidence/i);
 assert.throws(()=>svc.validateInput({...base,tool:'Weak Student Remedial Plan'}),/evidence/i);
 const general=svc.validateInput(base);
 assert.equal(general.topicScope,'general');
 assert.equal(general.subject,'Hindi');
});
test('TDD: 3-hour paper blueprint has real mixed sections, 1–5 marks, Bloom levels and exact time',()=>{
 const request=svc.validateInput(base);
 const plan=svc.planAssessment(request);
 assert.equal(plan.questions.length,14);
 assert.equal(plan.questions.reduce((sum,q)=>sum+q.marks,0),40);
 assert.equal(plan.questions.reduce((sum,q)=>sum+q.minutes,0),180);
 assert.ok(new Set(plan.questions.map(q=>q.type)).size>=3);
 assert.ok(plan.questions.every(q=>Number.isInteger(q.marks)&&q.marks>=1&&q.marks<=5));
 assert.ok(plan.questions.every(q=>['Apply','Analyze'].includes(q.bloom)));
 assert.ok(plan.questions.every(q=>q.id&&q.minutes>0));
});
test('TDD: shorter papers have fewer question types; impossible 50-mark 10-item mixed paper fails visibly',()=>{
 const long=svc.planAssessment(svc.validateInput(base));
 const short=svc.planAssessment(svc.validateInput({...base,duration:'45 Minutes',totalMarks:20,count:12}));
 assert.ok(short.sections.length<long.sections.length);
 assert.equal(short.questions.reduce((a,q)=>a+q.minutes,0),45);
 assert.throws(()=>svc.planAssessment(svc.validateInput({...base,totalMarks:50,count:10})),/questions|mix|structure|distribution/i);
});
test('TDD: 10 distinct activities must contain real materials, steps, goals and practical duration',()=>{
 const payload=svc.validateInput({...base,tool:'Activity Ideas Generator',activityFocus:'Quick Fun Games',count:10});
 const items=Array.from({length:10},(_,i)=>({title:'Classroom challenge '+i,goal:'Practice Hindi vocabulary by identifying real word families '+i,materials:['word cards'],steps:['Sort ten Hindi words by shared root','Explain the grouping to a partner'],minutes:7}));
 const value=svc.validateOutput(payload,{activities:items});
 assert.equal((value.match(/Classroom challenge/g)||[]).length,10);
 assert.doesNotMatch(value,/using your class notes|Option A|Option B/);
 assert.throws(()=>svc.validateOutput(payload,{activities:items.slice(0,8)}),/10|count|activities/i);
});
test('TDD: backend rejects generic, duplicate, and unverifiable assessment responses',()=>{
 const req=svc.validateInput(base),plan=svc.planAssessment(req);
 const questions=plan.questions.map((q,i)=>({id:q.id,text:'हिंदी भाषा में विभिन्न स्तर के शब्दों की तुलना और विश्लेषण कीजिए '+(i+1)+(q.type==='MCQ'?' (A) संज्ञा (B) क्रिया (C) विशेषण (D) सर्वनाम':''),answerGuide:'शब्दों के चयन और विश्लेषण के उचित कारण लिखें'}));
 assert.match(svc.validateOutput(req,{questions},plan),/हिंदी/);
 assert.throws(()=>svc.validateOutput(req,{questions:questions.map(q=>({...q,text:'Define all using your class notes or textbook.'}))},plan),/generic|placeholder|quality|repeat/i);
 assert.throws(()=>svc.validateOutput(req,{questions:questions.map(q=>({...q,text:questions[0].text}))},plan),/duplicate|repeat/i);
 assert.throws(()=>svc.validateOutput(req,{questions:questions.slice(1)},plan),/count|questions/i);
});
test('TDD: server authenticates Supabase staff and school before any Gemini generation',async()=>{
 const h=mockFetch();
 const service=config(h.fetcher);
 await assert.rejects(service.generate({...base},''),e=>e.status===401);
 assert.equal(h.requests.length,0);
 await assert.rejects(config(mockFetch({role:'accountant'}).fetcher).generate(base,'valid-staff-token'),e=>e.status===403);
 const noKey=svc.createService({fetcher:h.fetcher,env:{SCHOOL_SUPABASE_URL:'https://example.supabase.co',SCHOOL_SUPABASE_PUBLISHABLE_KEY:'public-key'}});
 await assert.rejects(noKey.generate(base,'valid-staff-token'),e=>e.status===503);
});
test('TDD: AI output is validated and never marked successful on provider rate limit or bad format',async()=>{
 const bad=mockFetch({failProvider:true});
 await assert.rejects(config(bad.fetcher).generate(base,'valid-staff-token'),e=>e.status===502||e.status===429);
 const sent=bad.requests.find(x=>x.url.includes('generativelanguage.googleapis.com'));
 assert.equal(sent.opts.headers['x-goog-api-key'],'server-key');
 assert.equal((sent.opts.headers.Authorization||''),'');
 assert.match(sent.opts.body,/Hindi/);
 assert.match(sent.opts.body,/mixed sections|assessment blueprint|question blueprint/i);
});
test('TDD: client must call authenticated backend, never ship provider key or fall back to local fake text',()=>{
 const src=fs.readFileSync('app-extracted/src/BrightNexaApp.jsx','utf8');
 const client=fs.readFileSync('teacher-ai-cloud.js','utf8');
 assert.match(src,/await Oa\(/);
 assert.match(src,/BNSmartToolsAI/);
 assert.doesNotMatch(src,/Offline draft ready\. Check your class syllabus before use\./);
 assert.match(client,/bn_school_staff_session_v1/);
 assert.match(client,/api\/smart-tools\/generate/);
 assert.doesNotMatch(client,/GEMINI_API_KEY|GROQ_API_KEY|x-goog-api-key/);
});


test('TDD: dropdown selections govern the request; optional suggestions must not override class or marks',()=>{
 const p=svc.validateInput({...base,subject:'Science',topic:'all',totalMarks:25,count:10,duration:'45 Minutes',instructions:'Class 6 Hindi ka 50 marks paper 3 hours ka banao. Grammar, comprehension and essay writing. Answer key bhi do.'});
 assert.equal(p.className,'6');
 assert.equal(p.subject,'Science');
 assert.equal(p.totalMarks,25);
 assert.equal(p.durationMinutes,45);
 assert.equal(p.count,10);
 const plan=svc.planAssessment(p);
 assert.equal(plan.totalMarks,25);
 assert.equal(plan.questions.reduce((n,q)=>n+q.minutes,0),45);
 const prompt=svc.promptFor(p,plan);
 assert.match(prompt.user,/Grammar, comprehension and essay writing/);
 assert.match(prompt.system,/AUTHORITATIVE|form settings/i);
});
test('TDD: no separate topic field and teacher suggestions are used for generated and saved drafts',()=>{
 const source=fs.readFileSync('app-extracted/src/BrightNexaApp.jsx','utf8');
 const bundle=fs.readFileSync('assets/index-brightnexa-v2.js','utf8');
 assert.doesNotMatch(source,/label=\{`Topic \/ Chapter`\}/);
 assert.doesNotMatch(bundle,/label: `Topic \/ Chapter`/);
 assert.match(source,/Suggestions \/ Chapter \(optional\)/);
 assert.match(source,/topic:\s*teacherInstructions\.trim\(\)/);
 assert.match(bundle,/topic:\s*teacherInstructions\.trim\(\)/);
 assert.match(source,/d\('20'\)/,'50-mark paper should default to a feasible 20 questions');
});
test('TDD: unstructured instructions are preserved, validated and provider prompt is not generic',()=>{
 const p=svc.validateInput({...base,topic:'all',instructions:'Students will practise मुहावरे, paragraph writing, and reading comprehension. Include answer keys.'});
 assert.match(p.instructions,/मुहावरे/);
 const prompt=svc.promptFor(p,svc.planAssessment(p));
 assert.match(prompt.user,/paragraph writing/);
 assert.doesNotMatch(prompt.system,/use your class notes/i);
 assert.throws(()=>svc.validateInput({...base,instructions:'x'.repeat(4000)}),/instruction|long/i);
});
test('TDD: teacher instructions are sent by the authenticated frontend without a local-template fallback',()=>{
 const source=fs.readFileSync('app-extracted/src/BrightNexaApp.jsx','utf8');
 assert.match(source,/Suggestions \/ Chapter \(optional\)/);
 assert.match(source,/instructions:\s*teacherInstructions/);
 assert.match(source,/await Oa\(/);
 assert.doesNotMatch(source,/Offline draft ready\. Check your class syllabus before use\./);
});


test('TDD: all served entrypoints load the AI client before the actual React bundle, with consistent mirrors',()=>{
 const fs=require('node:fs');
 const bases=['','docs/','app-extracted/dist/'];
 for(const prefix of bases){
  const html=fs.readFileSync(prefix+'index.html','utf8');
  const client=html.indexOf('teacher-ai-cloud.js?v=');
  const verifiedEntry=html.indexOf('school-erp-entry.js?v=');
  assert.ok(client>0&&verifiedEntry>client,'AI client must load before the verified school entry: '+prefix);
  const bootstrap=fs.readFileSync(prefix+'school-erp-entry.js','utf8');
  assert.ok(bootstrap.includes('assets/index-brightnexa-v2.js?v=20261111-portrait-compact-v1'));
  assert.ok(bootstrap.includes('school_workspace_pull'));
  const js=fs.readFileSync(prefix+'assets/index-brightnexa-v2.js','utf8');
  assert.match(js,/BNSmartToolsAI/);
  assert.match(js,/Suggestions \/ Chapter \(optional\)/);
  assert.doesNotMatch(js,/Offline draft ready\. Check your class syllabus before use/);
 }
 const source=fs.readFileSync('app-extracted/src/BrightNexaApp.jsx','utf8');
 assert.match(source,/generating\s*\?\s*[\x60'"]Generating with AI/);
});
test('TDD: Smart Tools backend route requires school authentication and never exposes a provider secret',()=>{
 const source=fs.readFileSync('server.js','utf8');
 assert.match(source,/pathname === '\/api\/smart-tools\/generate'/);
 assert.match(source,/smartToolsAI\.generate\(payload, token\)/);
 assert.doesNotMatch(fs.readFileSync('teacher-ai-cloud.js','utf8'),/x-goog-api-key|GEMINI_API_KEY|GROQ_API_KEY/);
});


test('TDD: teacher can request 10–20 distinct activities; never silently truncate count',()=>{
 const input={...base,tool:'Activity Ideas Generator',count:20,activityFocus:'Quick Fun Games',instructions:'Make 20 Hindi word games'};
 const req=svc.validateInput(input);
 assert.equal(req.count,20);
 assert.throws(()=>svc.validateInput({...input,count:21}),/20|count|activities/i);
 const prompt=svc.promptFor(req,null);
 assert.match(prompt.system,/Exactly 20 entries/);
 const items=Array.from({length:20},(_,i)=>({title:'Hindi classroom game '+i,goal:'Practice vocabulary in small groups with clear learning outcome '+i,materials:['word cards'],steps:['Sort the words by grammatical function','Explain choices in Hindi to a partner'],minutes:6}));
 const generated=svc.validateOutput(req,{activities:items});
 assert.equal((generated.match(/Hindi classroom game /g)||[]).length,20);
});
test('TDD: a meaningful typed notice request works even when chapter input remains "all"',()=>{
 const req=svc.validateInput({...base,tool:'School Notice Generator',topic:'all',instructions:'Make a school notice about the annual Hindi handwriting competition, only using confirmed details.'});
 assert.equal(req.tool,'School Notice Generator');
 assert.notEqual(req.topic,'all');
 assert.match(svc.promptFor(req).user,/handwriting competition/);
});


test('TDD RED: browser client always installs window.BNSmartToolsAI even when legacy CommonJS module is present',()=>{
 const vm=require('node:vm');
 const source=fs.readFileSync('teacher-ai-cloud.js','utf8');
 const window={};
 const module={exports:{}};
 vm.runInNewContext(source,{window,globalThis:window,module});
 assert.equal(typeof window.BNSmartToolsAI?.generate,'function','Browser client must never export exclusively to CommonJS');
 assert.equal(typeof module.exports.generate,'function','Node/CommonJS consumers retain support');
});
test('TDD RED: missing AI client is recovered once via versioned, same-origin script and never a fake local generator',()=>{
 const src=fs.readFileSync('app-extracted/src/BrightNexaApp.jsx','utf8');
 const bundle=fs.readFileSync('assets/index-brightnexa-v2.js','utf8');
 for(const [name,code] of [['source',src],['bundle',bundle]]){
  assert.match(code,/ensureSchoolAIClient/,'Client recovery guard missing from '+name);
  assert.match(code,/document\.createElement\(['"]script['"]\)/,'A missing client needs real script loading in '+name);
  assert.match(code,/teacher-ai-cloud\.js\?v=20261106-client-recovery-v2/,'Cache/version mismatch in '+name);
  assert.match(code,/script\.onerror/,'Network failure must be surfaced to teacher in '+name);
  assert.doesNotMatch(code,/if\(!globalThis\.BNSmartToolsAI\)throw Error\('School AI client failed to load/);
 }
});
test('TDD RED: cache reset version changes with the AI client while keeping existing data untouched',()=>{
 for(const dir of ['','docs/','app-extracted/dist/']){
  const html=fs.readFileSync(dir+'index.html','utf8');
  assert.match(html,/teacher-ai-cloud\.js\?v=20261106-client-recovery-v2/);
  assert.match(html,/school-erp-entry\.js\?v=[0-9]{8}-[a-z0-9-]+/);
  assert.match(html,/CACHE_VERSION = '[0-9]{8}-[a-z0-9-]+'/);
  const sw=fs.readFileSync(dir+'sw.js','utf8');
  assert.match(sw,/teacher-ai-cloud\.js\?v=20261106-client-recovery-v2/);
  assert.doesNotMatch(html,/localStorage\.clear\(/);
 }
});


test('client recovery: runtime loads exactly one versioned script and executes the real AI client',async()=>{
 const vm=require('node:vm');
 const src=fs.readFileSync('assets/index-brightnexa-v2.js','utf8');
 const start=src.indexOf('let schoolAIClientLoad = null;');
 const end=src.indexOf('function OaLegacy(',start);
 assert.ok(start>=0&&end>start);
 const window={}, scripts=[];
 const document={
  baseURI:'https://bright-nexa-school-os.onrender.com/index.html?openSchool=true',
  createElement(tag){assert.equal(tag,'script');return {};},
  head:{appendChild(script){scripts.push(script);}}
 };
 const context=vm.createContext({window,globalThis:window,document,URL,Promise,Error});
 const real=vm.runInContext(src.slice(start,end)+';({Oa,ensureSchoolAIClient})',context);
 const first=real.Oa({tool:'Lesson Plan Generator'});
 const second=real.Oa({tool:'Activity Ideas Generator'});
 assert.equal(scripts.length,1,'Concurrent calls must share a single client download');
 assert.ok(scripts[0].src.startsWith('https://bright-nexa-school-os.onrender.com/teacher-ai-cloud.js?v=20261106-client-recovery-v2'));
 assert.equal(scripts[0].async,true);
 const calls=[];
 window.BNSmartToolsAI={generate:async(input)=>{calls.push(input.tool);return 'real provider result for '+input.tool;}};
 scripts[0].onload();
 assert.equal(await first,'real provider result for Lesson Plan Generator');
 assert.equal(await second,'real provider result for Activity Ideas Generator');
 assert.deepEqual(calls,['Lesson Plan Generator','Activity Ideas Generator']);
 const third=await real.Oa({tool:'School Notice Generator'});
 assert.equal(third,'real provider result for School Notice Generator');
 assert.equal(scripts.length,1,'Already initialized client must not download again');
});
test('client recovery: script network failure is visible and does not create any content',async()=>{
 const vm=require('node:vm'),src=fs.readFileSync('assets/index-brightnexa-v2.js','utf8');
 const start=src.indexOf('let schoolAIClientLoad = null;'),end=src.indexOf('function OaLegacy(',start);
 const window={}, scripts=[];
 const document={baseURI:'https://bright-nexa-school-os.onrender.com/index.html',createElement:()=>({}),head:{appendChild:s=>scripts.push(s)}};
 const real=vm.runInNewContext(src.slice(start,end)+';({Oa})',{window,globalThis:window,document,URL,Promise,Error});
 const pending=real.Oa({tool:'Question Paper Generator'});
 assert.equal(scripts.length,1);
 scripts[0].onerror();
 await assert.rejects(pending,/could not be downloaded/);
 assert.equal(window.BNSmartToolsAI,undefined,'Must not substitute a local placeholder generator');
});


test('default Groq uses supported GPT-OSS JSON model instead of retired Llama 70B',async()=>{
 const requests=[];
 const service=svc.createService({env:{GROQ_API_KEY:'fixture-key'},fetcher:async(url,opts)=>{
  if(url.endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:'user'})};
  if(url.includes('/school_users?'))return {ok:true,json:async()=>[{id:'staff',auth_user_id:'user',institution_id:'school',role:'teacher',status:'active'}]};
  if(url.includes('/institutions?'))return {ok:true,json:async()=>[{id:'school',status:'trial'}]};
  const request=JSON.parse(opts.body);requests.push(request);
  return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({content:'Learning objectives include practicing safe circuit building. Children explore how batteries and bulbs work together, discuss observations, compare materials, and complete a short exit ticket to demonstrate understanding.'})}}]})};
 }});
 const result=await service.generate({...base,subject:'Science',tool:'Lesson Plan Generator'},'fixture-token');
 assert.match(result.content,/Learning objectives/);
 assert.equal(requests.length,1);
 assert.equal(requests[0].model,'openai/gpt-oss-120b');
 assert.equal(requests[0].response_format.type,'json_object');
 assert.equal(requests[0].reasoning_format,'hidden');
});
test('deprecated Groq model migrates once after real HTTP 404, preserving school content checks',async()=>{
 const models=[];
 const service=svc.createService({env:{GROQ_API_KEY:'fixture',GROQ_MODEL:'llama-3.3-70b-versatile'},fetcher:async(url,opts)=>{
  if(url.endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:'user'})};
  if(url.includes('/school_users?'))return {ok:true,json:async()=>[{id:'staff',auth_user_id:'user',institution_id:'school',role:'school_admin',status:'active'}]};
  if(url.includes('/institutions?'))return {ok:true,json:async()=>[{id:'school',status:'trial'}]};
  const model=JSON.parse(opts.body).model;models.push(model);
  if(model==='llama-3.3-70b-versatile')return {ok:false,status:404};
  return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({content:'Class activity: practice safe low-voltage circuits with teacher oversight. Identify circuit parts, compare working and broken circuits, and finish with guided observations and an exit ticket.'})}}]})};
 }});
 const result=await service.generate({...base,subject:'Science',tool:'Lesson Plan Generator'},'fixture-token');
 assert.match(result.content,/Class activity/);
 assert.deepEqual(models,['llama-3.3-70b-versatile','openai/gpt-oss-120b']);
});
test('unsupported custom Groq model 404 does not invent content or retry endlessly',async()=>{
 let attempts=0;
 const service=svc.createService({env:{GROQ_API_KEY:'fixture',GROQ_MODEL:'custom-unknown'},fetcher:async(url)=>{
  if(url.endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:'user'})};
  if(url.includes('/school_users?'))return {ok:true,json:async()=>[{id:'staff',auth_user_id:'user',institution_id:'school',role:'teacher',status:'active'}]};
  if(url.includes('/institutions?'))return {ok:true,json:async()=>[{id:'school',status:'active'}]};
  attempts++;return {ok:false,status:404};
 }});
 await assert.rejects(service.generate({...base,subject:'Science',tool:'Lesson Plan Generator'},'fixture-token'),err=>err.status===404&&/unavailable or retired/.test(err.message));
 assert.equal(attempts,1);
});
test('Gemini 404 uses configured Groq fallback without declaring rate limits or fabricating content',async()=>{
 const models=[];
 const service=svc.createService({env:{GEMINI_API_KEY:'fixture',GROQ_API_KEY:'fixture'},fetcher:async(url,opts)=>{
  if(url.endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:'user'})};
  if(url.includes('/school_users?'))return {ok:true,json:async()=>[{id:'staff',auth_user_id:'user',institution_id:'school',role:'teacher',status:'active'}]};
  if(url.includes('/institutions?'))return {ok:true,json:async()=>[{id:'school',status:'active'}]};
  if(url.includes('googleapis.com')){models.push('gemini');return {ok:false,status:404};}
  models.push(JSON.parse(opts.body).model);
  return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({content:'Teaching plan: introduce energy transfer in simple electric circuits, explore safety with low-voltage batteries, test connections and record observations in a teacher-monitored classroom.'})}}]})};
 }});
 assert.match((await service.generate({...base,subject:'Science',tool:'Lesson Plan Generator'},'fixture-token')).content,/Teaching plan/);
 assert.deepEqual(models,['gemini','openai/gpt-oss-120b']);
});
