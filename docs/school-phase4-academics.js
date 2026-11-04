/* Phase 4: school exam validation, per-exam report cards, and preview-first admissions import.
   All persistence must use owner JWT + RLS; no client service key or blind demo data. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.BrightNexaAcademics=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const trim=x=>String(x??'').trim();
  const key=x=>trim(x).toLocaleLowerCase('en').replace(/\s+/g,' ');
  function text(value,label,min,max){
    const v=trim(value);
    if(v.length<min||v.length>max)throw Error(label+' must have '+min+'–'+max+' characters.');
    return v;
  }
  function positiveMark(value,label,zero){
    const v=trim(value);
    if(!/^\d{1,4}(?:\.\d{1,2})?$/.test(v))throw Error('Enter a valid '+label+' (maximum two decimal places).');
    const n=Number(v);
    if(!Number.isFinite(n)||n>(zero?1000:1000)||(zero?n<0:n<=0))throw Error('Invalid '+label+' value.');
    return n;
  }
  function markDetails(raw,students,existingRows=[],editingId=null){
    const student=trim(raw.student);
    if(!(students||[]).some(s=>s.id===student))throw Error('Select a student belonging to this school.');
    const exam=text(raw.exam,'Exam',2,100),subject=text(raw.subject,'Subject',2,100);
    const obtained=positiveMark(raw.obtained,'obtained marks',true);
    const maximum=positiveMark(raw.maximum,'maximum marks',false);
    if(obtained>maximum)throw Error('Marks scored cannot exceed maximum marks.');
    if((existingRows||[]).some(r=>r.id!==editingId&&r.module==='exams'&&
      r.details?.student===student&&key(r.details?.exam)===key(exam)&&key(r.details?.subject)===key(subject)))
      throw Error('This student already has a saved mark for the same exam and subject. Edit the existing entry.');
    return {student,exam,subject,obtained:String(obtained),maximum:String(maximum)};
  }
  function examNames(rows,studentId){
    const names=new Map();
    for(const row of rows||[]){
      if(row.module!=='exams'||row.details?.student!==studentId)continue;
      const exam=trim(row.details?.exam);
      if(exam&&!names.has(key(exam)))names.set(key(exam),exam);
    }
    return [...names.values()].sort((a,b)=>a.localeCompare(b));
  }
  function report(rows,studentId,exam){
    const chosen=key(exam),subjects=[],issues=[],seen=new Set();
    let obtained=0,maximum=0;
    for(const row of rows||[]){
      const d=row.details||{};
      if(row.module!=='exams'||d.student!==studentId||key(d.exam)!==chosen)continue;
      try{
        const subject=text(d.subject,'Subject',2,100);
        const score=positiveMark(d.obtained,'obtained marks',true);
        const total=positiveMark(d.maximum,'maximum marks',false);
        if(score>total)throw Error('Marks scored exceed maximum marks.');
        if(seen.has(key(subject)))throw Error('Duplicate subject mark: '+subject);
        seen.add(key(subject));
        subjects.push({subject,obtained:score,maximum:total,percent:Math.round(score*10000/total)/100});
        obtained+=score;maximum+=total;
      }catch(e){issues.push({id:row.id||'',reason:e.message});}
    }
    subjects.sort((a,b)=>a.subject.localeCompare(b.subject));
    return {exam:trim(exam),studentId,subjects,obtained,maximum,percent:maximum?Math.round(obtained*10000/maximum)/100:null,issues};
  }
  function cell(v){
    let s=String(v??'').replace(/\u0000/g,'');
    if(/^[\s\u0000-\u001f]*[=+@\-]/.test(s))s="'"+s;
    return '"'+s.replace(/"/g,'""')+'"';
  }
  function csv(rows,fields){return [fields.map(cell).join(','),...rows.map(row=>fields.map(f=>cell(row[f])).join(','))].join('\r\n');}
  function parseDob(input){
    const v=trim(input);if(!v)return null;
    let iso=v;
    const dmy=v.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if(dmy)iso=dmy[3]+'-'+dmy[2].padStart(2,'0')+'-'+dmy[1].padStart(2,'0');
    if(/^\d{5}$/.test(v)){
      const day=Number(v);
      if(day<1||day>90000)throw Error('Invalid Excel date serial.');
      iso=new Date(Date.UTC(1899,11,30)+day*86400000).toISOString().slice(0,10);
    }
    if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)||new Date(iso).toISOString().slice(0,10)!==iso)throw Error('DOB must be a real date.');
    if(iso>new Date().toISOString().slice(0,10))throw Error('DOB cannot be in the future.');
    return iso;
  }
  const canon=x=>trim(x).toLocaleLowerCase('en').replace(/[^a-z0-9]/g,'');
  const cleanClass=x=>canon(x).replace(/^class/,'');
  function previewAdmissions(parsed,classes,existing=[]){
    if(!Array.isArray(parsed)||!parsed.length)throw Error('File must have a header and at least one admission row.');
    if(parsed.length>200)throw Error('Maximum 200 students per upload so the database save can stay atomic.');
    const names=Object.keys(parsed[0]);
    function field(aliases,required){
      const found=names.filter(n=>aliases.includes(canon(n)));
      if(found.length>1)throw Error('Ambiguous duplicate file headings: '+found.join(', '));
      if(!found.length&&required)throw Error('Missing required column: '+aliases[0]);
      return found[0]||null;
    }
    const cols={
      admission:field(['admissionnumber','admissionno','admno','studentid'],true),
      name:field(['studentname','fullname','name'],true),
      className:field(['class','classname','grade'],true),
      section:field(['section','sec'],false),
      year:field(['academicyear','session'],false),
      dob:field(['dob','dateofbirth','birthdate'],false)
    };
    const previous=new Set((existing||[]).map(s=>canon(s.admission_number)));
    const within=new Set(),valid=[],errors=[];
    parsed.forEach((row,i)=>{
      const line=i+2;
      try{
        const admission_number=text(row[cols.admission],'Admission number',1,60);
        const name=text(row[cols.name],'Student name',2,180);
        const classLabel=text(row[cols.className],'Class',1,60);
        const section=cols.section?trim(row[cols.section]):'';
        const year=cols.year?trim(row[cols.year]):'';
        const matches=(classes||[]).filter(c=>cleanClass(c.name)===cleanClass(classLabel)&&
          (!section||canon(c.section)===canon(section))&&(!year||trim(c.academic_year)===year));
        if(matches.length!==1)throw Error(matches.length?'Class is ambiguous. Specify section / academic year.':'Class and section not found in school.');
        const admitKey=canon(admission_number);
        if(previous.has(admitKey))throw Error('Admission number already exists in school (including archived students).');
        if(within.has(admitKey))throw Error('Duplicate admission number within file.');
        const dob=cols.dob?parseDob(row[cols.dob]):null;
        valid.push({name,admission_number,class_id:matches[0].id,dob,status:'active'});
        within.add(admitKey);
      }catch(e){errors.push({row:line,reason:e.message});}
    });
    return {valid,errors,rowCount:parsed.length,canCommit:valid.length===parsed.length&&errors.length===0};
  }
  return {markDetails,examNames,report,csv,parseDob,previewAdmissions};
});
