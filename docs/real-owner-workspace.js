/* School-owned, RLS-authorized data. No sample data, no service_role, no local records. */
(() => {
'use strict';
const BASE='https://mrfvbwmyxndrakskqyas.supabase.co';
const KEY='sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT';
const TOKEN='bn_school_staff_session_v1';
const $=id=>document.getElementById(id);
const menus=['Dashboard','School Profile','Students','Teachers','Non-Teaching Staff','Transport & Routes','Infrastructure & Assets','Class & Section Setup','Attendance','Fees','Expenses & Budget','Exams & Marks','Report Cards','Homework & Notices','Parent Messages','AI Teacher Tools','Opportunity Desk','Growth Passport','School Quality Score','Contact & Support','Settings','Parents App','Teachers Online Access','Smart Tools'];
const available=new Set(['Dashboard','School Profile','Students','Teachers','Non-Teaching Staff','Class & Section Setup','Attendance','Fees','Homework & Notices','Settings','Smart Tools','Parents App','Teachers Online Access']);
const state={session:null,me:null,school:null,classes:[],students:[],staff:[],fees:[],attendance:[],notices:[]};
let active='Dashboard';
const safe=x=>String(x??'');
const node=(tag,value)=>{const e=document.createElement(tag);if(value!==undefined)e.textContent=safe(value);return e};
const view=(id,on)=>$(id).classList.toggle('hidden',!on);
const error=e=>{view('message',true);$('message').textContent=e.message||safe(e);$('message').classList.add('warn')};
async function parse(r){const v=await r.json().catch(()=>({}));if(!r.ok)throw Error(v.message||v.error_description||v.error||'Cloud request failed');return v}
async function token(){
 if(!state.session)throw Error('Login required.');
 if(Number(state.session.expires_at)>Date.now()/1000+90)return state.session.access_token;
 const t=await parse(await fetch(BASE+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:KEY,'content-type':'application/json'},body:JSON.stringify({refresh_token:state.session.refresh_token}),cache:'no-store'}));
 state.session={access_token:t.access_token,refresh_token:t.refresh_token,expires_at:Math.floor(Date.now()/1000)+(Number(t.expires_in)||3600)};
 sessionStorage.setItem(TOKEN,JSON.stringify(state.session));return state.session.access_token;
}
async function req(path,options={}){
 const jwt=await token();
 const r=await fetch(BASE+'/rest/v1/'+path,{method:options.method||'GET',headers:{apikey:KEY,Authorization:'Bearer '+jwt,'content-type':'application/json',...(options.method?{'Prefer':'return=representation'}:{})},body:options.body?JSON.stringify(options.body):undefined,cache:'no-store'});
 return parse(r);
}
const filt=(tbl,params)=>tbl+'?'+new URLSearchParams(params).toString();
const inSchool=(table,select='*',more={})=>req(filt(table,{select,institution_id:'eq.'+state.me.institution_id,...more}));
function renderMenu(){
 const nav=$('menu');nav.replaceChildren();
 for(const title of menus){
   const b=node('button',title);b.type='button';b.dataset.section=title;
   b.addEventListener('click',()=>open(title));nav.append(b);
 }
}
function table(headers,rows){
 const wrap=node('div');wrap.className='data';
 const t=node('table'),head=node('thead'),tr=node('tr');
 headers.forEach(h=>tr.append(node('th',h)));head.append(tr);t.append(head);
 const body=node('tbody');
 for(const row of rows){const r=node('tr');row.forEach(x=>r.append(node('td',x)));body.append(r)}
 t.append(body);wrap.append(t);return wrap;
}
function showData(rows,cols,fn){
 const body=$('sectionBody');body.replaceChildren();
 if(!rows.length){body.append(node('p','No records yet.'));return}
 body.append(table(cols,rows.map(fn)));
}
function link(label,href){const a=node('a',label);a.href=href;return a}
function renderSection(title){
 const body=$('sectionBody');body.replaceChildren();
 const desc=node('p');desc.className='muted';
 if(title==='School Profile'){
   const info=state.school;
   body.append(table(['Field','Value'],[['School name',info.name],['Academic sections',state.classes.length],['Active students',state.students.length],['Staff profiles',state.staff.length]]));
 }else if(title==='Students'){
   desc.textContent='Real admission register, saved in your school database.';body.append(desc);
   const form=node('form');form.className='form';form.id='addStudent';
   form.innerHTML='<label>Student name<input name="name" required minlength="2" maxlength="120"></label><label>Admission number<input name="admission" required maxlength="60"></label><label>Class<select name="class_id" required></select></label><button class="primary" type="submit">Add student</button>';
   const sel=form.elements.class_id;sel.append(new Option('Choose class',''));
   state.classes.forEach(c=>sel.append(new Option(c.name+' '+(c.section||''),c.id)));
   form.addEventListener('submit',async ev=>{
      ev.preventDefault();const name=form.elements.name.value.trim(),admission=form.elements.admission.value.trim(),class_id=sel.value;
      if(!name||!admission||!state.classes.some(c=>c.id===class_id)){error(Error('Enter valid student details.'));return}
      if(state.students.some(s=>s.admission_number.toLowerCase()===admission.toLowerCase())){error(Error('Admission number already exists.'));return}
      const b=form.querySelector('button');b.disabled=true;
      try{await req('school_students',{method:'POST',body:{institution_id:state.me.institution_id,name,admission_number:admission,class_id,status:'active'}});await reload();open('Students')}catch(e){error(e)}finally{b.disabled=false}
   });body.append(form);body.append(table(['Student','Admission','Class','Status'],state.students.map(s=>[s.name,s.admission_number,state.classes.find(c=>c.id===s.class_id)?.name||'—',s.status])));
 }else if(title==='Teachers'||title==='Non-Teaching Staff'){
   const want=title==='Teachers'?'teaching':'housekeeping';
   const rows=state.staff.filter(s=>s.staff_category===want);
   body.append(table(['Name','Designation','Employment','Category'],rows.map(s=>[s.display_name,s.designation||'—',s.employment_type||'—',s.staff_category])));
   desc.textContent='Staff profiles are stored in Supabase. Invited login access is managed separately.';body.append(desc);
 }else if(title==='Class & Section Setup'){
   body.append(table(['Class','Section','Academic year','Students'],state.classes.map(c=>[c.name,c.section,c.academic_year,state.students.filter(s=>s.class_id===c.id).length])));
   body.append(link('Manage class assignments and rights','./index.html?view=roles'));
 }else if(title==='Attendance'){
   body.append(table(['Date','Student','Status'],state.attendance.map(a=>[a.day,state.students.find(s=>s.id===a.student_id)?.name||'Student',a.status])));
   body.append(link('Mark attendance for a class','./index.html?view=attendance'));
 }else if(title==='Fees'){
   const total=state.fees.reduce((sum,x)=>sum+(x.kind==='payment'?Number(x.amount_rupees):0),0);
   desc.textContent='Recorded payments total: ₹'+total.toLocaleString('en-IN')+'. Only saved fee entries are included.';body.append(desc);
   body.append(table(['Date','Student','Kind','Amount (₹)','Description'],state.fees.map(f=>[f.occurred_on,state.students.find(s=>s.id===f.student_id)?.name||'Student',f.kind,f.amount_rupees,f.description||'—'])));
   body.append(link('Open fee and receipt operations','./school-operations.html'));
 }else if(title==='Homework & Notices'){
   body.append(table(['Notice','Message','Created'],state.notices.map(n=>[n.title,n.body,n.created_at?.slice(0,10)])));
   body.append(link('Homework management','./index.html?view=homework'));
 }else if(title==='Teachers Online Access'){location.assign('./index.html?view=roles')}
 else if(title==='Parents App'){location.assign('./parents-cloud.html')}
 else if(title==='Smart Tools'){location.assign('./smart-tools.html')}
 else if(title==='Settings'){body.append(link('Manage account and school roles','./index.html?view=roles'))}
 else {
   desc.textContent='This module is not connected to the cloud database yet. Existing historical local demonstration functionality is not being presented as real school records.';body.append(desc);
 }
}
function open(name){
 active=name;view('dash',name==='Dashboard');view('section',name!=='Dashboard');
 $('heading').textContent=name==='Dashboard'?state.school.name:name;
 $('subtitle').textContent=name==='Dashboard'?'School operations from verified cloud records':'Haridwar Public School · '+name;
 document.querySelectorAll('#menu button').forEach(b=>b.setAttribute('aria-current',b.dataset.section===name?'page':'false'));
 if(name!=='Dashboard'){view('section',true);$('sectionTitle').textContent=name;renderSection(name)}
}
async function reload(){
 $('message').classList.add('hidden');
 const [classes,students,staff,fees,attendance,notices]=await Promise.all([
 inSchool('school_classes','id,name,section,academic_year',{limit:'500'}),
 inSchool('school_students','id,name,admission_number,class_id,status',{status:'eq.active',limit:'1000'}),
 inSchool('school_staff_profiles','id,display_name,designation,employment_type,staff_category',{limit:'500'}),
 inSchool('school_fee_entries','id,student_id,kind,amount_rupees,description,occurred_on',{limit:'1000'}),
 inSchool('school_attendance','id,student_id,day,status',{order:'day.desc',limit:'200'}),
 inSchool('school_notices','id,title,body,created_at',{order:'created_at.desc',limit:'100'})
 ]);
 Object.assign(state,{classes,students,staff,fees,attendance,notices});
 $('studentsCount').textContent=students.length;
 $('teachersCount').textContent=staff.filter(s=>s.staff_category==='teaching').length;
 $('classesCount').textContent=classes.length;
 $('feesCount').textContent='₹'+fees.filter(x=>x.kind==='payment').reduce((t,x)=>t+Number(x.amount_rupees),0).toLocaleString('en-IN');
 if(active!=='Dashboard')renderSection(active);
}
async function start(){
 try{
  state.session=JSON.parse(sessionStorage.getItem(TOKEN)||'null');
  if(!state.session?.access_token){location.replace('./index.html');return}
  const jwt=await token();
  const identity=await parse(await fetch(BASE+'/auth/v1/user',{headers:{apikey:KEY,Authorization:'Bearer '+jwt},cache:'no-store'}));
  const members=await req(filt('school_users',{select:'id,institution_id,role,status',auth_user_id:'eq.'+identity.id,status:'eq.active'}));
  state.me=members.find(x=>x.role==='school_admin');
  if(!state.me)throw Error('Owner account required. Please log in as school administrator.');
  const schools=await req(filt('institutions',{select:'id,name,status',id:'eq.'+state.me.institution_id}));
  state.school=schools.find(x=>['active','trial'].includes(x.status));
  if(!state.school)throw Error('School is not active.');
  $('topSchool').textContent=$('sideSchool').textContent=state.school.name;
  renderMenu();document.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>open(b.dataset.open)));
  $('refresh').addEventListener('click',()=>reload().catch(error));
  $('logout').addEventListener('click',()=>{sessionStorage.removeItem(TOKEN);location.assign('./index.html')});
  await reload();open('Dashboard');
 }catch(e){error(e);$('subtitle').textContent='Cloud records are unavailable';}
}
start();
})();