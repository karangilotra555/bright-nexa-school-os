'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const gen=require('../teacher-generator-engine.js');
const base={className:'6',subject:'Science',topic:'Food Components',language:'English',difficulty:'Hard',count:10,duration:'1 Hour',totalMarks:25};
test('Food Components lesson plan uses real nutrient examples and 60 minute allocation',()=>{
 const output=gen.generate({...base,tool:'Lesson Plan Generator'});
 for(const word of ['Carbohydrates','Proteins','Fats','Roughage','Water','60 min','rice','pulses'])assert.match(output,new RegExp(word,'i'));
 assert.doesNotMatch(output,/Step-by-step breakdown of Food Components|sample problems on the board/i);
 const times=[...output.matchAll(/: (\d+) min/g)].map(x=>Number(x[1]));assert.equal(times.length,5);assert.equal(times.reduce((a,b)=>a+b,0),60);
});
test('question papers and class tests deliver exactly requested questions and marks',()=>{
 for(const tool of ['Question Paper Generator','Class Test Generator','Worksheet Generator']){
  const s=gen.generate({...base,tool});
  const questions=[...s.matchAll(/^Q\d+\. .+ \[(\d+) marks?\]$/gm)];
  assert.equal(questions.length,10,tool);
  assert.equal(questions.reduce((sum,m)=>sum+Number(m[1]),0),25,tool);
  assert.doesNotMatch(s,/Option A    \(b\) Option B|Characteristic 1|all questions.*Internal choice provided/i);
 }
});
test('Hindi and bilingual variants show meaningful subject content',()=>{
 const hi=gen.generate({...base,tool:'Lesson Plan Generator',language:'Hindi'});
 const bi=gen.generate({...base,tool:'Question Paper Generator',language:'Bilingual'});
 assert.match(hi,/कार्बोहाइड्रेट|प्रोटीन/);assert.match(bi,/Rice|चावल/);
});
test('remarks/remedial/parent and notices never invent grades, targets or compulsory events',()=>{
 for(const tool of ['Student Remark Generator','Weak Student Remedial Plan','Parent Message Generator','School Notice Generator']){
  const s=gen.generate({...base,tool});
  assert.doesNotMatch(s,/Grade A1|below 40%|attendance is compulsory|Circular Ref No/i);
  assert.match(s,/verify|confirm|evidence|approval|assessment/i);
 }
});
test('all ten tools produce nonempty draft text with explicit teacher review',()=>{
 for(const tool of gen.TOOLS){
  const s=gen.generate({...base,tool});assert(s.length>140,tool);assert.match(s,/TEACHER DRAFT/);
 }
});
test('invalid inputs are rejected rather than reported as generated successfully',()=>{
 assert.throws(()=>gen.generate({...base,tool:'Question Paper Generator',count:30,totalMarks:10}),/marks must be at least/);
 assert.throws(()=>gen.generate({...base,tool:'Lesson Plan Generator',topic:''}),/Topic/);
 assert.throws(()=>gen.generate({...base,tool:'Workshop Generator'}),/Unknown generator/);
 assert.deepEqual(gen.assignMarks(5,13).reduce((a,b)=>a+b,0),13);
});



test('45-minute/50-mark/10-item combination is rejected instead of printing fake five-mark MCQs',()=>{
 assert.throws(()=>gen.generate({...base,tool:'Question Paper Generator',duration:'45 Minutes',difficulty:'Easy',count:10,totalMarks:50}),/feasible time allocation/);
 const paper=gen.buildPaper({...base,tool:'Question Paper Generator',duration:'45 Minutes',difficulty:'Easy',count:10,totalMarks:25});
 const qs=paper.sections.flatMap(s=>s.questions);
 assert.equal(qs.length,10);
 assert.equal(qs.reduce((n,q)=>n+q.marks,0),25);
 assert.ok(qs.every(q=>q.marks<=5));
 assert.ok(qs.filter(q=>q.type==='MCQ').every(q=>q.marks===1));
 assert.ok(qs.filter(q=>q.type==='Short Answer').every(q=>q.marks===2||q.marks===3));
 assert.equal(paper.durationMinutes,45);
});
test('3-hour paper changes structures and contains authentic longer questions',()=>{
 const input={...base,tool:'Question Paper Generator',count:10,totalMarks:25,difficulty:'Hard'};
 const short=gen.buildPaper({...input,duration:'45 Minutes'});
 const long=gen.buildPaper({...input,duration:'3 Hours'});
 assert.ok(long.sections.length>short.sections.length);
 assert.ok(long.sections.some(s=>s.kind==='Case Study'));
 assert.ok(short.sections.every(s=>s.kind!=='Case Study'));
 assert.equal(long.sections.flatMap(s=>s.questions).reduce((n,q)=>n+q.minutes,0),180);
 assert.notDeepEqual(short.sections.flatMap(s=>s.questions).map(q=>q.en),long.sections.flatMap(s=>s.questions).map(q=>q.en));
});
test('all six duration dropdown options allocate exact marks and minutes without placeholder stems',()=>{
 const values=['45 Minutes','1 Hour','1.5 Hours','2 Hours','2.5 Hours','3 Hours'];
 const minutes=[45,60,90,120,150,180];
 const outputs=values.map(duration=>gen.buildPaper({...base,tool:'Question Paper Generator',duration,difficulty:'Easy',count:10,totalMarks:25}));
 outputs.forEach((p,i)=>{
  const qs=p.sections.flatMap(s=>s.questions);
  assert.equal(qs.length,10);
  assert.equal(qs.reduce((n,q)=>n+q.marks,0),25);
  assert.equal(qs.reduce((n,q)=>n+q.minutes,0),minutes[i]);
  assert.doesNotMatch(qs.map(q=>q.en).join(' '),/Option A|Option B|Characteristic 1/i);
 });
 assert.ok(outputs[5].sections.length>outputs[0].sections.length);
});
test('difficulty changes Bloom-level question content and unsupported chapters fail safely',()=>{
 const params={...base,tool:'Question Paper Generator',count:10,totalMarks:25,duration:'3 Hours'};
 const easy=gen.buildPaper({...params,difficulty:'Easy'});
 const hard=gen.buildPaper({...params,difficulty:'Hard'});
 assert.deepEqual(new Set(easy.sections.flatMap(s=>s.questions).map(q=>q.bloom)),new Set(['Remember','Understand']));
 assert.ok(hard.sections.flatMap(s=>s.questions).every(q=>['Evaluate','Create'].includes(q.bloom)));
 assert.notDeepEqual(easy.sections.flatMap(s=>s.questions).map(q=>q.en),hard.sections.flatMap(s=>s.questions).map(q=>q.en));
 assert.throws(()=>gen.buildPaper({...params,subject:'Math',topic:'Fractions'}),/No verified question bank/);
 assert.throws(()=>gen.buildPaper({...params,count:13,totalMarks:10}),/marks must be at least/);
});

test('Print/PDF renders only reviewed draft text in A4 preview and does not print dashboard',()=>{
 const created=[],head={appendChild(n){created.push(n)}},body={appendChild(n){created.push(n)}};
 const document={title:'',head,body,createElement(tag){return {tag,textContent:''};}};
 let printCount=0,focusCount=0;
 const open=()=>({document,focus(){focusCount++},print(){printCount++}});
 assert.equal(gen.printDraft('Edited\nTeacher answer',open),true);
 assert.equal(printCount,1);assert.equal(focusCount,1);
 assert.equal(created.find(n=>n.tag==='pre').textContent,'Edited\nTeacher answer');
 assert.match(created.find(n=>n.tag==='style').textContent,/size:A4/);
 assert.throws(()=>gen.printDraft(''),/Nothing to print/);
});
test('School OS print handlers use the draft printer instead of printing the whole dashboard',()=>{
 const fs=require('node:fs'),src=fs.readFileSync('app-extracted/src/BrightNexaApp.jsx','utf8');
 assert.match(src,/BNTeacherGenerator\.printDraft\(f\)/);
 assert.doesNotMatch(src,/<Component1363[\s\S]{0,180}window\.print\(\)/);
});
