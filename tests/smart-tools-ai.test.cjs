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
 assert.throws(()=>svc.validateInput({...base,topic:'',tool:'Activity Ideas Generator'}),/topic/i);
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


test('TDD: free-form teacher instructions override defaults when explicit, without losing school guardrails',()=>{
 const p=svc.validateInput({...base,subject:'Science',topic:'all',totalMarks:25,count:10,duration:'45 Minutes',instructions:'Class 6 Hindi ka 50 marks paper 3 hours ka banao. Grammar, comprehension and essay writing. Answer key bhi do.'});
 assert.equal(p.className,'6');assert.equal(p.subject,'Hindi');assert.equal(p.totalMarks,50);assert.equal(p.durationMinutes,180);
 assert.ok(p.count>=12,'50 marks needs a proper mixed paper, not ten five-mark questions');
 const plan=svc.planAssessment(p);assert.equal(plan.totalMarks,50);
 assert.equal(plan.questions.reduce((n,q)=>n+q.minutes,0),180);
 const prompt=svc.promptFor(p,plan);
 assert.match(prompt.user,/Grammar, comprehension and essay writing/);
 assert.match(prompt.system,/teacher instructions|teacher's instructions/i);
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
 assert.match(source,/Teacher Instructions/);
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
  const bundle=html.indexOf('assets/index-brightnexa-v2.js?v=');
  assert.ok(client>0&&bundle>client,'AI client must load before the school app: '+prefix);
  const js=fs.readFileSync(prefix+'assets/index-brightnexa-v2.js','utf8');
  assert.match(js,/BNSmartToolsAI/);
  assert.match(js,/Teacher Instructions/);
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
