/* Bright Nexa cloud teacher portal. Publishable key only; no admin secrets.
 * Supabase RLS is the actual authority; UI hiding alone grants no access.
 */
(() => {
  'use strict';
  const BASE='https://mrfvbwmyxndrakskqyas.supabase.co';
  const APIKEY='sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT';
  const TOKEN_KEY='bn_school_staff_session_v1';
  const SELECTED_SCHOOL_KEY='bn_school_staff_selected_school_v1';
  const FROM_LOCAL=(()=>{
    const fromLink=new URLSearchParams(typeof location==='undefined'?'':location.search).get('fromLocal')==='1';
    const store=typeof localStorage==='undefined'?null:localStorage;
    if(fromLink&&store)store.setItem('bn_school_cloud_handoff_intent_v1','1');
    return fromLink||store?.getItem('bn_school_cloud_handoff_intent_v1')==='1';
  })();
  const LOCAL_DRAFT=FROM_LOCAL?window.BNSchoolLocalHandoff?.read(localStorage):null;
  const ROLES=['school_admin','principal','teacher','accountant','librarian','receptionist','transport_staff'];
  const $=id=>document.getElementById(id);
  let session=null,me=null,identity=null,allClasses=[],allStudents=[],allHomework=[],allStaff=[],allAssignments=[],allHomeworkFiles=[];
  let rolePermissions=null;
  let feeStudentRoster=[]; // Finance-only three-column RPC result; never reveal DOB/profile fields.
  let editingFeeEntry=null;
  let recoveryMode=false;
  const photos=window.BNStudentPhotos?.create({base:BASE,key:APIKEY,
    token:async()=>{await ensureToken();return session?.access_token;}})||{
      validate(){throw Error('School photo service is unavailable. Refresh the page.');},
      async upload(){throw Error('School photo service is unavailable. Refresh the page.');},
      async signedUrl(){return null;}
    };
  let schoolLoadEpoch=0;
  const homeworkFiles=window.BNHomeworkFiles.create({base:BASE,key:APIKEY,token:async()=>{await ensureToken();return session?.access_token;}});
  const values=v=>v==null?'':String(v);
  function notify(msg,isError=false){
    const e=$('status');e.textContent=msg;e.classList.remove('hidden','error','ok');e.classList.add(isError?'error':'ok');
  }
  function clearNotice(){ $('status').classList.add('hidden');$('status').textContent=''; }

  // Host-safe confirmation and recovery destinations; never send mail to localhost from a deployed app.
  function emailReturnUrl(){
    const url=new URL('./teacher-access.html',location.href);
    return ['https:','http:'].includes(url.protocol)&&!['localhost','127.0.0.1'].includes(url.hostname)
      ?url.href:'https://bright-nexa-school-os.onrender.com/teacher-access.html';
  }
  function emailDialog(mode,email=''){
    const dialog=$('bnEmailDialog'),address=$('bnEmailInput'),feedback=$('bnEmailFeedback');
    if(!dialog)return notify('Email verification needs attention. Check your inbox and try again.',true);
    address.value=email||'';
    feedback.textContent='';feedback.classList.remove('error');
    const verified=mode==='verified',expired=mode==='expired',pending=mode==='pending';
    put('bnEmailTitle',verified?'Email verified successfully':expired?'Verification link expired':pending?'Check your account':'Email verification required');
    put('bnEmailDescription',verified
      ?'Your email is confirmed. Continue to your secure school account.'
      :expired?'This confirmation link has expired or is invalid. Request a fresh verification email below.'
      :pending?'If this is a new account awaiting verification, check your inbox or Spam folder. Already registered and verified? You can sign in directly—another email is not needed.'
      :'Your account exists, but its email address has not been verified. Check your inbox or resend a fresh confirmation link.');
    put('bnEmailSymbol',verified?'✓':expired?'!':'✉');
    $('bnEmailAddressWrap').classList.toggle('hidden',verified);
    $('bnEmailResend').classList.toggle('hidden',verified);
    $('bnEmailContinue').textContent=verified?'Continue to school':'Go to sign in';
    dialog.dataset.verified=verified?'true':'false';
    if(dialog.open)dialog.close();
    dialog.showModal();
    (verified?$('bnEmailContinue'):address).focus();
  }
  $('bnEmailClose').addEventListener('click',()=>$('bnEmailDialog').close());
  $('bnEmailContinue').addEventListener('click',()=>{
    const dialog=$('bnEmailDialog'),verified=dialog.dataset.verified==='true';
    dialog.close();
    if(verified&&session)$('continuePreviousSession').click();
    else $('loginEmail').focus();
  });
  $('bnEmailResend').addEventListener('click',async()=>{
    const email=$('bnEmailInput').value.trim().toLowerCase();
    const feedback=$('bnEmailFeedback'),button=$('bnEmailResend');
    if(!$('bnEmailInput').checkValidity()||!email){
      feedback.textContent='Enter your registered email address.';feedback.classList.add('error');return;
    }
    button.disabled=true;feedback.classList.remove('error');
    try{
      // Supabase Auth's public resend endpoint, not a privileged admin operation.
      await authRequest('resend?redirect_to='+encodeURIComponent(emailReturnUrl()),{type:'signup',email});
      feedback.textContent='Request accepted. Email is sent only for a registration still awaiting confirmation. If your account is already verified, no new email is needed—choose Go to sign in.';
    }catch(error){
      feedback.classList.add('error');
      feedback.textContent=/rate|429|too many/i.test(error.message||'')
        ?'Too many requests. Please try again later.'
        :'Could not request a verification email. Please retry or contact your school administrator.';
    }finally{button.disabled=false;}
  });
  function put(id,value){$(id).textContent=values(value);}
  function dom(tag,text,cls){
    const e=document.createElement(tag); if(text!==undefined)e.textContent=values(text);if(cls)e.className=cls;return e;
  }
  function display(id,show){$(id).classList.toggle('hidden',!show);}
  // One focused form at a time: sign in, owner registration, recovery, or activation.
  function showAuthView(view){
    const login=view==='login',signup=view==='signup',forgot=view==='forgot',activation=view==='activation';
    display('loginForm',login);
    display('ownerSignupForm',signup);
    display('forgotPasswordForm',forgot);
    display('activation',activation);
    display('forgotPasswordLink',login);
    display('authFootnote',login);
    if(!login)display('savedSessionPanel',false);
    put('authHeading',signup?'Create your account':forgot?'Reset your password':activation?'Secure account activation':view==='school'?'Set up your school':'Welcome back');
    put('authDescription',signup?'Create your school owner account. You can set up your school after verifying your email.'
      :forgot?'Enter your registered email and we will send you a secure reset link.'
      :activation?'Choose a secure password to finish your account setup.'
      :view==='school'?'Your email is verified. Complete your school setup below.'
      :'Sign in to access your school\'s workspace.');
  }
  // Recovery feedback belongs to the reset card, not a floating page-wide toast.
  function resetFeedback(message,isError=false){
    const node=$('forgotFeedback');
    node.textContent=message;
    node.classList.remove('hidden','error');
    if(isError)node.classList.add('error');
  }
  $('toggleLoginPassword').addEventListener('click',()=>{
    const input=$('loginPassword');
    const showing=input.type==='password';
    input.type=showing?'text':'password';
    const button=$('toggleLoginPassword');
    button.textContent=showing?'Hide':'Show';
    button.setAttribute('aria-label',showing?'Hide password':'Show password');
    button.setAttribute('aria-pressed',String(showing));
  });
  function saveSession(next){
    session={access_token:next.access_token,refresh_token:next.refresh_token,expires_at:Math.floor(Date.now()/1000)+(Number(next.expires_in)||3600)};
    sessionStorage.setItem(TOKEN_KEY,JSON.stringify(session));
  }
  async function timedCloudFetch(url,options={}){
    // Isolated Node/VM fixtures omit timers; browsers always provide them.
    if(typeof setTimeout!=='function'||typeof clearTimeout!=='function')return fetch(url,options);
    const ctl=typeof AbortController==='function'?new AbortController():null;
    let timer,expired=false;
    try{
      return await Promise.race([
        Promise.resolve().then(()=>fetch(url,{...options,...(ctl?{signal:ctl.signal}:{})})),
        new Promise((_,reject)=>{timer=setTimeout(()=>{
          expired=true;ctl?.abort();
          reject(Error('School cloud request timed out. Save was not confirmed; check internet and retry.'));
        },20000);})
      ]);
    }catch(e){
      if(expired||e?.name==='AbortError')throw Error('School cloud request timed out. Save was not confirmed; check internet and retry.');
      throw e;
    }finally{clearTimeout(timer);}
  }
  async function responseJson(res){
    const data=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(data.message||data.msg||data.error_description||data.error||'Request denied by server');
    return data;
  }
  async function authRequest(path,body,method='POST'){
    return responseJson(await timedCloudFetch(BASE+'/auth/v1/'+path,{
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
    const res=await timedCloudFetch(BASE+'/rest/v1/'+table+(query?'?'+query:''),{
      method,headers:{'apikey':APIKEY,'Authorization':'Bearer '+session.access_token,
        'Content-Type':'application/json','Prefer':prefer},
      body:body===null?undefined:JSON.stringify(body),cache:'no-store'
    });
    const result=await responseJson(res);
    if((method==='PATCH'||method==='DELETE')&&prefer.includes('return=representation')&&(!Array.isArray(result)||result.length===0))
      throw Error('No authorized school record was changed. Reload before retrying; check school permissions.');
    return result;
  }
  const query=params=>Object.entries(params).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');
  const eq=x=>'eq.'+x;
  const isAdmin=()=>me?.role==='school_admin';
  const teacher=()=>me?.role==='teacher';
  const canAcademic=()=>['school_admin','principal','teacher'].includes(me?.role);
  // Website is for school office roles. Teacher/student daily work uses
  // the installed mobile PWA or trusted app WebView. This is a UX boundary;
  // Supabase RLS remains the actual authorization control.
  function isMobileAppContext(win=window){
    const agent=String(win.navigator?.userAgent||'');
    const mobile=/Android|iPhone|iPad|iPod/i.test(agent);
    const installed=win.matchMedia?.('(display-mode: standalone)')?.matches===true
      || win.navigator?.standalone===true;
    const androidApp=/Android/i.test(agent)&&/(; wv\)|\bwv\b)/i.test(agent);
    return mobile&&(installed||androidApp);
  }
  function showMobileOnlyNotice(){
    const section=$('portalSection');
    if(!section)return;
    // No student, teacher, roster or finance request is made after this gate.
    const page=document.createElement('section');
    page.id='teacherMobileOnlyNotice';page.setAttribute('role','status');
    page.style.cssText='max-width:580px;margin:48px auto;padding:28px;background:white;border:1px solid #dce6ef;border-radius:16px;color:#0b2545;box-shadow:0 10px 35px #061a3612';
    const h=document.createElement('h2');h.textContent='Teacher access is available in the mobile app';
    const p=document.createElement('p');p.textContent='For school security, teacher attendance, homework and marks are managed from the installed Bright Nexa Teacher app. The school office website is reserved for authorized Owner/Admin, Accountant and office staff.';
    const link=document.createElement('a');link.href='./parent-app-download.html';link.textContent='Open mobile app instructions';link.style.cssText='display:inline-flex;padding:11px 15px;background:#0b315e;color:white;border-radius:10px;text-decoration:none;font-weight:700';
    page.append(h,p,link);
    section.replaceChildren(page);
    display('loginSection',false);display('portalSection',true);display('logout',true);
  }
  const className=c=>c?c.name+' '+(c.section||'')+' ('+c.academic_year+')':'Unknown class';
  function clearChildren(e){e.replaceChildren();}
  function options(target,records,label){
    const s=$(target);s.replaceChildren();
    if(!records.length){s.append(dom('option','No available entries'));return}
    for(const row of records){const o=dom('option',label(row));o.value=row.id;s.append(o)}
  }
  function dropSession(){
    ++schoolLoadEpoch;
    session=null;me=null;identity=null;rolePermissions=null;feeStudentRoster=[];recoveryMode=false;allClasses=[];allStudents=[];allAssignments=[];allHomework=[];allStaff=[];
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(SELECTED_SCHOOL_KEY);
    // Logging out of staff access must also revoke the local ERP UI bridge.
    // This does not touch school records, sync queues, local drafts or backups.
    sessionStorage.removeItem('bright-nexa-school-os:session:v2');
    invalidateRoster();clearProfileEditor();
    display('portalSection',false);display('loginSection',true);display('logout',false);display('activation',false);
    display('savedSessionPanel',false);display('schoolPickerWrap',false);display('createFirstSchoolPanel',false);showAuthView('login');
    put('schoolLabel','Cloud-based school access');document.querySelector('#loginPassword').value='';
  }
  async function switchToDifferentAccount(){
    const jwt=session?.access_token;
    dropSession();
    $('loginEmail').value='';
    $('loginPassword').value='';
    clearNotice();
    $('loginEmail').focus();
    if(jwt){
      // Remove the previous session in the browser immediately. Server sign-out
      // is best effort; it must not stop the user entering another account.
      await timedCloudFetch(BASE+'/auth/v1/logout',{method:'POST',
        headers:{apikey:APIKEY,Authorization:'Bearer '+jwt},cache:'no-store'}).catch(()=>{});
    }
  }
  function tab(name){
    if(name==='dashboard'&&isAdmin()){location.assign('./index.html?openSchool=true&tab=Dashboard');return;}
    if(name==='admin'&&!isAdmin())return;
    if(name!=='admin'&&!isTabVisibleForRole(name,me?.role||'teacher'))return;
    // Owner timetable deep-links retain the main School OS context without
    // spawning a second, duplicated staff/ERP sidebar.
    const focused=isAdmin()&&name==='timetable'
      &&new URLSearchParams(location.search).get('view')==='timetable';
    document.body.classList.toggle('bn-owner-timetable',focused);
    display('ownerTimetableNav',focused);
    document.querySelectorAll('[data-view]').forEach(n=>n.classList.toggle('hidden',n.dataset.view!==name));
    if($('portalStats'))$('portalStats').classList.toggle('hidden',isAdmin());
    document.querySelectorAll('[data-tab]').forEach(n=>n.classList.toggle('active',n.dataset.tab===name));
    if(name==='fees')loadFees().catch(e=>notify(e.message||'Fees unavailable',true));
    if(name==='timetable'&&window.BNTimetable)window.BNTimetable.activate({
      me,classes:allClasses,assignments:allAssignments,staff:allStaff,
      api,query,eq,notify,openAssignments:()=>tab('admin')
    });
  }
  async function load(requestedSchoolId){
    const thisLoad=++schoolLoadEpoch;
    await ensureToken();
    identity=await responseJson(await timedCloudFetch(BASE+'/auth/v1/user',{headers:{
      apikey:APIKEY,Authorization:'Bearer '+session.access_token},cache:'no-store'}));
    const memberships=await api('school_users',query({select:'id,institution_id,auth_user_id,email,role,status,display_name',auth_user_id:eq(identity.id)}));
    if(thisLoad!==schoolLoadEpoch)return;
    const active=memberships.filter(x=>x.auth_user_id===identity.id&&x.status==='active');
    if(!active.length){
      // No school membership: keep the verified Auth session so the first-school
      // RPC can securely create the new owner/school, never a sample tenant.
      display('portalSection',false);display('loginSection',true);showAuthView('school');
      display('savedSessionPanel',false);display('createFirstSchoolPanel',true);
      display('localSchoolNotice',FROM_LOCAL);
      display('logout',true);notify('No school is assigned to this account. Create your empty school below.');return;
    }
    display('createFirstSchoolPanel',false);showAuthView('login');
    // A real school membership wins over a stale browser-only import intent.
    // Preserve draft bytes; clear only the obsolete navigation flag.
    if(FROM_LOCAL)localStorage.removeItem('bn_school_cloud_handoff_intent_v1');
    // School names become visible ONLY after a verified Supabase Auth session,
    // and only for institutions having an active membership for this account.
    const permitted=[];
    for(const member of active){
      const schoolRows=await api('institutions',query({select:'id,name,status',id:eq(member.institution_id)}));
      if(thisLoad!==schoolLoadEpoch)return;
      const school=schoolRows.find(s=>s.id===member.institution_id&&['active','trial'].includes(s.status));
      if(school)permitted.push({member,school});
    }
    if(!permitted.length){dropSession();notify('No active school is available for this account. Contact the school administrator.',true);return;}
    const preferred=requestedSchoolId||sessionStorage.getItem(SELECTED_SCHOOL_KEY);
    if(requestedSchoolId&&!permitted.some(x=>x.school.id===requestedSchoolId))
      throw Error('This account is not authorized for that school.');
    const chosen=permitted.find(x=>x.school.id===preferred)||permitted[0];
    me=chosen.member;
    const school=chosen.school;
    // Invalidate the previous school's visible cached rows before loading the
    // selected school's roster and role permissions.
    allClasses=[];allStudents=[];allAssignments=[];allHomework=[];allStaff=[];allHomeworkFiles=[];
    rolePermissions=null;feeStudentRoster=[];invalidateRoster();clearProfileEditor();
    sessionStorage.setItem(SELECTED_SCHOOL_KEY,school.id);
    const selector=$('schoolPicker');
    selector.replaceChildren();
    for(const entry of permitted){
      const option=dom('option',entry.school.name);
      option.value=entry.school.id;
      selector.append(option);
    }
    selector.value=school.id;
    display('schoolPickerWrap',permitted.length>1);
    put('schoolLabel',school.name);
    const myName=staffName(me);
    put('membership',school.name+' · '+(myName||me.email)+' · '+me.role.replaceAll('_',' '));
    if($('accountEmailDisplay'))put('accountEmailDisplay',me.email);
    if($('accountRoleDisplay'))put('accountRoleDisplay',me.role.replaceAll('_',' ').toUpperCase());
    if($('accountNameInput'))$('accountNameInput').value=(myName&&myName!==me.email)?myName:'';
    put('hello',me.role==='teacher'?'Teacher workspace':isAdmin()?'School Admin tools':'School staff workspace');
    put('rolePill',me.role.replaceAll('_',' ').toUpperCase());
    if(me.role==='teacher'&&!isMobileAppContext()){
      showMobileOnlyNotice();
      return;
    }
    await loadRolePermissions();
    // Route only after Supabase Auth + tenant membership were verified above.
    const next=window.BNSchoolRoleEntry?.roleDestination({
      role:me.role,verified:me.status==='active'&&me.auth_user_id===identity.id,
      membershipCount:permitted.length,search:location.search
    });
    if(next){location.replace(new URL(next,location.href).href);return;}
    display('loginSection',false);display('portalSection',true);display('logout',true);
    applyNavigationVisibility();
    await reload();
    const requested=new URLSearchParams(location.search).get('view');
    const allowedViews=['dashboard','classes','timetable','attendance','homework','notices','profiles','fees','admin','account'];
    const landing=allowedViews.find(view=>isTabVisibleForRole(view,me.role));
    const deepLink=allowedViews.includes(requested)&&isTabVisibleForRole(requested,me.role)?requested:null;
    const preferredLandingView=window.BNSchoolRoleEntry?.preferredView(me.role);
    const openingView=deepLink||(preferredLandingView&&isTabVisibleForRole(preferredLandingView,me.role)?preferredLandingView:null)||landing||'account';
    tab(openingView);clearNotice();
    if(openingView==='attendance'){if(writableClasses('can_take_attendance').length)await loadAttendance();else notify('No attendance class is assigned yet. Ask your school admin to assign your class in Roles & Permissions.');}
  }
  async function renderMobileReadiness(){
    const target=$('mobileReadinessStatus');
    if(!target||!isAdmin())return;
    const schoolId=me.institution_id;
    target.textContent='Checking Supabase setup…';
    const activeTeachers=allStaff.filter(s=>s.role==='teacher'&&s.status==='active');
    const assignedTeachers=new Set(allAssignments.filter(a=>a.active&&a.school_user_id&&allClasses.some(c=>c.id===a.class_id)
      &&(a.can_take_attendance||a.can_assign_homework)).map(a=>a.school_user_id));
    const teacherReady=activeTeachers.filter(t=>assignedTeachers.has(t.id)).length;
    const tasks=[
      activeTeachers.length?activeTeachers.length+' active teacher account(s)':'No active teacher account: invite one and activate email',
      teacherReady?teacherReady+' teacher(s) assigned attendance/homework classes':'No active teacher with class attendance/homework rights'
    ];
    try{
      const profiles=await api('school_student_profiles',query({select:'student_id,guardian_phone,guardian_email',institution_id:eq(schoolId),limit:'1000'}));
      if(me?.institution_id!==schoolId)return;
      const activeStudentIds=new Set(allStudents.map(s=>s.id));
      const onboardable=(profiles||[]).filter(p=>activeStudentIds.has(p.student_id)
        &&/^[0-9]{10}$/.test(String(p.guardian_phone||'').replace(/\D/g,'')));
      tasks.push(onboardable.length+'/'+activeStudentIds.size+' active student(s) have a valid guardian phone for first mobile login');
      tasks.push((profiles||[]).filter(p=>activeStudentIds.has(p.student_id)&&String(p.guardian_email||'').trim()).length
        +' guardian email(s) recorded for email password recovery');
    }catch(e){
      tasks.push('Guardian phone/email readiness could not be confirmed from Supabase: '+(e.message||'Access denied'));
    }
    try{
      const links=await api('school_guardian_students',query({select:'student_id',institution_id:eq(schoolId),limit:'1000'}));
      if(me?.institution_id!==schoolId)return;
      tasks.push(new Set((links||[]).filter(x=>allStudents.some(s=>s.id===x.student_id)).map(x=>x.student_id)).size
        +' active student(s) have a linked guardian/student mobile account');
    }catch(e){
      tasks.push('Guardian account linkage could not be verified: '+(e.message||'Access denied'));
    }
    if(me?.institution_id!==schoolId)return;
    const ul=dom('ul');ul.style.cssText='margin:10px 0 0;padding-left:22px;font-size:13px;color:#234366;line-height:1.85';
    for(const task of tasks)ul.append(dom('li',task));
    target.replaceChildren(ul);
  }
  async function reload(){
    await loadRolePermissions();
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
      allStaff=await api('school_users',query({select:'id,auth_user_id,email,role,status,institution_id,display_name',institution_id:eq(institution_id),order:'email.asc',limit:'500'}));
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
    invalidateRoster();renderClasses();renderSelects();renderHomework();if(isAdmin()){renderAdmin();await renderMobileReadiness();}await loadNotices();
  }
  let readProfile=null,editingStudent=null,profileGeneration=0;
  function clearProfileEditor(){
    profileGeneration++;readProfile=null;editingStudent=null;
    display('studentProfileForm',false);$('profileEditor').replaceChildren();
    display('studentPhotoWrap',false);display('studentPhotoPreview',false);
    $('studentPhotoPreview').removeAttribute('src');
    $('studentPhotoInput').value='';put('studentPhotoStatus','');
    if($('studentMarksheetWrap')){display('studentMarksheetWrap',false);display('markPublishControls',false);}
    $('studentMarksheetList')?.replaceChildren();$('markPublishExam')?.replaceChildren();
    if($('studentMarksheetStatus'))put('studentMarksheetStatus','');
  }
  async function loadStudentMarksheets(id,generation){
    if(!$('studentMarksheetWrap')||!canAcademic())return;
    const scope={p_school:me.institution_id,p_student:id};
    display('studentMarksheetWrap',true);
    put('studentMarksheetStatus','Loading marksheets…');
    try{
      const [published,drafts]=await Promise.all([
        api('rpc/bn_school_published_marksheets','','POST',scope),
        isAdmin()?api('rpc/bn_school_marksheet_drafts','','POST',scope):[]
      ]);
      if(generation!==profileGeneration||editingStudent!==id)return;
      const list=$('studentMarksheetList');
      list.replaceChildren();
      if(!published.length)list.append(dom('p','No published marksheets available for this account.'));
      for(const sheet of published){
        list.append(dom('strong',sheet.examName),
          dom('p',sheet.subjects.map(row=>row.subject+' '+row.obtained+' / '+row.maximum).join(' · ')));
      }
      if(isAdmin()){
        options('markPublishExam',drafts.map(exam=>({id:exam.exam_id,label:exam.exam_name})),exam=>exam.label);
        display('markPublishControls',drafts.length>0);
      }
      put('studentMarksheetStatus',isAdmin()&&!drafts.length
        ? 'No valid cloud marks to publish. Save the marks in ERP and reload the student profile.' : '');
    }catch(err){
      if(generation===profileGeneration&&editingStudent===id)put('studentMarksheetStatus','Could not load marksheets. Reload the student profile to retry. '+err.message);
    }
  }
  $('publishMarksheet')?.addEventListener('click',async()=>{
    const button=$('publishMarksheet'),id=editingStudent,exam=$('markPublishExam').value,generation=profileGeneration;
    if(button.disabled||!isAdmin()||!id||id!==$('profileStudent').value||!exam)return;
    if(!window.confirm('Publish the latest saved marks for the selected student and exam? They will be visible to linked guardians and authorized staff.'))return;
    button.disabled=true;
    put('studentMarksheetStatus','Publishing to Supabase…');
    try{
      await api('rpc/bn_publish_school_marksheet','','POST',{p_school:me.institution_id,p_student:id,p_exam:exam});
      if(generation!==profileGeneration||editingStudent!==id)return;
      await loadStudentMarksheets(id,generation);
      if(generation===profileGeneration&&editingStudent===id&&!$('studentMarksheetStatus').textContent)
        put('studentMarksheetStatus','Published to Supabase.');
    }catch(err){
      if(generation===profileGeneration&&editingStudent===id)
        put('studentMarksheetStatus','Could not confirm publication. Use Publish selected marksheet to retry. '+err.message);
    }finally{button.disabled=false;}
  });
  $('profileClassFilter')?.addEventListener('change',()=>{renderProfileStudents();clearProfileEditor();});
  $('profileSearchInput')?.addEventListener('input',()=>{renderProfileStudents();clearProfileEditor();});
  $('profileStudent')?.addEventListener('change',()=>{updateSelectedStudentBadge();clearProfileEditor();});
  $('loadProfile').addEventListener('click',()=>run(async()=>{
    if(!isAdmin()&&!isTabVisibleForRole('profiles',me.role))throw Error('Student profiles permission required.');clearProfileEditor();const generation=profileGeneration,id=$('profileStudent').value;
    const student=allStudents.find(s=>s.id===id);if(!student)throw Error('Choose a student.');
    const rows=await api('school_student_profiles',query({select:'*',student_id:eq(id),institution_id:eq(me.institution_id)}));
    if(generation!==profileGeneration||$('profileStudent').value!==id)return;
    const core=await api('school_students',query({select:'id,name,dob',id:eq(id),institution_id:eq(me.institution_id)}));
    if(generation!==profileGeneration||$('profileStudent').value!==id||!core[0])return;
    editingStudent=id;readProfile=window.BNStudentProfile.editor($('profileEditor'),{student:{...core[0],profile:rows[0]||{}}});display('studentProfileForm',true);
    display('studentPhotoWrap',isAdmin());
    const linkedPhoto=rows[0]?.details?.photo_path;
    if(linkedPhoto&&isAdmin()){
      try{
        const signed=await photos.signedUrl(me.institution_id,id,linkedPhoto);
        if(generation===profileGeneration&&editingStudent===id&&signed){
          $('studentPhotoPreview').src=signed;display('studentPhotoPreview',true);
        }
      }catch(_){put('studentPhotoStatus','Photo unavailable. Contact school admin.');}
    }
    const viewer=!isAdmin();
    $('studentProfileForm').querySelectorAll('input,select,textarea').forEach(field=>{field.disabled=viewer;});
    display('saveProfile',!viewer);updateSelectedStudentBadge();
    await loadStudentMarksheets(id,generation);
  }));
  $('uploadStudentPhoto').addEventListener('click',()=>run(async()=>{
    if(!isAdmin()||!editingStudent||editingStudent!==$('profileStudent').value)
      throw Error('Load and select a student as school admin first.');
    const button=$('uploadStudentPhoto'),file=$('studentPhotoInput').files?.[0];
    if(!file)throw Error('Choose a photo first.');
    photos.validate(file);
    button.disabled=true;
    try{
      put('studentPhotoStatus','Uploading private student photo…');
      const result=await photos.upload(me.institution_id,editingStudent,file);
      const previous=readProfile;
      if(previous)readProfile=()=>{const p=previous();p.p_profile.details.photo_path=result.path;return p;};
      if(result.url){$('studentPhotoPreview').src=result.url;display('studentPhotoPreview',true);}
      $('studentPhotoInput').value='';
      put('studentPhotoStatus',result.previewWarning
        ?'Student photo saved in Supabase. Preview could not load right now; refresh the photo later.'
        :'Student photo published securely. Linked student/parent will see it on refresh.');
    }finally{button.disabled=false;}
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

  function newFeeReceipt(){
    if(!globalThis.crypto?.randomUUID)throw Error('Secure receipt generator unavailable. Use an official receipt number or a modern HTTPS browser.');
    return 'RCP-'+new Date().toISOString().slice(0,10).replaceAll('-','')+'-'+globalThis.crypto.randomUUID().replaceAll('-','').slice(0,12).toUpperCase();
  }
  function feeCorrectionRows(original,replacement){
    // Fee records are append-only under RLS. A single atomic bulk insert
    // cancels the old amount, then records the corrected amount/student/date.
    // Unique REV-<original UUID> prevents applying the same correction twice.
    const reverseKind=original.kind==='payment'?'charge':'payment';
    return [
      {institution_id:me.institution_id,student_id:original.student_id,created_by:me.id,
       kind:reverseKind,amount_rupees:Number(original.amount_rupees),
       reference:'REV-'+original.id,
       description:'Correction reversal of '+original.id,occurred_on:original.occurred_on},
      replacement
    ];
  }
  function stopFeeEdit(){
    editingFeeEntry=null;
    $('saveFeeEntry').textContent='Save ledger entry';
    display('cancelFeeEdit',false);display('feeEditHint',false);
    $('feeEntryForm').reset();
    $('feeReference').value='';
    $('feeDate').value='';
  }
  $('cancelFeeEdit').addEventListener('click',stopFeeEdit);
  async function feeRowsSaved(rows){
    // A network error may occur AFTER Supabase commits. Read both references
    // back before reporting an error or trying a second insert.
    try{
      for(const row of rows){
        const saved=await api('school_fee_entries',query({
          select:'reference,student_id,kind,amount_rupees,occurred_on',
          institution_id:eq(me.institution_id),reference:eq(row.reference),limit:'2'}));
        if(!Array.isArray(saved)||!saved.some(record=>
          record.reference===row.reference &&
          record.student_id===row.student_id &&
          record.kind===row.kind &&
          Number(record.amount_rupees)===Number(row.amount_rupees) &&
          record.occurred_on===row.occurred_on
        ))return false;
      }
      return true;
    }catch(_){return false;}
  }
  const fmtINR=value=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:2}).format(Number(value)||0);
  async function loadFees(){
    if(!['school_admin','accountant'].includes(me?.role))throw Error('Fee ledger access denied for this role.');
    await ensureToken();
    const [summary,entries,financeStudents]=await Promise.all([
      responseJson(await timedCloudFetch(BASE+'/rest/v1/rpc/school_fee_summary',{
        method:'POST',cache:'no-store',headers:{apikey:APIKEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},
        body:JSON.stringify({p_institution:me.institution_id})
      })),
      api('school_fee_entries',query({select:'id,student_id,kind,amount_rupees,reference,description,occurred_on',
        institution_id:eq(me.institution_id),order:'occurred_on.desc',limit:'100'})),
      api('rpc/bn_finance_students','','POST',{p_institution_id:me.institution_id})
    ]);
    if(!Array.isArray(financeStudents))throw Error('Finance student directory unavailable.');
    feeStudentRoster=financeStudents;
    const row=Array.isArray(summary)?summary[0]||{}:summary||{};
    put('feeOutstanding',fmtINR(row.outstanding_rupees));
    put('feeEntryCount',String(row.entry_count||0));
    const picker=$('feeStudent'),previous=picker.value;
    picker.replaceChildren();
    for(const student of feeStudentRoster){
      const option=dom('option',student.name+' · '+student.admission_number);
      option.value=student.id;picker.append(option);
    }
    if(feeStudentRoster.some(x=>x.id===previous))picker.value=previous;
    const tbody=$('feeEntries');tbody.replaceChildren();
    const label=new Map(feeStudentRoster.map(s=>[s.id,s.admission_number]));
    const reversed=new Set(entries.filter(e=>/^REV-[0-9a-f-]{36}$/i.test(e.reference||'')).map(e=>e.reference.slice(4)));
    const current=entries.filter(e=>!/^REV-[0-9a-f-]{36}$/i.test(e.reference||'')&&!reversed.has(e.id));
    if(!current.length){
      const tr=dom('tr'),cell=dom('td','No fee entries recorded yet.');
      cell.colSpan=6;tr.append(cell);tbody.append(tr);
    }else{
      for(const entry of current){
        const tr=dom('tr');
        for(const v of [entry.occurred_on,label.get(entry.student_id)||'Student record',entry.kind,fmtINR(entry.amount_rupees),entry.reference||'—'])tr.append(dom('td',v));
        const actions=dom('td');
        if(['school_admin','accountant'].includes(me.role)){
          const edit=dom('button','✏ Edit','ghost');edit.type='button';
          edit.title='Correct this saved fee entry without deleting its audit record';
          edit.addEventListener('click',()=>{
            editingFeeEntry={...entry};
            $('feeStudent').value=entry.student_id;
            $('feeKind').value=entry.kind;
            $('feeAmount').value=entry.amount_rupees;
            $('feeDate').value=entry.occurred_on;
            $('feeDescription').value=entry.description||'';
            $('feeReference').value=''; // original reference stays in audit history
            $('saveFeeEntry').textContent='Save correction';
            display('cancelFeeEdit',true);display('feeEditHint',true);
            $('feeEntryForm').scrollIntoView?.({behavior:'smooth',block:'nearest'});
          });
          actions.append(edit);
        }
        tr.append(actions);tbody.append(tr);
      }
    }
    const date=$('feeDate');
    if(!date.value){
      const now=new Date();
      date.value=new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,10);
    }
  }
  $('feeEntryForm').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
    if(!['school_admin','accountant'].includes(me?.role))throw Error('Fee posting not allowed for this role.');
    const studentId=$('feeStudent').value;
    if(!feeStudentRoster.some(s=>s.id===studentId))throw Error('Select a student belonging to this school.');
    const kind=$('feeKind').value,amount=Number($('feeAmount').value);
    const notes=$('feeDescription').value.trim(),occurred_on=$('feeDate').value;
    if(!['charge','payment'].includes(kind))throw Error('Invalid fee entry type.');
    if(!Number.isFinite(amount)||amount<=0||amount>100000000||Math.abs(amount-Math.round(amount*100)/100)>1e-8)
      throw Error('Enter a valid amount with at most two decimals.');
    if(notes.length>250||!/^\d{4}-\d{2}-\d{2}$/.test(occurred_on))throw Error('Invalid notes or date.');
    // Generate exactly once per attempted save. If a response is lost, a retry
    // reuses the same reference instead of posting a second payment.
    const reference=$('feeReference').value.trim()||newFeeReceipt();
    if(reference.length>100)throw Error('Receipt / reference cannot exceed 100 characters.');
    $('feeReference').value=reference;
    const original=editingFeeEntry;
    const replacement={
      institution_id:me.institution_id,student_id:studentId,created_by:me.id,
      kind,amount_rupees:amount,reference,description:notes,occurred_on
    };
    if(original&&original.reference===reference)throw Error('Use a new reference for a corrected record.');
    const rows=original?feeCorrectionRows(original,replacement):[replacement];
    const button=$('saveFeeEntry');if(button.disabled)return;button.disabled=true;
    try{
      try{
        await api('school_fee_entries','','POST',original?rows:rows[0]);
      }catch(writeError){
        if(!await feeRowsSaved(rows))throw writeError;
      }
      stopFeeEdit();
      await loadFees();
      notify(original?'Fee correction saved in Supabase; original entry preserved in audit history.':'Fee entry saved in Supabase. Receipt: '+reference);
    }finally{button.disabled=false;}
  })});

  async function loadNotices(){
    if(!isTabVisibleForRole('notices',me?.role||'teacher')){$('noticesList').replaceChildren();return;}
    const rows=await api('school_notices',query({select:'id,title,body,created_at',institution_id:eq(me.institution_id),order:'created_at.desc',limit:'100'}));
    const root=$('noticesList');root.replaceChildren();
    if(!rows.length){root.append(dom('p','No notices published yet.'));return;}
    for(const n of rows){const item=dom('div',undefined,'assignment');item.append(dom('h3',n.title),dom('p',n.body),dom('small',new Date(n.created_at).toLocaleDateString(),'muted'));root.append(item);}
  }
  $('refreshNotices').addEventListener('click',()=>run(loadNotices));
  $('parentApp').addEventListener('click',async e=>{e.preventDefault();const jwt=session?.access_token;dropSession();if(jwt)await timedCloudFetch(BASE+'/auth/v1/logout',{method:'POST',headers:{apikey:APIKEY,Authorization:'Bearer '+jwt}}).catch(()=>{});location.assign('./parents.html');});
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

      if(canAcademic()&&isTabVisibleForRole('attendance',me.role)&&writableClasses('can_take_attendance').some(x=>x.id===c.id)){
        const attBtn=dom('button','📋 Attendance','ghost');
        attBtn.type='button';
        attBtn.style.padding='4px 8px';
        attBtn.style.fontSize='12px';
        attBtn.addEventListener('click',()=>{
          if($('attendanceClass')){$('attendanceClass').value=c.id;invalidateRoster();}
          tab('attendance');
          run(loadAttendance);
        });

        right.append(attBtn);
      }
      if(canAcademic()&&isTabVisibleForRole('homework',me.role)&&writableClasses('can_assign_homework').some(x=>x.id===c.id)){
        const hwBtn=dom('button','📝 Homework','ghost');
        hwBtn.type='button';
        hwBtn.style.padding='4px 8px';
        hwBtn.style.fontSize='12px';
        hwBtn.addEventListener('click',()=>{
          if($('homeworkClass')){$('homeworkClass').value=c.id;fillSubject(c.id);}
          tab('homework');
        });
        right.append(hwBtn);
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
    const moduleKey=action==='can_take_attendance'?'attendance':action==='can_assign_homework'?'homework':'classes';
    if(!isTabVisibleForRole(moduleKey,me?.role||'teacher'))return [];
    if(me.role==='school_admin'||me.role==='principal')return allClasses;
    if(me.role!=='teacher')return [];
    return allClasses.filter(c=>allAssignments.some(a=>a.school_user_id===me.id&&a.class_id===c.id&&a.active&&a[action]));
  }
  async function updateStaffName(staff,newName){
    if(!isAdmin()||!staff?.id)throw Error('School admin required to change staff names.');
    if(!newName||newName.length>120)throw Error('Staff name must be 1 to 120 characters.');
    const saved=await api('school_users',query({id:eq(staff.id),institution_id:eq(me.institution_id)}),'PATCH',{display_name:newName});
    if(!Array.isArray(saved)||saved.length!==1||saved[0].display_name!==newName)throw Error('Supabase did not confirm the staff name change.');
    staff.display_name=newName;
    if(staff.id===me?.id){
      me.display_name=newName;
      const schoolLabel=$('schoolLabel')?.textContent||'School';
      put('membership',schoolLabel+' · '+newName+' · '+me.role.replaceAll('_',' '));
    }
  }
  const DEFAULT_ROLE_PERMS={
    teacher:{classes:true,attendance:true,homework:true,notices:true,profiles:false},
    accountant:{classes:false,attendance:false,homework:false,notices:false,profiles:false},
    receptionist:{classes:true,attendance:false,homework:false,notices:true,profiles:true},
    transport_staff:{classes:false,attendance:false,homework:false,notices:true,profiles:false},
    librarian:{classes:false,attendance:false,homework:false,notices:false,profiles:false}
  };
  function getRolePermissions(){return rolePermissions||DEFAULT_ROLE_PERMS;}
  async function loadRolePermissions(){
    if(!me?.institution_id){rolePermissions=null;return DEFAULT_ROLE_PERMS;}
    const rows=await api('school_role_module_permissions',query({select:'role,module_key,enabled',institution_id:eq(me.institution_id)}));
    if(!Array.isArray(rows))throw Error('Supabase role permissions could not be loaded.');
    const next=Object.fromEntries(Object.entries(DEFAULT_ROLE_PERMS).map(([role,modules])=>[role,{...modules}]));
    for(const row of rows){if(next[row.role]&&Object.prototype.hasOwnProperty.call(next[row.role],row.module_key))next[row.role][row.module_key]=row.enabled===true;}
    if(next.accountant)for(const module of Object.keys(next.accountant))next.accountant[module]=false; // Accountant is finance-only.
    rolePermissions=next;return next;
  }
  function isTabVisibleForRole(tabName,role){
    if(tabName==='dashboard')return role==='school_admin';
    if(tabName==='admin')return role==='school_admin';
    if(tabName==='fees')return role==='school_admin'||role==='accountant';
    if(role==='school_admin'||role==='principal')return true;
    if(tabName==='timetable')return role==='teacher';
    if(tabName==='account')return true;
    const perms=getRolePermissions()[role]||DEFAULT_ROLE_PERMS[role];
    if(!perms)return false;
    return Boolean(perms[tabName]);
  }
  function applyNavigationVisibility(){
    const role=me?.role||'teacher';
    const isAdm=isAdmin();
    display('dashboardTab',false); // Full ERP owns the Dashboard; this workspace keeps staff tools.
    display('adminTab',isAdm);
    display('librarianApp',isAdm||role==='librarian'||role==='principal');
    display('profilesTab',isAdm||isTabVisibleForRole('profiles',role));
    display('timetableTab',isAdm||role==='teacher'||role==='principal');
    display('schoolOsAdminNav',isAdm); // Owner/admin can reach full ERP modules without losing this portal's working staff tools.
    display('adminErpBanner',false); // The existing Dashboard and School OS shortcut already launch ERP.
    display('portalPermissionNotice',!isAdm);
    if($('loadProfile'))$('loadProfile').textContent=isAdm?'View / edit student':'View student details';
    display('staffDesktopShortcut',isAdm);
    display('staffBackToErp',isAdm);
    display('staffBrandBack',isAdm);
    display('staffSmartToolsLink',canAcademic());
    display('staffSmartToolsQuickLink',canAcademic());
    display('feesTab',isAdm||role==='accountant');
    document.querySelectorAll('[data-tab]').forEach(btn=>{
      const t=btn.dataset.tab;
      if(t==='dashboard')btn.classList.add('hidden');
      else if(t==='admin')btn.classList.toggle('hidden',!isAdm);
      else if(t==='profiles')btn.classList.toggle('hidden',!(isAdm||isTabVisibleForRole('profiles',role)));
      else if(t!=='account'){
        btn.classList.toggle('hidden',!isTabVisibleForRole(t,role));
      }
    });
  }
  function getStaffPermissionsSummary(staff){
    if(staff.role==='school_admin')return dom('span','👑 School Admin (verified school controls)','pill');
    if(staff.role==='principal')return dom('span','📘 Academic oversight (no owner-only actions)','pill');
    if(staff.role==='accountant')return dom('span','₹ Fees & payments only','pill');
    if(staff.role==='librarian')return dom('span','📚 Library inventory and lending only','pill');
    if(staff.role!=='teacher')return dom('span','Staff role: '+staff.role.replaceAll('_',' '),'pill');
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
    if(s.display_name)return s.display_name;
    if(identity&&identity.id===s.auth_user_id){
      const own=identity.user_metadata?.full_name||identity.user_metadata?.name;
      if(own)return own;
    }
    return s.email||'';
  }
  function staffLabel(s){
    const name=staffName(s);
    return name||s.email||'Unnamed staff member';
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
    }else if(isTabVisibleForRole('profiles',me?.role||'teacher')){
      if($('profileClassFilter'))options('profileClassFilter',[{id:'',name:'All accessible classes'}].concat(allClasses),c=>c.id?className(c):c.name);
      renderProfileStudents();clearProfileEditor();
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
        if(newName&&newName.trim())run(async()=>{
          await updateStaffName(staff,newName.trim());
          renderAdmin();renderSelects();
          notify('Cloud name updated to "'+newName.trim()+'".');
        });
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
      const manageableRoles=['teacher','accountant','receptionist','transport_staff','librarian'];
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
          cb.checked=Boolean(currentRolePerms[r]?.[m])&&r!=='accountant';
          if(r==='accountant'){cb.disabled=true;cb.title='Finance-only role. Use Fees & Payments, not school academic modules.';}
          checks[m]=cb;
          mTd.append(cb);
          rTr.append(mTd);
        }
        const actTd=dom('td');
        const saveRoleBtn=dom('button','Save','ghost');
        saveRoleBtn.type='button';
        saveRoleBtn.style.padding='4px 8px';
        if(r==='accountant'){saveRoleBtn.disabled=true;saveRoleBtn.title='Finance-only role is fixed; no academic module permissions';}
        saveRoleBtn.addEventListener('click',()=>run(async()=>{
          if(!isAdmin())throw Error('School admin required.');
          saveRoleBtn.disabled=true;
          try{
            const payload=modules.map(module_key=>({institution_id:me.institution_id,role:r,module_key,enabled:checks[module_key].checked}));
            const result=await api('school_role_module_permissions','on_conflict=institution_id,role,module_key','POST',payload,'resolution=merge-duplicates,return=representation');
            if(!Array.isArray(result)||result.length!==modules.length)throw Error('Supabase did not confirm every permission. Refresh and check again.');
            await loadRolePermissions();renderAdmin();applyNavigationVisibility();
            notify('Cloud permissions saved for '+r.replaceAll('_',' ')+'.');
          }finally{saveRoleBtn.disabled=false;}
        }));
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
      left.append(dom('strong',staffLabel(staff)+' · '+(c?className(c):'Class')));
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
    try{clearNotice();await task()}catch(e){
      if(/email.*(?:not.confirmed|not.verified|unconfirmed)|confirm your email/i.test(e.message||''))
        emailDialog('unconfirmed',$('loginEmail').value.trim()||$('ownerSignupEmail').value.trim());
      else notify(e.message||'Operation could not be completed.',true);
    }
  }
  $('continuePreviousSession').addEventListener('click',()=>run(async()=>{
    display('savedSessionPanel',false);
    await load();
  }));
  $('differentSchoolLogin').addEventListener('click',()=>run(switchToDifferentAccount));
  $('switchSchoolAccount').addEventListener('click',()=>run(switchToDifferentAccount));
  $('schoolPicker').addEventListener('change',e=>run(async()=>{
    const nextSchool=e.target.value;
    if(!session||!me||nextSchool===me.institution_id)return;
    const picker=$('schoolPicker');picker.disabled=true;
    try{
      display('portalSection',false);
      await load(nextSchool);
      notify('Authorized school selected. Records were refreshed from Supabase.');
    }finally{picker.disabled=false;}
  }));
  $('showOwnerSignup').addEventListener('click',()=>{
    showAuthView('signup');$('ownerSignupEmail').value=$('loginEmail').value.trim()||$('ownerSignupEmail').value;
    $('ownerSignupEmail').focus();
  });
  $('returnToLoginFromSignup').addEventListener('click',()=>{showAuthView('login');$('loginEmail').focus();});
  $('returnToLoginFromForgot').addEventListener('click',()=>{showAuthView('login');$('loginEmail').focus();});
  $('ownerSignupForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
    const button=$('ownerSignupSubmit');if(button.disabled)return;
    const email=$('ownerSignupEmail').value.trim().toLowerCase(),password=$('ownerSignupPassword').value;
    if(!email||password.length<12)throw Error('Enter a valid email and password with at least 12 characters.');
    button.disabled=true;
    try{
      const res=await authRequest('signup?redirect_to='+encodeURIComponent(emailReturnUrl()),{email,password});
      $('ownerSignupPassword').value='';
      if(res.access_token&&res.refresh_token){
        saveSession(res);showAuthView('login');await load();
      }else{
        showAuthView('login');
        emailDialog('pending',email);
      }
    }finally{button.disabled=false;}
  })});
  $('createFirstSchoolForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
    const button=$('createFirstSchoolButton');if(button.disabled)return;
    await ensureToken();
    const name=$('firstSchoolName').value.trim();
    if(name.length<3||name.length>120)throw Error('Enter a school name between 3 and 120 characters.');
    button.disabled=true;
    try{
      // The authenticated, SECURITY DEFINER RPC enforces one school per account.
      // It creates a fresh institution and a verified school_admin membership.
      if(FROM_LOCAL&&!LOCAL_DRAFT&&localStorage.getItem('bright-nexa-school-os:snapshot:v1'))
        throw Error('Your existing local school could not be read. Device data was preserved; do not create a different school.');
      const importing=!!LOCAL_DRAFT;
      if(importing){
        if(!window.BNWorkspaceCloud?.buildProjection||!window.BNSchoolLocalHandoff)
          throw Error('Local-to-Supabase import service is unavailable. Refresh without clearing data.');
        if(!$('localSchoolImportConsent').checked)
          throw Error('Confirm that this local school belongs to you before importing it.');
        if(LOCAL_DRAFT.name!==name)
          throw Error('Use the saved local school name to connect your draft. Existing local records were not changed.');
        const ops=LOCAL_DRAFT.operations||{};
        if(['feeStructures','feePayments','studentFeeDues','classFeeCharges'].some(k=>Array.isArray(ops[k])&&ops[k].length))
          throw Error('Local fee records require separate reconciliation. Cloud school was not created.');
      }
      // The first-school RPC authenticates the email-confirmed owner and
      // atomically creates the tenant and school_admin membership.
      const schoolId=await api('rpc/register_first_school','','POST',{p_school_name:name});
      if(!/^[0-9a-f-]{36}$/i.test(String(schoolId)))throw Error('School creation returned no valid school ID.');
      sessionStorage.setItem(SELECTED_SCHOOL_KEY,String(schoolId));
      let initial;
      try{
        initial=await api('rpc/bn_initialize_school_workspace','','POST',{p_institution_id:String(schoolId)});
        if(initial?.school?.id!==String(schoolId)||!initial?.snapshot)
          throw Error('The new cloud workspace was not confirmed.');
        if(importing){
          const {snapshot,projection}=window.BNSchoolLocalHandoff.prepare(
            LOCAL_DRAFT,initial,window.BNWorkspaceCloud.buildProjection);
          const saved=await api('rpc/school_workspace_push','','POST',{
            p_institution_id:String(schoolId),p_expected_revision:initial.revision,
            p_snapshot:snapshot,p_projection:projection});
          if(saved?.school?.id!==String(schoolId)||!(saved.revision>initial.revision))
            throw Error('Supabase did not confirm the imported school.');
          const checked=await api('rpc/school_workspace_pull','','POST',{p_institution_id:String(schoolId)});
          if(checked?.school?.id!==String(schoolId)||
             checked.snapshot?.institution?.institution?.name!==name||
             checked.revision!==saved.revision||
             !Array.isArray(checked.snapshot?.students)||
             checked.snapshot.students.length!==snapshot.students.length)
            throw Error('Imported local records failed cloud read-back verification.');
          // Only a confirmed cloud save authorizes clearing the same-device
          // legacy IndexedDB snapshot, and only after the ERP verifies the tenant.
          localStorage.setItem('bn_school_import_pending_clear_v1',JSON.stringify({
            schoolId:String(schoolId),revision:checked.revision,name}));
        }
      }catch(err){
        throw Error('School "'+name+'" was registered in Supabase, but '+(importing?'local import':'workspace initialization')+
          ' is not verified: '+(err.message||err)+
          '. Your original device data is still retained. Sign in again rather than creating a duplicate school.');
      }
      await load(String(schoolId));
      notify(importing?'Local school '+name+' imported and verified in Supabase.':'New empty Supabase school created.');
    }finally{button.disabled=false;}
  })});
  $('createSchoolChangeAccount').addEventListener('click',()=>run(switchToDifferentAccount));
  $('loginForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
    const btn=e.submitter;btn.disabled=true;
    try{const tokens=await authRequest('token?grant_type=password',{email:$('loginEmail').value.trim(),password:$('loginPassword').value});saveSession(tokens);await load()}
    finally{btn.disabled=false}
  })});
  $('forgotPasswordLink').addEventListener('click',()=>{
    display('forgotFeedback',false);
    showAuthView('forgot');
    $('forgotEmail').value=$('loginEmail').value.trim();$('forgotEmail').focus();
  });
  $('forgotPasswordForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
    const button=$('sendResetEmail');
    if(button.disabled)return;
    const email=$('forgotEmail').value.trim().toLowerCase();
    if(!email||!$('forgotEmail').checkValidity()){
      resetFeedback('Enter a valid registered email address.',true);return;
    }
    button.disabled=true;
    button.textContent='Requesting reset link...';
    display('forgotFeedback',false);
    try{
      // One canonical HTTPS recovery URL, also used by confirmation emails.
      // Redirect must be allow-listed in Supabase Auth URL Configuration.
      const redirect=emailReturnUrl();
      const response=await timedCloudFetch(BASE+'/auth/v1/recover?redirect_to='+encodeURIComponent(redirect),{
        method:'POST',headers:{apikey:APIKEY,'Content-Type':'application/json'},
        body:JSON.stringify({email}),cache:'no-store'
      });
      const payload=await response.json().catch(()=>({}));
      if(!response.ok){
        const detail=String(payload.error_code||payload.code||payload.msg||payload.message||payload.error||'');
        if(response.status===429 || /rate.limit|too.many|only.request.this.after/i.test(detail)){
          const retry=Number(response.headers?.get?.('retry-after'));
          const wait=Number.isFinite(retry)&&retry>0?Math.ceil(retry)+' seconds':'about a minute';
          throw Error('Too many password reset requests. Please wait '+wait+' before trying again.');
        }
        if(/email.*not.authorized|smtp|email.provider/i.test(detail))
          throw Error('The school email service could not send this request. Administrator: check Supabase Auth email/SMTP settings.');
        if(/redirect|not.allowed/i.test(detail))
          throw Error('Password reset redirect is not authorized. Administrator: allow the School OS recovery URL in Supabase Auth.');
        if(response.status>=500)
          throw Error('The school email service is temporarily unavailable. Please try again later.');
        throw Error('Reset request was rejected (HTTP '+response.status+'). Please contact the school administrator.');
      }
      // HTTP 200 confirms the request was accepted, NOT inbox delivery.
      resetFeedback('Reset request accepted for eligible existing accounts; this does not confirm an email was sent or delivered. First-time teachers and staff must be invited by their School Admin before password recovery can work. If your account was already activated, check Inbox and Spam, and wait at least a minute before retrying.');
    }catch(error){
      resetFeedback(error?.message||'Could not request a password reset email. Check your connection and retry.',true);
    }finally{
      button.disabled=false;
      button.textContent='Send reset link';
    }
  })});
  $('activateForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
    if(!session)throw Error('Email link expired. Please request a fresh link.');
    const pw=$('newPassword').value;
    if(pw.length<12||pw.length>256)throw Error('Password must contain 12–256 characters.');
    const data=await apiAuthUserUpdate(pw);
    if(!data.id)throw Error('Could not update password.');
    $('activateForm').reset();
    if(recoveryMode){
      const token=session.access_token;
      await timedCloudFetch(BASE+'/auth/v1/logout',{method:'POST',headers:{apikey:APIKEY,Authorization:'Bearer '+token}}).catch(()=>{});
      dropSession();
      notify('Password reset successfully. Sign in with your new password.');
      return;
    }
    display('activation',false);notify('Password set. You can now sign in.');
    await load();
  })});
  async function apiAuthUserUpdate(password,currentPassword,accessToken){
    await ensureToken();
    return responseJson(await timedCloudFetch(BASE+'/auth/v1/user',{method:'PUT',headers:{apikey:APIKEY,Authorization:'Bearer '+(accessToken||session.access_token),'Content-Type':'application/json'},body:JSON.stringify(currentPassword?{password,current_password:currentPassword}:{password})}));
  }
  // Staff self-service password change. Authenticate the CURRENT password
  // with Supabase Auth, then use that freshly authenticated short-lived session
  // to perform the update. Roles and class permissions are not changed here.
  
  $('saveAccountNameButton')?.addEventListener('click',()=>run(async()=>{
    const nextName=($('accountNameInput')?.value||'').trim();
    if(!nextName)throw Error('Enter a staff display name.');
    const button=$('saveAccountNameButton');button.disabled=true;
    try{
      const savedIdentity=await responseJson(await timedCloudFetch(BASE+'/auth/v1/user',{
        method:'PUT',
        headers:{apikey:APIKEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},
        body:JSON.stringify({data:{full_name:nextName,name:nextName}})
      }));
      if(savedIdentity.id!==identity.id)throw Error('Supabase Auth did not confirm the name change.');
      identity.user_metadata={...identity.user_metadata,...savedIdentity.user_metadata};
      if(isAdmin())await updateStaffName(me,nextName);
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
      await timedCloudFetch(BASE+'/auth/v1/logout',{method:'POST',headers:{apikey:APIKEY,Authorization:'Bearer '+freshToken}}).catch(()=>{});
      freshToken=null;
      await timedCloudFetch(BASE+'/auth/v1/logout',{method:'POST',headers:{apikey:APIKEY,Authorization:'Bearer '+session.access_token}}).catch(()=>{});
      dropSession();
      notify('Password changed successfully. Please sign in again with your new password.');
    }finally{
      if(freshToken){
        await timedCloudFetch(BASE+'/auth/v1/logout',{method:'POST',headers:{apikey:APIKEY,Authorization:'Bearer '+freshToken}}).catch(()=>{});
      }
      form.reset();
      button.disabled=false;
    }
  })});
  $('logout').addEventListener('click',()=>{run(async()=>{
    if(session?.access_token)await timedCloudFetch(BASE+'/auth/v1/logout',{method:'POST',headers:{apikey:APIKEY,Authorization:'Bearer '+session.access_token}}).catch(()=>{});
    dropSession();notify('Signed out.');
  })});
  $('reload').addEventListener('click',()=>run(async()=>{await reload();notify('Updated from cloud.')}));
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.tab)));
  $('homeworkClass').addEventListener('change',()=>fillSubject($('homeworkClass').value));
  $('loadAttendance').addEventListener('click',()=>run(loadAttendance));
  let currentRoster=[],rosterScope=null,rosterGeneration=0;
  function invalidateRoster(){rosterGeneration++;currentRoster=[];rosterScope=null;$('rosterList').replaceChildren();display('saveAttendance',false);display('markRemainingPresent',false);}
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
      const status=records.find(r=>r.student_id===student.id)?.status||'';
      const select=newSelect(['','present','absent','late','excused'],status);
      select.children[0].textContent='Not marked';
      select.value=status;
      select.setAttribute('aria-label','Attendance for '+student.name);
      select.dataset.studentId=student.id;select.dataset.classId=cls;
      line.append(left,select);root.append(line);
    }
    display('saveAttendance',currentRoster.length>0);
    display('markRemainingPresent',currentRoster.length>0);
    if(!currentRoster.length)root.append(dom('p','No students are published for this class.'));
  }
  $('markRemainingPresent').addEventListener('click',()=>{
    if(!rosterScope||rosterScope.classId!==$('attendanceClass').value||rosterScope.day!==$('attendanceDate').value)return;
    for(const select of $('rosterList').querySelectorAll('select[data-student-id]'))if(!select.value)select.value='present';
  });
  $('saveAttendance').addEventListener('click',()=>run(async()=>{
    const cls=$('attendanceClass').value,day=$('attendanceDate').value;
    const selects=[...$('rosterList').querySelectorAll('select[data-student-id]')];
    if(!selects.length||!rosterScope)throw Error('Load the roster first.');
    if(!writableClasses('can_take_attendance').some(c=>c.id===cls))throw Error('You are not assigned to this attendance class.');
    if(rosterScope.classId!==cls||rosterScope.day!==day)throw Error('Class or date changed. Reload roster.');
    if(selects.some(s=>s.dataset.classId!==cls))throw Error('Class changed. Reload roster.');
    if(selects.some(s=>!['present','absent','late','excused'].includes(s.value)))throw Error('Mark every student before saving attendance.');
    const records=selects.map(s=>({student_id:s.dataset.studentId,class_id:cls,institution_id:me.institution_id,day,status:s.value,recorded_by:me.id}));
    const button=$('saveAttendance');if(button.disabled)return;button.disabled=true;
    try{
      const expected=new Map(records.map(row=>[row.student_id,row.status]));
      let confirmed=false,writeFailure=null;
      try{
        const saved=await api('school_attendance','on_conflict=student_id%2Cday','POST',records,'resolution=merge-duplicates,return=representation');
        confirmed=Array.isArray(saved)&&saved.length===records.length&&saved.every(row=>expected.get(row.student_id)===row.status);
      }catch(error){writeFailure=error;}
      if(!confirmed){
        try{
          const readBack=await api('school_attendance',query({select:'student_id,status',class_id:eq(cls),day:eq(day),institution_id:eq(me.institution_id)}));
          confirmed=Array.isArray(readBack)&&readBack.length===records.length&&readBack.every(row=>expected.get(row.student_id)===row.status);
        }catch(_) {}
      }
      if(!confirmed)throw writeFailure||Error('Attendance write was not confirmed for the full class. Please refresh the roster before retrying.');
      notify('Attendance verified in Supabase for '+records.length+' students on '+day+'. Linked parents can refresh attendance in their app.');
    }finally{button.disabled=false;}
  }));
  $('homeworkForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
    const class_id=$('homeworkClass').value;
    if(!writableClasses('can_assign_homework').some(c=>c.id===class_id))throw Error('You are not assigned to this class.');
    const subject=$('homeworkSubject').value.trim(),title=$('homeworkTitle').value.trim();
    if(!subject||!title)throw Error('Subject and task are required.');
    const button=$('publishHomework');if(button.disabled)return;const selectedFiles=Array.from($('homeworkFiles').files||[]);if(selectedFiles.length>5)throw Error('Choose up to 5 files.');for(const file of selectedFiles)await window.BNHomeworkFiles.validate(file);button.disabled=true;
    try{
      const form=$('homeworkForm');
      const id=form.dataset.pendingHomeworkId||(form.dataset.pendingHomeworkId=crypto.randomUUID());
      const payload={id,institution_id:me.institution_id,class_id,subject,title,
        instructions:$('homeworkInstructions').value.trim(),due_on:$('homeworkDate').value||null,created_by:me.id};
      let published=null,writeFailure=null;
      try{
        const result=await api('school_homework','','POST',payload);
        if(Array.isArray(result)&&result.length===1&&result[0].id===id)published=result[0];
      }catch(error){writeFailure=error;}
      if(!published){
        // A successful INSERT can lose its network response. Reuse this form's
        // stable UUID and read back instead of creating duplicate homework.
        try{
          const saved=await api('school_homework',query({select:'*',id:eq(id),institution_id:eq(me.institution_id),limit:'2'}));
          if(Array.isArray(saved)&&saved.length===1&&saved[0].class_id===class_id&&saved[0].title===title&&saved[0].subject===subject)published=saved[0];
        }catch(_){}
      }
      if(!published)throw writeFailure||Error('Homework was not confirmed in Supabase. Retry without changing the form.');
      delete form.dataset.pendingHomeworkId;
      let fileError=null;
      try{if(selectedFiles.length)await homeworkFiles.upload(published,selectedFiles);}
      catch(err){fileError=err;}
      e.target.reset();await reload();
      notify(fileError?'Homework saved. Some files were not uploaded: '+fileError.message+' Use Add photo / PDF on this homework to retry.':'Homework verified in Supabase with '+selectedFiles.length+' file(s).',!!fileError);
    }finally{button.disabled=false;}
  })});
  $('inviteForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
    if(!isAdmin())throw Error('School admin required.');
    await ensureToken();
    const invEmail=$('inviteEmail').value.trim();
    const invRole=$('inviteRole').value;
    const invName=($('inviteName')?.value||'').trim();
    const r=await responseJson(await timedCloudFetch(BASE+'/functions/v1/school-invite-staff',{
      method:'POST',headers:{apikey:APIKEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},
      body:JSON.stringify({email:invEmail,role:invRole})
    }));
    e.target.reset();await reload();
    const invited=allStaff.find(st=>st.email?.toLowerCase()===invEmail.toLowerCase());
    if(invName&&invited)await updateStaffName(invited,invName);
    notify('Invitation requested for '+(invName?invName+' ('+r.email+')':r.email)+'. Check email activation.');
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
    if(!allStaff.some(s=>s.id===rec.school_user_id&&s.role==='teacher'&&s.status==='active'))throw Error('Select an active teacher whose email activation is complete.');
    if(!allClasses.some(c=>c.id===rec.class_id))throw Error('Select an existing class.');
    await api('school_teacher_assignments','','POST',rec);
    await reload();notify('Teacher assignment saved.');
  })});
  $('studentForm').addEventListener('submit',e=>{e.preventDefault();run(async()=>{
    throw Error('Add admissions in the main School OS Students module. This old test-student form is disabled to prevent duplicate records.');
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
  if(FROM_LOCAL){
    // Local draft information belongs to the authenticated school-creation step,
    // never the public sign-in screen; it is not a login error.
    if(LOCAL_DRAFT){
      put('localSchoolNoticeTitle','Saved school setup: '+LOCAL_DRAFT.name);
      put('localSchoolNoticeText','This browser contains a school setup that is not yet verified online. If this is your school, choose the import option after signing in. Nothing is deleted before successful online read-back.');
      $('firstSchoolName').value=LOCAL_DRAFT.name;
      $('loginEmail').value=LOCAL_DRAFT.email;
      $('ownerSignupEmail').value=LOCAL_DRAFT.email;
      display('localSchoolImportLabel',true);
      $('createFirstSchoolButton').textContent='Create '+LOCAL_DRAFT.name+' in Supabase';
    }else{
      put('localSchoolNoticeTitle','Review existing school setup');
      put('localSchoolNoticeText','We could not read the saved setup on this browser. Existing data has not been changed.');
    }
  }
  // Only Supabase-issued authenticated invite fragments are processed; tokens
  // are immediately removed from address bar after parsing.
  let confirmedByEmailLink=false;
  let authLinkExpired=false;
  try {
    const hash=new URLSearchParams(location.hash.replace(/^#/,''));
    authLinkExpired=!!hash.get('error')&&/expired|invalid|denied|access_denied/i.test((hash.get('error_code')||'')+' '+hash.get('error'));
    if(authLinkExpired)history.replaceState(null,'',location.pathname+location.search);
    if(hash.has('access_token')&&hash.has('refresh_token')){
      saveSession({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_in:parseInt(hash.get('expires_in')||'3600',10)});
      recoveryMode=hash.get('type')==='recovery';
      confirmedByEmailLink=['signup','email'].includes(hash.get('type'));
      if(['invite','recovery'].includes(hash.get('type'))){
        showAuthView('activation');
        if(recoveryMode){
          put('activationTitle','Reset staff password');
          put('activationDescription','Set a new password for your school account. The old password will not be emailed.');
        }
      }
      history.replaceState(null,'',location.pathname+location.search);
    }else{
      const saved=sessionStorage.getItem(TOKEN_KEY);
      if(saved)session=JSON.parse(saved);
    }
  }catch{dropSession()}
  if(authLinkExpired)emailDialog('expired');
  if(confirmedByEmailLink&&session){
    fetch(BASE+'/auth/v1/user',{headers:{apikey:APIKEY,Authorization:'Bearer '+session.access_token},cache:'no-store'})
      .then(responseJson).then(user=>{
        if(user.email_confirmed_at||user.confirmed_at)emailDialog('verified',user.email||'');
        else notify('Email confirmation has not been verified. Request another email link.',true);
      }).catch(()=>notify('Could not verify the email confirmation. Please sign in again.',true));
  }
  if(session&&!$('activation').classList.contains('hidden')){
    notify(recoveryMode?'Secure recovery link verified. Set your new password.':'Invitation verified. Set your new password to continue.');
  }else if(session){
    const requested=new URLSearchParams(location.search).get('view');
    let verifiedErp=null;
    try{verifiedErp=JSON.parse(sessionStorage.getItem('bright-nexa-school-os:session:v2')||'null');}catch(_){}
    // Only owner navigation from an already-verified ERP may auto-resume.
    // load() ALWAYS rechecks the token, active school membership and role
    // through Supabase; no browser-stored flag can grant data access.
    if(requested==='timetable'&&verifiedErp?.cloudVerified===true
      &&verifiedErp?.role==='OWNER'&&verifiedErp?.cloudUserId){
      run(()=>load());
    }else{
      display('savedSessionPanel',true);
    }
  }
})();
