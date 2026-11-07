/* Bright Nexa timetable within the approved staff/ERP navigation.
 * All data goes through existing authenticated Supabase REST + RLS.
 */
(function(root){
'use strict';
const DAYS=['','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const fmt=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const minutes=v=>{if(!/^\d{2}:\d{2}$/.test(v||''))throw Error('Invalid school bell time');const [h,m]=v.split(':').map(Number);if(h>23||m>59)throw Error('Invalid bell time');return h*60+m;};
function buildBellSchedule({start='08:00',periods=8,duration=40,breakAfter=3,breakMinutes=15,lunchAfter=5,lunchMinutes=30,days=[1,2,3,4,5,6],year}){
 const count=Number(periods),dur=Number(duration);
 if(!Number.isInteger(count)||count<1||count>12||!Number.isInteger(dur)||dur<20||dur>90)throw Error('Choose 1–12 periods of 20–90 minutes each');
 const unique=[...new Set(days.map(Number))];if(!unique.length||unique.some(x=>!Number.isInteger(x)||x<1||x>6))throw Error('Select valid working days');
 const slots=[];
 for(const day of unique){
  let clock=minutes(start),index=0;
  function add(kind,label,len){if(clock+len>1440)throw Error('School day ends after midnight');slots.push({academic_year:year,weekday:day,slot_index:++index,kind,label,starts_at:fmt(clock)+':00',ends_at:fmt(clock+len)+':00'});clock+=len;}
  for(let p=1;p<=count;p++){
   add('period','Period '+p,dur);
   if(p===Number(breakAfter)&&p<count&&Number(breakMinutes)>0)add('break','Short break',Number(breakMinutes));
   if(p===Number(lunchAfter)&&p<count&&Number(lunchMinutes)>0&&Number(breakAfter)!==p)add('lunch','Lunch break',Number(lunchMinutes));
  }
 }
 return slots;
}
function autoFill({slots,drafts,published,assignments,targets,classId,schoolId,year}){
 const teaching=slots.filter(s=>s.kind==='period'&&s.academic_year===year).sort((a,b)=>a.weekday-b.weekday||a.slot_index-b.slot_index);
 const bySlot=new Map(drafts.filter(d=>d.class_id===classId).map(d=>[d.slot_id,d]));
 const allUsed=new Set([...drafts,...published].filter(d=>d.class_id!==classId&&d.teacher_user_id).map(d=>d.slot_id+'|'+d.teacher_user_id));
 const myAssignments=assignments.filter(a=>a.class_id===classId&&a.active&&a.assignment_type==='subject_teacher'&&a.subject&&a.school_user_id);
 const mapped=new Map(myAssignments.map(a=>[a.school_user_id+'|'+a.subject.toLowerCase(),a]));
 const todo=(targets||[]).map(t=>({...t,count:Number(t.count)})).filter(t=>t.count>0);
 if(!todo.length)throw Error('Enter subject-wise weekly periods after assigning teachers in Roles & Permissions.');
 for(const t of todo){
  if(!Number.isInteger(t.count)||t.count<1||t.count>72||!mapped.has(t.teacher_user_id+'|'+t.subject.toLowerCase()))
   throw Error('Choose only assigned subject teachers and valid weekly period counts.');
  t.remaining=t.count-bySlot.size&&0; // overwritten below with exact existing counts
  t.remaining=t.count-[...bySlot.values()].filter(d=>d.teacher_user_id===t.teacher_user_id&&d.subject.toLowerCase()===t.subject.toLowerCase()).length;
 }
 const empty=teaching.filter(s=>!bySlot.has(s.id));
 if(todo.reduce((n,t)=>n+Math.max(0,t.remaining),0)>empty.length)throw Error('Weekly subject periods exceed free teaching slots.');
 const lastByDay=new Map(),additions=[];
 for(const slot of empty){
  const eligible=todo.filter(t=>t.remaining>0&&!allUsed.has(slot.id+'|'+t.teacher_user_id));
  if(!eligible.length)continue;
  eligible.sort((a,b)=>{
   const dayKey=slot.weekday+':'+slot.slot_index;
   const aa=lastByDay.get(slot.weekday)===a.subject?1:0;
   const bb=lastByDay.get(slot.weekday)===b.subject?1:0;
   return (a.remaining-b.remaining)*-10 + (aa-bb)*3 || a.subject.localeCompare(b.subject);
  });
  const t=eligible[0];t.remaining--;lastByDay.set(slot.weekday,t.subject);
  additions.push({institution_id:schoolId,class_id:classId,slot_id:slot.id,academic_year:year,subject:t.subject,teacher_user_id:t.teacher_user_id,notes:''});
 }
 if(todo.some(t=>t.remaining>0))throw Error('Teachers already booked at too many periods; adjust weekly targets or assignments.');
 return additions;
}
const text=(el,value)=>{el.textContent=String(value??'');return el;};
function node(tag,value){const el=document.createElement(tag);if(value!==undefined)text(el,value);return el;}
function opt(select,value,label){const e=node('option',label);e.value=value;select.append(e);}
function title(sl){return sl.label+' · '+sl.starts_at.slice(0,5)+'–'+sl.ends_at.slice(0,5);}
function activate(ctx){
 const host=document.getElementById('schoolTimetableRoot');
 if(!host||!ctx?.me)return;
 const admin=ctx.me.role==='school_admin';
 const id=ctx.me.institution_id;
 const years=[...new Set(ctx.classes.map(c=>c.academic_year).filter(Boolean))].sort().reverse();
 if(!years.length){host.replaceChildren(node('p','Create a class and academic session first.'));return;}
 const oldState=host.__bnState||{};
 const st=host.__bnState={schoolId:id,year:years.includes(oldState.year)?oldState.year:years[0],day:oldState.day||1,
   classId:ctx.classes.some(c=>c.id===oldState.classId)?oldState.classId:ctx.classes[0]?.id,
   slots:[],drafts:[],published:[],version:(oldState.version||0)+1};
 const currentVersion=st.version;
 host.replaceChildren();
 const heading=node('h2','School Timetable');host.append(heading);
 host.append(node('p','Class & section weekly timetable • Bell timings • Subject teachers • Draft → Publish. All changes use Supabase.'));
 const controls=node('div');controls.className='formgrid two';
 const classWrap=node('div'),yearWrap=node('div');
 classWrap.append(node('label','Class / Section'));const classPick=node('select');classPick.id='bnTimeClass';
 ctx.classes.filter(c=>c.academic_year===st.year).forEach(c=>opt(classPick,c.id,c.name+' '+(c.section||'')+' ('+c.academic_year+')'));
 if(ctx.classes.some(c=>c.id===st.classId&&c.academic_year===st.year))classPick.value=st.classId;
 else st.classId=classPick.value;
 classWrap.append(classPick);
 yearWrap.append(node('label','Academic session'));const yearPick=node('select');years.forEach(y=>opt(yearPick,y,y));yearPick.value=st.year;yearWrap.append(yearPick);
 controls.append(classWrap,yearWrap);host.append(controls);
 const status=node('p','Loading Supabase timetable…');status.className='muted';status.setAttribute('role','status');host.append(status);
 const grid=node('div');grid.style.cssText='overflow:auto;max-width:100%;margin:12px 0';host.append(grid);
 const editor=node('div');editor.className='panel';host.append(editor);
 const current=()=>ctx.me.institution_id===id&&host.__bnState===st;
 const setStatus=(message,error=false)=>{status.textContent=message;status.style.color=error?'#b42337':'';if(ctx.notify)ctx.notify(message,error);};
 const qry=values=>ctx.query(values);
 const api=(table,q='',method='GET',body=null,prefer)=>ctx.api(table,q,method,body,prefer);
 async function fetchAll(){
  const filter={institution_id:ctx.eq(id),academic_year:ctx.eq(st.year),limit:'1000'};
  const [slots,published,drafts]=await Promise.all([
   api('school_timetable_slots',qry({...filter,order:'weekday.asc,slot_index.asc'})),
   api('school_timetable_published',qry({...filter,order:'slot_id.asc'})),
   admin?api('school_timetable_drafts',qry({...filter,order:'slot_id.asc'})):Promise.resolve([])
  ]);
  if(!current())return;
  st.slots=slots;st.published=published;st.drafts=drafts;
  render();
 }
 function render(){
  if(!current())return;
  grid.replaceChildren();editor.replaceChildren();
  const table=node('table');table.className='data-table';table.style.minWidth='820px';
  const head=node('thead'),row=node('tr');row.append(node('th','Slot'));
  for(let d=1;d<=6;d++)row.append(node('th',DAYS[d]));
  head.append(row);table.append(head);
  const body=node('tbody'),max=Math.max(0,...st.slots.map(s=>s.slot_index));
  for(let i=1;i<=max;i++){
   const tr=node('tr');tr.append(node('th',''+i));
   for(let d=1;d<=6;d++){
    const td=node('td');td.style.minWidth='125px';
    const sl=st.slots.find(s=>s.weekday===d&&s.slot_index===i);
    if(sl){
     const drafts=admin?st.drafts:st.published;
     const p=drafts.find(x=>x.class_id===st.classId&&x.slot_id===sl.id);
     const published=st.published.find(x=>x.class_id===st.classId&&x.slot_id===sl.id);
     td.append(node('small',title(sl)));
     if(sl.kind==='period'){
      td.append(node('div',p?.subject||'—'));
      const teacher=ctx.staff.find(u=>u.id===p?.teacher_user_id);
      if(teacher)td.append(node('small',teacher.display_name||teacher.email||'Assigned teacher'));
      if(admin&&p&&!published)td.append(node('small','Draft'));
      if(admin&&!p&&published)td.append(node('small','Published; unsaved draft'));
      if(admin){
       td.style.cursor='pointer';td.title='Click to edit this period';
       td.addEventListener('click',()=>{$('bnTimeSlot').value=sl.id;$('bnTimeSubject').value=p?.subject||'';$('bnTimeTeacher').value=p?.teacher_user_id||'';$('bnTimeSubject').focus();});
      }
     }else{td.append(node('strong',sl.label));td.style.background='#f1f5f9';}
    }else td.textContent='—';
    tr.append(td);
   }body.append(tr);
  }
  table.append(body);grid.append(table);
  setStatus(st.slots.length?('Loaded '+st.slots.length+' bell slots. '+st.published.filter(p=>p.class_id===st.classId).length+' published lessons.'):'No bell timings yet. Set up the school day first.');
  if(!admin)return;
  const teacherAssignments=ctx.assignments.filter(a=>a.class_id===st.classId&&a.active);
  const banner=node('p','1. Define school day → 2. Assign teachers (Roles & Permissions) → 3. Fill weekly periods → 4. Publish');
  banner.className='muted';editor.append(banner);
  const link=node('button','Manage Class / Subject Teachers');link.className='ghost';link.type='button';
  link.addEventListener('click',()=>ctx.openAssignments?.());editor.append(link);
  const schedule=node('details');schedule.style.marginTop='14px';schedule.append(node('summary','School bell timings / breaks'));
  const form=node('form');form.className='formgrid two';form.style.marginTop='12px';
  const fields=[['bnTimeStart','First period','time','08:00'],['bnTimePeriods','Periods each day','number','8'],
    ['bnTimeDuration','Minutes per period','number','40'],['bnTimeBreakAt','Short break after period','number','3'],
    ['bnTimeBreakLength','Short break (min)','number','15'],['bnTimeLunchAt','Lunch after period','number','5'],
    ['bnTimeLunchLength','Lunch duration (min)','number','30']];
  for(const [fid,label,type,defaultValue] of fields){const wrap=node('div');wrap.append(node('label',label));const inp=node('input');inp.id=fid;inp.type=type;inp.value=defaultValue;inp.required=true;inp.min=type==='number'?'0':undefined;wrap.append(inp);form.append(wrap);}
  const daysWrap=node('div');daysWrap.style.gridColumn='1/-1';daysWrap.append(node('label','Working days'));
  for(let d=1;d<=6;d++){const span=node('label');span.style.marginRight='14px';const check=node('input');check.type='checkbox';check.checked=true;check.dataset.weekday=String(d);span.append(check,document.createTextNode(' '+DAYS[d]));daysWrap.append(span);}form.append(daysWrap);
  const create=node('button','Create initial bell schedule');create.className='primary';create.type='submit';form.append(create);
  form.addEventListener('submit',e=>run(async()=>{
   e.preventDefault();
   if(st.slots.length)throw Error('Timings already exist. Existing timetable preserved; edit individual slots separately.');
   const rows=buildBellSchedule({start:$('bnTimeStart').value,periods:Number($('bnTimePeriods').value),duration:Number($('bnTimeDuration').value),
     breakAfter:Number($('bnTimeBreakAt').value),breakMinutes:Number($('bnTimeBreakLength').value),
     lunchAfter:Number($('bnTimeLunchAt').value),lunchMinutes:Number($('bnTimeLunchLength').value),
     days:[...daysWrap.querySelectorAll('input:checked')].map(c=>Number(c.dataset.weekday)),year:st.year
   }).map(r=>({...r,institution_id:id}));
   await api('school_timetable_slots','','POST',rows);
   await fetchAll();
  }));
  schedule.append(form);editor.append(schedule);
  const lesson=node('form');lesson.className='formgrid two';lesson.style.marginTop='18px';
  lesson.append(node('h3','Edit a weekly period'));
  const slotWrap=node('div');slotWrap.append(node('label','Day / Period'));
  const slotPick=node('select');slotPick.id='bnTimeSlot';
  st.slots.filter(s=>s.kind==='period').sort((a,b)=>a.weekday-b.weekday||a.slot_index-b.slot_index)
   .forEach(s=>opt(slotPick,s.id,DAYS[s.weekday]+' · '+title(s)));
  slotWrap.append(slotPick);lesson.append(slotWrap);
  const subjectWrap=node('div');subjectWrap.append(node('label','Subject'));
  const subjectInput=node('input');subjectInput.id='bnTimeSubject';subjectInput.required=true;subjectInput.maxLength=100;
  subjectInput.placeholder='English, Mathematics, Games…';subjectWrap.append(subjectInput);lesson.append(subjectWrap);
  const teacherWrap=node('div');teacherWrap.append(node('label','Assigned teacher'));
  const teacherPick=node('select');teacherPick.id='bnTimeTeacher';opt(teacherPick,'','Not assigned');
  for(const a of teacherAssignments){
   const u=ctx.staff.find(x=>x.id===a.school_user_id);
   if(!u||u.role!=='teacher'||u.status!=='active')continue;
   opt(teacherPick,a.school_user_id,(u.display_name||u.email)+' · '+(a.assignment_type==='class_teacher'?'Class Teacher':a.subject));
  }
  teacherWrap.append(teacherPick);lesson.append(teacherWrap);
  const button=node('button','Save draft period');button.type='submit';button.className='primary';lesson.append(button);
  lesson.addEventListener('submit',e=>run(async()=>{
   e.preventDefault();const slot=st.slots.find(x=>x.id===slotPick.value);
   if(!slot)throw Error('Select a teaching period.');
   const subject=subjectInput.value.trim(),teacher=teacherPick.value||null;
   if(!subject)throw Error('Enter a subject.');
   if(teacher&&!teacherAssignments.some(a=>a.school_user_id===teacher&&
      (a.assignment_type==='class_teacher'||a.subject.toLowerCase()===subject.toLowerCase())))
     throw Error('This teacher is not assigned to that subject and class.');
   const record={institution_id:id,class_id:st.classId,slot_id:slot.id,academic_year:st.year,subject,teacher_user_id:teacher};
   await api('school_timetable_drafts',qry({on_conflict:'institution_id,class_id,slot_id'}),'POST',[record],'resolution=merge-duplicates,return=representation');
   await fetchAll();
  }));
  const reset=node('button','Remove draft period');reset.type='button';reset.className='ghost';
  reset.addEventListener('click',()=>run(async()=>{
   if(!slotPick.value)throw Error('Choose a period.');
   await api('school_timetable_drafts',qry({institution_id:ctx.eq(id),class_id:ctx.eq(st.classId),slot_id:ctx.eq(slotPick.value)}),'DELETE',null,'return=minimal');
   await fetchAll();
  }));lesson.append(reset);editor.append(lesson);
  // No fake auto-generation: weekly loads must be explicitly provided by the
  // administrator. The generator only adds to empty draft slots.
  const auto=node('details');auto.style.marginTop='15px';auto.append(node('summary','Auto-fill empty slots (assigned subject teachers only)'));
  auto.append(node('p','Enter required weekly periods for each mapped subject. Existing draft periods will not be overwritten.'));
  const autoForm=node('form'),targetInputs=[];
  for(const a of teacherAssignments.filter(a=>a.assignment_type==='subject_teacher'&&a.subject)){
   const teacher=ctx.staff.find(x=>x.id===a.school_user_id);
   if(!teacher||teacher.status!=='active')continue;
   const label=node('label',a.subject+' · '+(teacher.display_name||teacher.email)+' weekly periods: ');
   const input=node('input');input.type='number';input.min='0';input.max='72';input.value='0';input.style.width='72px';label.append(input);autoForm.append(label);
   targetInputs.push({input,subject:a.subject,teacher_user_id:a.school_user_id});
  }
  if(!targetInputs.length)auto.append(node('p','Assign subject teachers first in Roles & Permissions.'));
  else{
   const fill=node('button','Generate missing draft periods');fill.type='submit';fill.className='ghost';autoForm.append(fill);
   autoForm.addEventListener('submit',e=>run(async()=>{
    e.preventDefault();
    const targets=targetInputs.map(t=>({...t,count:Number(t.input.value)}));
    const records=autoFill({slots:st.slots,drafts:st.drafts,published:st.published,assignments:teacherAssignments,targets,classId:st.classId,schoolId:id,year:st.year});
    if(!records.length)throw Error('No unfilled periods matched the weekly subject targets.');
    await api('school_timetable_drafts',qry({on_conflict:'institution_id,class_id,slot_id'}),'POST',records,'resolution=merge-duplicates,return=representation');
    await fetchAll();
   }));
   auto.append(autoForm);
  }editor.append(auto);
  const publish=node('button','Publish this class timetable to students, parents & teachers');publish.type='button';publish.className='primary';publish.style.marginTop='16px';
  publish.addEventListener('click',()=>run(async()=>{
   const count=st.drafts.filter(d=>d.class_id===st.classId).length;
   if(!count)throw Error('Save draft lessons before publishing.');
   if(!root.confirm('Publish '+count+' lessons for this class? Students and parents will see the approved timetable.'))return;
   const result=await api('rpc/bn_publish_class_timetable','','POST',{p_institution_id:id,p_class_id:st.classId,p_academic_year:st.year},'return=representation');
   await fetchAll();setStatus('Published '+result+' lesson slots to linked portals.');
  }));editor.append(publish);
 }
 async function run(task){try{await task()}catch(e){setStatus(e.message||'Could not update timetable',true);}}
 classPick.addEventListener('change',()=>{st.classId=classPick.value;render()});
 yearPick.addEventListener('change',()=>{st.year=yearPick.value;activate({...ctx,year:st.year})});
 run(fetchAll);
}
const api={DAYS,buildBellSchedule,autoFill,activate};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else root.BNTimetable=api;
})(typeof window!=='undefined'?window:globalThis);
