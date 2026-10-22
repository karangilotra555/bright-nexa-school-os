/* Bright Nexa cloud teacher portal. Publishable key only; no admin secrets.
 * Supabase RLS is the actual authority; UI hiding alone grants no access.
 */
(() => {
  'use strict';
  const BASE='https://mrfvbwmyxndrakskqyas.supabase.co';
  const APIKEY='sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT';
  const TOKEN_KEY='bn_school_staff_session_v1';
  const ROLES=['school_admin','principal','teacher','accountant','receptionist','transport_staff'];
  const $=id=>document.getElementById(id);
  let session=null,me=null,identity=null,allClasses=[],allStudents=[],allHomework=[],allStaff=[],allAssignments=[];
  const values=v=>v==null?'':String(v);
  function notify(msg,isError=false){
    const e=$('status');e.textContent=msg;e.classList.remove('hidden','error','ok');e.classList.add(isError?'error':'ok');
  }
  function clearNotice(){ $('status').classList.add('hidden');$('status').textContent=''; }
  function put(id,value){$(id).textContent=values(value);}
  function dom(tag,text,cls){
    const e=document.createElement(tag); if(text!==undefined)e.textContent=values(text);if(cls)e.className=cls;return e;
  }
  function display(id,show){$(id).classList.toggle('hidden',!show);}
  function saveSession(next){
    session={access_token:next.access_token,refresh_token:next.refresh_token,expires_at:Math.floor(Date.now()/1000)+(Number(next.expires_in)||3600)};
    sessionStorage.setItem(TOKEN_KEY,JSON.stringify(session));
  }
  async function responseJson(res){
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data.message||data.msg||data.error_description||data.error||'Request denied by server');
    return data;
  }
  async function authRequest(path,body,method='POST'){
    return responseJson(await fetch(BASE+'/auth/v1/'+path,{
      method,headers:{'apikey':APIKEY,'Content-Type':'application/json'},
      body:JSON.stringify(body),cache:'no-store'
    }));
  }
  async function ensureToken(){
    if(!session||!session.access_token)throw new Error('Please log in.');
    if(session.expires_at>Date.now()/1000+90)return;
    if(!session.refresh_token){dropSession();throw new Error('Session expired. Log in again.');}
    const p=await authRequest('token?grant_type=refresh_token',{refresh_token:session.refresh_token});
    saveSession(p);
  }
  async function api(table,query='',method='GET',body=null,prefer='return=representation'){
    await ensureToken();
    const res=await fetch(BASE+'/rest/v1/'+table+(query?'?'+query:''),{
      method,headers:{'apikey':APIKEY,'Authorization':'Bearer '+session.access_token,
        'Content-Type':'application/json','Prefer':prefer},
      body:body===null?undefined:JSON.stringify(body),cache:'no-store'
    });
    return responseJson(res);
  }
  const query=params=>Object.entries(params).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
  const eq=x=>'eq.'+x;
  const isAdmin=()=>me?.role==='school_admin';
  const teacher=()=>me?.role==='teacher';
  const canAcademic=()=>['school_admin','principal','teacher'].includes(me?.role);
  const className=c=>c?c.name+' '+(c.section||'')+' ('+c.academic_year+')':'Unknown class';
  function clearChildren(e){e.replaceChildren();}
  function options(target,records,label){
    const s=$(target);s.replaceChildren();
    if(!records.length){s.append(dom('option','No available entries'));return}
    for(const row of records){const o=dom('option',label(row));o.value=row.id;s.append(o)}
  }
  function dropSession(){
    session=null;me=null;identity=null;allClasses=[];allStudents=[];allAssignments=[];allHomework=[];allStaff=[];
    sessionStorage.removeItem(TOKEN_KEY);
    display('portalSection',false);display('loginSection',true);display('logout',false);
    put('schoolLabel','Cloud-based school access');document.querySelector('#loginPassword').value='';
  }
  function tab(name){
    document.querySelectorAll('[data-view]').forEach(n=>n.classList.toggle('hidden',n.dataset.view!==name));
    document.querySelectorAll('[data-tab]').forEach(n=>n.classList.toggle('active',n.dataset.tab===name));
  }
  async function load(){
    await ensureToken();
    identity=await responseJson(await fetch(BASE+'/auth/v1/user',{headers:{
      apikey:APIKEY,Authorization:'Bearer '+session.access_token},cache:'no-store'}));
    const memberships=await api('school_users',query({select:'id,institution_id,auth_user_id,email,role,status',auth_user_id:eq(identity.id)}));
    me=memberships.find(x=>x.auth_user_id===identity.id&&x.status==='active')||null;
    if(!me){dropSession();notify('Your school has not activated this staff account. Ask the school administrator to invite you.',true);return}
    const schoolRows=await api('institutions',query({select:'id,name,status',id:eq(me.institution_id)}));
    const school=schoolRows[0];
    if(!school||!['active','trial'].includes(school.status)){
      dropSession();notify('Institution is inactive. Contact school administration.',true);return;
    }
    put('schoolLabel',school.name);
    put('membership',school.name+' · '+me.email+' · '+me.role.replaceAll('_',' '));
    put('hello',me.role==='teacher'?'Teacher workspace':'School staff workspace');
    put('rolePill',me.role.replaceAll('_',' ').toUpperCase());
    display('loginSection',false);display('portalSection',true);display('logout',true);
    display('adminTab',isAdmin());
    document.querySelector('[data-tab="attendance"]').classList.toggle('hidden',!canAcademic());
    document.querySelector('[data-tab="homework"]').classList.toggle('hidden',!canAcademic());
    await reload();tab('classes');
    clearNotice();
  }
  async function reload(){
    const institution_id=me.institution_id;
    const cQ=query({select:'id,institution_id,name,section,academic_year',institution_id:eq(institution_id),order:'name.asc',limit:'500'});
    const sQ=query({select:'id,name,admission_number,class_id,institution_id,status',institution_id:eq(institution_id),status:eq('active'),limit:'1000'});
    const aQ=query({select:'*',institution_id:eq(institution_id),limit:'1000'});
    const hQ=query({select:'*',institution_id:eq(institution_id),order:'created_at.desc',limit:'100'});
    [allClasses,allStudents,allAssignments,allHomework]=await Promise.all([
      api('school_classes',cQ),
      api('school_students',sQ),
      api('school_teacher_assignments',aQ),
      canAcademic()?api('school_homework',hQ):Promise.resolve([])
    ]);
    if(isAdmin())allStaff=await api('school_users',query({select:'id,auth_user_id,email,role,status,institution_id',institution_id:eq(institution_id),order:'email.asc',limit:'500'}));
    else allStaff=[];
    put('countClasses',allClasses.length);put('countStudents',allStudents.length);put('countHomework',allHomework.length);
    renderClasses();renderSelects();renderHomework();if(isAdmin())renderAdmin();
  }
  function renderClasses(){
    const root=$('classesList');clearChildren(root);
    if(!allClasses.length){root.append(dom('p','No classes are assigned to your account yet. Ask the school administrator.'));return}
    for(const c of allClasses){
      const count=allStudents.filter(s=>s.class_id===c.id).length;
      const line=dom('div',undefined,'rowlist');
      const left=dom('div');left.append(dom('strong',className(c)));
      left.append(dom('div',count+' accessible students','muted'));
      const assignments=allAssignments.filter(a=>a.class_id===c.id&&(isAdmin()||a.school_user_id===me.id));
      const flags=assignments.map(a=>a.assignment_type==='subject_teacher'?a.subject:'Class Teacher').join(', ');
      line.append(left,dom('span',flags||'School access','pill'));root.append(line);
    }
  }
  function writableClasses(action){
    if(me.role==='school_admin'||me.role==='principal')return allClasses;
    if(me.role!=='teacher')return [];
    return allClasses.filter(c=>allAssignments.some(a=>a.school_user_id===me.id&&a.class_id===c.id&&a.active&&a[action]));
  }
  function renderSelects(){
    options('attendanceClass',writableClasses('can_take_attendance'),className);
    options('homeworkClass',writableClasses('can_assign_homework'),className);
    const current=writableClasses('can_assign_homework')[0];
    if(current)fillSubject(current.id);
    if(isAdmin()){
      options('assignTeacher',allStaff.filter(s=>s.role==='teacher'&&s.status==='active'),s=>s.email);
      options('assignClass',allClasses,className);
      options('studentClass',allClasses,className);
    }
  }
  function fillSubject(classId){
    if(me.role!=='teacher')return;
    const a=allAssignments.filter(a=>a.school_user_id===me.id&&a.class_id===classId&&a.active&&a.can_assign_homework&&a.assignment_type==='subject_teacher');
    const classT=allAssignments.some(a=>a.school_user_id===me.id&&a.class_id===classId&&a.active&&a.can_assign_homework&&a.assignment_type==='class_teacher');
    if(a.length===1&&!classT){$('homeworkSubject').value=a[0].subject;$('homeworkSubject').readOnly=true}
    else{$('homeworkSubject').readOnly=false;$('homeworkSubject').value=''}
  }
  function renderHomework(){
    const root=$('homeworkList');root.replaceChildren();
    if(!allHomework.length){root.append(dom('p','No homework published yet.'));return}
    for(const h of allHomework.slice(0,25)){
      const c=allClasses.find(c=>c.id===h.class_id);
      const div=dom('div',undefined,'assignment');
      div.append(dom('strong',h.subject+' · '+h.title));
      div.append(dom('div',(c?className(c):'Class')+(h.due_on?' · Due '+h.due_on:''),'muted'));
      if(h.instructions)div.append(dom('p',h.instructions));
      root.append(div);
    }
  }
  function newSelect(vs,current){
    const sel=dom('select');
    for(const v of vs){const o=dom('option',v.replaceAll('_',' '));o.value=v;o.selected=v===current;sel.append(o)}
    return sel;
  }
  function renderAdmin(){
    const root=$('staffTable');root.replaceChildren();
    for(const staff of allStaff){
      const tr=dom('tr');const email=dom('td',staff.email);
      const role=dom('td');const roleSelect=newSelect(ROLES,staff.role);role.append(roleSelect);
      const status=dom('td');const statusSelect=newSelect(['active','disabled'],staff.status);status.append(statusSelect);
      if(staff.id===me.id){roleSelect.disabled=true;statusSelect.disabled=true}
      const action=dom('td');const save=dom('button','Save','ghost');
      if(staff.id===me.id)save.disabled=true;
      save.addEventListener('click',()=>run(async()=>{
        await api('school_users',query({id:eq(staff.id),institution_id:eq(me.institution_id)}),'PATCH',{role:roleSelect.value,status:statusSelect.value});
        await reload();notify('Staff permissions updated.');
      }));
      action.append(save);tr.append(email,role,status,action);root.append(tr);
    }
    const listing=$('assignmentsList');clearChildren(listing);
    for(const a of allAssignments){
      const c=allClasses.find(x=>x.id===a.class_id);
      const staff=allStaff.find(x=>x.id===a.school_user_id);
      const line=dom('div',undefined,'rowlist');const left=dom('div');
      left.append(dom('strong',(staff?.email||'Teacher')+' · '+(c?className(c):'Class')));
      const detail=(a.assignment_type==='subject_teacher'?a.subject+' · ':'Class teacher · ')+
        [a.can_view_roster?'Roster':'',a.can_take_attendance?'Attendance':'',a.can_assign_homework?'Homework':'',a.can_enter_marks?'Marks':''].filter(Boolean).join(', ');
      left.append(dom('div',detail,'muted'));line.append(left);
      const revoke=dom('button','Revoke','danger');
      revoke.addEventListener('click',()=>run(async()=>{
        await api('school_teacher_assignments',query({id:eq(a.id),institution_id:eq(me.institution_id)}),'DELETE',null,'return=minimal');
        await reload();notify('Assignment revoked.');
      }));
      line.append(revoke);listing.append(line);
    }
    if(!allAssignments.length)listing.append(dom('p','No teacher class assignments yet.'));
  }
  async function run(task){
    try{clearNotice();await task()}catch(e){notify(e.message||'Operation could not be completed.',true)}
  }
  $('loginForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
    const btn=e.submitter;btn.disabled=true;
    try{const tokens=await authRequest('token?grant_type=password',{email:$('loginEmail').value.trim(),password:$('loginPassword').value});saveSession(tokens);await load()}
    finally{btn.disabled=false}
  })});
  $('activateForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
    if(!session)throw Error('Invite session missing. Open your invitation email again.');
    const pw=$('newPassword').value;
    if(pw.length<12)throw Error('Password must contain at least 12 characters.');
    const data=await apiAuthUserUpdate(pw);
    if(!data.id)throw Error('Could not activate account.');
    display('activation',false);notify('Password set. You can now sign in.');
    await load();
  })});
  async function apiAuthUserUpdate(password){
    await ensureToken();
    return responseJson(await fetch(BASE+'/auth/v1/user',{method:'PUT',headers:{apikey:APIKEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({password})}));
  }
  $('logout').addEventListener('click',()=>{run(async()=>{
    if(session?.access_token)await fetch(BASE+'/auth/v1/logout',{method:'POST',headers:{apikey:APIKEY,Authorization:'Bearer '+session.access_token}}).catch(()=>{});
    dropSession();notify('Signed out.');
  })});
  $('reload').addEventListener('click',()=>run(async()=>{await reload();notify('Updated from cloud.')}));
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.tab)));
  $('homeworkClass').addEventListener('change',()=>fillSubject($('homeworkClass').value));
  $('loadAttendance').addEventListener('click',()=>run(loadAttendance));
  let currentRoster=[];
  async function loadAttendance(){
    const cls=$('attendanceClass').value,day=$('attendanceDate').value;
    if(!allClasses.some(c=>c.id===cls)||!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Choose class and date.');
    currentRoster=allStudents.filter(s=>s.class_id===cls);
    const records=await api('school_attendance',query({select:'student_id,status',class_id:eq(cls),day:eq(day),institution_id:eq(me.institution_id)}));
    const root=$('rosterList');clearChildren(root);
    for(const student of currentRoster){
      const line=dom('div',undefined,'rowlist');
      const left=dom('div');left.append(dom('strong',student.name));
      left.append(dom('small',student.admission_number,'muted'));
      const select=newSelect(['present','absent','late','excused'],records.find(r=>r.student_id===student.id)?.status||'present');
      select.dataset.studentId=student.id;select.dataset.classId=cls;
      line.append(left,select);root.append(line);
    }
    display('saveAttendance',currentRoster.length>0);
    if(!currentRoster.length)root.append(dom('p','No students are published for this class.'));
  }
  $('saveAttendance').addEventListener('click',()=>run(async()=>{
    const cls=$('attendanceClass').value,day=$('attendanceDate').value;
    const selects=[...$('rosterList').querySelectorAll('select[data-student-id]')];
    if(!selects.length)throw Error('Load the roster first.');
    if(selects.some(s=>s.dataset.classId!==cls))throw Error('Class changed. Reload roster.');
    const records=selects.map(s=>({student_id:s.dataset.studentId,class_id:cls,institution_id:me.institution_id,day,status:s.value,recorded_by:me.id}));
    await api('school_attendance','on_conflict=student_id%2Cday','POST',records,'resolution=merge-duplicates,return=minimal');
    notify('Attendance saved for '+records.length+' students.');
  }));
  $('homeworkForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
    const class_id=$('homeworkClass').value;
    if(!writableClasses('can_assign_homework').some(c=>c.id===class_id))throw Error('You are not assigned to this class.');
    const subject=$('homeworkSubject').value.trim(),title=$('homeworkTitle').value.trim();
    if(!subject||!title)throw Error('Subject and task are required.');
    await api('school_homework','','POST',{
      institution_id:me.institution_id,class_id,subject,title,
      instructions:$('homeworkInstructions').value.trim(),due_on:$('homeworkDate').value||null,created_by:me.id
    });
    e.target.reset();await reload();notify('Homework published.');
  })});
  $('inviteForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
    if(!isAdmin())throw Error('School admin required.');
    await ensureToken();
    const r=await responseJson(await fetch(BASE+'/functions/v1/school-invite-staff',{
      method:'POST',headers:{apikey:APIKEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},
      body:JSON.stringify({email:$('inviteEmail').value.trim(),role:$('inviteRole').value})
    }));
    e.target.reset();await reload();notify('Invitation requested for '+r.email+'. Check email delivery and Auth redirect settings.');
  })});
  $('classForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
    if(!isAdmin())throw Error('School admin required.');
    await api('school_classes','','POST',{institution_id:me.institution_id,
      name:$('className').value.trim(),section:$('classSection').value.trim(),academic_year:$('classYear').value.trim()});
    e.target.reset();await reload();notify('Class added.');
  })});
  $('assignmentForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
    if(!isAdmin())throw Error('School admin required.');
    const type=$('assignType').value;
    const subject=type==='subject_teacher'?$('assignSubject').value.trim():'';
    if(type==='subject_teacher'&&!subject)throw Error('Subject teacher must have a subject.');
    const rec={
      institution_id:me.institution_id,school_user_id:$('assignTeacher').value,class_id:$('assignClass').value,
      assignment_type:type,subject,active:true,
      can_view_roster:$('permRoster').checked,
      can_take_attendance:$('permAttendance').checked,
      can_assign_homework:$('permHomework').checked,
      can_enter_marks:$('permMarks').checked
    };
    if(!allStaff.some(s=>s.id===rec.school_user_id&&s.role==='teacher'))throw Error('Select an active teacher.');
    if(!allClasses.some(c=>c.id===rec.class_id))throw Error('Select an existing class.');
    await api('school_teacher_assignments','','POST',rec);
    await reload();notify('Teacher assignment saved.');
  })});
  $('studentForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
    if(!isAdmin())throw Error('School admin required.');
    await api('school_students','','POST',{institution_id:me.institution_id,
      class_id:$('studentClass').value,name:$('studentName').value.trim(),admission_number:$('studentAdm').value.trim(),status:'active'});
    e.target.reset();await reload();notify('Test student saved.');
  })});
  $('assignType').addEventListener('change',()=>{
    const subj=$('assignType').value==='subject_teacher';
    $('assignSubject').disabled=!subj;$('permAttendance').checked=!subj;
  });
  function dateLocal(){
    const d=new Date();const yyyy=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,'0');const day=String(d.getDate()).padStart(2,'0');
    return yyyy+'-'+m+'-'+day;
  }
  $('attendanceDate').value=dateLocal();
  // Only Supabase-issued authenticated invite fragments are processed; tokens
  // are immediately removed from address bar after parsing.
  try {
    const hash=new URLSearchParams(location.hash.replace(/^#/,''));
    if(hash.has('access_token')&&hash.has('refresh_token')){
      saveSession({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_in:parseInt(hash.get('expires_in')||'3600',10)});
      if(['invite','recovery'].includes(hash.get('type')))display('activation',true);
      history.replaceState(null,'',location.pathname+location.search);
    }else{const saved=sessionStorage.getItem(TOKEN_KEY);if(saved)session=JSON.parse(saved)}
  }catch{dropSession()}
  if(session&&!$('activation').classList.contains('hidden')){
    notify('Invitation verified. Set your new password to continue.');
  }else if(session)run(load);
})();