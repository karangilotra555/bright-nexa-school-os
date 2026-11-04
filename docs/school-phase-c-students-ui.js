/* Phase C1: owner-only student contact profile and document status checklist.
   Loads one selected student on demand. No personal details cached locally in this UI. */
(()=>{
 'use strict';
 const core=window.BrightNexaStudentProfile;
 const e=(tag,label,klass)=>{const n=document.createElement(tag);if(label!==undefined)n.textContent=String(label);if(klass)n.className=klass;return n};
 const label=(title,control)=>{const l=e('label',title);l.append(control);return l};
 const input=(kind,max)=>{const n=e('input');n.type=kind;n.maxLength=max||200;return n};
 const select=(items)=>{const n=e('select');for(const [value,title] of items)n.append(new Option(title,value));return n};
 const fields=[
   ['guardian_name','Guardian / parent name','text',150],
   ['guardian_relationship','Relationship','text',40],
   ['guardian_phone','Guardian phone','tel',20],
   ['guardian_email','Guardian email','email',200],
   ['alternate_contact_name','Emergency contact name','text',150],
   ['alternate_contact_phone','Emergency contact phone','tel',20],
   ['address_line','Home address','text',400],
   ['city','City','text',100],
   ['postal_code','Postal / PIN code','text',20],
   ['admission_on','Date of admission','date',null]
 ];
 function attach({body,state,req,inSchool,error}){
   if(!core)return;
   const root=e('section',undefined,'phase-c-profile'),h=e('h3','Student profile & document checklist');
   const p=e('p','Private school owner records. Open a student to update guardian contact details and record which required documents have been received and manually checked.','phase-c-hint');
   const controls=e('div',undefined,'phase-c-row');
   const picker=select([['','Choose student'],...[...state.students,...(state.formerStudents||[])].map(s=>[s.id,s.name+' · '+s.admission_number+(s.status==='active'?'':' ('+s.status+')')])]);
   picker.setAttribute('aria-label','Student profile selector');
   const open=e('button','Open student profile');open.type='button';
   controls.append(label('Student',picker),open);root.append(h,p,controls);
   const holder=e('div');root.append(holder);body.append(root);
   let sequence=0;
   const schoolId=state.school.id;
   const students=[...state.students,...(state.formerStudents||[])];
   async function fetchRows(studentId){
     const [profileRows,docs]=await Promise.all([
       inSchool('school_student_profiles','*',{student_id:'eq.'+studentId,limit:'2'}),
       inSchool('school_student_document_checks','*',{student_id:'eq.'+studentId,order:'document_type.asc'})
     ]);
     if(profileRows.length>1||profileRows.some(x=>x.student_id!==studentId||x.institution_id!==schoolId)||
       docs.some(x=>x.student_id!==studentId||x.institution_id!==schoolId))
       throw Error('School profile data returned unexpected student/school rows.');
     return {profile:profileRows[0]||null,docs};
   }
   async function openStudent(){
     const student=students.find(s=>s.id===picker.value),ticket=++sequence;
     holder.replaceChildren();
     if(!student){holder.append(e('p','Choose a real school student first.','phase-c-hint'));return}
     holder.append(e('p','Loading private student profile from cloud…','phase-c-hint'));
     let data;
     try{data=await fetchRows(student.id)}
     catch(err){
       if(ticket!==sequence)return;
       holder.replaceChildren();holder.append(e('p','Profile unavailable: '+err.message+'. Requires the Phase C1 database migration and verified owner permissions.','phase-c-error'));return;
     }
     if(ticket!==sequence)return;
     render(student,data);
   }
   open.addEventListener('click',()=>void openStudent());
   function render(student,data){
     holder.replaceChildren();
     const headline=e('div',undefined,'phase-c-heading');
     headline.append(e('h4',student.name+' · '+student.admission_number),
       e('p','Class: '+(state.classes.find(c=>c.id===student.class_id)?.name||'Unassigned')+' · '+student.status));
     holder.append(headline);
     const form=e('form');form.className='phase-c-form';
     const inputs={};
     for(const [key,title,type,max] of fields){
       const control=input(type,max);
       control.name=key;control.value=data.profile?.[key]||'';
       inputs[key]=control;form.append(label(title,control));
     }
     const save=e('button','Save student contact profile');save.type='submit';save.className='primary';
     if(state.offlineReadOnly)save.disabled=true;
     const profileStatus=e('p',undefined,'phase-c-hint');profileStatus.setAttribute('role','status');
     form.append(save,profileStatus);holder.append(form);
     form.addEventListener('submit',async ev=>{
       ev.preventDefault();save.disabled=true;
       try{
         const raw=Object.fromEntries(fields.map(([k])=>[k,inputs[k].value]));
         const profile=core.validateProfile(student.id,raw,students);
         const nextTime=new Date().toISOString(),payload={...profile,updated_at:nextTime};
         let result;
         if(data.profile){
           const filter=new URLSearchParams({
             id:'eq.'+data.profile.student_id,
             student_id:'eq.'+student.id,
             institution_id:'eq.'+schoolId,
             updated_at:'eq.'+data.profile.updated_at
           });
           // This table is keyed by student_id, not a separate id.
           filter.delete('id');
           result=await req('school_student_profiles?'+filter,{method:'PATCH',body:payload});
         }else{
           result=await req('school_student_profiles',{method:'POST',body:{...payload,institution_id:schoolId}});
         }
         data.profile=core.confirmRow(result,{student_id:student.id,institution_id:schoolId,guardian_name:profile.guardian_name,guardian_phone:profile.guardian_phone,guardian_email:profile.guardian_email});
         profileStatus.className='phase-c-hint';profileStatus.textContent='Student contact details saved and confirmed in the school cloud.';
       }catch(err){profileStatus.className='phase-c-error';profileStatus.textContent=err.message;error(err)}
       finally{save.disabled=state.offlineReadOnly}
     });
     const docSection=e('section',undefined,'phase-c-docs');docSection.append(e('h4','Document receipt & verification'));
     const summary=e('p');docSection.append(summary);
     const table=e('div',undefined,'phase-c-table');docSection.append(table);
     const docForm=e('form');docForm.className='phase-c-form';
     const type=select(Object.entries(core.TYPES)),status=select(Object.entries(core.STATUSES));
     const notes=input('text',300);
     type.setAttribute('aria-label','Document type');status.setAttribute('aria-label','Document status');
     docForm.append(label('Document',type),label('Review status',status),label('Notes (optional)',notes));
     const docSave=e('button','Save document status');docSave.type='submit';docSave.className='primary';
     if(state.offlineReadOnly)docSave.disabled=true;
     docForm.append(docSave);
     const statusLine=e('p',undefined,'phase-c-hint');statusLine.setAttribute('role','status');
     docForm.append(statusLine);docSection.append(docForm);
     holder.append(docSection);
     const refreshChecklist=()=>{
       const result=core.checklist(data.docs,student.id);
       summary.textContent='Received: '+result.received+' / '+result.total+' · Verified: '+result.verified+
         '. No scanned files are uploaded or attached here.';
       table.replaceChildren();
       for(const [documentType,name] of Object.entries(core.TYPES)){
         const found=data.docs.find(x=>x.document_type===documentType);
         const row=e('div',undefined,'phase-c-doc-row');
         row.append(e('span',name),e('strong',core.STATUSES[found?.status]||'Not received'));
         const edit=e('button','Update');edit.type='button';
         edit.addEventListener('click',()=>{
           type.value=documentType;status.value=found?.status||'not_received';notes.value=found?.notes||'';
           docForm.scrollIntoView({behavior:'smooth',block:'center'});
         });
         row.append(edit);table.append(row);
       }
     };
     docForm.addEventListener('submit',async ev=>{
       ev.preventDefault();docSave.disabled=true;
       try{
         const document=core.validateDocument(student.id,
           {document_type:type.value,status:status.value,notes:notes.value},students,state.authUserId);
         const prior=data.docs.find(x=>x.document_type===document.document_type);
         const payload={...document,updated_at:new Date().toISOString()};
         let result;
         if(prior){
           const q=new URLSearchParams({
             id:'eq.'+prior.id,institution_id:'eq.'+schoolId,
             student_id:'eq.'+student.id,updated_at:'eq.'+prior.updated_at
           });
           result=await req('school_student_document_checks?'+q,{method:'PATCH',body:payload});
         }else{
           result=await req('school_student_document_checks',
             {method:'POST',body:{...payload,institution_id:schoolId}});
         }
         const checked=core.confirmRow(result,{
           institution_id:schoolId,student_id:student.id,
           document_type:document.document_type,status:document.status
         });
         if(prior)data.docs=data.docs.map(x=>x.id===checked.id?checked:x);
         else data.docs.push(checked);
         statusLine.className='phase-c-hint';statusLine.textContent='Document checklist updated in the school cloud.';
         refreshChecklist();
       }catch(err){statusLine.className='phase-c-error';statusLine.textContent=err.message;error(err)}
       finally{docSave.disabled=state.offlineReadOnly}
     });
     refreshChecklist();
     holder.append(e('p','Document statuses are owner-entered records. They are not official certificate validation, digitally signed certificates or a storage system for uploaded identity documents.','phase-c-hint'));
   }
 }
 window.BrightNexaPhaseCStudentProfiles={attach};
})();
