/* Bright Nexa timetable: Supabase is the only authoritative source. */
(()=>{'use strict';
const BASE='https://mrfvbwmyxndrakskqyas.supabase.co';
const APIKEY='sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT';
const TOKEN_KEY='bn_school_staff_session_v1';
const SCHOOL_KEY='bn_school_staff_selected_school_v1';
const $=id=>document.getElementById(id);
const DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const SUGGESTED=['English','Mathematics','Hindi','Science','Social Science','Computer Science','Physical Education','Art','Music','Sanskrit','EVS','General Knowledge'];
const state={session:null,schools:[],school:null,classes:[],staff:[],assignments:[],periods:[],slots:[],publications:[],edit:null};
function show(id,yes){$(id).classList.toggle('hidden',!yes)}
function notice(message,error=false){const el=$('status');el.textContent=message;el.classList.toggle('error',error)}
function select(el,rows,label){const current=el.value;el.replaceChildren();
 for(const row of rows){const option=document.createElement('option');option.value=row.value;option.textContent=label(row);el.append(option);}
 if([...el.options].some(o=>o.value===current))el.value=current;
}
function query(params){return new URLSearchParams(params).toString()}
function eq(v){return 'eq.'+v}
function key(c){return String(c||'').trim().toLowerCase()}
async function response(res){let body;try{body=await res.json()}catch(_){body={}}
 if(!res.ok)throw Error(body.message||body.error_description||body.error||'Cloud request was denied');
 return body}
async function ensureToken(){
 const s=state.session;
 if(!s?.access_token)throw Error('Please sign in to the School Staff Portal first.');
 if(Number(s.expires_at||0)>Date.now()/1000+90)return;
 if(!s.refresh_token)throw Error('Your staff session has expired. Sign in again.');
 const next=await response(await fetch(BASE+'/auth/v1/token?grant_type=refresh_token',{
  method:'POST',cache:'no-store',headers:{apikey:APIKEY,'Content-Type':'application/json'},
  body:JSON.stringify({refresh_token:s.refresh_token})
 }));
 state.session={access_token:next.access_token,refresh_token:next.refresh_token,expires_at:Math.floor(Date.now()/1000)+Number(next.expires_in||3600)};
 sessionStorage.setItem(TOKEN_KEY,JSON.stringify(state.session));
}
async function request(path,{method='GET',body=null,prefer='return=representation',contentType='application/json'}={}){
 await ensureToken();
 const headers={apikey:APIKEY,Authorization:'Bearer '+state.session.access_token,Prefer:prefer};
 if(body!==null)headers['Content-Type']=contentType;
 const res=await fetch(BASE+'/rest/v1/'+path,{method,cache:'no-store',headers,body:body===null?undefined:JSON.stringify(body)});
 if(method==='DELETE'&&res.status===204)return [];
 return response(res);
}
async function adminIdentity(){
 const raw=sessionStorage.getItem(TOKEN_KEY);
 if(!raw)throw Error('Sign in to Teacher & Staff Login as School Admin first.');
 try{state.session=JSON.parse(raw)}catch(_){throw Error('Saved staff session invalid. Sign in again.');}
 await ensureToken();
 const identity=await response(await fetch(BASE+'/auth/v1/user',{headers:{apikey:APIKEY,Authorization:'Bearer '+state.session.access_token},cache:'no-store'}));
 const users=await request('school_users?'+query({select:'id,institution_id,auth_user_id,role,status,email,display_name',auth_user_id:eq(identity.id),role:eq('school_admin'),status:eq('active')}));
 if(!users.length)throw Error('School Administrator permission required to build timetables.');
 const permitted=[];
 for(const user of users){
  const schools=await request('institutions?'+query({select:'id,name,status',id:eq(user.institution_id)}));
  const school=schools.find(s=>['trial','active'].includes(s.status));
  if(school)permitted.push(school);
 }
 if(!permitted.length)throw Error('No active school is assigned to this administrator.');
 state.schools=permitted;
 const saved=sessionStorage.getItem(SCHOOL_KEY);
 state.school=permitted.find(x=>x.id===saved)||permitted[0];
 select($('school'),permitted.map(x=>({value:x.id,name:x.name})),x=>x.name);
 $('school').value=state.school.id;
 show('adminApp',true);show('periodSetup',true);
}
async function load(){
 if(!state.school)return;
 notice('Loading authorized timetable…');
 const id=state.school.id,inst=eq(id);
 const [classes,staff,assignments,periods,slots,publications]=await Promise.all([
  request('school_classes?'+query({select:'id,name,section,academic_year,institution_id',institution_id:inst,order:'name.asc',limit:'500'})),
  request('school_users?'+query({select:'id,display_name,email,role,status,institution_id',institution_id:inst,role:eq('teacher'),status:eq('active'),limit:'500'})),
  request('school_teacher_assignments?'+query({select:'id,school_user_id,class_id,assignment_type,subject,active',institution_id:inst,active:eq('true'),limit:'1500'})),
  request('school_timetable_periods?'+query({select:'*',institution_id:inst,order:'weekday.asc,period_no.asc',limit:'100'})),
  request('school_timetable_slots?'+query({select:'*',institution_id:inst,limit:'5000'})),
  request('school_timetable_publications?'+query({select:'*',institution_id:inst,limit:'500'}))
 ]);
 Object.assign(state,{classes,staff,assignments,periods,slots,publications});
 select($('class'),classes.map(c=>({value:c.id,label:[c.name,c.section,c.academic_year].filter(Boolean).join(' · ')})),x=>x.label);
 select($('teacher'),staff.map(t=>({value:t.id,label:t.display_name||t.email||'Teacher'})),x=>x.label);
 if(!classes.length){notice('No classes exist. Create Class & Section first, then return to Timetable.',true);return;}
 notice('Timetable loaded. Nothing is published until you select Publish.');
 render();
}
function selectedClass(){return $('class').value}
function periodsFor(day){return state.periods.filter(p=>p.weekday===day).sort((a,b)=>a.period_no-b.period_no)}
function slotFor(classId,period){return state.slots.find(s=>s.class_id===classId&&s.period_id===period.id)}
function teacherName(id){const t=state.staff.find(x=>x.id===id);return t?.display_name||t?.email||'Unassigned'}
function className(id){const c=state.classes.find(x=>x.id===id);return c?[c.name,c.section].filter(Boolean).join(' '):'Unknown class'}
function tval(value){return String(value||'').slice(0,5)}
function permittedTeacherIds(classId,subject){
 const target=key(subject);
 return new Set(state.assignments.filter(a=>a.active&&a.class_id===classId&&
  (a.assignment_type==='class_teacher'||(a.assignment_type==='subject_teacher'&&key(a.subject)===target)))
  .map(a=>a.school_user_id));
}
function updateTeacherSelect(preferred){
 const cls=selectedClass(),eligible=permittedTeacherIds(cls,$('subject').value);
 const teachers=state.staff.filter(t=>eligible.has(t.id));
 select($('assignedTeacher'),[{value:'',name:'No teacher selected (draft only)'},...teachers.map(t=>({value:t.id,name:t.display_name||t.email||'Assigned teacher'}))],x=>x.name);
 if(preferred&&teachers.some(t=>t.id===preferred))$('assignedTeacher').value=preferred;
}
function render(){
 const c=selectedClass();if(!c)return;
 const publication=state.publications.find(p=>p.class_id===c);
 $('publishState').textContent=publication?.published?'Published to student & parent portals. Editing a lesson will unpublish until reviewed again.':'Draft — students/parents cannot see this timetable until you publish it.';
 $('publish').disabled=state.periods.length===0;
 $('unpublish').disabled=!publication?.published;
 show('periodEditor',false);
 const grid=$('grid');grid.replaceChildren();
 const max=Math.max(0,...DAYS.map((_,i)=>periodsFor(i+1).length));
 for(let index=0;index<max;index++){
  const tr=document.createElement('tr');
  const head=document.createElement('th');head.scope='row';head.textContent='Period '+(index+1);tr.append(head);
  for(let d=1;d<=6;d++){
   const td=document.createElement('td'),p=periodsFor(d)[index];
   if(!p){tr.append(td);continue;}
   const slot=slotFor(c,p);
   const teacherView=$('viewMode').value==='teacher';
   const teacherId=$('teacher').value;
   const visible=teacherView?state.slots.find(s=>s.period_id===p.id&&s.teacher_user_id===teacherId):slot;
   const button=document.createElement('button');
   button.type='button';button.className='slot'+(p.kind==='lesson'&&visible?' saved':'')+(p.kind!=='lesson'?' break':'');
   const main=document.createElement('strong');
   const secondary=document.createElement('small');
   const duration=tval(p.starts_at)+' – '+tval(p.ends_at);
   const time=document.createElement('small');time.textContent=duration;
   if(p.kind!=='lesson'){main.textContent=p.label||p.kind.toUpperCase();secondary.textContent='Non-teaching';button.disabled=true;}
   else if(visible){main.textContent=visible.subject;secondary.textContent=teacherView?className(visible.class_id):teacherName(visible.teacher_user_id);if(visible.room)secondary.textContent+=' · '+visible.room;}
   else{main.textContent=teacherView?'Free':'＋ Assign subject';secondary.textContent='';}
   button.append(time,main,secondary);
   if(!teacherView&&p.kind==='lesson')button.addEventListener('click',()=>openSlot(p,slot));
   else button.disabled=true;
   td.append(button);tr.append(td);
  }
  grid.append(tr);
 }
 select($('editDay'),DAYS.map((name,i)=>({value:String(i+1),name})),x=>x.name);
 updatePeriodOptions();
}
function updatePeriodOptions(){
 const d=Number($('editDay').value||1);
 select($('editPeriod'),periodsFor(d).map(p=>({value:p.id,label:'Period '+p.period_no+' · '+tval(p.starts_at)+'-'+tval(p.ends_at)})),x=>x.label);
 fillPeriodEditor();
}
function fillPeriodEditor(){
 const p=state.periods.find(x=>x.id===$('editPeriod').value);
 if(!p)return;
 $('periodStart').value=tval(p.starts_at);$('periodEnd').value=tval(p.ends_at);
 $('periodKind').value=p.kind;$('periodLabel').value=p.label||'';
}
function openSlot(period,slot){
 state.edit={period,slot};
 $('editorTitle').textContent=DAYS[period.weekday-1]+' · Period '+period.period_no+' · '+tval(period.starts_at)+'–'+tval(period.ends_at)+' · '+className(selectedClass());
 $('subject').value=slot?.subject||'';$('room').value=slot?.room||'';
 updateTeacherSelect(slot?.teacher_user_id);
 $('removeSlot').disabled=!slot;
 show('periodEditor',true);
 $('periodEditor').scrollIntoView({behavior:'smooth',block:'nearest'});
}
async function execute(fn){
 const buttons=[...document.querySelectorAll('button')].filter(x=>!x.disabled);
 for(const b of buttons)b.disabled=true;
 try{await fn()}catch(e){notice(e.message||'Could not save timetable.',true)}
 finally{for(const b of buttons)b.disabled=false;}
}
function minute(text){const [h,m]=String(text).split(':').map(Number);return h*60+m}
function hhmm(number){return String(Math.floor(number/60)).padStart(2,'0')+':'+String(number%60).padStart(2,'0')}
async function setupPeriods(){
 if(state.periods.length)throw Error('Period structure already exists. Use the individual period editor below instead of resetting school periods.');
 const days=Number($('workDays').value),start=minute($('startTime').value),dur=Number($('periodMinutes').value),count=Number($('lessonCount').value);
 const after=Number($('breakAfter').value),breakLength=Number($('breakMinutes').value);
 if(!Number.isInteger(dur)||dur<20||dur>90||!Number.isInteger(count)||count<1||count>12||!Number.isInteger(start)||!Number.isInteger(days))throw Error('Check period setup values.');
 const created=[];
 for(let day=1;day<=days;day++){
  let current=start,number=0;
  for(let i=1;i<=count;i++){
   const end=current+dur;if(end>=1440)throw Error('Schedule must finish before midnight.');
   created.push({institution_id:state.school.id,weekday:day,period_no:++number,starts_at:hhmm(current),ends_at:hhmm(end),kind:'lesson',label:''});
   current=end;
   if(i===after&&breakLength>0&&i<count){
    created.push({institution_id:state.school.id,weekday:day,period_no:++number,starts_at:hhmm(current),ends_at:hhmm(current+breakLength),kind:'break',label:'Lunch / Break'});
    current+=breakLength;
   }
  }
 }
 await request('school_timetable_periods',{method:'POST',body:created});
 await load();notice('Period structure created. Assign teachers and subjects, then publish each class.');
}
async function savePeriod(){
 const p=state.periods.find(x=>x.id===$('editPeriod').value);
 if(!p)throw Error('Choose a period.');
 const a=$('periodStart').value,b=$('periodEnd').value;
 if(!a||!b||a>=b)throw Error('End time must be later than start time.');
 await request('school_timetable_periods?'+query({id:eq(p.id),institution_id:eq(state.school.id)}),{
  method:'PATCH',body:{starts_at:a,ends_at:b,kind:$('periodKind').value,label:$('periodLabel').value.trim()}
 });
 await load();notice('Period updated. Existing class timetables require publishing again.');
}
async function saveSlot(){
 const edit=state.edit;if(!edit)throw Error('Choose a period first.');
 const subject=$('subject').value.trim(),teacher=$('assignedTeacher').value;
 if(!subject||subject.length>90)throw Error('Subject is required (up to 90 characters).');
 if(teacher&&!permittedTeacherIds(selectedClass(),subject).has(teacher))throw Error('Teacher must be assigned to this class and subject in Staff Roles & Permissions.');
 const payload={subject,teacher_user_id:teacher||null,room:$('room').value.trim()||null};
 if(edit.slot){
  await request('school_timetable_slots?'+query({id:eq(edit.slot.id),institution_id:eq(state.school.id)}),{method:'PATCH',body:payload});
 }else{
  await request('school_timetable_slots',{method:'POST',
   body:{...payload,institution_id:state.school.id,class_id:selectedClass(),period_id:edit.period.id}});
 }
 await load();notice('Lesson saved as draft. Check clashes and publish when ready.');
}
async function removeSlot(){
 if(!state.edit?.slot)return;
 if(!confirm('Remove this lesson? The class timetable will become unpublished until reapproved.'))return;
 await request('school_timetable_slots?'+query({id:eq(state.edit.slot.id),institution_id:eq(state.school.id)}),{method:'DELETE',prefer:'return=minimal'});
 await load();notice('Lesson removed; timetable remains unpublished until approved again.');
}
async function publish(value){
 const c=selectedClass();if(!c)throw Error('Select a class.');
 const slots=state.slots.filter(x=>x.class_id===c);
 if(value&&!slots.length)throw Error('Assign lessons before publishing.');
 if(value&&slots.some(x=>!x.teacher_user_id))throw Error('Assign a verified teacher to every lesson before publishing.');
 const existing=state.publications.find(x=>x.class_id===c);
 if(existing)await request('school_timetable_publications?'+query({institution_id:eq(state.school.id),class_id:eq(c)}),{method:'PATCH',body:{published:value}});
 else await request('school_timetable_publications',{method:'POST',body:{institution_id:state.school.id,class_id:c,published:value}});
 await load();notice(value?'Published! Student and parent portals can refresh the timetable.':'Unpublished. Students and parents will no longer see this schedule.');
}
$('school').addEventListener('change',()=>execute(async()=>{state.school=state.schools.find(x=>x.id===$('school').value);sessionStorage.setItem(SCHOOL_KEY,state.school.id);await load()}));
$('class').addEventListener('change',render);
$('teacher').addEventListener('change',render);
$('viewMode').addEventListener('change',()=>{show('teacherFilter',$('viewMode').value==='teacher');render()});
$('refresh').addEventListener('click',()=>execute(load));
$('print').addEventListener('click',()=>window.print());
$('publish').addEventListener('click',()=>execute(()=>publish(true)));
$('unpublish').addEventListener('click',()=>execute(()=>publish(false)));
$('setupPeriods').addEventListener('click',()=>execute(setupPeriods));
$('editDay').addEventListener('change',updatePeriodOptions);
$('editPeriod').addEventListener('change',fillPeriodEditor);
$('savePeriod').addEventListener('click',()=>execute(savePeriod));
$('saveSlot').addEventListener('click',()=>execute(saveSlot));
$('removeSlot').addEventListener('click',()=>execute(removeSlot));
$('cancelSlot').addEventListener('click',()=>show('periodEditor',false));
$('subject').addEventListener('input',()=>updateTeacherSelect(null));
// Datalist requires options, not SELECT: replace default list safely.
const datalist=$('suggestedSubjects');datalist.replaceChildren();
for(const name of SUGGESTED){const o=document.createElement('option');o.value=name;datalist.append(o);}
(async()=>{try{await adminIdentity();await load()}catch(e){notice(e.message||'School Administrator login required.',true)}})();
})();
