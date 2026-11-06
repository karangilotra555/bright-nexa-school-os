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
