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


test('45-minute 50-mark paper has ten distinct five-part questions, never 5-mark MCQs',()=>{
 const paper=gen.generate({...base,tool:'Question Paper Generator',duration:'45 Minutes',difficulty:'Easy',count:10,totalMarks:50});
 const lines=paper.split('\n').filter(x=>/^Q\d+\./.test(x));
 assert.equal(lines.length,10);
 for(const line of lines){
  assert.match(line,/Answer each part \(1 mark each\):/);
  assert.equal((line.match(/\([a-e]\)/g)||[]).length,5);
  assert.match(line,/\[5 marks\]$/);
 }
 assert.equal(lines.reduce((sum,line)=>sum+Number(line.match(/\[(\d+) marks?\]$/)[1]),0),50);
 assert.equal(new Set(lines).size,10);
 assert.doesNotMatch(paper,/\(A\).*?\[5 marks\]/);
});
test('3-hour paper changes the actual questions, not just the duration label',()=>{
 const input={...base,tool:'Question Paper Generator',count:10,totalMarks:50,difficulty:'Easy'};
 const short=gen.generate({...input,duration:'45 Minutes'});
 const long=gen.generate({...input,duration:'3 Hours'});
 const questions=s=>s.split('\n').filter(x=>/^Q\d+\./.test(x));
 assert.equal(questions(short).length,10);assert.equal(questions(long).length,10);
 assert.notDeepEqual(questions(short),questions(long));
 assert.match(long,/Longer reasoning, comparison and case-based questions/);
 assert.doesNotMatch(long,/Answer each part \(1 mark each\)/);
});

test('all six duration dropdown options produce distinct papers and fractional hours use correct blueprint',()=>{
 const values=['45 Minutes','1 Hour','1.5 Hours','2 Hours','2.5 Hours','3 Hours'];
 const outputs=values.map(duration=>gen.generate({...base,tool:'Question Paper Generator',duration,difficulty:'Easy',count:10,totalMarks:50}));
 const questions=s=>s.split('\n').filter(x=>/^Q\d+\./.test(x)).join('\n');
 assert.equal(new Set(outputs.map(questions)).size,values.length);
 assert.match(outputs[2],/Conceptual questions with examples and explanations/); // 90 min, not 300
 assert.match(outputs[4],/Longer reasoning, comparison and case-based questions/); // 150 min
 assert.ok(outputs.every(s=>(s.match(/^Q\d+\./gm)||[]).length===10));
});

test('difficulty changes actual paper questions and unsupported chapters fail safely',()=>{
 const params={...base,tool:'Question Paper Generator',count:10,totalMarks:50,duration:'3 Hours'};
 const easy=gen.generate({...params,difficulty:'Easy'});
 const hard=gen.generate({...params,difficulty:'Hard'});
 assert.notDeepEqual(easy.split('\n').filter(x=>/^Q\d+\./.test(x)),hard.split('\n').filter(x=>/^Q\d+\./.test(x)));
 assert.throws(()=>gen.generate({...params,subject:'Math',topic:'Fractions'}),/No verified question bank/);
 assert.throws(()=>gen.generate({...params,count:13}),/Only 12 distinct reviewed/);
 assert.throws(()=>gen.generate({...params,count:2,totalMarks:50,duration:'45 Minutes'}),/at most 10 marks per question/);
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
