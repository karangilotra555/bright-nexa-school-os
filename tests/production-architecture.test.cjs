'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const engine=require('../teacher-generator-engine.js');
const base={tool:'Question Paper Generator',className:'6',subject:'Science',topic:'Food Components',language:'English'};
const allQuestions=p=>p.sections.flatMap(s=>s.questions);
const flatten=t=>t.normalize('NFKC').trim().toLowerCase();

test('TDD: each generated paper is a concrete mark-balanced, time-balanced blueprint',()=>{
 for(const [difficulty,duration,count,totalMarks] of [['Easy','45 Minutes',8,15],['Medium','1.5 Hours',10,22],['Hard','3 Hours',10,30]]){
  const p=engine.buildPaper({...base,difficulty,duration,count,totalMarks});
  const qs=allQuestions(p);
  assert.equal(qs.length,count);
  assert.equal(qs.reduce((n,q)=>n+q.marks,0),totalMarks);
  assert.equal(qs.reduce((n,q)=>n+q.minutes,0),duration==='45 Minutes'?45:duration==='1.5 Hours'?90:180);
  assert.ok(qs.every(q=>Number.isInteger(q.marks)&&q.marks>=1&&q.marks<=5));
  assert.ok(qs.every(q=>q.minutes>0&&q.type&&q.bloom&&q.en&&q.hi));
  assert.equal(new Set(qs.map(q=>flatten(q.en))).size,qs.length,'No repeated question stem');
  assert.doesNotMatch(qs.map(q=>q.en).join(' '),/Option A|Option B|using your class notes|characteristic 1/i);
  assert.equal(p.difficulty,difficulty);
 }
});

test('TDD: Bloom depth is actually bounded by difficulty, not changed by ordering',()=>{
 const inputs={...base,duration:'3 Hours',count:10,totalMarks:30};
 const easy=allQuestions(engine.buildPaper({...inputs,difficulty:'Easy'}));
 const medium=allQuestions(engine.buildPaper({...inputs,difficulty:'Medium'}));
 const hard=allQuestions(engine.buildPaper({...inputs,difficulty:'Hard'}));
 assert.ok(easy.every(q=>['Remember','Understand'].includes(q.bloom)));
 assert.ok(medium.every(q=>['Apply','Analyze'].includes(q.bloom)));
 assert.ok(hard.every(q=>['Evaluate','Create'].includes(q.bloom)));
 assert.notDeepEqual(easy.map(q=>q.en),medium.map(q=>q.en));
 assert.notDeepEqual(medium.map(q=>q.en),hard.map(q=>q.en));
});

test('TDD: duration increases genuine sections and long-form/case coverage',()=>{
 const short=engine.buildPaper({...base,difficulty:'Medium',duration:'45 Minutes',count:8,totalMarks:15});
 const long=engine.buildPaper({...base,difficulty:'Hard',duration:'3 Hours',count:10,totalMarks:30});
 assert.ok(long.sections.length>short.sections.length);
 assert.ok(allQuestions(short).some(q=>q.type==='MCQ'));
 assert.ok(allQuestions(long).some(q=>q.type==='Case Study'));
 assert.ok(allQuestions(long).some(q=>q.marks===5));
 assert.ok(long.sections.every(s=>s.questions.length>0&&s.marks===s.questions.reduce((n,q)=>n+q.marks,0)));
});

test('TDD: Hindi and bilingual papers contain actual reviewed translations for every question',()=>{
 const params={...base,difficulty:'Medium',duration:'1.5 Hours',count:10,totalMarks:22};
 const hindi=engine.generate({...params,language:'Hindi'});
 const bilingual=engine.generate({...params,language:'Bilingual'});
 const p=engine.buildPaper(params);
 for(const q of allQuestions(p)){assert.ok(hindi.includes(q.hi));assert.ok(bilingual.includes(q.hi));assert.ok(bilingual.includes(q.en));}
 assert.doesNotMatch(hindi,/[[]CONFIRM[]]|Option A/);
});

test('TDD: impossible time, unsupported chapter and impossible marks fail visibly',()=>{
 assert.throws(()=>engine.buildPaper({...base,difficulty:'Easy',duration:'45 Minutes',count:10,totalMarks:50}),/duration|marks|feasible|time|maximum/i);
 assert.throws(()=>engine.buildPaper({...base,difficulty:'Hard',duration:'3 Hours',count:2,totalMarks:30}),/marks|maximum|feasible/i);
 assert.throws(()=>engine.buildPaper({...base,subject:'Mathematics',topic:'Fractions',difficulty:'Easy',duration:'45 Minutes',count:8,totalMarks:15}),/question bank|chapter/i);
});

test('TDD: Supabase draft list uses cloud pagination instead of a 30-record truncation',async()=>{
 const api=require('../teacher-drafts-cloud.js'),requests=[];
 const all=Array.from({length:135},(_,i)=>({id:'d'+i,institution_id:'school',author_school_user_id:'member',tool:'Question Paper Generator',class_label:'6',subject:'Science',topic:'Food Components',language:'English',content:'Approved text '+i,created_at:'2026-11-06'}));
 const storage={getItem:()=>JSON.stringify({access_token:'session',expires_at:Math.floor(Date.now()/1000)+3600})};
 const fetcher=async(url,options={})=>{
  requests.push(url);
  let body;
  if(url.endsWith('/auth/v1/user'))body={id:'user'};
  else if(url.includes('/school_users?'))body=[{id:'member',institution_id:'school',auth_user_id:'user',role:'teacher',status:'active'}];
  else if(url.includes('/institutions?'))body=[{id:'school',status:'active'}];
  else if(url.includes('/school_teacher_drafts?')){
   const u=new URL(url),offset=Number(u.searchParams.get('offset')||0),limit=Number(u.searchParams.get('limit')||100);
   body=all.slice(offset,offset+limit);
  }else throw Error('Unexpected request: '+url);
  return {ok:true,json:async()=>body};
 };
 const rows=await api.create({fetcher,sessionStorage:storage}).list();
 assert.equal(rows.length,135);
 assert.equal(new Set(rows.map(row=>row.id)).size,135);
 assert.ok(requests.filter(x=>x.includes('school_teacher_drafts?')).length>=2);
});

test('TDD: role permission source is tenant-scoped Supabase RLS, no browser authority',()=>{
 const p=fs.readFileSync(path.join(__dirname,'../teacher-access.js'),'utf8');
 const migrations=fs.readdirSync(path.join(__dirname,'../supabase/migrations')).filter(x=>x.endsWith('.sql')).map(x=>fs.readFileSync(path.join(__dirname,'../supabase/migrations',x),'utf8')).join('\n');
 assert.match(p,/school_role_module_permissions/);
 assert.match(p,/async function loadRolePermissions\(\)/);
 assert.match(p,/on_conflict=institution_id,role,module_key/);
 assert.doesNotMatch(p,/localStorage\.setItem\(['"]bright-nexa-school-os:role-permissions/);
 assert.match(migrations,/school_role_module_permissions[\s\S]*ENABLE ROW LEVEL SECURITY/);
 assert.match(migrations,/staff_module_enabled/);
 assert.match(migrations,/teacher_can/);
});


test('TDD: directory prefers verified display name without exposing redundant fallback email',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../teacher-access.js'),'utf8');
 const staffFn=src.slice(src.indexOf('function staffName(s)'),src.indexOf('function studentLabel(s)'));
 assert.match(staffFn,/display_name/);
 assert.doesNotMatch(staffFn,/\`\$\{name\} \(\$\{s\.email\}\\\)/);
 const membership=src.slice(src.indexOf("put('membership'"),src.indexOf("put('membership'")+250);
 assert.doesNotMatch(membership,/\+me\.email\+/);
});
