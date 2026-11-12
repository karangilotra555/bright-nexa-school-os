'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const svc=require('../src/smart-tools/teacher-ai.cjs');
const client=require('../teacher-ai-cloud.js');
const base={tool:'Class Test Generator',className:'6',subject:'Science',duration:'45 Minutes',count:10,totalMarks:25};
test('optional suggestions set the academic scope without a chapter payload',()=>{
 assert.equal(svc.validateInput({...base,instructions:'Fractions'}).topic,'Fractions');
 assert.equal(svc.validateInput({...base,instructions:''}).topicScope,'general');
});
test('assessment rejects MCQs missing three choices',()=>{
 const plan=svc.planAssessment(base);
 const questions=plan.questions.map((q,i)=>({id:q.id,text:'Which material conducts electricity in experiment '+i+'? (A) Copper',answerGuide:'Copper is a conductor of electricity.'}));
 assert.throws(()=>svc.validateOutput(base,{questions},plan),/choices|options/i);
 const empty=questions.map(q=>({...q,text:q.text.replace('(A) Copper','(A) (B) (C) (D) Copper')}));
 assert.throws(()=>svc.validateOutput(base,{questions:empty},plan),/choices|options/i);
});
test('activities cannot exceed the selected duration',()=>{
 const activities=Array.from({length:2},(_,i)=>({title:'Circuit investigation '+i,goal:'Identify materials that conduct electricity',materials:['battery','bulb'],steps:['Connect the battery to the bulb safely','Test each material and record the result'],minutes:30}));
 assert.throws(()=>svc.validateOutput({...base,tool:'Activity Ideas Generator',count:2,duration:'20 Minutes'},{activities}),/duration|time/i);
});
test('MCQ choices preserve mathematical signs and decimals',()=>{
 const plan=svc.planAssessment(base);
 const questions=plan.questions.map((q,i)=>({id:q.id,text:'Select the correct numerical result for calculation '+i+': (A) -2 (B) 2 (C) 2.5 (D) 25',answerGuide:'(A) The result is negative two.'}));
 assert.doesNotThrow(()=>svc.validateOutput({...base,subject:'Mathematics'},{questions},plan));
});
test('AI session with unknown expiry refreshes before sending a request',async()=>{
 let saved={access_token:'old-token',refresh_token:'refresh-token'};
 const storage={getItem:()=>JSON.stringify(saved),setItem:(_,v)=>{saved=JSON.parse(v)}};
 const api=client.create({storage,fetcher:async(url,opts)=>{
  if(url.includes('/auth/v1/token'))return {ok:true,json:async()=>({access_token:'new-token',refresh_token:'new-refresh',expires_in:3600})};
  assert.equal(opts.headers.Authorization,'Bearer new-token');
  return {ok:true,json:async()=>({content:'Verified school material. '.repeat(5)})};
 }});
 assert.match(await api.generate(base),/Verified/);
});
test('restricted Gemini 2.5 HTTP 404 retries once using newer Flash-Lite, never fabricates output',async()=>{
 const calls=[];
 const service=svc.createService({env:{GEMINI_API_KEY:'fixture',GEMINI_MODEL:'gemini-2.5-flash'},fetcher:async(url)=>{
  if(url.endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:'user'})};
  if(url.includes('/school_users?'))return {ok:true,json:async()=>[{id:'staff',auth_user_id:'user',institution_id:'school',role:'teacher',status:'active'}]};
  if(url.includes('/institutions?'))return {ok:true,json:async()=>[{id:'school',status:'active'}]};
  calls.push(url);
  if(url.includes('gemini-2.5-flash:'))return {ok:false,status:404};
  if(url.includes('gemini-3.5-flash-lite:'))return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({content:'Learning objective: explore safe low-voltage conductor tests. Explain how a complete circuit works, compare observations, and discuss everyday examples with the teacher.'})}]}}]})};
  throw Error('unexpected model');
 }});
 const result=await service.generate({...base,tool:'Lesson Plan Generator'},'fixture-token');
 assert.match(result.content,/Learning objective/);
 assert.equal(calls.length,2);
 assert.ok(calls[0].includes('gemini-2.5-flash:'));
 assert.ok(calls[1].includes('gemini-3.5-flash-lite:'));
});
test('default Gemini model uses current Flash-Lite rather than restricted 2.5',async()=>{
 const calls=[];
 const service=svc.createService({env:{GEMINI_API_KEY:'fixture'},fetcher:async(url)=>{
  if(url.endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:'user'})};
  if(url.includes('/school_users?'))return {ok:true,json:async()=>[{id:'staff',auth_user_id:'user',institution_id:'school',role:'teacher',status:'active'}]};
  if(url.includes('/institutions?'))return {ok:true,json:async()=>[{id:'school',status:'active'}]};
  calls.push(url);
  return {ok:false,status:404};
 }});
 await assert.rejects(()=>service.generate({...base,tool:'Lesson Plan Generator'},'fixture-token'),/unavailable|404/);
 assert.equal(calls.length,1,'do not retry an unavailable current model or invent a lesson');
 assert.ok(calls[0].includes('gemini-3.5-flash-lite:'));
});
test('provider transport failure falls back to Groq with bounded requests',async()=>{
 const service=svc.createService({env:{GEMINI_API_KEY:'fixture',GROQ_API_KEY:'fixture'},fetcher:async(url,opts)=>{
  if(url.endsWith('/auth/v1/user'))return {ok:true,json:async()=>({id:'user'})};
  if(url.includes('/school_users?'))return {ok:true,json:async()=>[{id:'staff',auth_user_id:'user',institution_id:'school',role:'teacher',status:'active'}]};
  if(url.includes('/institutions?'))return {ok:true,json:async()=>[{id:'school',status:'active'}]};
  assert.ok(opts.signal,'Provider requests must have an abort deadline');
  if(url.includes('googleapis.com'))throw new TypeError('fetch failed');
  return {ok:true,json:async()=>({choices:[{message:{content:JSON.stringify({content:'Learning objectives: identify conductors using a safe battery circuit. Discuss the observations, compare materials and finish with an exit ticket.'})}}]})};
 }});
 assert.match((await service.generate({...base,tool:'Lesson Plan Generator'},'fixture-token')).content,/conductors/);
});
for(const tool of svc.TOOLS)test('authenticated contract returns usable '+tool,async()=>{
 const request={...base,tool,count:5,totalMarks:10,instructions:tool==='School Notice Generator'?'Library reading session on 10 December in the library; attendance is optional.':'',evidence:'Observed: learner identifies conductors but needs help explaining circuit gaps.'};
 const kind=svc.contractFor(tool).kind;
 const questions=[
  'Which material is a conductor? (A) Copper (B) Rubber (C) Wood (D) Glass',
  'Which component supplies energy to a circuit? (A) Bulb (B) Switch (C) Cell (D) Wire',
  'Explain why an open switch prevents a bulb from glowing in a simple circuit.',
  'Describe a safe experiment to compare conducting and insulating materials.',
  'Why must both terminals of a cell be connected for a bulb to glow?'
 ];
 const answers=['(A) Copper allows electric current to flow.','(C) A cell supplies electrical energy.','An open switch breaks the conducting path.','Use a small battery and bulb; compare each material in the circuit gap.','A complete conducting path between terminals is needed.'];
 const plan=kind==='assessment'?svc.planAssessment(request):null;
 const content=kind==='assessment'?{questions:plan.questions.map((q,i)=>({id:q.id,text:questions[i],answerGuide:answers[i]}))}:kind==='tasks'||kind==='activities'?{[kind==='tasks'?'tasks':'activities']:['Observe circuit','Sort materials','Draw connections','Compare switches','Explain results'].map(title=>({title,goal:'Explain how a complete circuit works',materials:['small battery','bulb'],steps:['Observe a low voltage battery circuit','Record observations and explain your reasoning'],minutes:5}))}:{content:'Teacher review draft: use the supplied observations and confirmed details. Identify the learning goal, discuss evidence, and agree a practical next step with the learner.'};
 let verified=false;
 const service=svc.createService({env:{GEMINI_API_KEY:'fixture-only'},fetcher:async(url,options)=>{
  if(url.endsWith('/auth/v1/user')){assert.equal(options.headers.Authorization,'Bearer fixture-token');verified=true;return {ok:true,json:async()=>({id:'user'})}}
  if(url.includes('/school_users?'))return {ok:true,json:async()=>[{id:'staff',auth_user_id:'user',institution_id:'school',role:'teacher',status:'active'}]};
  if(url.includes('/institutions?'))return {ok:true,json:async()=>[{id:'school',status:'active'}]};
  assert.ok(verified);return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify(content)}]}}]})};
 }});
 const result=await service.generate(request,'fixture-token');
 assert.equal(result.tool,tool);assert.ok(result.content.length>90);
 if(plan)assert.match(result.content,/Total marks: 10/);
});
