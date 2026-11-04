/* Phase B1: exam schedule, school-defined grade bands and safe draft result validation.
   Uses owner-scoped generic records; no automatic result publication or parent exposure. */
(function(root,factory){
 'use strict';const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.BrightNexaExamPlanner=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const clean=v=>String(v??'').trim().replace(/\s+/g,' ');
 const key=v=>clean(v).toLocaleLowerCase('en');
 function text(value,name,min=2,max=100){
  const v=clean(value);if(v.length<min||v.length>max)throw Error(name+' must have '+min+'–'+max+' characters.');return v;
 }
 function day(value){
  const s=String(value??'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)
    throw Error('Choose a valid exam date.');return s;
 }
 function time(value){
  const s=String(value??'');
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))throw Error('Enter a valid exam start time.');return s;
 }
 function score(value,label,min,max){
  const s=String(value??'').trim();
  if(!/^\d{1,4}(?:\.\d{1,2})?$/.test(s))throw Error('Enter '+label+' with at most two decimal places.');
  const n=Number(s);if(n<min||n>max)throw Error(label+' must be '+min+'–'+max+'.');return n;
 }
 const rows=(records,module)=>Array.isArray(records)?records.filter(r=>r?.module===module):[];
 function planInput(raw,classes,allRows=[],editingId=null){
  const classroom=(classes||[]).find(c=>c.id===raw.class_id);
  if(!classroom)throw Error('Choose a class from the verified school roster.');
  const exam=text(raw.exam,'Exam name'),subject=text(raw.subject,'Subject');
  const maximum=score(raw.maximum,'Maximum marks',1,1000);
  const scheduled_on=day(raw.scheduled_on),starts_at=time(raw.starts_at);
  const duration=Number(raw.duration_minutes);
  if(!Number.isInteger(duration)||duration<15||duration>360)throw Error('Duration must be 15–360 minutes.');
  const status=String(raw.status);
  if(!['draft','scheduled'].includes(status))throw Error('Exam plan status must be draft or scheduled.');
  const details={class_id:classroom.id,academic_year:classroom.academic_year,exam,subject,
    maximum,scheduled_on,starts_at,duration_minutes:duration,status};
  if(rows(allRows,'exam_plans').some(row=>row.id!==editingId&&
      row.details?.class_id===classroom.id&&key(row.details.exam)===key(exam)&&key(row.details.subject)===key(subject)))
    throw Error('An exam plan already exists for this class, exam and subject. Edit the existing plan.');
  return details;
 }
 function bandsInput(lines){
  const original=String(lines??'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(original.length<2||original.length>16)throw Error('Enter 2–16 grade bands, one "minimum,grade" per line.');
  const bands=[],seen=new Set();
  for(const entry of original){
    const parts=entry.split(',');
    if(parts.length!==2)throw Error('Each grade band must be "minimum percentage,grade label".');
    const min=score(parts[0],'Grade lower boundary',0,100);
    const grade=text(parts[1],'Grade label',1,15);
    if(seen.has(min))throw Error('Duplicate grade percentage boundary.');
    seen.add(min);bands.push({min,grade});
  }
  bands.sort((a,b)=>b.min-a.min);
  if(bands[bands.length-1].min!==0)throw Error('Grade bands must include a zero-percent boundary.');
  if(bands.some((b,i)=>i&&b.min>=bands[i-1].min))throw Error('Grade percentage boundaries must be distinct.');
  return bands;
 }
 function schemeInput(raw,classes,allRows=[],editingId=null){
  const year=String(raw.academic_year||'').trim();
  if(!(classes||[]).some(c=>c.academic_year===year))throw Error('Choose an existing academic year.');
  const label=text(raw.name,'Grading policy name',3,100),bands=bandsInput(raw.bands);
  const policy={academic_year:year,name:label,bands};
  if(rows(allRows,'grading_schemes').some(r=>r.id!==editingId&&r.details?.academic_year===year))
    throw Error('A grading policy already exists for this academic year. Edit it rather than duplicating.');
  return policy;
 }
 const gradeFor=(bands,percentage)=>{
  if(!Number.isFinite(percentage)||percentage<0||percentage>100)return null;
  const sorted=[...(bands||[])].sort((a,b)=>b.min-a.min);
  return sorted.find(x=>percentage>=x.min)?.grade||null;
 };
 function audit({records,student,classes,exam}){
  if(!student?.id||!classes?.some(c=>c.id===student.class_id))throw Error('Select a student from a verified school class.');
  const klass=classes.find(c=>c.id===student.class_id),name=key(exam),issues=[];
  const plans=rows(records,'exam_plans').filter(r=>r.details?.class_id===klass.id&&key(r.details?.exam)===name);
  const schemeRows=rows(records,'grading_schemes').filter(r=>r.details?.academic_year===klass.academic_year);
  if(!name)issues.push('Select an exam.');
  if(!plans.length)issues.push('No exam plan has been configured for this class and exam.');
  if(schemeRows.length!==1)issues.push('Exactly one school-defined grading policy is required for '+klass.academic_year+'.');
  const bySubject=new Map();
  for(const p of plans){
    const k=key(p.details?.subject);
    if(!k||bySubject.has(k))issues.push('Duplicate or invalid subject in class exam plan.');
    else bySubject.set(k,p.details);
    if(!['scheduled','draft'].includes(p.details?.status))issues.push('Invalid exam plan status.');
    if(p.details?.status!=='scheduled')issues.push('Exam plan subject '+String(p.details?.subject||'?')+' is still a draft.');
  }
  const marks=rows(records,'exams').filter(r=>r.details?.student===student.id&&key(r.details?.exam)===name);
  const found=new Map();
  let earned=0,possible=0;
  for(const r of marks){
    const d=r.details||{},k=key(d.subject);
    if(found.has(k)){issues.push('Duplicate mark record for '+(d.subject||'?')+'.');continue;}
    found.set(k,r);
    const plan=bySubject.get(k);
    if(!plan){issues.push('Unplanned subject mark '+(d.subject||'?')+'.');continue;}
    try{
      const obtained=score(d.obtained,'Marks scored',0,1000);
      const maximum=score(d.maximum,'Maximum marks',1,1000);
      if(obtained>maximum||maximum!==Number(plan.maximum))throw Error('Saved marks do not match planned maximum for '+plan.subject+'.');
      earned+=obtained;possible+=maximum;
    }catch(e){issues.push(e.message)}
  }
  for(const [k,plan] of bySubject)if(!found.has(k))issues.push('Missing marks for '+plan.subject+'.');
  if(plans.length&&marks.length===0)issues.push('No student marks entered for this exam.');
  const percentage=possible?Math.round(earned*10000/possible)/100:null;
  let provisionalGrade=null;
  if(!issues.length&&percentage!==null&&schemeRows.length===1){
    try{
      const bands=bandsInput(schemeRows[0].details.bands.map(x=>x.min+','+x.grade).join('\n'));
      provisionalGrade=gradeFor(bands,percentage);
    }catch(e){issues.push('Grading policy invalid: '+e.message)}
  }
  return {student_id:student.id,exam:clean(exam),academic_year:klass.academic_year,
    plannedSubjects:plans.length,markedSubjects:marks.length,earned,possible,percentage,
    provisionalGrade,readyForReview:issues.length===0&&provisionalGrade!==null,issues,
    note:'This is a provisional draft result. No approval, publication to parents, pass/fail decision or transcript issuance has occurred.'};
 }
 return {planInput,bandsInput,schemeInput,gradeFor,audit,day,time,score};
});
