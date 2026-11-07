(function(root){
'use strict';
const sections=[
 {title:'Essentials',icon:'👤',open:true,fields:[['first_name','First name'],['middle_name','Middle name'],['last_name','Last name'],['date_of_birth','Date of birth','date'],['gender','Gender']]},
 {title:'Unique IDs',icon:'🪪',fields:[['udise_number','UDISE number'],['pen_number','PEN (Permanent Education Number)','text','private'],['apaar_id','APAAR ID','text','private']]},
 {title:'Address & Communication',icon:'📍',fields:[['guardian_phone','Registered mobile','tel','private','profile'],['alternate_contact_phone','Secondary contact','tel','private','profile'],['student_email','Student email','email','private'],['address_line','Current address','textarea',null,'profile'],['city','City','text',null,'profile'],['state','State'],['postal_code','PIN code','text',null,'profile'],['permanent_address','Permanent address','textarea'],['permanent_city','Permanent city'],['permanent_state','Permanent state'],['permanent_postal_code','Permanent PIN code'],['guardian_email','Contact email','email','private','profile']]},
 {title:'Academic Mapping',icon:'🎓',fields:[['roll_number','Roll number'],['admission_on','Admission date','date',null,'profile'],['house_name','House'],['previous_school','Previous school'],['latest_exam_result','Latest exam result (%)'],['bus_route','Bus route'],['bus_stop','Bus stop']]},
 {title:'Personal Details',icon:'📋',fields:[['aadhaar_number','Aadhaar number','text','private'],['religion','Religion'],['school_category','School category'],['caste','Caste'],['nationality','Nationality']]},
 {title:'Family',icon:'👪',fields:[['father_name','Father’s name'],['father_occupation','Father’s occupation'],['mother_name','Mother’s name'],['mother_occupation','Mother’s occupation'],['guardian_name','Guardian name','text',null,'profile'],['guardian_relationship','Guardian relationship','text',null,'profile'],['alternate_contact_name','Alternate contact name','text',null,'profile']]},
 {title:'Health & Medical',icon:'🩺',fields:[['blood_group','Blood group'],['allergies','Allergies','textarea'],['medical_conditions','Medical conditions / care instructions','textarea'],['emergency_contact_name','Emergency contact name'],['emergency_contact_phone','Emergency mobile','tel','private']]}
];
function value(data,field){const [key,,, ,scope]=field;const p=data.student?.profile||{},d=p.details||{};if(key==='date_of_birth')return data.student?.dob||'';if(key==='first_name')return d[key]||data.student?.name||'';return scope==='profile'?(p[key]??''):(d[key]??'');}
function mask(input){const s=String(input||'');if(!s)return 'Not provided by school';if(s.includes('@')){const parts=s.split('@');return parts[0].slice(0,1)+'••••@'+parts[1];}return '•••• '+s.slice(-4);}
function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(cls)e.className=cls;return e;}
function fieldDisplay(parent,label,input,privateField){const item=el('div',undefined,'bn-profile-field'),name=el('span',label),out=el('strong',input===undefined||input===null||input===''?'—':input);item.append(name,out);if(privateField&&input){let shown=false;out.textContent=mask(input);const button=el('button','Show','bn-profile-reveal');button.type='button';button.setAttribute('aria-label','Show '+label);button.addEventListener('click',()=>{shown=!shown;out.textContent=shown?input:mask(input);button.textContent=shown?'Hide':'Show';button.setAttribute('aria-label',(shown?'Hide ':'Show ')+label)});item.append(button);}parent.append(item);}
function render(rootEl,data){
 rootEl.replaceChildren();const student=data.student||{},profile=student.profile||{},details=profile.details||{};
 const hero=el('div',undefined,'panel bn-profile-hero');hero.append(el('div',(student.name||'BN').trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase(),'bn-profile-avatar'),el('h2',student.name||'Student'),el('p',[student.className,student.section].filter(Boolean).join(' · ')),el('strong',student.admissionNumber||'Admission number not provided'));rootEl.append(hero);
 const stats=el('div',undefined,'bn-profile-stats');for(const [label,count] of [['Attendance',data.attendance?.percent==null?'—':data.attendance.percent+'%'],['Leave requests',(data.leaves||[]).length],['Last exam result',details.latest_exam_result!==undefined&&details.latest_exam_result!==null&&details.latest_exam_result!==''?details.latest_exam_result+'%':'—']]){const card=el('div');card.append(el('strong',count),el('span',label));stats.append(card)}rootEl.append(stats,el('p','Details are maintained by your school. — means the information has not been entered.','bn-att-note'));
 for(const section of sections){const card=el('details',undefined,'bn-profile-card');card.open=!!section.open;const heading=el('summary',section.icon+' '+section.title),grid=el('div',undefined,'bn-profile-grid');card.append(heading,grid);if(section.title==='Academic Mapping'){fieldDisplay(grid,'School',data.school?.name);fieldDisplay(grid,'Admission number',student.admissionNumber);fieldDisplay(grid,'Class / Section',[student.className,student.section].filter(Boolean).join(' - '));fieldDisplay(grid,'Session',data.school?.session);}
  for(const field of section.fields){let input=value(data,field);if(field[2]==='date'&&input){const date=new Date(input+'T00:00:00Z');if(!Number.isNaN(date.getTime()))input=date.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});}fieldDisplay(grid,field[1],input,field[3]==='private');}rootEl.append(card);
 }
 // One authorized student record drives the same academic view for parents
 // and students. Never guess teacher names or invent a timetable.
 const academics=el('details',undefined,'bn-profile-card');academics.open=true;
 const academicsGrid=el('div',undefined,'bn-profile-grid');
 academics.append(el('summary','📚 My Class, Teachers & Timetable'),academicsGrid);
 const teachers=Array.isArray(data.teachers)?data.teachers:[];
 const classTeacher=teachers.find(t=>t.assignment_type==='class_teacher');
 fieldDisplay(academicsGrid,'Class teacher',classTeacher?.teacher_name||
   (data.teachersStatus==='loaded'?'Not assigned by school':'Not available until school publishes assignments'),false);
 const subjects=teachers.filter(t=>t.assignment_type==='subject_teacher');
 if(subjects.length){
   for(const t of subjects)fieldDisplay(academicsGrid,(t.subject||'Subject')+' teacher',t.teacher_name||'Assigned teacher',false);
 }else{
   fieldDisplay(academicsGrid,'Subject-wise teachers',data.teachersStatus==='loaded'?'Not assigned by school':'Not available until school publishes assignments',false);
 }
 const timetable=Array.isArray(data.timetable)?data.timetable:[];
 if(timetable.length){
  for(const slot of timetable){
   const weekday=String(slot.day||'Day'),time=[slot.starts_at,slot.ends_at].filter(Boolean).join(' – ');
   fieldDisplay(academicsGrid,[weekday,time].filter(Boolean).join(' · '),String(slot.subject||'—'),false);
  }
 }else{
   fieldDisplay(academicsGrid,'Class timetable','Not published by school yet',false);
 }
 rootEl.append(academics);
}
function editor(rootEl,data){rootEl.replaceChildren();const inputs=[];for(const section of sections){const group=el('details',undefined,'bn-profile-card');group.open=section.open;group.append(el('summary',section.icon+' '+section.title));const grid=el('div',undefined,'bn-profile-grid');for(const field of section.fields){const label=el('label',field[1]);const input=el(field[2]==='textarea'?'textarea':'input');if(input.tagName==='INPUT')input.type=field[2]||'text';input.value=value(data,field);input.maxLength=field[2]==='textarea'?2000:200;input.dataset.profileKey=field[0];input.dataset.profileScope=field[4]||'details';if(field[0]==='latest_exam_result'){input.type='number';input.min='0';input.max='100';input.step='0.01';}label.append(input);grid.append(label);inputs.push(input);}group.append(grid);rootEl.append(group);}return ()=>{const p=data.student?.profile||{};const payload={guardian_name:p.guardian_name||'',guardian_relationship:p.guardian_relationship||'',guardian_phone:p.guardian_phone||'',guardian_email:p.guardian_email||'',alternate_contact_name:p.alternate_contact_name||'',alternate_contact_phone:p.alternate_contact_phone||'',address_line:p.address_line||'',city:p.city||'',postal_code:p.postal_code||'',admission_on:p.admission_on||'',details:{...(p.details||{})}};let dob=data.student?.dob||null;for(const input of inputs){if(!input.checkValidity())throw Error('Check '+input.parentElement.firstChild.textContent);if(input.dataset.profileKey==='date_of_birth'){dob=input.value||null;continue;}const target=input.dataset.profileScope==='profile'?payload:payload.details;target[input.dataset.profileKey]=input.value.trim();}return {p_profile:payload,p_dob:dob};};}
const api={sections,value,mask,render,editor};if(typeof module!=='undefined')module.exports=api;else root.BNStudentProfile=api;
})(typeof window!=='undefined'?window:globalThis);
