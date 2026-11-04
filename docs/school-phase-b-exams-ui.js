/* Phase B1 school-owner exam plans and grading rules.
   Uses verified owner JWT and existing RLS, no teacher/parent publication. */
(()=>{
 'use strict';
 const domain=window.BrightNexaExamPlanner;
 const E=(tag,value)=>{const el=document.createElement(tag);if(value!==undefined)el.textContent=String(value);return el};
 const norm=x=>String(x??'').trim().toLocaleLowerCase('en').replace(/\s+/g,' ');
 const f=(name,input)=>{const label=E('label',name);label.append(input);return label};
 function select(placeholder,items){
   const input=E('select');input.required=true;input.append(new Option(placeholder,''));
   for(const [label,value] of items)input.append(new Option(label,value));
   return input;
 }
 function input(type,placeholder='',min='',max=''){
   const el=E('input');el.type=type;el.placeholder=placeholder;el.required=true;
   if(min!=='')el.min=String(min);if(max!=='')el.max=String(max);
   return el;
 }
 function message(parent,txt,bad=false){
   parent.textContent=txt;parent.className='phase-b-message'+(bad?' phase-b-error':'');
 }
 function list(rows,cols){
   const div=E('div');div.className='phase-b-table';const table=E('table');
   const h=E('tr');cols.forEach(c=>h.append(E('th',c)));table.append(h);
   for(const row of rows){const tr=E('tr');row.forEach(x=>{
     const td=E('td');
     if(x&&typeof x==='object'&&typeof x.nodeType==='number')td.append(x);
     else td.textContent=String(x??'');
     tr.append(td);
   });table.append(tr)}div.append(table);return div;
 }
 async function saveRecord(opts,module,details,existingId){
   const {state,req,allSchool}=opts;
   if(state.offlineReadOnly)throw Error('Cannot change exam settings while offline.');
   if(!state.me?.id||state.me.role!=='school_admin'||!state.school?.id)throw Error('Verified active school owner required.');
   const fresh=await allSchool('school_module_records','id,institution_id,module,details,title');
   if(fresh.some(row=>row.institution_id!==state.school.id))throw Error('Unexpected records from a different school.');
   let prepared;
   if(module==='exam_plans')prepared=domain.planInput(details,state.classes,fresh,existingId);
   else prepared=domain.schemeInput(details,state.classes,fresh,existingId);
   const title=module==='exam_plans'?prepared.exam+' — '+prepared.subject:prepared.academic_year+' grade policy';
   let payload={title,details:prepared,updated_at:new Date().toISOString()},result;
   if(existingId){
     const original=fresh.find(x=>x.id===existingId&&x.module===module);
     if(!original)throw Error('This record changed or disappeared. Refresh before editing.');
     if(module==='exam_plans'){
       const classStudents=new Set([...state.students,...(state.formerStudents||[])].filter(s=>s.class_id===original.details.class_id).map(s=>s.id));
       const hasMarks=fresh.some(x=>x.module==='exams'&&classStudents.has(x.details?.student)&&norm(x.details?.exam)===norm(original.details?.exam));
       const before=original.details;
       if(hasMarks&&(before.class_id!==prepared.class_id||
         norm(before.exam)!==norm(prepared.exam)||norm(before.subject)!==norm(prepared.subject)||
         Number(before.maximum)!==prepared.maximum))
         throw Error('Marks already exist. Exam, class, subject and maximum cannot be changed; edit only schedule/status.');
     }else if(!confirm('Changing a grade policy can change provisional report-card grades. Continue?'))return null;
     result=await req('school_module_records?id=eq.'+encodeURIComponent(existingId)+
       '&institution_id=eq.'+state.me.institution_id+'&module=eq.'+module,
       {method:'PATCH',body:payload});
   }else{
     payload={...payload,module,institution_id:state.me.institution_id,created_by:state.authUserId};
     result=await req('school_module_records',{method:'POST',body:payload});
   }
   if(!Array.isArray(result)||result.length!==1||!result[0].id||
     result[0].institution_id!==state.school.id||result[0].module!==module||
     result[0].details?.academic_year!==prepared.academic_year)
     throw Error('The exam setting was not confirmed by cloud. Refresh before retrying.');
   return result[0];
 }
 function planner(opts){
   const {body,state,open,reload,error}=opts;
   const root=E('section');root.className='phase-b-planner';
   root.append(E('h2','Exam planner & grading policy'),
     E('p','Set class-wise exam dates, subjects and maximum marks, then configure this school’s grade boundaries. No default board grading rule is assumed. Saving these plans does NOT publish results to parents.'));
   if(!domain){root.append(E('p','Academic planning module did not load. Refresh online.'));body.append(root);return}
   if(!state.classes.length){root.append(E('p','Add school classes and academic year before configuring exams.'));body.append(root);return}
   const classes=state.classes.map(c=>[[c.name,c.section,c.academic_year].filter(Boolean).join(' • '),c.id]);
   const row=E('div');row.className='phase-b-columns';
   const box=E('section');box.className='phase-b-card';box.append(E('h3','Subject exam schedule'));
   const form=E('form');form.className='phase-b-form';
   const classInput=select('Choose class / section',classes),
     examInput=input('text','e.g. First Term'),subjectInput=input('text','e.g. Mathematics'),
     dateInput=input('date'),timeInput=input('time'),
     maxInput=input('number','Marks',1,1000),duration=input('number','Minutes',15,360);
   examInput.maxLength=100;subjectInput.maxLength=100;
   maxInput.step='0.01';duration.step='1';
   const statusInput=select('Select status',[['Draft — not scheduled','draft'],['Scheduled — approved date','scheduled']]);
   const fields=[['Class / section',classInput],['Exam name',examInput],['Subject',subjectInput],
     ['Exam date',dateInput],['Start time',timeInput],['Duration (minutes)',duration],
     ['Maximum marks',maxInput],['Planning status',statusInput]];
   fields.forEach(([label,control])=>form.append(f(label,control)));
   const button=E('button','Save exam plan');button.type='submit';button.className='primary';
   const cancel=E('button','Cancel edit');cancel.type='button';cancel.hidden=true;
   form.append(button,cancel);box.append(form);
   const feedback=E('p');feedback.setAttribute('role','status');box.append(feedback);
   let editing=null;
   const reset=()=>{form.reset();editing=null;button.textContent='Save exam plan';cancel.hidden=true};
   cancel.addEventListener('click',reset);
   form.addEventListener('submit',async event=>{
     event.preventDefault();button.disabled=true;
     try{
       const details={class_id:classInput.value,exam:examInput.value,subject:subjectInput.value,
         scheduled_on:dateInput.value,starts_at:timeInput.value,
         duration_minutes:duration.value,maximum:maxInput.value,status:statusInput.value};
       const saved=await saveRecord(opts,'exam_plans',details,editing);
       if(saved){reset();message(feedback,'Exam plan confirmed in school cloud.');await reload();open('Exams & Marks');}
     }catch(e){message(feedback,e.message,true);error(e)}
     finally{button.disabled=false}
   });
   box.append(E('h4','Existing planned subjects'));
   const planned=state.extra.filter(x=>x.module==='exam_plans');
   if(!planned.length)box.append(E('p','No exam schedule configured yet.'));
   else box.append(list(planned.map(p=>{
     const d=p.details||{},c=state.classes.find(x=>x.id===d.class_id),edit=E('button','Edit');
     edit.type='button';edit.addEventListener('click',()=>{
       editing=p.id;classInput.value=d.class_id;examInput.value=d.exam;subjectInput.value=d.subject;
       dateInput.value=d.scheduled_on;timeInput.value=d.starts_at;
       maxInput.value=d.maximum;duration.value=d.duration_minutes;statusInput.value=d.status;
       button.textContent='Update plan';cancel.hidden=false;form.scrollIntoView({behavior:'smooth',block:'start'});
     });
     return [[c?.name,c?.section,c?.academic_year].filter(Boolean).join(' '),d.exam,d.subject,
       d.scheduled_on+' '+d.starts_at,d.maximum,d.status,edit];
   }),['Class','Exam','Subject','Date & start','Max','Status','Action']));
   row.append(box);
   const policyBox=E('section');policyBox.className='phase-b-card';policyBox.append(E('h3','School grading policies'));
   policyBox.append(E('p','Define exact percentage boundaries for each academic year. Example format: 90,A; 75,B; 0,C — this is formatting guidance only, not an assigned school policy.'));
   const form2=E('form');form2.className='phase-b-form';
   const years=[...new Set(state.classes.map(c=>c.academic_year).filter(Boolean))].sort();
   const yearInput=select('Choose academic year',years.map(x=>[x,x]));
   const titleInput=input('text','Grading policy name');titleInput.maxLength=100;
   const textarea=E('textarea');textarea.rows=7;textarea.placeholder='90,A\n75,B\n50,C\n0,D';textarea.required=true;
   form2.append(f('Academic year',yearInput),f('Policy name',titleInput),f('Grade bands: minimum %, label',textarea));
   const save=E('button','Save grading policy');save.type='submit';save.className='primary';
   const cancel2=E('button','Cancel edit');cancel2.type='button';cancel2.hidden=true;
   form2.append(save,cancel2);policyBox.append(form2);
   const feedback2=E('p');feedback2.setAttribute('role','status');policyBox.append(feedback2);
   let schemeId=null;
   const resetPolicy=()=>{form2.reset();schemeId=null;save.textContent='Save grading policy';cancel2.hidden=true};
   cancel2.addEventListener('click',resetPolicy);
   form2.addEventListener('submit',async event=>{
     event.preventDefault();save.disabled=true;
     try{
       const outcome=await saveRecord(opts,'grading_schemes',{
         academic_year:yearInput.value,name:titleInput.value,bands:textarea.value
       },schemeId);
       if(outcome){resetPolicy();message(feedback2,'School grade policy confirmed in cloud.');await reload();open('Exams & Marks');}
     }catch(e){message(feedback2,e.message,true);error(e)}
     finally{save.disabled=false}
   });
   const policies=state.extra.filter(x=>x.module==='grading_schemes');
   if(!policies.length)policyBox.append(E('p','No grading policy configured. Result cards will show percentages only.'));
   else policyBox.append(list(policies.map(p=>{
     const d=p.details||{},edit=E('button','Edit');edit.type='button';
     edit.addEventListener('click',()=>{
       schemeId=p.id;yearInput.value=d.academic_year;titleInput.value=d.name;
       textarea.value=Array.isArray(d.bands)?d.bands.map(x=>x.min+','+x.grade).join('\n'):'';
       save.textContent='Update policy';cancel2.hidden=false;form2.scrollIntoView({behavior:'smooth',block:'start'});
     });
     return [d.academic_year,d.name,Array.isArray(d.bands)?d.bands.map(x=>x.min+'%: '+x.grade).join(' · '):'Invalid',edit];
   }),['Session','Policy','Boundaries','Action']));
   row.append(policyBox);root.append(row);
   root.append(E('p','Plans and grade policies are visible only to authorized school owners. This phase does not yet create approval records, publish marks, or send notices to guardians.','phase-b-disclaimer'));
   body.append(root);
 }
 function decorateDraft({container,state,student,exam}){
   if(!domain||!student)return;
   const panel=E('section');panel.className='phase-b-audit';
   panel.append(E('h3','Exam plan & grade review'));
   try{
     const result=domain.audit({records:state.extra,student,classes:state.classes,exam});
     const stamp=E('p',result.readyForReview?
       'Complete draft result: '+result.earned+'/'+result.possible+' ('+result.percentage+'%), provisional grade '+result.provisionalGrade+'.':
       'Draft result cannot be graded yet. '+result.issues.length+' planning/marks issue(s) need attention.');
     panel.append(stamp);
     if(result.issues.length){const ul=E('ul');for(const issue of result.issues)ul.append(E('li',issue));panel.append(ul);}
     panel.append(E('p',result.note));
   }catch(e){panel.append(E('p','Draft exam review unavailable: '+e.message))}
   container.append(panel);
 }
 window.BrightNexaPhaseB={planner,decorateDraft};
})();