'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const E=require('../docs/school-phase-b-exams.js');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const klass=[{id:'class-1',name:'Class 1',section:'A',academic_year:'2026-2027'},
 {id:'class-2',name:'Class 2',section:'A',academic_year:'2026-2027'}];
const student={id:'student-1',name:'Student One',class_id:'class-1',status:'active'};
const valid={class_id:'class-1',exam:'Term 1',subject:'Mathematics',scheduled_on:'2026-11-15',
 starts_at:'09:00',duration_minutes:'90',maximum:'100',status:'scheduled'};
const plan=(id,subject,date='2026-11-15')=>({id,module:'exam_plans',details:{...E.planInput({...valid,subject,scheduled_on:date},klass),subject}});
const scheme={id:'scheme-1',module:'grading_schemes',details:{
 academic_year:'2026-2027',name:'School Terms',bands:[{min:90,grade:'A1'},{min:75,grade:'B'},{min:0,grade:'C'}]}};
const mark=(id,subject,obtained,maximum='100')=>({id,module:'exams',details:{student:'student-1',exam:'Term 1',subject,obtained,maximum}});
test('exam planner requires actual school class, valid date, duration and scores',()=>{
 const r=E.planInput(valid,klass);
 assert.equal(r.academic_year,'2026-2027');assert.equal(r.maximum,100);
 assert.equal(r.starts_at,'09:00');
 assert.throws(()=>E.planInput({...valid,class_id:'foreign-school-class'},klass),/verified school roster/);
 assert.throws(()=>E.planInput({...valid,scheduled_on:'2026-02-30'},klass),/valid exam date/);
 assert.throws(()=>E.planInput({...valid,duration_minutes:'5'},klass),/15–360/);
 assert.throws(()=>E.planInput({...valid,maximum:'1001'},klass),/Maximum marks must be/);
 assert.throws(()=>E.planInput({...valid,maximum:'0'},klass),/Maximum marks must be/);
 assert.throws(()=>E.planInput({...valid,starts_at:'25:88'},klass),/valid exam start/);
 assert.throws(()=>E.planInput({...valid,status:'published'},klass),/draft or scheduled/);
 assert.equal(E.planInput({...valid,maximum:'1000'},klass).maximum,1000);
});
test('class/exam/subject uniqueness is detected by owner before save',()=>{
 const original=plan('plan-1','Mathematics');
 assert.throws(()=>E.planInput({...valid,exam:' TERM  1 ',subject:' mathematics '},klass,[original]),/already exists/);
 assert.equal(E.planInput({...valid,subject:'Mathematics'},klass,[original],'plan-1').subject,'Mathematics');
 assert.equal(E.planInput({...valid,class_id:'class-2'},klass,[original]).class_id,'class-2');
});
test('school-defined grades require explicit zero boundary and unique intervals, no default is assumed',()=>{
 const input=E.schemeInput({academic_year:'2026-2027',name:'Annual grading',bands:'90,A1\n75,B\n0,C'},klass);
 assert.deepEqual(input.bands.map(x=>x.min),[90,75,0]);
 assert.equal(E.gradeFor(input.bands,89.99),'B');assert.equal(E.gradeFor(input.bands,90),'A1');
 assert.equal(E.gradeFor(input.bands,0),'C');
 assert.equal(E.gradeFor(input.bands,101),null);
 assert.throws(()=>E.bandsInput('90,A1\n75,B'),/zero-percent/);
 assert.throws(()=>E.bandsInput('75,B\n75,C\n0,D'),/Duplicate grade/);
 assert.throws(()=>E.bandsInput('100,A'),/2–16/);
 assert.throws(()=>E.schemeInput({academic_year:'2025-2026',name:'Annual',bands:'90,A\n0,C'},klass),/existing academic year/);
 assert.throws(()=>E.schemeInput({academic_year:'2026-2027',name:'Another',bands:'90,A\n0,C'},klass,[scheme]),/already exists/);
});
test('complete planned student scores get provisional-only grade, not published',()=>{
 const records=[plan('p1','Mathematics'),plan('p2','English'),scheme,
   mark('m1','Mathematics','75'),mark('m2','English','90')];
 const result=E.audit({records,student,classes:klass,exam:'Term 1'});
 assert.equal(result.plannedSubjects,2);assert.equal(result.markedSubjects,2);
 assert.equal(result.earned,165);assert.equal(result.possible,200);
 assert.equal(result.percentage,82.5);assert.equal(result.provisionalGrade,'B');
 assert.equal(result.readyForReview,true);
 assert.equal(result.issues.length,0);
 assert.match(result.note,/provisional draft/);
 assert.match(result.note,/No approval, publication/);
});
test('missing grades, missing marks, duplicate subjects, unplanned and wrong max fail closed',()=>{
 const base=[plan('p1','Mathematics'),plan('p2','English'),scheme,
  mark('m1','Mathematics','75'),mark('m2','English','90')];
 const cases=[
  [base.filter(x=>x.id!=='m2'),/Missing marks for English/],
  [[...base,mark('m3','Mathematics','99')],/Duplicate mark record/],
  [[...base,mark('m3','Science','99')],/Unplanned subject mark/],
  [base.map(x=>x.id==='m1'?mark('m1','Mathematics','75','50'):x),/do not match planned maximum/],
  [base.filter(x=>x.id!=='scheme-1'),/grading policy is required/],
  [base.map(x=>x.id==='p2'?{...x,details:{...x.details,status:'draft'}}:x),/still a draft/],
 ];
 for(const [records,message] of cases){
  const result=E.audit({records,student,classes:klass,exam:'Term 1'});
  assert.equal(result.provisionalGrade,null);
  assert.equal(result.readyForReview,false);
  assert.ok(result.issues.some(issue=>message.test(issue)),result.issues.join('; '));
 }
});
test('does not mix marks across students or Unit Test and Term 1',()=>{
 const records=[plan('p1','Mathematics'),scheme,mark('m1','Mathematics','100'),
 {id:'other',module:'exams',details:{student:'other-child',exam:'Term 1',subject:'Mathematics',obtained:'10',maximum:'100'}},
 {id:'other-exam',module:'exams',details:{student:'student-1',exam:'Unit Test',subject:'Mathematics',obtained:'0',maximum:'100'}}];
 const x=E.audit({records,student,classes:klass,exam:'Term 1'});
 assert.equal(x.earned,100);assert.equal(x.readyForReview,true);assert.equal(x.provisionalGrade,'A1');
 const another=E.audit({records,student:{...student,id:'other-child',class_id:'class-2'},classes:klass,exam:'Term 1'});
 assert.equal(another.provisionalGrade,null);
});
test('owner UI and server migration preserve marks flow and never publish to parents',()=>{
 const extra=read('docs/school-extra-modules.js'),owner=read('docs/real-owner-workspace.js');
 const html=read('docs/real-owner-workspace.html'),ui=read('docs/school-phase-b-exams-ui.js');
 const sql=read('supabase/migrations/20261104102000_phase_b_exam_plan_and_grading.sql');
 assert.ok(html.indexOf('school-phase-b-exams.js')<html.indexOf('school-phase-b-exams-ui.js'));
 assert.ok(html.indexOf('school-phase-b-exams-ui.js')<html.indexOf('school-extra-modules.js'));
 assert.match(extra,/BrightNexaPhaseB\?\.planner/);
 assert.match(extra,/BrightNexaPhaseB\?\.decorateDraft/);
 assert.match(owner,/title,body,state,req,allSchool,reload,open,error/);
 assert.match(ui,/allSchool\('school_module_records'/);
 assert.match(ui,/method:'POST'/);assert.match(ui,/method:'PATCH'/);
 assert.doesNotMatch(ui,/service_role|sb_secret_|\/auth\/v1\/admin/);
 assert.doesNotMatch(ui,/sendWhatsApp|sendSms|publishToParent|notification\.send/);
 assert.match(sql,/CREATE UNIQUE INDEX IF NOT EXISTS bn_exam_plan_unique_subject/);
 assert.match(sql,/CREATE UNIQUE INDEX IF NOT EXISTS bn_grading_scheme_unique_year/);
 assert.match(sql,/grading_schemes/);
 assert.match(sql,/exam_plans/);
 for(const file of ['docs/school-phase-b-exams.js','docs/school-phase-b-exams-ui.js','docs/school-extra-modules.js'])
  assert.doesNotThrow(()=>new vm.Script(read(file)));
});
