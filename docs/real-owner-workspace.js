/* School-owned, RLS-authorized data. No sample data, no service_role, no local records. */
(() => {
'use strict';
const BASE='https://mrfvbwmyxndrakskqyas.supabase.co';
const KEY='sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT';
const TOKEN='bn_school_staff_session_v1';
const $=id=>document.getElementById(id);
const menus=['Dashboard','School Profile','Students','Teachers','Non-Teaching Staff','Transport & Routes','Infrastructure & Assets','Class & Section Setup','Attendance','Fees','Expenses & Budget','Exams & Marks','Report Cards','Homework & Notices','Parent Messages','AI Teacher Tools','Opportunity Desk','Growth Passport','School Quality Score','Contact & Support','Settings','Parents App','Teachers Online Access','Smart Tools'];
const available=new Set(['Dashboard','School Profile','Students','Teachers','Non-Teaching Staff','Class & Section Setup','Attendance','Fees','Homework & Notices','Settings','Smart Tools','Parents App','Teachers Online Access']);
const state={session:null,me:null,school:null,authUserId:null,offlineReadOnly:false,classes:[],students:[],formerStudents:[],staff:[],fees:[],attendance:[],notices:[],extra:[]};
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
 if(state.offlineReadOnly)throw Error('Offline copy is read-only. Reconnect and sign in before editing records.');
 const jwt=await token();
 const r=await fetch(BASE+'/rest/v1/'+path,{method:options.method||'GET',headers:{apikey:KEY,Authorization:'Bearer '+jwt,'content-type':'application/json',...(options.method?{'Prefer':'return=representation'}:{})},body:options.body?JSON.stringify(options.body):undefined,cache:'no-store'});
 return parse(r);
}
const filt=(tbl,params)=>tbl+'?'+new URLSearchParams(params).toString();
const inSchool=(table,select='*',more={})=>req(filt(table,{select,institution_id:'eq.'+state.me.institution_id,...more}));
const allSchool=(table,select='*',more={})=>window.BrightNexaSchoolAdmin.allPages(inSchool,table,select,more);
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
    desc.textContent='Real student register. Edit existing records or archive a student without deleting their attendance or fee history.';body.append(desc);
    const all=[...state.students,...state.formerStudents];
    const form=node('form');form.className='form';form.id='addStudent';
    form.innerHTML='<label>Student name<input name="name" required minlength="2" maxlength="180"></label><label>Admission number<input name="admission" required maxlength="60"></label><label>Date of birth<input name="dob" type="date"></label><label>Class<select name="class_id" required></select></label><label>Status<select name="status"><option value="active">Active</option><option value="archived">Archived</option><option value="transferred">Transferred</option><option value="graduated">Graduated</option></select></label><button class="primary" type="submit">Add student</button>';
    const sel=form.elements.class_id;sel.append(new Option('Choose class',''));
    state.classes.forEach(c=>sel.append(new Option(c.name+' '+(c.section||''),c.id)));
    const saveButton=form.querySelector('button[type="submit"]'),cancel=node('button','Cancel edit');cancel.type='button';cancel.hidden=true;form.append(cancel);
    let editing=null;
    function resetEdit(){editing=null;form.reset();saveButton.textContent='Add student';cancel.hidden=true}
    cancel.addEventListener('click',resetEdit);
    form.addEventListener('submit',async ev=>{
      ev.preventDefault();
      let input;
      try {
        input=window.BrightNexaSchoolAdmin.studentInput({
          name:form.elements.name.value,admission_number:form.elements.admission.value,
          dob:form.elements.dob.value,class_id:sel.value,status:form.elements.status.value
        },state.classes,all,editing?.id);
      }catch(e){return error(e)}
      saveButton.disabled=true;
      try{
        if(editing){
          const payload={...input,updated_at:new Date().toISOString()};
          const rows=await req(filt('school_students',{id:'eq.'+editing.id,institution_id:'eq.'+state.me.institution_id,updated_at:'eq.'+editing.updated_at}),{method:'PATCH',body:payload});
          window.BrightNexaSchoolAdmin.expectUpdated(rows,editing.id);
        } else {
          const rows=await req('school_students',{method:'POST',body:{...input,institution_id:state.me.institution_id}});
          if(!Array.isArray(rows)||rows.length!==1||!rows[0].id)throw Error('Cloud admission was not confirmed; refresh before retrying.');
        }
        resetEdit();await reload();open('Students');
      }catch(e){error(e)}finally{saveButton.disabled=false}
    });
    body.append(form);
    const wrap=node('div');wrap.className='data';const t=node('table'),head=node('thead'),tr=node('tr');
    ['Student','Admission','Class','DOB','Status','Actions'].forEach(k=>tr.append(node('th',k)));
    head.append(tr);t.append(head);const tbody=node('tbody');
    for(const student of all){
      const line=node('tr');
      [student.name,student.admission_number,state.classes.find(c=>c.id===student.class_id)?.name||'—',student.dob||'—',student.status].forEach(v=>line.append(node('td',v)));
      const actions=node('td'),edit=node('button','Edit'),archive=node('button',student.status==='active'?'Archive':'Reactivate');
      edit.type=archive.type='button';
      edit.addEventListener('click',()=>{
        editing=student;form.elements.name.value=student.name;form.elements.admission.value=student.admission_number;
        form.elements.dob.value=student.dob||'';sel.value=student.class_id||'';form.elements.status.value=student.status;
        saveButton.textContent='Save changes';cancel.hidden=false;form.scrollIntoView({behavior:'smooth',block:'start'});
      });
      archive.addEventListener('click',async()=>{
        const status=student.status==='active'?'archived':'active';
        if(!confirm((status==='archived'?'Archive ':'Reactivate ')+student.name+'? Their historical records will be preserved.'))return;
        archive.disabled=true;
        try{
          const rows=await req(filt('school_students',{id:'eq.'+student.id,institution_id:'eq.'+state.me.institution_id,updated_at:'eq.'+student.updated_at}),{method:'PATCH',body:{status,updated_at:new Date().toISOString()}});
          window.BrightNexaSchoolAdmin.expectUpdated(rows,student.id);
          await reload();open('Students');
        }catch(e){error(e);archive.disabled=false}
      });
      actions.append(edit,node('span',' '),archive);line.append(actions);tbody.append(line);
    }
    t.append(tbody);wrap.append(t);body.append(wrap);
    window.BrightNexaAdmissionsImport?.render({body,state,req,allSchool,reload,open,error});
  }else if(title==='Teachers'||title==='Non-Teaching Staff'){
    const want=title==='Teachers'?'teaching':'housekeeping';
    const rows=state.staff.filter(s=>s.staff_category===want);
    const form=node('form');form.className='form';
    form.innerHTML='<label>Full name<input name="display_name" required minlength="2" maxlength="150"></label><label>Designation<input name="designation" required maxlength="120"></label><label>Employment<select name="employment_type"><option value="permanent">Permanent</option><option value="contract">Contract</option><option value="part_time">Part-time</option><option value="visiting">Visiting</option></select></label><label id="staffExtras"></label><button class="primary" type="submit">Save staff profile</button>';
    const extras=form.querySelector('#staffExtras');
    function renderEmployment(){
      const v=form.elements.employment_type.value;extras.replaceChildren();
      if(v==='contract')extras.innerHTML='Contract end date<input name="contract_end_on" type="date" required>';
      else if(v==='part_time')extras.innerHTML='Days/week<input name="days_per_week" type="number" min="1" max="7" required><input name="hours_per_day" type="number" min=".5" max="12" step=".5" placeholder="Hours/day" required>';
      else if(v==='visiting')extras.innerHTML='Visits/month<input name="visits_per_month" type="number" min="1" max="31" required>';
    }
    form.elements.employment_type.addEventListener('change',renderEmployment);
    const save=form.querySelector('button[type="submit"]'),cancel=node('button','Cancel edit');cancel.type='button';cancel.hidden=true;form.append(cancel);
    let editing=null;
    function resetEdit(){editing=null;form.reset();renderEmployment();save.textContent='Save staff profile';cancel.hidden=true}
    cancel.addEventListener('click',resetEdit);
    form.addEventListener('submit',async e=>{
      e.preventDefault();
      let input;
      try{input=window.BrightNexaSchoolAdmin.staffInput({
        id:editing?.id,display_name:form.elements.display_name.value,designation:form.elements.designation.value,
        employment_type:form.elements.employment_type.value,
        contract_end_on:form.elements.contract_end_on?.value,
        days_per_week:form.elements.days_per_week?.value,hours_per_day:form.elements.hours_per_day?.value,
        visits_per_month:form.elements.visits_per_month?.value
      },state.staff)}catch(err){return error(err)}
      save.disabled=true;
      try{
        if(editing){
          const rows=await req(filt('school_staff_profiles',{id:'eq.'+editing.id,institution_id:'eq.'+state.me.institution_id,updated_at:'eq.'+editing.updated_at}),{method:'PATCH',body:{...input,updated_at:new Date().toISOString()}});
          window.BrightNexaSchoolAdmin.expectUpdated(rows,editing.id);
        }else{
          const rows=await req('school_staff_profiles',{method:'POST',body:{...input,institution_id:state.me.institution_id,staff_category:want,is_seeded_test:false}});
          if(!Array.isArray(rows)||rows.length!==1||!rows[0].id)throw Error('Staff profile save not confirmed; refresh before retrying.');
        }
        resetEdit();await reload();open(title);
      }catch(err){error(err)}finally{save.disabled=false}
    });
    body.append(form);
    const wrap=node('div');wrap.className='data';const t=node('table'),h=node('tr');
    ['Name','Designation','Employment','Category','Actions'].forEach(k=>h.append(node('th',k)));
    const thead=node('thead');thead.append(h);t.append(thead);const tbody=node('tbody');
    for(const s of rows){
      const tr=node('tr');[s.display_name,s.designation||'—',s.employment_type||'—',s.staff_category].forEach(v=>tr.append(node('td',v)));
      const cell=node('td'),edit=node('button','Edit');edit.type='button';
      edit.addEventListener('click',()=>{
        editing=s;form.elements.display_name.value=s.display_name;form.elements.designation.value=s.designation;
        form.elements.employment_type.value=s.employment_type||'permanent';renderEmployment();
        if(form.elements.contract_end_on)form.elements.contract_end_on.value=s.contract_end_on||'';
        if(form.elements.days_per_week)form.elements.days_per_week.value=s.days_per_week||'';
        if(form.elements.hours_per_day)form.elements.hours_per_day.value=s.hours_per_day||'';
        if(form.elements.visits_per_month)form.elements.visits_per_month.value=s.visits_per_month||'';
        save.textContent='Update staff profile';cancel.hidden=false;form.scrollIntoView({behavior:'smooth',block:'start'});
      });
      cell.append(edit);tr.append(cell);tbody.append(tr);
    }
    t.append(tbody);wrap.append(t);body.append(wrap);
    desc.textContent='Staff profile changes do not create or revoke login access. Account permissions are managed separately.';body.append(desc,link('Invite staff and assign class rights','./index.html?view=roles'));
  }else if(title==='Class & Section Setup'){
   const form=node('form');form.className='form';
   form.innerHTML='<label>Class<select name="name" required></select></label><label>Section<input name="section" maxlength="12" required value="A"></label><label>Academic year<input name="academic_year" required value="2026-2027" pattern="[0-9]{4}-[0-9]{4}"></label><button class="primary" type="submit">Add class</button>';
   const sel=form.elements.name;sel.append(new Option('Choose class',''));
   for(const name of ['Nursery','LKG','UKG',...Array.from({length:12},(_,i)=>'Class '+(i+1))])sel.append(new Option(name,name));
   const save=form.querySelector('button[type="submit"]'),cancel=node('button','Cancel edit');cancel.type='button';cancel.hidden=true;form.append(cancel);
   let editing=null;
   function resetEdit(){editing=null;form.reset();save.textContent='Add class';cancel.hidden=true}
   cancel.addEventListener('click',resetEdit);
   form.addEventListener('submit',async e=>{e.preventDefault();
     const name=sel.value,section=form.elements.section.value.trim().toUpperCase(),academic_year=form.elements.academic_year.value.trim();
     const parts=academic_year.split('-').map(Number);
     if(!name||!section||section.length>12||!/^[0-9]{4}-[0-9]{4}$/.test(academic_year)||parts[1]!==parts[0]+1)return error(Error('Enter a valid class, section and consecutive academic year.'));
     if(state.classes.some(c=>c.id!==editing?.id&&c.name===name&&c.section===section&&c.academic_year===academic_year))return error(Error('Class section already exists.'));
     save.disabled=true;
     try{
       if(editing){
         const filters={id:'eq.'+editing.id,institution_id:'eq.'+state.me.institution_id,name:'eq.'+editing.name,section:'eq.'+editing.section,academic_year:'eq.'+editing.academic_year};
         const rows=await req(filt('school_classes',filters),{method:'PATCH',body:{name,section,academic_year}});
         window.BrightNexaSchoolAdmin.expectUpdated(rows,editing.id);
       }else{
         const rows=await req('school_classes',{method:'POST',body:{institution_id:state.me.institution_id,name,section,academic_year}});
         if(!Array.isArray(rows)||rows.length!==1||!rows[0].id)throw Error('Class save was not confirmed. Refresh before retrying.');
       }
       resetEdit();await reload();open(title);
     }catch(e){error(e)}finally{save.disabled=false}
   });body.append(form);
   const wrap=node('div');wrap.className='data';const t=node('table'),h=node('tr');
   ['Class','Section','Academic year','Active students','Actions'].forEach(x=>h.append(node('th',x)));
   const thead=node('thead');thead.append(h);t.append(thead);const tbody=node('tbody');
   for(const cl of state.classes){
     const tr=node('tr');
     [cl.name,cl.section,cl.academic_year,state.students.filter(s=>s.class_id===cl.id).length].forEach(x=>tr.append(node('td',x)));
     const cell=node('td'),edit=node('button','Edit');edit.type='button';
     edit.addEventListener('click',()=>{
       editing=cl;sel.value=cl.name;form.elements.section.value=cl.section;form.elements.academic_year.value=cl.academic_year;
       save.textContent='Save class changes';cancel.hidden=false;form.scrollIntoView({behavior:'smooth',block:'start'});
     });
     cell.append(edit);tr.append(cell);tbody.append(tr);
   }
   t.append(tbody);wrap.append(t);body.append(wrap);
   body.append(link('Manage class assignments and rights','./index.html?view=roles'));
  }else if(title==='Attendance'){
   desc.textContent='Mark individual attendance in the live school register.';body.append(desc);
   const form=node('form');form.className='form';
   form.innerHTML='<label>Student<select name="student_id" required></select></label><label>Date<input name="day" type="date" required></label><label>Status<select name="status"><option value="present">Present</option><option value="absent">Absent</option><option value="late">Late</option><option value="excused">Excused</option></select></label><button class="primary" type="submit">Save attendance</button>';
   const sel=form.elements.student_id;sel.append(new Option('Choose student',''));
   state.students.forEach(s=>sel.append(new Option(s.name+' · '+s.admission_number,s.id)));
   form.elements.day.value=new Date().toLocaleDateString('en-CA');
   form.addEventListener('submit',async ev=>{
     ev.preventDefault();
     const student=state.students.find(x=>x.id===sel.value),day=form.elements.day.value,status=form.elements.status.value;
     if(!student||!day) return error(Error('Select student and date.'));
     const b=form.querySelector('button');b.disabled=true;
     try{
       const prev=await inSchool('school_attendance','id',{student_id:'eq.'+student.id,day:'eq.'+day,limit:'1'});
       const row={institution_id:state.me.institution_id,student_id:student.id,class_id:student.class_id,day,status,recorded_by:state.me.id};
       if(prev.length){
         const result=await req(filt('school_attendance',{id:'eq.'+prev[0].id,institution_id:'eq.'+state.me.institution_id}),{method:'PATCH',body:row});
         window.BrightNexaSchoolAdmin.expectUpdated(result,prev[0].id);
       } else {
         const result=await req('school_attendance',{method:'POST',body:row});
         if(!Array.isArray(result)||result.length!==1||!result[0].id)throw Error('Attendance save was not confirmed. Refresh before retrying.');
       }
       await reload();open('Attendance');
     }catch(e){error(e)}finally{b.disabled=false}
   });body.append(form);
   body.append(table(['Date','Student','Status'],state.attendance.map(a=>[a.day,state.students.find(s=>s.id===a.student_id)?.name||'Student',a.status])));
   body.append(link('Mark full class attendance','./index.html?view=attendance'));
 }else if(title==='Fees'){
    const total=state.fees.reduce((sum,x)=>sum+(x.kind==='payment'?Number(x.amount_rupees):0),0);
    desc.textContent='Recorded payments total: ₹'+total.toLocaleString('en-IN')+'. Append-only fee entries from cloud records; every entry has a unique reference.';body.append(desc);
    const fee=window.BrightNexaFeeLedger;
    if(!fee){body.append(node('p','Fee safety module unavailable. Refresh before recording payments.'));return}
    const draft=fee.draft();
    const form=node('form');form.className='form';
    form.innerHTML='<label>Student<select name="student_id" required></select></label><label>Type<select name="kind"><option value="payment">Payment received</option><option value="charge">Fee charged</option></select></label><label>Amount (₹)<input type="number" name="amount" min="1" max="100000000" required></label><label>Description<input name="description" maxlength="250" placeholder="e.g. Tuition fee"></label><label>Receipt/reference (optional)<input name="reference" maxlength="100" placeholder="Auto-generated if blank"></label><button class="primary" type="submit">Save fee entry</button>';
    const sel=form.elements.student_id;sel.append(new Option('Choose student',''));state.students.forEach(s=>sel.append(new Option(s.name+' · '+s.admission_number,s.id)));
    const status=node('p');status.className='muted';status.setAttribute('role','status');
    form.addEventListener('submit',async ev=>{
      ev.preventDefault();
      const student=state.students.find(s=>s.id===sel.value),amt=Number(form.elements.amount.value);
      if(!student||!Number.isSafeInteger(amt)||amt<1||amt>100000000)return error(Error('Choose a student and valid whole-rupee amount.'));
      let payload;
      try{
        payload=draft.prepare({
          institution_id:state.me.institution_id,student_id:student.id,kind:form.elements.kind.value,
          amount_rupees:amt,description:form.elements.description.value,occurred_on:new Date().toLocaleDateString('en-CA'),created_by:state.me.id
        },form.elements.reference.value);
      }catch(e){return error(e)}
      const b=form.querySelector('button[type="submit"]');b.disabled=true;
      status.textContent='Checking cloud fee reference '+payload.reference+'…';
      try{
        const saved=await fee.save({
          payload,
          post:row=>req('school_fee_entries',{method:'POST',body:row}),
          find:reference=>inSchool('school_fee_entries','id,institution_id,student_id,kind,amount_rupees,occurred_on,reference',{reference:'eq.'+reference,limit:'2'})
        });
        draft.clear();
        status.textContent='Fee record confirmed: '+saved.record.reference;
        await reload();open('Fees');
      }catch(e){error(e);status.textContent=e.message}
      finally{b.disabled=false}
    });
    body.append(form,status);
    body.append(table(['Date','Student','Kind','Amount (₹)','Reference'],state.fees.map(f=>[f.occurred_on,[...state.students,...state.formerStudents].find(s=>s.id===f.student_id)?.name||'Student',f.kind,f.amount_rupees,f.reference||'—'])));
    body.append(link('Detailed fee and guardian operations','./school-operations.html'));
  }else if(title==='Homework & Notices'){
   const form=node('form');form.className='form';
   form.innerHTML='<label>Notice title<input name="title" minlength="3" maxlength="180" required></label><label>Message<input name="body" minlength="3" maxlength="2500" required></label><button class="primary" type="submit">Publish notice</button>';
   form.addEventListener('submit',async ev=>{ev.preventDefault();const title=form.elements.title.value.trim(),body=form.elements.body.value.trim();if(title.length<3||body.length<3)return error(Error('Enter notice title and message.'));
    const b=form.querySelector('button');b.disabled=true;try{await req('school_notices',{method:'POST',body:{institution_id:state.me.institution_id,title,body,created_by:state.me.id}});await reload();open('Homework & Notices')}catch(e){error(e)}finally{b.disabled=false}
   });body.append(form);
   body.append(table(['Notice','Message','Created'],state.notices.map(n=>[n.title,n.body,n.created_at?.slice(0,10)])));
   body.append(link('Homework management','./index.html?view=homework'));
 }else if(title==='Teachers Online Access'){location.assign('./index.html?view=roles')}
 else if(title==='Parents App'){location.assign('./parents-cloud.html')}
 else if(title==='Smart Tools'){location.assign('./smart-tools.html')}
 else if(title==='Settings'){body.append(link('Manage account and school roles','./index.html?view=roles'))}
 else if(window.BrightNexaOwnerExtra?.render({title,body,state,req,reload,open,error})){}
 else {
   desc.textContent='This module is not connected to the cloud database yet. Existing historical local demonstration functionality is not being presented as real school records.';body.append(desc);
 }
}
function open(name){
 active=name;view('dash',name==='Dashboard');view('section',name!=='Dashboard');
 $('heading').textContent=name==='Dashboard'?state.school.name:name;
 $('subtitle').textContent=name==='Dashboard'?'School operations from verified cloud records':state.school.name+' · '+name;
 document.querySelectorAll('#menu button').forEach(b=>b.setAttribute('aria-current',b.dataset.section===name?'page':'false'));
 if(name!=='Dashboard'){view('section',true);$('sectionTitle').textContent=name;renderSection(name)}
}
function updateCounts(){
 $('studentsCount').textContent=state.students.length;
 $('teachersCount').textContent=state.staff.filter(s=>s.staff_category==='teaching').length;
 $('classesCount').textContent=state.classes.length;
 $('feesCount').textContent='₹'+state.fees.filter(x=>x.kind==='payment').reduce((t,x)=>t+Number(x.amount_rupees),0).toLocaleString('en-IN');
}
function bindInterface(){
 renderMenu();
 document.querySelectorAll('[data-open]').forEach(b=>b.addEventListener('click',()=>open(b.dataset.open)));
 $('refresh').addEventListener('click',()=>{if(state.offlineReadOnly){location.assign('./index.html');return;}reload().catch(error)});
 $('logout').addEventListener('click',()=>{sessionStorage.removeItem(TOKEN);location.assign('./index.html')});
 window.BrightNexaOfflineUI?.attach(state);
 window.BrightNexaBackup?.attach({state,allSchool,error});
}
async function restoreOffline(){
 const recovered=await window.BrightNexaOfflineUI.restore();
 Object.assign(state,recovered.payload);
 state.authUserId=recovered.userId;
 state.offlineReadOnly=true;
 $('topSchool').textContent=$('sideSchool').textContent=state.school.name;
 bindInterface();updateCounts();open('Dashboard');
 view('message',true);$('message').classList.add('warn');
 $('message').textContent='Offline read-only copy (maximum 24 hours old). Data changes are blocked until internet and owner login are verified.';
}
async function reload(){
 $('message').classList.add('hidden');
 const [classes,allStudents,staff,fees,attendance,notices,extra]=await Promise.all([
  allSchool('school_classes','id,name,section,academic_year'),
  allSchool('school_students','id,name,admission_number,class_id,status,dob,updated_at'),
  allSchool('school_staff_profiles','id,display_name,designation,employment_type,staff_category,contract_end_on,days_per_week,hours_per_day,visits_per_month,updated_at'),
  allSchool('school_fee_entries','id,student_id,kind,amount_rupees,description,reference,occurred_on'),
  inSchool('school_attendance','id,student_id,day,status',{order:'day.desc,id.asc',limit:'200'}),
  inSchool('school_notices','id,title,body,created_at',{order:'created_at.desc,id.asc',limit:'100'}),
  allSchool('school_module_records','id,module,title,details,created_at')
 ]);
 const students=allStudents.filter(s=>s.status==='active');
 const formerStudents=allStudents.filter(s=>s.status!=='active');
 Object.assign(state,{classes,students,formerStudents,staff,fees,attendance,notices,extra});
 updateCounts();
 try {await window.BrightNexaOfflineUI?.save(state)}catch(e){const status=$('localStatus');if(status)status.textContent='Offline copy not saved: '+e.message;}
 if(active!=='Dashboard')renderSection(active);
}
async function start(){
 try{
  state.session=JSON.parse(sessionStorage.getItem(TOKEN)||'null');
  if(!state.session?.access_token){if(!navigator.onLine){await restoreOffline();return;}location.replace('./index.html');return}
  const jwt=await token();
  const identity=await parse(await fetch(BASE+'/auth/v1/user',{headers:{apikey:KEY,Authorization:'Bearer '+jwt},cache:'no-store'}));
  state.authUserId=identity.id;
  const members=await req(filt('school_users',{select:'id,institution_id,role,status',auth_user_id:'eq.'+identity.id,status:'eq.active'}));
  state.me=members.find(x=>x.role==='school_admin');
  if(!state.me)throw Error('Owner account required. Please log in as school administrator.');
  const schools=await req(filt('institutions',{select:'id,name,status',id:'eq.'+state.me.institution_id}));
  state.school=schools.find(x=>['active','trial'].includes(x.status));
  if(!state.school)throw Error('School is not active.');
  $('topSchool').textContent=$('sideSchool').textContent=state.school.name;
  bindInterface();
  await reload();open('Dashboard');
 }catch(e){
   if(!state.offlineReadOnly && (!navigator.onLine || /Failed to fetch|NetworkError|Load failed|fetch failed/i.test(String(e?.message||e)))){
     try {await restoreOffline();return;}catch(offlineError){error(offlineError);}
   }else error(e);
   $('subtitle').textContent='Cloud records are unavailable';
 }
}
start();
})();