/* Role-verified school operations. RLS is the authority, not UI visibility. */
(() => {'use strict';
 const BASE='https://mrfvbwmyxndrakskqyas.supabase.co';
 const KEY='sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT';
 const STORE='bn_school_staff_session_v1';
 const $=id=>document.getElementById(id);
 let session=null,user=null,me=null,school=null,students=[],allGuardians=[],links=[];
 const show=(id,on)=>$(id).classList.toggle('hidden',!on);
 const word=(id,value)=>$(id).textContent=value==null?'':String(value);
 const node=(name,text)=>{const e=document.createElement(name);if(text!==undefined)e.textContent=String(text);return e};
 const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(Number(n)||0);
 const notify=(message,error=false)=>{
  const s=$('status');s.textContent=message;s.className='status'+(error?' error':'');
  s.classList.remove('hidden');s.scrollIntoView({block:'nearest'});
 };
 const query=o=>Object.entries(o).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
 const eq=v=>'eq.'+v;
 async function read(res){
  const body=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(body.message||body.msg||body.error_description||body.error||'School API error');
  return body;
 }
 function save(next){
  session={access_token:next.access_token,refresh_token:next.refresh_token,
   expires_at:Math.floor(Date.now()/1000)+(Number(next.expires_in)||3600)};
  sessionStorage.setItem(STORE,JSON.stringify(session));
 }
 async function ensure(){
  if(!session?.access_token)throw Error('Sign in at School Login first.');
  if(session.expires_at>Date.now()/1000+90)return;
  if(!session.refresh_token)throw Error('School session expired. Log in again.');
  const t=await read(await fetch(BASE+'/auth/v1/token?grant_type=refresh_token',{method:'POST',
   headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})}));
  save(t);
 }
 async function api(table,params={},method='GET',body=null){
  await ensure();
  return read(await fetch(BASE+'/rest/v1/'+table+'?'+query(params),{
   method,headers:{apikey:KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json',
    Prefer:method==='POST'?'return=representation':'return=minimal'},
   body:body==null?undefined:JSON.stringify(body),cache:'no-store'
  }));
 }
 const canFinance=()=>['school_admin','accountant'].includes(me.role);
 const canNotice=()=>['school_admin','principal'].includes(me.role);
 const canGuardian=()=>me.role==='school_admin';
 const studentName=id=>students.find(s=>s.id===id)?.name||'Unavailable student';
 function choices(id){
  const element=$(id);element.replaceChildren();
  if(!students.length){const option=node('option','No students assigned');option.value='';element.append(option);return}
  for(const student of students){const option=node('option',student.name+' · '+student.admission_number);option.value=student.id;element.append(option)}
 }
 const busy=(id,fn)=>async event=>{
  event.preventDefault();const button=$(id).querySelector('button[type="submit"]');button.disabled=true;
  try{await fn()}catch(e){notify(e.message||'Operation failed.',true)}finally{button.disabled=false}
 };
 async function load(){
  await ensure();
  user=await read(await fetch(BASE+'/auth/v1/user',{headers:{apikey:KEY,Authorization:'Bearer '+session.access_token}}));
  const memberships=await api('school_users',{select:'id,auth_user_id,institution_id,role,status',auth_user_id:eq(user.id),status:'eq.active',limit:'1'});
  me=memberships[0];
  if(!me||!['school_admin','principal','accountant'].includes(me.role))throw Error('This staff role cannot access Cloud Operations.');
  const found=await api('institutions',{select:'id,name,status',id:eq(me.institution_id),limit:'1'});
  school=found[0];if(!school||!['active','trial'].includes(school.status))throw Error('Institution is not active.');
  show('noAccess',false);show('opsApp',true);
  for(const id of ['financeSection','guardianSection','noticeSection','leavesSection'])show(id,false);
  show('financeSection',canFinance());show('guardianSection',canGuardian());show('noticeSection',canNotice());show('leavesSection',canNotice());
  word('schoolName',school.name);word('currentSchool',school.name);
  word('staffRole',me.role.replace('_',' ')+' · School status: '+school.status);
  students=await api('school_students',{select:'id,institution_id,name,admission_number,class_id,status',institution_id:eq(me.institution_id),status:'eq.active',order:'name.asc',limit:'1000'});
  if(canFinance()){choices('feeStudent');await loadFees()}
  if(canGuardian()){choices('guardianStudent');await loadGuardianLinks()}
  if(canNotice()){await Promise.all([loadNotices(),loadLeaves()])}
 }
 async function loadFees(){
  const entries=await api('school_fee_entries',{select:'id,student_id,kind,amount_rupees,description,reference,occurred_on',
   institution_id:eq(me.institution_id),order:'occurred_on.desc',limit:'1000'});
  const tbody=$('feeRows');tbody.replaceChildren();
  let total=0;
  for(const entry of entries){
   total+=entry.kind==='charge'?Number(entry.amount_rupees):-Number(entry.amount_rupees);
   const tr=node('tr');for(const txt of [entry.occurred_on,studentName(entry.student_id),entry.kind,money(entry.amount_rupees),entry.reference||entry.description||'—'])tr.append(node('td',txt));tbody.append(tr);
  }
  word('ledgerTotal',entries.length+' entries · All-school recorded balance '+money(total)+' (limited to most recent 1000 entries)');
 }
 async function loadGuardianLinks(){
  [allGuardians,links]=await Promise.all([
    api('school_guardians',{select:'id,email,status,institution_id',institution_id:eq(me.institution_id),limit:'1000'}),
    api('school_guardian_students',{select:'guardian_id,student_id,relationship,institution_id',institution_id:eq(me.institution_id),limit:'1000'})
  ]);
  const tbody=$('guardianRows');tbody.replaceChildren();
  for(const link of links){
   const guardian=allGuardians.find(g=>g.id===link.guardian_id);
   const tr=node('tr');tr.append(node('td',studentName(link.student_id)),node('td',guardian?.email||'—'),node('td',link.relationship));
   const td=node('td'),button=node('button','Revoke');button.type='button';button.className='danger';
   button.addEventListener('click',async()=>{
    if(!confirm('Revoke this guardian link? The parent will lose access to this student.'))return;
    button.disabled=true;
    try{await api('rpc/school_unlink_guardian',{},'POST',{p_student_id:link.student_id,p_guardian_id:link.guardian_id});await loadGuardianLinks();notify('Guardian access revoked.')}
    catch(e){notify(e.message,true)}finally{button.disabled=false}
   });td.append(button);tr.append(td);tbody.append(tr);
  }
  if(!links.length){const tr=node('tr'),td=node('td','No verified guardian links yet');td.colSpan=4;tr.append(td);tbody.append(tr)}
 }
 async function loadNotices(){
  const rows=await api('school_notices',{select:'title,body,created_at',institution_id:eq(me.institution_id),order:'created_at.desc',limit:'50'});
  const box=$('noticeRows');box.replaceChildren();
  for(const notice of rows){
   const el=node('div');el.style.cssText='border-bottom:1px solid #e1ebf4;padding:12px 0';
   el.append(node('strong',notice.title),node('p',notice.body),node('small',new Date(notice.created_at).toLocaleDateString('en-IN')));box.append(el);
  }
  if(!rows.length)box.append(node('p','No notices published.'));
 }
 async function loadLeaves(){
  const rows=await api('school_parent_leaves',{select:'id,student_id,from_on,to_on,reason,status',
   institution_id:eq(me.institution_id),order:'created_at.desc',limit:'100'});
  const tbody=$('leaveRows');tbody.replaceChildren();
  for(const leave of rows){
   const tr=node('tr');tr.append(node('td',studentName(leave.student_id)),node('td',leave.from_on+' – '+leave.to_on),
    node('td',leave.reason),node('td',leave.status));
   const td=node('td');
   if(leave.status==='pending'){
    for(const status of ['approved','rejected']){
     const b=node('button',status);b.type='button';b.className=status==='rejected'?'danger':'ghost';
     b.addEventListener('click',async()=>{
      b.disabled=true;
      try{await api('school_parent_leaves',{id:eq(leave.id),institution_id:eq(me.institution_id)},'PATCH',{status});
       await loadLeaves();notify('Leave '+status+'.')}
      catch(e){notify(e.message,true)}finally{b.disabled=false}
     });td.append(b);
    }
   }
   tr.append(td);tbody.append(tr);
  }
  if(!rows.length){const tr=node('tr'),td=node('td','No parent leave requests');td.colSpan=5;tr.append(td);tbody.append(tr)}
 }
 $('feeForm').addEventListener('submit',busy('feeForm',async()=>{
  if(!canFinance())throw Error('School finance permission required.');
  const chosen=students.find(s=>s.id===$('feeStudent').value);
  const kind=$('feeKind').value,amt=Number($('feeAmount').value),ref=$('feeReference').value.trim();
  if(!chosen||!['charge','payment'].includes(kind)||!Number.isSafeInteger(amt)||amt<1||amt>100000000)throw Error('Choose a student and valid whole-rupee amount.');
  if(ref.length>100)throw Error('Reference too long.');
  await api('school_fee_entries',{},'POST',{institution_id:me.institution_id,student_id:chosen.id,kind,
   amount_rupees:amt,occurred_on:$('feeDate').value||new Date().toISOString().slice(0,10),
   created_by:me.id,description:$('feeDescription').value.trim(),reference:ref||null});
  $('feeForm').reset();$('feeDate').value=new Date().toISOString().slice(0,10);await loadFees();notify('Fee ledger entry recorded securely.');
 }));
 $('guardianForm').addEventListener('submit',busy('guardianForm',async()=>{
  if(!canGuardian())throw Error('School admin permission required.');
  const student=students.find(s=>s.id===$('guardianStudent').value);
  const email=$('guardianEmail').value.trim().toLowerCase();
  if(!student||!email.includes('@'))throw Error('Select a student and verified guardian email.');
  await api('rpc/school_link_guardian',{},'POST',{p_student_id:student.id,p_email:email,p_relationship:$('guardianRelation').value});
  $('guardianForm').reset();await loadGuardianLinks();notify('Verified guardian linked to selected student.');
 }));
 $('noticeForm').addEventListener('submit',busy('noticeForm',async()=>{
  if(!canNotice())throw Error('School notice permission required.');
  const title=$('noticeTitle').value.trim(),body=$('noticeBody').value.trim();
  if(title.length<3||body.length<3)throw Error('Enter notice title and message.');
  await api('school_notices',{},'POST',{institution_id:me.institution_id,title,body,created_by:me.id});
  $('noticeForm').reset();await loadNotices();notify('Notice published to linked parents.');
 }));
 $('opsRefresh').addEventListener('click',()=>load().then(()=>notify('School cloud data refreshed.')).catch(e=>notify(e.message,true)));
 $('feeDate').value=new Date().toISOString().slice(0,10);
 try{session=JSON.parse(sessionStorage.getItem(STORE)||'null')}catch{session=null}
 if(!session?.access_token){show('noAccess',true);notify('Sign in at the main School Login first.',true)}
 else load().catch(e=>{show('opsApp',false);show('noAccess',true);notify(e.message,true)});
})();