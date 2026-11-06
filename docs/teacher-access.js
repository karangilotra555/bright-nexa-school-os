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
  let session=null,me=null,identity=null,allClasses=[],allStudents=[],allHomework=[],allStaff=[],allAssignments=[],allHomeworkFiles=[];
  const homeworkFiles=window.BNHomeworkFiles.create({base:BASE,key:APIKEY,token:async()=>{await ensureToken();return session?.access_token;}});
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
    sessionStorage.removeItem(TOKEN_KEY);invalidateRoster();clearProfileEditor();
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
    const myName=staffName(me);
    put('membership',school.name+' · '+(myName&&myName!==me.email?myName+' · ':'')+me.email+' · '+me.role.replaceAll('_',' '));
    if($('accountEmailDisplay'))put('accountEmailDisplay',me.email);
    if($('accountRoleDisplay'))put('accountRoleDisplay',me.role.replaceAll('_',' ').toUpperCase());
    if($('accountNameInput'))$('accountNameInput').value=(myName&&myName!==me.email)?myName:'';
    put('hello',me.role==='teacher'?'Teacher workspace':'School staff workspace');
    put('rolePill',me.role.replaceAll('_',' ').toUpperCase());
    display('loginSection',false);display('portalSection',true);display('logout',true);
    applyNavigationVisibility();
    await reload();
    const attendanceFirst=(me.role==='teacher'||new URLSearchParams(location.search).get('view')==='attendance')&&canAcademic();
    tab(attendanceFirst?'attendance':'classes');clearNotice();
    if(attendanceFirst){if(writableClasses('can_take_attendance').length)await loadAttendance();else notify('No attendance class is assigned yet. Ask your school admin to assign your class in Roles & Permissions.');}
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
    if(isAdmin()){
      allStaff=await api('school_users',query({select:'id,auth_user_id,email,role,status,institution_id',institution_id:eq(institution_id),order:'email.asc',limit:'500'}));
      try{
        const profs=await api('school_student_profiles',query({select:'student_id,details',institution_id:eq(institution_id),limit:'1000'}));
        const pMap=new Map((profs||[]).map(p=>[p.student_id,p.details||{}]));
        for(const s of allStudents){
          const d=pMap.get(s.id);
          if(d&&d.roll_number)s.roll_number=d.roll_number;
        }
      }catch(_){}
    }else allStaff=[];
    allHomeworkFiles=await homeworkFiles.list(allHomework.map(h=>h.id));
    put('countClasses',allClasses.length);put('countStudents',allStudents.length);put('countHomework',allHomework.length);
    invalidateRoster();renderClasses();renderSelects();renderHomework();if(isAdmin())renderAdmin();await loadNotices();
  }
  let readProfile=null,editingStudent=null,profileGeneration=0;
  function clearProfileEditor(){profileGeneration++;readProfile=null;editingStudent=null;display('studentProfileForm',false);$('profileEditor').replaceChildren();}
  $('profileClassFilter')?.addEventListener('change',()=>{renderProfileStudents();clearProfileEditor();});
  $('profileSearchInput')?.addEventListener('input',()=>{renderProfileStudents();clearProfileEditor();});
  $('profileStudent')?.addEventListener('change',()=>{updateSelectedStudentBadge();clearProfileEditor();});
  $('loadProfile').addEventListener('click',()=>run(async()=>{
    if(!isAdmin())throw Error('School admin required.');clearProfileEditor();const generation=profileGeneration,id=$('profileStudent').value;
    const student=allStudents.find(s=>s.id===id);if(!student)throw Error('Choose a student.');
    const rows=await api('school_student_profiles',query({select:'*',student_id:eq(id),institution_id:eq(me.institution_id)}));
    if(generation!==profileGeneration||$('profileStudent').value!==id)return;
    const core=await api('school_students',query({select:'id,name,dob',id:eq(id),institution_id:eq(me.institution_id)}));
    if(generation!==profileGeneration||$('profileStudent').value!==id||!core[0])return;
    editingStudent=id;readProfile=window.BNStudentProfile.editor($('profileEditor'),{student:{...core[0],profile:rows[0]||{}}});display('studentProfileForm',true);updateSelectedStudentBadge();
  }));
  $('studentProfileForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
    if(!isAdmin()||!readProfile||editingStudent!==$('profileStudent').value)throw Error('Load the student profile first.');
    const button=$('saveProfile');if(button.disabled)return;const payload=readProfile();button.disabled=true;
    try{
      await api('rpc/school_save_student_profile','','POST',{p_student_id:editingStudent,...payload},'return=minimal');
      const targetStudent=allStudents.find(s=>s.id===editingStudent);
      if(targetStudent&&payload.p_profile?.details?.roll_number){
        targetStudent.roll_number=payload.p_profile.details.roll_number;
      }
      renderProfileStudents();
      notify('Student details saved. Linked app and web accounts can refresh Profile.');
    }finally{button.disabled=false;}
  });});
  async function loadNotices(){
    const rows=await api('school_notices',query({select:'id,title,body,created_at',institution_id:eq(me.institution_id),order:'created_at.desc',limit:'100'}));
    const root=$('noticesList');root.replaceChildren();
    if(!rows.length){root.append(dom('p','No notices published yet.'));return;}
    for(const n of rows){const item=dom('div',undefined,'assignment');item.append(dom('h3',n.title),dom('p',n.body),dom('small',new Date(n.created_at).toLocaleDateString(),'muted'));root.append(item);}
  }
  $('refreshNotices').addEventListener('click',()=>run(loadNotices));
  $('parentApp').addEventListener('click',async e=>{e.preventDefault();const jwt=session?.access_token;dropSession();if(jwt)await fetch(BASE+'/auth/v1/logout',{method:'POST',headers:{apikey:APIKEY,Authorization:'Bearer '+jwt}}).catch(()=>{});location.assign('./parents.html');});
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
      const right=dom('div',undefined,'flex');
      right.style.gap='6px';
      right.style.alignItems='center';
      right.style.flexWrap='wrap';
      right.append(dom('span',flags||'School access','pill'));

      if(canAcademic()){
        const attBtn=dom('button','📋 Attendance','ghost');
        attBtn.type='button';
        attBtn.style.padding='4px 8px';
        attBtn.style.fontSize='12px';
        attBtn.addEventListener('click',()=>{
          if($('attendanceClass')){$('attendanceClass').value=c.id;invalidateRoster();}
          tab('attendance');
          run(loadAttendance);
        });

        const hwBtn=dom('button','📝 Homework','ghost');
        hwBtn.type='button';
        hwBtn.style.padding='4px 8px';
        hwBtn.style.fontSize='12px';
        hwBtn.addEventListener('click',()=>{
          if($('homeworkClass')){$('homeworkClass').value=c.id;fillSubject(c.id);}
          tab('homework');
        });

        right.append(attBtn,hwBtn);
      }

      if(isAdmin()){
        const stuBtn=dom('button','👥 Students','ghost');
        stuBtn.type='button';
        stuBtn.style.padding='4px 8px';
        stuBtn.style.fontSize='12px';
        stuBtn.addEventListener('click',()=>{
          if($('profileClassFilter')){
            $('profileClassFilter').value=c.id;
            $('profileClassFilter').dispatchEvent(new Event('change'));
          }
          tab('profiles');
        });
        right.append(stuBtn);
      }

      line.append(left,right);root.append(line);
    }
  }
  function writableClasses(action){
    if(me.role==='school_admin'||me.role==='principal')return allClasses;
    if(me.role!=='teacher')return [];
    return allClasses.filter(c=>allAssignments.some(a=>a.school_user_id===me.id&&a.class_id===c.id&&a.active&&a[action]));
  }
  function saveStaffName(keyOrEmail,name){
    if(!name)return;
    const instId=me?.institution_id;
    if(!instId)return;
    try{
      const key='bright-nexa-school-os:staff-names:'+instId;
      const current=JSON.parse(localStorage.getItem(key)||'{}');
      current[keyOrEmail]=name;
      localStorage.setItem(key,JSON.stringify(current));
    }catch(_){}
  }
  function updateStaffName(staff,newName){
    if(!newName||!staff)return;
    saveStaffName(staff.email,newName);
    if(staff.id)saveStaffName(staff.id,newName);
    staff.name=newName;
    if(staff.id===me?.id){
      me.name=newName;
      const schoolLabel=$('schoolLabel')?.textContent||'School';
      put('membership',schoolLabel+' · '+newName+' · '+me.email+' · '+me.role.replaceAll('_',' '));
    }
  }
  const DEFAULT_ROLE_PERMS={
    teacher:{classes:true,attendance:true,homework:true,notices:true,profiles:false},
    accountant:{classes:true,attendance:false,homework:false,notices:true,profiles:true},
    receptionist:{classes:true,attendance:false,homework:false,notices:true,profiles:true},
    transport_staff:{classes:false,attendance:false,homework:false,notices:true,profiles:false}
  };
  function getRolePermissions(){
    if(!me?.institution_id)return DEFAULT_ROLE_PERMS;
    try{
      const saved=localStorage.getItem('bright-nexa-school-os:role-permissions:'+me.institution_id);
      if(saved)return Object.assign({},DEFAULT_ROLE_PERMS,JSON.parse(saved));
    }catch(_){}
    return DEFAULT_ROLE_PERMS;
  }
  function isTabVisibleForRole(tabName,role){
    if(role==='school_admin'||role==='principal')return true;
    if(tabName==='admin')return false;
    if(tabName==='account')return true;
    const perms=getRolePermissions()[role]||DEFAULT_ROLE_PERMS[role];
    if(!perms)return true;
    return Boolean(perms[tabName]);
  }
  function applyNavigationVisibility(){
    const role=me?.role||'teacher';
    const isAdm=isAdmin();
    display('adminTab',isAdm);
    display('profilesTab',isAdm||isTabVisibleForRole('profiles',role));
    display('schoolOsAdminNav',isAdm);
    display('adminErpBanner',isAdm);
    document.querySelectorAll('[data-tab]').forEach(btn=>{
      const t=btn.dataset.tab;
      if(t==='admin')btn.classList.toggle('hidden',!isAdm);
      else if(t==='profiles')btn.classList.toggle('hidden',!(isAdm||isTabVisibleForRole('profiles',role)));
      else if(t!=='account'){
        btn.classList.toggle('hidden',!isTabVisibleForRole(t,role));
      }
    });
  }
  function getStaffPermissionsSummary(staff){
    if(staff.role==='school_admin'||staff.role==='principal'){
      return dom('span','👑 Full School Access (All classes & modules)','pill');
    }
    const container=dom('div');
    const assigns=allAssignments.filter(a=>a.school_user_id===staff.id&&a.active);
    if(assigns.length===0){
      const noAssign=dom('span','⚠️ No classes assigned','pill');
      noAssign.style.background='#fff8e6';noAssign.style.color='#8a6100';
      container.append(noAssign);
    }else{
      for(const a of assigns){
        const c=allClasses.find(cls=>cls.id===a.class_id);
        const cName=c?className(c):'Class';
        const rights=[a.can_view_roster?'Roster':'',a.can_take_attendance?'Attendance':'',a.can_assign_homework?'Homework':'',a.can_enter_marks?'Marks':''].filter(Boolean).join(', ');
        const item=dom('div',`${cName} (${rights||'View'})`);
        item.style.fontSize='12px';item.style.marginBottom='2px';
        container.append(item);
      }
    }
    const assignBtn=dom('button','+ Assign / Edit Rights','ghost');
    assignBtn.type='button';
    assignBtn.style.padding='2px 6px';assignBtn.style.fontSize='11px';assignBtn.style.marginTop='4px';
    assignBtn.addEventListener('click',()=>{
      const teacherSelect=$('assignTeacher');
      if(teacherSelect){
        teacherSelect.value=staff.id;
        teacherSelect.dispatchEvent(new Event('change'));
      }
      const assignSec=$('assignmentForm');
      if(assignSec){
        assignSec.scrollIntoView({behavior:'smooth'});
        assignSec.style.outline='3px solid #ff7818';
        setTimeout(()=>assignSec.style.outline='',2000);
      }
    });
    container.append(assignBtn);
    return container;
  }
  function staffName(s){
    if(!s)return '';
    if(s.name)return s.name;
    if(identity&&identity.id===s.auth_user_id&&(identity.user_metadata?.full_name||identity.user_metadata?.name)){
      return identity.user_metadata.full_name||identity.user_metadata.name;
    }
    try{
      const saved=JSON.parse(localStorage.getItem('bright-nexa-school-os:staff-names:'+me?.institution_id)||'{}');
      if(saved[s.email])return saved[s.email];
      if(s.id&&saved[s.id])return saved[s.id];
    }catch(_){}
    try{
      const ops=JSON.parse(localStorage.getItem('bright-nexa-school-os:operations:v1')||'{}');
      const match=(ops.teachers||[]).find(t=>t.email?.toLowerCase()===s.email?.toLowerCase());
      if(match?.name)return match.name;
    }catch(_){}
    const raw=String(s.email||'').split('@')[0].replace(/[0-9_.-]+$/g,'').replace(/[._-]/g,' ');
    if(raw.trim()){
      return raw.split(' ').filter(Boolean).map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
    }
    return s.email;
  }
  function staffLabel(s){
    const name=staffName(s);
    return name&&name!==s.email?`${name} (${s.email})`:s.email;
  }
  function studentLabel(s){
    const c=allClasses.find(cls=>cls.id===s.class_id);
    const classStr=c?`${c.name}${c.section?' '+c.section:''}`:'';
    const rollStr=s.roll_number?`Roll ${s.roll_number}`:'';
    const parts=[rollStr,s.name,s.admission_number,classStr].filter(Boolean);
    return parts.join(' · ');
  }
  function getFilteredProfileStudents(){
    const filterClass=$('profileClassFilter')?.value||'';
    const query=($('profileSearchInput')?.value||'').trim().toLowerCase();
    return allStudents.filter(s=>{
      if(filterClass&&s.class_id!==filterClass)return false;
      if(!query)return true;
      const nameMatch=(s.name||'').toLowerCase().includes(query);
      const admMatch=(s.admission_number||'').toLowerCase().includes(query);
      const rollMatch=String(s.roll_number||'').toLowerCase()===query||String(s.roll_number||'').toLowerCase().includes(query);
      return nameMatch||admMatch||rollMatch;
    });
  }
  function updateSelectedStudentBadge(){
    const id=$('profileStudent')?.value;
    const s=allStudents.find(st=>st.id===id);
    const badge=$('profileSelectedBadge');
    if(!badge)return;
    if(!s){
      display('profileSelectedBadge',false);
      badge.textContent='';
      return;
    }
    const c=allClasses.find(cls=>cls.id===s.class_id);
    const classStr=c?className(c):'Assigned Class';
    const rollText=s.roll_number?` · Roll No: ${s.roll_number}`:'';
    badge.textContent=`Selected: ${s.name} (${s.admission_number}${rollText}) · Class: ${classStr}`;
    display('profileSelectedBadge',true);
  }
  function renderProfileStudents(){
    const filtered=getFilteredProfileStudents();
    if($('profileStudentCount'))put('profileStudentCount',filtered.length);
    options('profileStudent',filtered,studentLabel);
    updateSelectedStudentBadge();
  }
  function renderSelects(){
    options('attendanceClass',writableClasses('can_take_attendance'),className);
    options('homeworkClass',writableClasses('can_assign_homework'),className);
    const current=writableClasses('can_assign_homework')[0];
    if(current)fillSubject(current.id);
    if(isAdmin()){
      options('assignTeacher',allStaff.filter(s=>s.role==='teacher'&&s.status==='active'),staffLabel);
      const subList=$('assignSubjectList');
      if(subList){
        subList.replaceChildren();
        const stdSubs=['Mathematics','Science','English','Hindi','Social Science','Sanskrit','Computer Science','Art','EVS','Physics','Chemistry','Biology'];
        for(const sub of stdSubs){const o=document.createElement('option');o.value=sub;subList.appendChild(o);}
      }
      options('assignClass',allClasses,className);
      options('studentClass',allClasses,className);
      if($('profileClassFilter'))options('profileClassFilter',[{id:'',name:'All accessible classes'}].concat(allClasses),c=>c.id?className(c):c.name);
      renderProfileStudents();
      clearProfileEditor();
    }
  }
  function fillSubject(classId){
    const list=$('homeworkSubjectList');
    if(list){
      list.replaceChildren();
      const standardSubjects=['Mathematics','Science','English','Hindi','Social Science','Sanskrit','Computer Science','Art','EVS','Physics','Chemistry','Biology'];
      const aSubs=allAssignments.filter(a=>a.class_id===classId&&a.active&&a.can_assign_homework).map(x=>x.subject).filter(Boolean);
      const allSubs=Array.from(new Set(aSubs.concat(standardSubjects)));
      for(const s of allSubs){
        const opt=document.createElement('option');
        opt.value=s;
        list.appendChild(opt);
      }
    }
    if(me.role!=='teacher')return;
    const a=allAssignments.filter(a=>a.school_user_id===me.id&&a.class_id===classId&&a.active&&a.can_assign_homework&&a.assignment_type==='subject_teacher');
    const classT=allAssignments.some(a=>a.school_user_id===me.id&&a.class_id===classId&&a.active&&a.can_assign_homework&&a.assignment_type==='class_teacher');
    if(a.length===1&&!classT){$('homeworkSubject').value=a[0].subject;$('homeworkSubject').readOnly=true}
    else{$('homeworkSubject').readOnly=false;if(!a.some(x=>x.subject===$('homeworkSubject').value))$('homeworkSubject').value=''}
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
      homeworkFiles.links(div,allHomeworkFiles.filter(f=>f.homework_id===h.id));
      if(h.created_by===me.id&&writableClasses('can_assign_homework').some(c=>c.id===h.class_id)){
        const label=dom('label','Add photo / PDF','muted'),input=document.createElement('input');input.type='file';input.multiple=true;input.accept='application/pdf,image/jpeg,image/png,image/webp';label.append(input);div.append(label);
        input.addEventListener('change',()=>run(async()=>{input.disabled=true;try{await homeworkFiles.upload(h,input.files);await reload();notify('Homework files uploaded.');}finally{input.disabled=false;}}));
      }
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
      const tr=dom('tr');
      const email=dom('td');
      const sName=staffName(staff);
      const nameRow=dom('div');
      nameRow.style.display='flex';
      nameRow.style.alignItems='center';
      nameRow.style.gap='6px';
      nameRow.append(dom('strong',sName||staff.email));
      const editBtn=dom('button','✏️','ghost');
      editBtn.type='button';
      editBtn.title='Edit staff name';
      editBtn.style.padding='2px 6px';editBtn.style.fontSize='11px';
      editBtn.addEventListener('click',()=>{
        const newName=window.prompt('Enter name for '+staff.email+':',sName);
        if(newName&&newName.trim()){
          updateStaffName(staff,newName.trim());
          renderAdmin();renderSelects();
          notify('Name updated to "'+newName.trim()+'".');
        }
      });
      nameRow.append(editBtn);
      email.append(nameRow);
      email.append(dom('small',staff.email,'muted'));

      const role=dom('td');const roleSelect=newSelect(ROLES,staff.role);role.append(roleSelect);
      const perms=dom('td');perms.append(getStaffPermissionsSummary(staff));
      const status=dom('td');const statusSelect=newSelect(['active','disabled'],staff.status);status.append(statusSelect);
      if(staff.id===me.id){roleSelect.disabled=true;statusSelect.disabled=true}
      const action=dom('td');const save=dom('button','Save','ghost');
      if(staff.id===me.id)save.disabled=true;
      save.addEventListener('click',()=>run(async()=>{
        await api('school_users',query({id:eq(staff.id),institution_id:eq(me.institution_id)}),'PATCH',{role:roleSelect.value,status:statusSelect.value});
        await reload();notify('Staff permissions updated.');
      }));
      action.append(save);tr.append(email,role,perms,status,action);root.append(tr);
    }
    const matrixRoot=$('rolePermissionsBody');
    if(matrixRoot){
      matrixRoot.replaceChildren();
      const currentRolePerms=getRolePermissions();
      const manageableRoles=['teacher','accountant','receptionist','transport_staff'];
      const modules=['classes','attendance','homework','notices','profiles'];
      for(const r of manageableRoles){
        const rTr=dom('tr');
        const roleNameTd=dom('td');
        roleNameTd.append(dom('strong',r.replaceAll('_',' ').toUpperCase()));
        rTr.append(roleNameTd);
        const checks={};
        for(const m of modules){
          const mTd=dom('td');
          const cb=document.createElement('input');
          cb.type='checkbox';
          cb.checked=Boolean(currentRolePerms[r]?.[m]);
          checks[m]=cb;
          mTd.append(cb);
          rTr.append(mTd);
        }
        const actTd=dom('td');
        const saveRoleBtn=dom('button','Save','ghost');
        saveRoleBtn.type='button';
        saveRoleBtn.style.padding='4px 8px';
        saveRoleBtn.addEventListener('click',()=>{
          currentRolePerms[r]={
            classes:checks.classes.checked,
            attendance:checks.attendance.checked,
            homework:checks.homework.checked,
            notices:checks.notices.checked,
            profiles:checks.profiles.checked
          };
          localStorage.setItem('bright-nexa-school-os:role-permissions:'+me.institution_id,JSON.stringify(currentRolePerms));
          applyNavigationVisibility();
          notify('Permissions saved for '+r.replaceAll('_',' ')+'.');
        });
        actTd.append(saveRoleBtn);
        rTr.append(actTd);
        matrixRoot.append(rTr);
      }
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
  async function apiAuthUserUpdate(password,currentPassword,accessToken){
    await ensureToken();
    return responseJson(await fetch(BASE+'/auth/v1/user',{method:'PUT',headers:{apikey:APIKEY,Authorization:'Bearer '+(accessToken||session.access_token),'Content-Type':'application/json'},body:JSON.stringify(currentPassword?{password,current_password:currentPassword}:{password})}));
  }
  // Staff self-service password change. Authenticate the CURRENT password
  // with Supabase Auth, then use that freshly authenticated short-lived session
  // to perform the update. Roles and class permissions are not changed here.
  
  $('saveAccountNameButton')?.addEventListener('click',()=>run(async()=>{
    const nextName=($('accountNameInput')?.value||'').trim();
    if(!nextName)throw Error('Enter a staff display name.');
    const button=$('saveAccountNameButton');button.disabled=true;
    try{
      if(session?.access_token){
        await fetch(BASE+'/auth/v1/user',{
          method:'PATCH',
          headers:{apikey:APIKEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},
          body:JSON.stringify({data:{full_name:nextName,name:nextName}})
        }).catch(()=>null);
        if(identity){identity.user_metadata=identity.user_metadata||{};identity.user_metadata.full_name=nextName;identity.user_metadata.name=nextName;}
      }
      try{
        const key='bright-nexa-school-os:staff-names:'+me.institution_id;
        const current=JSON.parse(localStorage.getItem(key)||'{}');
        current[me.email]=nextName;current[me.id]=nextName;
        localStorage.setItem(key,JSON.stringify(current));
      }catch(_){}
      me.name=nextName;
      const schoolRows=await api('institutions',query({select:'name',id:eq(me.institution_id)}));
      const schoolName=schoolRows[0]?.name||'School';
      put('membership',schoolName+' · '+nextName+' · '+me.email+' · '+me.role.replaceAll('_',' '));
      renderSelects();if(isAdmin())renderAdmin();
      notify('Account name saved as "'+nextName+'". It will now appear across all teacher menus and rosters.');
    }finally{button.disabled=false;}
  }));
  $('changePasswordForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
    const button=$('changePasswordButton'),form=e.currentTarget;
    if(button.disabled)return;
    button.disabled=true;
    let freshToken=null;
    try{
      if(!me || !identity || !session)throw new Error('You must sign in before changing your password.');
      const current=$('currentStaffPassword').value;
      const next=$('nextStaffPassword').value;
      const confirm=$('confirmStaffPassword').value;
      if(!current || next.length<12 || next.length>256)throw new Error('New password must be 12–256 characters.');
      if(next!==confirm)throw new Error('New passwords do not match.');
      if(next===current)throw new Error('Choose a different password.');
      let verified;
      try{
        verified=await authRequest('token?grant_type=password',{email:identity.email,password:current});
      }catch(_){
        throw new Error('Current password is incorrect. Please try again.');
      }
      freshToken=verified.access_token;
      if(!freshToken || verified.user?.id!==identity.id){
        throw new Error('Account verification failed. Sign out and sign in again.');
      }
      const result=await apiAuthUserUpdate(next,current,freshToken);
      if(result.id!==identity.id)throw new Error('Password update confirmation failed. Contact your school admin.');
      // Revoke fresh and original sessions after a successful change.
      await fetch(BASE+'/auth/v1/logout',{method:'POST',headers:{apikey:APIKEY,Authorization:'Bearer '+freshToken}}).catch(()=>{});
      freshToken=null;
      await fetch(BASE+'/auth/v1/logout',{method:'POST',headers:{apikey:APIKEY,Authorization:'Bearer '+session.access_token}}).catch(()=>{});
      dropSession();
      notify('Password changed successfully. Please sign in again with your new password.');
    }finally{
      if(freshToken){
        await fetch(BASE+'/auth/v1/logout',{method:'POST',headers:{apikey:APIKEY,Authorization:'Bearer '+freshToken}}).catch(()=>{});
      }
      form.reset();
      button.disabled=false;
    }
  })});
  $('logout').addEventListener('click',()=>{run(async()=>{
    if(session?.access_token)await fetch(BASE+'/auth/v1/logout',{method:'POST',headers:{apikey:APIKEY,Authorization:'Bearer '+session.access_token}}).catch(()=>{});
    dropSession();notify('Signed out.');
  })});
  $('reload').addEventListener('click',()=>run(async()=>{await reload();notify('Updated from cloud.')}));
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.tab)));
  $('homeworkClass').addEventListener('change',()=>fillSubject($('homeworkClass').value));
  $('loadAttendance').addEventListener('click',()=>run(loadAttendance));
  let currentRoster=[],rosterScope=null,rosterGeneration=0;
  function invalidateRoster(){rosterGeneration++;currentRoster=[];rosterScope=null;$('rosterList').replaceChildren();display('saveAttendance',false);}
  $('attendanceClass').addEventListener('change',invalidateRoster);
  $('attendanceDate').addEventListener('change',invalidateRoster);
  async function loadAttendance(){
    const cls=$('attendanceClass').value,day=$('attendanceDate').value;
    invalidateRoster();const generation=rosterGeneration;
    if(!writableClasses('can_take_attendance').some(c=>c.id===cls)||!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Choose your assigned attendance class and date.');
    const roster=allStudents.filter(s=>s.class_id===cls);
    const records=await api('school_attendance',query({select:'student_id,status',class_id:eq(cls),day:eq(day),institution_id:eq(me.institution_id)}));
    if(generation!==rosterGeneration||$('attendanceClass').value!==cls||$('attendanceDate').value!==day)return;
    currentRoster=roster;rosterScope={classId:cls,day};
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
    if(!selects.length||!rosterScope)throw Error('Load the roster first.');
    if(!writableClasses('can_take_attendance').some(c=>c.id===cls))throw Error('You are not assigned to this attendance class.');
    if(rosterScope.classId!==cls||rosterScope.day!==day)throw Error('Class or date changed. Reload roster.');
    if(selects.some(s=>s.dataset.classId!==cls))throw Error('Class changed. Reload roster.');
    const records=selects.map(s=>({student_id:s.dataset.studentId,class_id:cls,institution_id:me.institution_id,day,status:s.value,recorded_by:me.id}));
    const button=$('saveAttendance');if(button.disabled)return;button.disabled=true;
    try{await api('school_attendance','on_conflict=student_id%2Cday','POST',records,'resolution=merge-duplicates,return=minimal');
    notify('Attendance saved for '+records.length+' students on '+day+'. Linked parents can refresh attendance in their app.');}finally{button.disabled=false;}
  }));
  $('homeworkForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
    const class_id=$('homeworkClass').value;
    if(!writableClasses('can_assign_homework').some(c=>c.id===class_id))throw Error('You are not assigned to this class.');
    const subject=$('homeworkSubject').value.trim(),title=$('homeworkTitle').value.trim();
    if(!subject||!title)throw Error('Subject and task are required.');
    const button=$('publishHomework');if(button.disabled)return;const selectedFiles=Array.from($('homeworkFiles').files||[]);if(selectedFiles.length>5)throw Error('Choose up to 5 files.');for(const file of selectedFiles)await window.BNHomeworkFiles.validate(file);button.disabled=true;
    try{const published=await api('school_homework','','POST',{
      institution_id:me.institution_id,class_id,subject,title,
      instructions:$('homeworkInstructions').value.trim(),due_on:$('homeworkDate').value||null,created_by:me.id
    });
    let fileError=null;try{if(selectedFiles.length)await homeworkFiles.upload(published[0],selectedFiles);}catch(err){fileError=err;}
    e.target.reset();await reload();notify(fileError?'Homework saved. Some files were not uploaded: '+fileError.message+' Use Add photo / PDF on this homework to retry.':'Homework published with '+selectedFiles.length+' file(s).',!!fileError);
    }finally{button.disabled=false;}
  })});
  $('inviteForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
    if(!isAdmin())throw Error('School admin required.');
    await ensureToken();
    const invEmail=$('inviteEmail').value.trim();
    const invRole=$('inviteRole').value;
    const invName=($('inviteName')?.value||'').trim();
    if(invName)saveStaffName(invEmail,invName);
    const r=await responseJson(await fetch(BASE+'/functions/v1/school-invite-staff',{
      method:'POST',headers:{apikey:APIKEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},
      body:JSON.stringify({email:invEmail,role:invRole})
    }));
    e.target.reset();await reload();notify('Invitation requested for '+(invName?invName+' ('+r.email+')':r.email)+'. Check email delivery and Auth redirect settings.');
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