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
 if(field[2]==='student')return state.students.find(s=>s.id===v)?.name||'Student';
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
 if(config.key==='exams'&&(Number(details.maximum)<=0||Number(details.obtained)<0||Number(details.obtained)>Number(details.maximum)))return error(Error('Marks must be between zero and maximum marks.'));
 if(config.key==='assets'&&Number(details.quantity)<=0)return error(Error('Units must be greater than zero.'));
 if(config.key==='expenses'&&Number(details.amount)<=0)return error(Error('Amount must be greater than zero.'));
 const title=String(details[config.fields[0][0]]||'Record').slice(0,180);
 save.disabled=true;
 try{
 const payload={title,details,updated_at:new Date().toISOString()};
 if(editId){await req('school_module_records?id=eq.'+encodeURIComponent(editId)+'&institution_id=eq.'+state.me.institution_id,{method:'PATCH',body:payload})}
 else{await req('school_module_records',{method:'POST',body:{...payload,module:config.key,institution_id:state.me.institution_id,created_by:state.authUserId}})}
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
 del.addEventListener('click',async()=>{if(!confirm('Delete this '+config.noun+'?'))return;del.disabled=true;try{await req('school_module_records?id=eq.'+encodeURIComponent(row.id)+'&institution_id=eq.'+state.me.institution_id,{method:'DELETE'});await reload();open(opts.title)}catch(e){error(e);del.disabled=false}});
 cell.append(edit,elt('span',' '),del);tr.append(cell);tbody.append(tr);
 }
 table.append(tbody);wrap.append(table);body.append(wrap);
}
function renderReportCards({body,state}){
 const marks=state.extra.filter(x=>x.module==='exams');
 const p=elt('p','Report cards use only the saved exam marks from this school. No predicted grades are generated.');p.className='muted';body.append(p);
 const sel=elt('select');sel.append(new Option('Select student',''));for(const s of state.students)sel.append(new Option(s.name+' · '+s.admission_number,s.id));
 const report=elt('div');body.append(sel,report);
 function show(){
 report.replaceChildren();if(!sel.value)return;
 const student=state.students.find(s=>s.id===sel.value);report.append(elt('h2',state.school.name+' — '+student.name));
 const rows=marks.filter(x=>x.details?.student===sel.value);
 const t=elt('table');const head=elt('tr');['Exam','Subject','Obtained','Maximum'].forEach(x=>head.append(elt('th',x)));t.append(head);
 let earned=0,max=0;
 for(const r of rows){const d=r.details;const tr=elt('tr');[d.exam,d.subject,d.obtained,d.maximum].forEach(v=>tr.append(elt('td',v)));t.append(tr);earned+=Number(d.obtained||0);max+=Number(d.maximum||0)}
 report.append(t);
 if(rows.length)report.append(elt('p','Total: '+earned+' / '+max+' ('+(max?Math.round(earned*10000/max)/100:0)+'%)'));else report.append(elt('p','No exam marks recorded for this student.'));
 const print=elt('button','Print report');print.type='button';print.className='primary';print.addEventListener('click',()=>window.print());report.append(print);
 }
 sel.addEventListener('change',show);
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
  if(configs[opts.title]){renderGeneric(opts,configs[opts.title]);return true}
  if(opts.title==='Report Cards'){renderReportCards(opts);return true}
  if(opts.title==='School Quality Score'){renderScore(opts);return true}
  return false;
 }
};
})();