/* Persistent school modules. Public client uses the owner JWT and Supabase RLS only. */
(() => {
'use strict';
const configs={
'Transport & Routes':{key:'transport',noun:'route',fields:[['route','Route name','text',true],['vehicle','Vehicle / registration','text',false],['driver','Driver name','text',false],['stops','Stops / pickup points','text',false]]},
'Infrastructure & Assets':{key:'assets',noun:'asset',fields:[['asset','Asset name','text',true],['category','Category','text',true],['quantity','Units','number',true],['condition','Condition','select:Working|Needs repair|Retired',true]]},
'Expenses & Budget':{key:'expenses',noun:'expense / budget',fields:[['expense','Description','text',true],['category','Category','text',true],['kind','Entry type','select:Expense|Budget',true],['amount','Amount (₹)','number',true],['date','Entry date','date',true]]},
'Exams & Marks':{key:'exams',noun:'exam mark',fields:[['student','Student','student',true],['exam','Exam name','text',true],['subject','Subject','text',true],['obtained','Marks scored','number',true],['maximum','Maximum marks','number',true]]},
'Parent Messages':{key:'parent_messages',noun:'message draft',fields:[['recipient','Recipient / class','text',true],['subject','Subject','text',true],['message','Message draft (not sent)','textarea',true]]},
'Opportunity Desk':{key:'opportunities',noun:'opportunity',fields:[['opportunity','Opportunity title','text',true],['category','Category','text',false],['deadline','Deadline','date',false],['url','Website URL','url',false]]},
'Growth Passport':{key:'achievements',noun:'achievement',fields:[['student','Student','student',true],['achievement','Achievement','text',true],['category','Category','text',false],['date','Award date','date',false]]},
'Contact & Support':{key:'contacts',noun:'contact',fields:[['department','Department','text',true],['person','Contact person','text',false],['phone','Phone','tel',false],['email','Email','email',false]]}
};
const elt=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);return n};
const readable=(v,field,state)=>{
 if(field[2]==='student')return [...state.students,...(state.formerStudents||[])].find(s=>s.id===v)?.name||'Student';
 return String(v??'—');
};
function makeField(field,state){
 const [key,label,type,required]=field;
 const wrap=elt('label',label);let input;
 if(type==='textarea'){input=elt('textarea');input.rows=3}
 else if(type==='student'){input=elt('select');input.append(new Option('Select student',''));for(const student of state.students)input.append(new Option(student.name+' · '+student.admission_number,student.id))}
 else if(type.startsWith('select:')){input=elt('select');for(const v of type.slice(7).split('|'))input.append(new Option(v,v))}
 else{input=elt('input');input.type=type; if(type==='number'){input.min='0';input.step='any'}if(type==='text')input.maxLength=180;}
 input.name=key;input.required=required;wrap.append(input);return wrap;
}
async function renderGeneric(opts,config){
 const {body,state,req,open,reload,error}=opts;
 const heading=elt('p','All changes in this section are saved to the school database.');heading.className='muted';body.append(heading);
 if(config.key==='parent_messages'){const info=elt('p','Messages are saved as drafts only. No WhatsApp, SMS or email is sent from this screen.');info.className='notice';body.append(info)}
 if(config.key==='expenses'){
  const rows=state.extra.filter(r=>r.module==='expenses');
  const spent=rows.filter(r=>r.details?.kind!=='Budget').reduce((t,r)=>t+Number(r.details?.amount||0),0);
  const planned=rows.filter(r=>r.details?.kind==='Budget').reduce((t,r)=>t+Number(r.details?.amount||0),0);
  const p=elt('p','Budget planned: ₹'+planned.toLocaleString('en-IN')+' · Expenses: ₹'+spent.toLocaleString('en-IN')+' · Remaining: ₹'+(planned-spent).toLocaleString('en-IN'));p.className='notice';body.append(p);
 }
 const form=elt('form');form.className='form';const inputs={};for(const field of config.fields){const wrap=makeField(field,state);form.append(wrap);inputs[field[0]]=wrap.querySelector('input,textarea,select')}
 const save=elt('button','Save '+config.noun);save.className='primary';save.type='submit';form.append(save);
 const cancel=elt('button','Cancel edit');cancel.type='button';cancel.hidden=true;form.append(cancel);
 let editId=null;cancel.addEventListener('click',()=>{editId=null;form.reset();save.textContent='Save '+config.noun;cancel.hidden=true});
 form.addEventListener('submit',async e=>{
 e.preventDefault();const details={};for(const field of config.fields){const value=inputs[field[0]].value.trim();if(field[3]&&!value)return error(Error('Enter '+field[1]));details[field[0]]=value;}
 if(config.key==='exams'){
  try{Object.assign(details,window.BrightNexaAcademics.markDetails(details,state.students,state.extra,editId));}
  catch(e){return error(e)}
 }
 if(config.key==='assets'&&Number(details.quantity)<=0)return error(Error('Units must be greater than zero.'));
 if(config.key==='expenses'&&Number(details.amount)<=0)return error(Error('Amount must be greater than zero.'));
 const title=String(details[config.fields[0][0]]||'Record').slice(0,180);
 save.disabled=true;
 try{
 const payload={title,details,updated_at:new Date().toISOString()};
 if(editId){const rows=await req('school_module_records?id=eq.'+encodeURIComponent(editId)+'&institution_id=eq.'+state.me.institution_id,{method:'PATCH',body:payload});window.BrightNexaSchoolAdmin.expectUpdated(rows,editId)}
 else{const rows=await req('school_module_records',{method:'POST',body:{...payload,module:config.key,institution_id:state.me.institution_id,created_by:state.authUserId}});if(!Array.isArray(rows)||rows.length!==1||!rows[0].id)throw Error('School module save was not confirmed; refresh before retrying.')}
 await reload();open(opts.title);
 }catch(e){error(e)}finally{save.disabled=false}
 });
 body.append(form);
 const items=state.extra.filter(x=>x.module===config.key);
 if(!items.length){const empty=elt('p','No records yet.');empty.className='muted';body.append(empty);return}
 const wrap=elt('div');wrap.className='data';const table=elt('table');const thead=elt('thead'),headingRow=elt('tr');
 for(const f of config.fields)headingRow.append(elt('th',f[1]));headingRow.append(elt('th','Actions'));thead.append(headingRow);table.append(thead);
 const tbody=elt('tbody');
 for(const row of items){
 const tr=elt('tr');for(const f of config.fields)tr.append(elt('td',readable(row.details?.[f[0]],f,state)));
 const cell=elt('td');
 const edit=elt('button','Edit');edit.type='button';
 edit.addEventListener('click',()=>{editId=row.id;for(const f of config.fields)inputs[f[0]].value=String(row.details?.[f[0]]??'');save.textContent='Update '+config.noun;cancel.hidden=false;form.scrollIntoView({behavior:'smooth',block:'start'})});
 const del=elt('button','Delete');del.type='button';
 del.addEventListener('click',async()=>{if(!confirm('Delete this '+config.noun+'?'))return;del.disabled=true;try{const removed=await req('school_module_records?id=eq.'+encodeURIComponent(row.id)+'&institution_id=eq.'+state.me.institution_id,{method:'DELETE'});window.BrightNexaSchoolAdmin.expectUpdated(removed,row.id);await reload();open(opts.title)}catch(e){error(e);del.disabled=false}});
 cell.append(edit,elt('span',' '),del);tr.append(cell);tbody.append(tr);
 }
 table.append(tbody);wrap.append(table);body.append(wrap);
}
function renderReportCards({body,state}){
 const engine=window.BrightNexaAcademics;
 const p=elt('p','Only recorded school marks are used. Select one exam: marks from different exams are never combined. A school grading policy can show a provisional grade only when all planned subjects match; result publication still requires a separate approval process.');
 p.className='muted';body.append(p);
 if(!engine){body.append(elt('p','Report tools could not load. Refresh while online.'));return}
 const records=state.extra.filter(x=>x.module==='exams');
 const students=[...state.students,...(state.formerStudents||[])];
 const controls=elt('div');controls.className='form';
 const studentSel=elt('select'),examSel=elt('select');
 studentSel.setAttribute('aria-label','Select student for report card');
 examSel.setAttribute('aria-label','Select exam for report card');
 studentSel.append(new Option('Select student',''));
 for(const student of students)studentSel.append(new Option(student.name+' · '+student.admission_number+(student.status==='active'?'':' ('+student.status+')'),student.id));
 const studentWrap=elt('label','Student');studentWrap.append(studentSel);
 const examWrap=elt('label','Exam');examWrap.append(examSel);
 controls.append(studentWrap,examWrap);body.append(controls);
 const result=elt('div');body.append(result);
 function examsForSelected(){
  examSel.replaceChildren();
  examSel.append(new Option('Select exam',''));
  for(const name of engine.examNames(records,studentSel.value))examSel.append(new Option(name,name));
 }
 function show(){
  result.replaceChildren();
  const student=students.find(s=>s.id===studentSel.value);
  if(!student||!examSel.value)return;
  const data=engine.report(records,student.id,examSel.value);
  result.append(elt('h2',state.school.name+' — '+student.name));
  const cl=state.classes.find(c=>c.id===student.class_id);
  result.append(elt('p','Admission: '+student.admission_number+' · Class: '+(cl?cl.name+' '+cl.section:'Not assigned')+' · Exam: '+data.exam));
  const table=elt('table');
  const head=elt('tr');['Subject','Obtained','Maximum','Percentage'].forEach(v=>head.append(elt('th',v)));table.append(head);
  for(const row of data.subjects){
   const tr=elt('tr');
   [row.subject,row.obtained,row.maximum,row.percent+'%'].forEach(v=>tr.append(elt('td',v)));
   table.append(tr);
  }
  result.append(table);
  window.BrightNexaPhaseB?.decorateDraft({container:result,state,student,exam:data.exam});
  if(!data.subjects.length){result.append(elt('p','No valid marks for this exam.'));return}
  const sum=elt('p','Total: '+data.obtained+' / '+data.maximum+' ('+data.percent+'%). Percentage only; this is not an official pass/fail or grade decision.');
  result.append(sum);
  if(data.issues.length){
   const warn=elt('p',data.issues.length+' invalid or duplicate subject entry/entries were excluded. Review Exams & Marks before publishing.');
   warn.className='notice';result.append(warn);
   return;
  }
  const print=elt('button','Print this exam report');print.type='button';print.className='primary';print.addEventListener('click',()=>window.print());
  const exportBtn=elt('button','Export exam CSV');exportBtn.type='button';
  exportBtn.addEventListener('click',()=>{
   const csv=engine.csv(data.subjects.map(s=>({student:student.name,admission_number:student.admission_number,exam:data.exam,subject:s.subject,obtained:s.obtained,maximum:s.maximum,percentage:s.percent})),
     ['student','admission_number','exam','subject','obtained','maximum','percentage']);
   const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
   const a=elt('a');a.download='bright-nexa-exam-report.csv';a.href=url;a.click();
   setTimeout(()=>URL.revokeObjectURL(url),5000);
  });
  result.append(print,elt('span',' '),exportBtn);
 }
 studentSel.addEventListener('change',()=>{examsForSelected();show()});
 examSel.addEventListener('change',show);
 examsForSelected();
}

function renderScore({body,state}){
 const stats=[
 ['Active students',state.students.length],
 ['Teachers',state.staff.filter(s=>s.staff_category==='teaching').length],
 ['Class-sections',state.classes.length],
 ['Attendance entries',state.attendance.length],
 ['Recorded fee entries',state.fees.length],
 ['Exam marks entered',state.extra.filter(r=>r.module==='exams').length],
 ['Assets registered',state.extra.filter(r=>r.module==='assets').length],
 ['Notices published',state.notices.length]
 ];
 body.append(elt('p','Verified operational indicators from this school database. No arbitrary quality rating is assigned.'));
 const tbl=elt('table');for(const [k,v] of stats){const tr=elt('tr');tr.append(elt('th',k),elt('td',v));tbl.append(tr)}body.append(tbl);
}
window.BrightNexaOwnerExtra={
 render(opts){
  if(configs[opts.title]){renderGeneric(opts,configs[opts.title]);if(opts.title==='Exams & Marks')window.BrightNexaPhaseB?.planner(opts);return true}
  if(opts.title==='Report Cards'){renderReportCards(opts);return true}
  if(opts.title==='School Quality Score'){renderScore(opts);return true}
  return false;
 }
};
})();