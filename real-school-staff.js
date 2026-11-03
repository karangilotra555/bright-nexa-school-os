/* Real school employment, role visibility and attendance. No browser-only demo data. */
(()=>{'use strict';
 const ROOT='https://mrfvbwmyxndrakskqyas.supabase.co';
 const KEY='sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT';
 const TOKEN='bn_school_staff_session_v1';
 const $=id=>document.getElementById(id);
 const choices=(id,items,label)=>{
  const select=$(id);select.replaceChildren();
  const empty=document.createElement('option');empty.value='';empty.textContent='Select invited staff';
  select.append(empty);
  for(const item of items){const o=document.createElement('option');o.value=item.id;o.textContent=label(item);select.append(o)}
 };
 const cell=(row,value)=>{const td=document.createElement('td');td.textContent=String(value==null?'':value);row.append(td)};
 const eq=id=>'eq.'+id;
 const qs=o=>Object.entries(o).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
 const humanType={permanent:'Permanent',contract:'Contract',part_time:'Part-time',visiting:'Visiting'};
 let session=null,me=null,staff=[],profiles=[],assignments=[],students=[],classes=[];
 function note(message,error=false){const s=$('status');s.textContent=message;s.className='status'+(error?' error':'');s.classList.remove('hidden')}
 function hide(id,on){$(id).classList.toggle('hidden',!on)}
 async function parse(res){
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(data.message||data.error_description||data.error||'Cloud request failed');
  return data;
 }
 async function ensure(){
  if(!session?.access_token)throw Error('Sign in using verified school login first.');
  if(session.expires_at>Date.now()/1000+90)return;
  if(!session.refresh_token)throw Error('School session expired. Sign in again.');
  const fresh=await parse(await fetch(ROOT+'/auth/v1/token?grant_type=refresh_token',{method:'POST',
    headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})}));
  session={access_token:fresh.access_token,refresh_token:fresh.refresh_token,
   expires_at:Math.floor(Date.now()/1000)+(Number(fresh.expires_in)||3600)};
  sessionStorage.setItem(TOKEN,JSON.stringify(session));
 }
 async function api(table,filters={},method='GET',body){
  await ensure();
  const headers={apikey:KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json',
    Prefer:method==='POST'?'return=representation':'return=minimal'};
  return parse(await fetch(ROOT+'/rest/v1/'+table+'?'+qs(filters),
     {method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'}));
 }
 const activeStaff=()=>staff.filter(u=>u.status==='active'&&u.role!=='school_admin');
 const profileFor=id=>profiles.find(p=>p.school_user_id===id);
 const staffTitle=u=>profileFor(u.id)?.display_name||u.email;
 function fieldVisibility(){
  const type=$('staffEmploymentType').value;
  hide('staffContractFields',type==='contract');
  hide('staffPartTimeFields',type==='part_time');
  hide('staffVisitingFields',type==='visiting');
  $('staffContractEnd').required=type==='contract';
  $('staffDaysWeek').required=$('staffHoursDay').required=type==='part_time';
  $('staffVisitsMonth').required=type==='visiting';
 }
 function selectedProfile(){
  const u=activeStaff().find(x=>x.id===$('staffProfileUser').value);
  const p=u&&profileFor(u.id);
  $('staffDisplayName').value=p?.display_name||u?.email?.split('@')[0]||'';
  $('staffDesignation').value=p?.designation||'';
  $('staffEmploymentType').value=p?.employment_type||'permanent';
  $('staffContractEnd').value=p?.contract_end_on||'';
  $('staffDaysWeek').value=p?.days_per_week??'';
  $('staffHoursDay').value=p?.hours_per_day??'';
  $('staffVisitsMonth').value=p?.visits_per_month??'';
  $('staffNotes').value=p?.notes||'';
  fieldVisibility();
 }
 function staffDirectory(){
  choices('staffProfileUser',activeStaff(),u=>u.email+' · '+u.role);
  choices('staffAttendanceMember',activeStaff(),u=>u.email+' · '+u.role);
  const tbody=$('staffDirectoryRows');tbody.replaceChildren();
  for(const u of activeStaff()){
   const p=profileFor(u.id),a=assignments.filter(x=>x.school_user_id===u.id&&x.active);
   const flags=a.map(item=>{
     const c=classes.find(x=>x.id===item.class_id);
     const permissions=['roster','attendance','homework','marks'].filter((_,i)=>
       [item.can_view_roster,item.can_take_attendance,item.can_assign_homework,item.can_enter_marks][i]);
     return (c?c.name+' '+c.section:'Class')+' ('+permissions.join(', ')+')';
   }).join('; ');
   const row=document.createElement('tr');
   [staffTitle(u),u.role.replaceAll('_',' '),humanType[p?.employment_type]||'Not configured',
    flags||'No class permissions'].forEach(v=>cell(row,v));tbody.append(row);
  }
  if(!activeStaff().length){const row=document.createElement('tr');
   const td=document.createElement('td');td.colSpan=4;td.textContent='Invite teacher accounts first in Roles & Permissions on School Login.';row.append(td);tbody.append(row)}
  selectedProfile();
 }
 async function refreshStaff(){
  const id=eq(me.institution_id);
  [staff,profiles,assignments,students,classes]=await Promise.all([
   api('school_users',{select:'id,email,role,status,institution_id',institution_id:id,limit:'500'}),
   api('school_staff_profiles',{select:'id,school_user_id,display_name,designation,employment_type,contract_end_on,days_per_week,hours_per_day,visits_per_month,notes,institution_id',institution_id:id,limit:'500'}),
   api('school_teacher_assignments',{select:'school_user_id,class_id,active,can_view_roster,can_take_attendance,can_assign_homework,can_enter_marks',institution_id:id,limit:'1000'}),
   api('school_students',{select:'id,name,admission_number,class_id,status',institution_id:id,status:'eq.active',limit:'1000'}),
   api('school_classes',{select:'id,name,section',institution_id:id,limit:'500'})
  ]);
  staffDirectory();
 }
 function bounds(){
  const month=$('reportMonth').value;
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw Error('Choose a valid report month.');
  const [y,m]=month.split('-').map(Number);
  const end=new Date(Date.UTC(y,m,1)).toISOString().slice(0,10);
  return [month+'-01',end];
 }
 const tally=(rows,key,id)=>{
  const items=rows.filter(r=>r[key]===id);
  const v={marked:items.length,present:0,absent:0,late:0,leave:0,excused:0};
  for(const r of items)if(r.status in v)v[r.status]++;
  return v;
 };
 function reportLine(parent,values){
  const row=document.createElement('tr');for(const v of values)cell(row,v);parent.append(row);
 }
 async function reports(){
  const [start,end]=bounds(),tenant=eq(me.institution_id);
  const period='(day.gte.'+start+',day.lt.'+end+')';
  const [studentMarks,staffMarks]=await Promise.all([
   api('school_attendance',{select:'student_id,day,status',institution_id:tenant,and:period,limit:'10000'}),
   api('school_staff_attendance',{select:'school_user_id,day,status',institution_id:tenant,and:period,limit:'10000'})
  ]);
  const studentRows=$('studentReportRows');studentRows.replaceChildren();
  for(const s of students){
   const t=tally(studentMarks,'student_id',s.id),cls=classes.find(c=>c.id===s.class_id);
   reportLine(studentRows,[s.name+' · '+s.admission_number,cls?cls.name+' '+cls.section:'Unassigned',
    t.marked,t.present,t.absent,t.late,t.excused,t.marked?Math.round(100*t.present/t.marked)+'%':'Not marked']);
  }
  const staffRows=$('staffReportRows');staffRows.replaceChildren();
  for(const u of activeStaff()){
   const t=tally(staffMarks,'school_user_id',u.id);
   reportLine(staffRows,[staffTitle(u)+' · '+u.role,t.marked,t.present,t.absent,t.late,t.leave,
    t.marked?Math.round(100*t.present/t.marked)+'%':'Not marked']);
  }
  if(!students.length)reportLine(studentRows,['No students registered','—','—','—','—','—','—','—']);
  if(!activeStaff().length)reportLine(staffRows,['No invited staff','—','—','—','—','—','—']);
  $('attendanceReportSummary').textContent=$('reportMonth').value+': '+
    studentMarks.length+' student marks, '+staffMarks.length+' staff marks. No assumed absences.'+
    ((studentMarks.length===10000||staffMarks.length===10000)?' WARNING: result limit reached — totals may be incomplete.':'');
 }
 const bind=(id,task)=>{
  $(id).addEventListener('submit',async e=>{
    e.preventDefault();const b=e.currentTarget.querySelector('button[type=submit]');b.disabled=true;
    try{await task()}catch(err){note(err.message,true)}finally{b.disabled=false}
  });
 };
 bind('staffProfileForm',async()=>{
  const u=activeStaff().find(x=>x.id===$('staffProfileUser').value);
  if(!u)throw Error('Select an invited active teacher or staff member.');
  const type=$('staffEmploymentType').value,name=$('staffDisplayName').value.trim();
  if(name.length<2||name.length>150)throw Error('Name must be 2–150 characters.');
  if(!Object.hasOwn(humanType,type))throw Error('Choose employment type.');
  const end=$('staffContractEnd').value,days=Number($('staffDaysWeek').value),
   hours=Number($('staffHoursDay').value),visits=Number($('staffVisitsMonth').value);
  if(type==='contract'&&!end)throw Error('Contract end date required.');
  if(type==='part_time'&&(!Number.isInteger(days)||days<1||days>7||hours<.5||hours>12))
    throw Error('Part-time requires 1–7 days/week and 0.5–12 hours/day.');
  if(type==='visiting'&&(!Number.isInteger(visits)||visits<1||visits>31))
    throw Error('Visiting teachers require 1–31 visits per month.');
  const values={institution_id:me.institution_id,school_user_id:u.id,display_name:name,
    designation:$('staffDesignation').value.trim(),employment_type:type,
    contract_end_on:type==='contract'?end:null,days_per_week:type==='part_time'?days:null,
    hours_per_day:type==='part_time'?hours:null,visits_per_month:type==='visiting'?visits:null,
    notes:$('staffNotes').value.trim()};
  const old=profileFor(u.id);
  if(old)await api('school_staff_profiles',{id:eq(old.id),institution_id:eq(me.institution_id)},'PATCH',values);
  else await api('school_staff_profiles',{},'POST',values);
  await refreshStaff();note('Verified school staff profile saved. Class permissions are separate in Roles & Permissions.');
 });
 bind('staffAttendanceForm',async()=>{
  const u=activeStaff().find(x=>x.id===$('staffAttendanceMember').value);
  const day=$('staffAttendanceDate').value,status=$('staffAttendanceStatus').value;
  if(!u||!day||!['present','absent','late','leave'].includes(status))
    throw Error('Select a staff member, date and attendance status.');
  const existing=await api('school_staff_attendance',{select:'id',school_user_id:eq(u.id),
    institution_id:eq(me.institution_id),day:eq(day),limit:'1'});
  const row={institution_id:me.institution_id,school_user_id:u.id,day,status,recorded_by:me.id,
    notes:$('staffAttendanceNotes').value.trim()};
  if(existing.length)await api('school_staff_attendance',{id:eq(existing[0].id),institution_id:eq(me.institution_id)},'PATCH',row);
  else await api('school_staff_attendance',{},'POST',row);
  await reports();note('Staff attendance saved to real school records and report updated.');
 });
 $('staffProfileUser').addEventListener('change',selectedProfile);
 $('staffEmploymentType').addEventListener('change',fieldVisibility);
 $('refreshAttendanceReports').addEventListener('click',()=>reports().then(()=>note('Real reports refreshed.')).catch(e=>note(e.message,true)));
 const today=new Date().toISOString().slice(0,10);
 $('staffAttendanceDate').value=today;$('reportMonth').value=today.slice(0,7);
 async function init(){
  try{session=JSON.parse(sessionStorage.getItem(TOKEN)||'null')}catch{session=null}
  if(!session?.access_token)return;
  try{
   await ensure();
   const user=await parse(await fetch(ROOT+'/auth/v1/user',{headers:{apikey:KEY,Authorization:'Bearer '+session.access_token},cache:'no-store'}));
   const rows=await api('school_users',{select:'id,institution_id,role,status',
      auth_user_id:eq(user.id),status:'eq.active',limit:'1'});
   me=rows[0];
   if(!me||!['school_admin','principal'].includes(me.role))return;
   const schools=await api('institutions',{select:'id,status',id:eq(me.institution_id),limit:'1'});
   if(!schools.length||!['active','trial'].includes(schools[0].status))return;
   await refreshStaff();
   hide('staffSection',true);hide('attendanceReportSection',true);
   await reports();
  }catch(err){note('Staff reports unavailable: '+(err.message||'Permission error'),true)}
 }
 init();
})();
