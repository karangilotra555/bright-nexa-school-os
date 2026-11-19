/* Bright Nexa Leadership App — verified school roles, Supabase only. No offline school data. */
(function(root){
'use strict';
const BASE='https://mrfvbwmyxndrakskqyas.supabase.co';
const KEY='sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT';
const allowedRoles=new Set(['school_admin','principal']);
const staffSessionKey='bn_school_staff_session_v1';
const staffSchoolKey='bn_school_staff_selected_school_v1';
const staffEntry='./teacher-access.html?view=attendance';
const denied=error=>[401,403].includes(error.status);
const schoolAccessError=()=>Object.assign(Error('Active Owner or Principal school access is required.'),{status:403});
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const escapeFilter=value=>String(value).replace(/[^a-zA-Z0-9_-]/g,'');
function create(fetcher=root.fetch?.bind(root),storage=root.BNMobileSession?.createStore('leadership')){
  let session=null,schools=[],selected=null,version=0,refreshing=null;
  async function send(path,options={},withAuth=true){
    if(withAuth)await fresh();
    if(withAuth&&!session?.access_token)throw Error('Sign in to your school account.');
    const controller=typeof AbortController!=='undefined'?new AbortController():null;
    let timer;
    try{
      const response=await Promise.race([
        fetcher(BASE+path,{...options,cache:'no-store',...(controller?{signal:controller.signal}:{}),
          headers:{apikey:KEY,'Content-Type':'application/json',...(withAuth?{Authorization:'Bearer '+session.access_token}:{}),...options.headers}}),
        new Promise((_,reject)=>{timer=setTimeout(()=>{controller?.abort();reject(Error('School network timed out. Please retry.'));},20000);})
      ]);
      const raw=await response.text();
      let data;try{data=raw?JSON.parse(raw):null;}catch(_){data=raw;}
      if(!response.ok)throw Object.assign(Error(data?.message||data?.msg||data?.error_description||data?.error||'School service unavailable ('+response.status+').'),{status:response.status});
      return {data,response};
    }finally{clearTimeout(timer);}
  }
  function installSession(value){
    if(!value?.access_token||!value?.refresh_token)throw Error('Invalid school authentication response.');
    session={...value,expires_at:Number(value.expires_at)||(Date.now()/1000+Number(value.expires_in||3600))};
  }
  async function refresh(token){
    try{
      return (await send('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:token})},false)).data;
    }catch(error){
      if(error.status===400)error.status=401;
      throw error;
    }
  }
  function remember(newLogin,marker){
    return storage?.write(JSON.stringify({token:session.refresh_token,schoolId:selected.id}),newLogin,marker);
  }
  async function fresh(){
    if(session?.expires_at>Date.now()/1000+90)return;
    if(!session?.refresh_token)throw Error('Your session has expired. Sign in again.');
    if(!refreshing)refreshing=(async()=>{
      const previous=session;
      const marker=storage?.marker?.();
      const data=await refresh(previous.refresh_token);
      if(session!==previous||marker!==storage?.marker?.())throw Error('Your session has expired. Sign in again.');
      installSession(data);
      if(selected)await remember(false,marker);
    })().finally(()=>{refreshing=null;});
    await refreshing;
  }
  async function verify(requestedSchool,requireSchool=false){
    const user=(await send('/auth/v1/user')).data;
    if(!user?.id)throw Error('School identity could not be verified.');
    if(user.app_metadata?.bn_teacher_mobile_pending===true)throw Object.assign(Error('Finish setting your school password in Staff sign-in.'),{status:403});
    const query=new URLSearchParams({select:'id,institution_id,auth_user_id,role,status,display_name',auth_user_id:'eq.'+escapeFilter(user.id),status:'eq.active',limit:'100'});
    const rows=(await send('/rest/v1/school_users?'+query)).data;
    if(!Array.isArray(rows))throw Error('School memberships could not be verified.');
    const verified=[];
    for(const member of rows){
      if(member.auth_user_id!==user.id||member.status!=='active'||!allowedRoles.has(member.role)||!member.institution_id)continue;
      try{
        const params=new URLSearchParams({select:'id,name,status',id:'eq.'+escapeFilter(member.institution_id),limit:'1'});
        const institutions=(await send('/rest/v1/institutions?'+params)).data;
        const school=institutions?.[0];
        if(school?.id===member.institution_id&&['active','trial'].includes(school.status)){
          verified.push({id:school.id,name:school.name||'Verified school',role:member.role,displayName:member.display_name||'School leadership'});
        }
      }catch(error){if(!denied(error))throw error;}
    }
    const preferred=verified.find(x=>x.id===(requestedSchool||selected?.id));
    if(!verified.length||(requireSchool&&requestedSchool&&!preferred))throw schoolAccessError();
    schools=verified;
    selected=preferred||verified[0];
    return {schools:[...schools],selected};
  }
  async function openSession(tokens,requestedSchool,newLogin,marker){
    try{
      if(marker!==storage?.marker?.())throw Error('Please sign in again.');
      installSession(tokens);
      const verified=await verify(requestedSchool,newLogin);
      if(marker!==storage?.marker?.()||!session)throw Error('Please sign in again.');
      const activeSession=session;
      const saved=await remember(newLogin,marker);
      const expectedMarker=newLogin&&saved===true?null:marker;
      if(saved===false||session!==activeSession||(storage?.marker&&storage.marker()!==expectedMarker))throw Error('Please sign in again.');
      if(saved)storage.activate?.();
      return verified;
    }catch(error){session=null;schools=[];selected=null;throw error;}
  }
  async function login(email,password){
    const marker=storage?.marker?.();
    const result=await send('/auth/v1/token?grant_type=password',{method:'POST',
      body:JSON.stringify({email:String(email).trim(),password})},false);
    return openSession(result.data,null,true,marker);
  }
  async function resumeStaff(tokens,schoolId){
    if(!schoolId)throw Error('Select a verified school.');
    return openSession(tokens,schoolId,true,storage?.marker?.());
  }
  async function restore(){
    const marker=storage?.marker?.();
    const saved=await storage?.read();
    if(!saved)return null;
    let record={token:saved}; // Accept older installs that kept only the token.
    if(saved.startsWith('{')){
      try{record=JSON.parse(saved);}catch(_){record=null;}
      if(!record?.token){await storage.clear();return null;}
    }
    try{return await openSession(await refresh(record.token),record.schoolId,false,marker);}
    catch(error){
      if(!denied(error))throw error;
      await storage?.clear();
      return null;
    }
  }
  async function choose(id){
    const match=schools.find(x=>x.id===id);
    if(!match)throw Error('Select a verified school.');
    selected=match;version++;
    await remember(false,storage?.marker?.());
    return match;
  }
  function school(){if(!selected)throw Error('Select a verified school.');return selected;}
  async function rpc(name,args={}){
    if(!/^bn_(?:list_teacher_leaves|review_teacher_leave|school_dated_timetable|teacher_leave_cover_plan|publish_teacher_covers|leadership_school_pulse|leadership_fee_snapshot|leadership_publish_urgent_notice|leadership_urgent_delivery_status)$/.test(name))throw Error('Unsupported leadership operation.');
    const owner=school();
    return (await send('/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify({p_school:owner.id,...args})})).data;
  }
  async function overview(){
    const owner=school(),epoch=version,day=today();
    const [leaves,pulse,fees]=await Promise.all([
      rpc('bn_list_teacher_leaves'),
      rpc('bn_leadership_school_pulse',{p_day:day}),
      rpc('bn_leadership_fee_snapshot',{p_day:day})
    ]);
    if(epoch!==version||owner.id!==selected?.id)throw Error('School changed. Reload the dashboard.');
    if(!Array.isArray(leaves)||!pulse||!fees)throw Error('School reports could not be verified.');
    return {school:owner,leaves,pulse,fees,students:pulse.students,teachers:pulse.teachers,
      pending:leaves.filter(x=>x.status==='pending').length,
      emergency:leaves.filter(x=>x.status==='pending'&&x.kind==='emergency').length,
      approved:leaves.filter(x=>x.status==='approved').length};
  }
  async function attendanceEntry(section,store=root.sessionStorage){
    if(school().role!=='school_admin')throw Object.assign(Error('Owner or Admin access is required for the ERP attendance register.'),{status:403});
    if(!['students','teaching'].includes(section))throw Error('Choose a valid attendance register.');
    await fresh();
    store.setItem(staffSchoolKey,school().id);
    const {access_token,refresh_token,expires_at}=session;
    store.setItem(staffSessionKey,JSON.stringify({access_token,refresh_token,expires_at}));
    return './index.html?'+new URLSearchParams({openSchool:'true',tab:'Attendance',attendance:section});
  }
  async function timetableClasses(){
    const params=new URLSearchParams({
      institution_id:'eq.'+school().id,select:'id,name,section,academic_stream',order:'name.asc,section.asc,academic_stream.asc'
    });
    return (await send('/rest/v1/school_classes?'+params)).data;
  }
  function datedTimetable(classId,day){
    return rpc('bn_school_dated_timetable',{p_class:classId,p_from:day,p_to:day});
  }
  async function review(id,decision){
    if(!['approved','declined'].includes(decision))throw Error('Invalid leave decision.');
    const target=String(id||'');if(!/^[0-9a-f-]{36}$/i.test(target))throw Error('Invalid leave request.');
    return rpc('bn_review_teacher_leave',{p_leave:target,p_status:decision});
  }
  async function covers(id,day){return rpc('bn_teacher_leave_cover_plan',{p_leave:id,p_day:day});}
  async function publish(id,day,entries){
    if(!Array.isArray(entries)||!entries.length)throw Error('Choose at least one valid substitute.');
    return rpc('bn_publish_teacher_covers',{p_leave:id,p_day:day,p_covers:entries});
  }
  async function publishUrgent(title,body,requestId){
    if(!/^[0-9a-f-]{36}$/i.test(String(requestId||'')))throw Error('Secure notice request ID required.');
    if(String(title||'').trim().length<8||String(title).trim().length>120||
       String(body||'').trim().length<15||String(body).trim().length>1500)
      throw Error('Notice title must be 8–120 characters and message 15–1500 characters.');
    return rpc('bn_leadership_publish_urgent_notice',{
      p_request_id:requestId,p_title:title.trim(),p_body:body.trim()
    });
  }
  const urgentDeliveryStatus=id=>rpc('bn_leadership_urgent_delivery_status',{p_notice:id});
  async function suggestCover(id,day){
    const current=school();await fresh();
    const host=root.location?.hostname||'';
    const endpoint=['bright-nexa-school-os.onrender.com','karangilotra555.github.io'].includes(host)
      ?'https://bright-nexa-school-os-api.onrender.com/api/timetable/cover-ai'
      :(root.location?.origin?root.location.origin+'/api/timetable/cover-ai':'https://bright-nexa-school-os-api.onrender.com/api/timetable/cover-ai');
    const controller=typeof AbortController!=='undefined'?new AbortController():null;
    let timeout;
    try{
      const response=await Promise.race([
        fetcher(endpoint,{method:'POST',cache:'no-store',...(controller?{signal:controller.signal}:{}),
          headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},
          body:JSON.stringify({school:current.id,leave:id,day,
            instructions:['Suggest free, subject-qualified substitutes with balanced daily load. Do not move original periods or invent staff.']})}),
        new Promise((_,reject)=>{timeout=setTimeout(()=>{controller?.abort();reject(Error('AI suggestion timed out. Existing qualified candidates remain available.'));},20000);})
      ]);
      const data=await response.json();
      if(!response.ok)throw Error(data?.error||data?.message||'AI cover suggestion unavailable. Manual eligible list remains available.');
      if(current.id!==selected?.id)throw Error('School changed. Reload the cover plan.');
      return data;
    }finally{clearTimeout(timeout);}
  }
  async function logout(){
    const token=session?.access_token;
    session=null;schools=[];selected=null;version++;
    await storage?.clear();
    if(token)send('/auth/v1/logout?scope=local',{method:'POST',keepalive:true,headers:{Authorization:'Bearer '+token}},false).catch(()=>{});
  }
  return {login,resumeStaff,restore,verify,choose,school,overview,attendanceEntry,timetableClasses,datedTimetable,review,covers,publish,publishUrgent,urgentDeliveryStatus,suggestCover,logout,today};
}
function mount(doc=root.document,fetcher=(...args)=>(root.fetch||fetch)(...args)){
  const $=id=>doc.getElementById(id), client=create(fetcher);
  const params=new URLSearchParams(root.location?.search||'');
  const entry=params.get('entry');
  const fromSharedApp=entry==='staff'||entry==='launcher';
  let snapshot=null,coverLeave=null,busy=false,pendingNoticeId=null;
  const elt=(tag,label,cls)=>{const e=doc.createElement(tag);if(label!==undefined)e.textContent=String(label);if(cls)e.className=cls;return e;};
  const note=(text,error=false)=>{const e=$('notice');e.textContent=text||'';e.classList.toggle('error',error);};
  const status=busyValue=>{busy=busyValue;$('schoolPicker').disabled=busyValue;doc.querySelectorAll('button[data-action]').forEach(btn=>btn.disabled=busyValue);};
  async function run(task){
    if(busy)return;
    status(true);note('');
    try{await task();}catch(e){note(e.message||'Could not reach the school.',true);}
    finally{status(false);}
  }
  function gate(show){$('loginPage').hidden=!show;$('mainApp').hidden=show;}
  function label(value){return value===null||value===undefined?'—':String(value);}
  function row(parent,title,detail){
    const div=elt('div',undefined,'line');
    div.append(elt('strong',title),elt('span',detail));parent.append(div);return div;
  }
  function showPage(page){
    doc.querySelectorAll('[data-page]').forEach(el=>el.hidden=el.dataset.page!==page);
    const activeNav=['student-attendance','teacher-attendance','uncovered'].includes(page)?'home':page;
    doc.querySelectorAll('[data-nav]').forEach(el=>el.classList.toggle('selected',el.dataset.nav===activeNav));
  }
  function drawHome(data){
    $('schoolName').textContent=data.school.name;
    $('roleLabel').textContent=data.school.role==='principal'?'Principal':'Owner / Admin';
    $('welcomeName').textContent='Hello, '+data.school.displayName;
    const values=[
      data.pulse.student_percent===null?'—':data.pulse.student_percent+'%',
      label(data.pulse.teachers_present),
      label(data.pending),
      label(data.pulse.uncovered_periods)
    ];
    ['metricStudents','metricTeachers','metricPending','metricUrgent'].forEach((id,i)=>$(id).textContent=values[i]);
    const insights=$('dailyBrief');insights.replaceChildren();
    const pulse=data.pulse,fees=data.fees;
    $('attendanceCoverage').textContent=pulse.students_marked+' / '+pulse.students+' students marked · '+pulse.students_present+' attending';
    $('teacherCoverage').textContent=pulse.teachers_marked+' / '+pulse.teachers+' teacher attendance marks linked';
    $('periodCoverage').textContent=pulse.scheduled_periods+' published periods for '+pulse.day;
    $('feeTotal').textContent='₹'+Number(fees.total||0).toLocaleString('en-IN',{maximumFractionDigits:2});
    $('feeCash').textContent='₹'+Number(fees.cash||0).toLocaleString('en-IN',{maximumFractionDigits:2});
    $('feeOnline').textContent='₹'+Number(fees.online||0).toLocaleString('en-IN',{maximumFractionDigits:2});
    $('feeUnknown').textContent='₹'+Number(fees.unclassified||0).toLocaleString('en-IN',{maximumFractionDigits:2});
    $('feeReceipts').textContent=fees.receipt_count+' posted fee entries · '+fees.day+' · provisional until reconciliation';
    if(data.emergency)row(insights,'Urgent leave',data.emergency+' emergency request(s) need immediate review.');
    if(data.pending)row(insights,'Approval queue',data.pending+' pending leave request(s); check teaching cover before approving.');
    if(data.approved)row(insights,'Cover reminder',data.approved+' approved leave request(s); verify all affected periods have cover.');
    if(!data.pending&&!data.approved)row(insights,'No leave backlog','Leave queue has no pending or approved requests in the current results.');
    if(pulse.student_percent===null)row(insights,'Attendance incomplete','Present percentage is hidden until attendance for all active students is marked.');
    if(pulse.teachers_present===null)row(insights,'Teacher roll incomplete','Teacher present count is unavailable until all teacher records are linked and marked.');
    if(pulse.uncovered_periods>0)row(insights,'Uncovered classes',pulse.uncovered_periods+' published periods currently have no valid teacher assigned.');
    if(pulse.uncovered_periods===null)row(insights,'Timetable not published','No scheduled periods verified for today.');
    if(Number(fees.unclassified)>0)row(insights,'Fee payment modes',fees.unclassified+' rupees cannot be classified as cash/online from saved records.');
    $('lastSync').textContent='Verified live from Supabase · '+new Date().toLocaleString('en-IN');
  }
  function drawAttendanceDetails(pulse){
    const students=$('studentAttendanceDetail'),teachers=$('teacherAttendanceDetail');
    students.replaceChildren();
    teachers.replaceChildren();
    row(students,'Attendance on '+pulse.day,pulse.students_marked+' of '+pulse.students+' students marked');
    row(students,'Present',pulse.students_present+' students present');
    row(teachers,'Attendance on '+pulse.day,pulse.teachers_marked+' of '+pulse.teachers+' teacher attendance marks linked');
    if(pulse.teachers_present!==null)row(teachers,'Present',pulse.teachers_present+' teachers present');
    if(pulse.teachers_on_leave>0)row(teachers,'Approved leave',pulse.teachers_on_leave+' teachers on leave');
  }
  function openMetric(page){
    showPage(page);
    doc.querySelector('[data-page="'+page+'"] h2')?.focus();
    if(page==='uncovered')return run(loadUncovered);
  }
  async function loadUncovered(){
    const pulse=snapshot?.pulse;
    const summary=$('uncoveredSummary'),field=$('uncoveredClassField'),list=$('uncoveredList');
    field.hidden=true;list.hidden=true;list.replaceChildren();
    if(!pulse){summary.textContent='Use Refresh live status to load today’s timetable.';return;}
    if(!pulse.scheduled_periods){summary.textContent='No periods have been published for '+pulse.day+'.';return;}
    if(!pulse.uncovered_periods){summary.textContent='All published periods are covered on '+pulse.day+'.';return;}
    summary.textContent=pulse.uncovered_periods+' of '+pulse.scheduled_periods+' published periods are uncovered on '+pulse.day+'.';
    const classes=await client.timetableClasses(),picker=$('uncoveredClass');
    picker.replaceChildren();
    for(const cls of classes){
      const option=elt('option',[cls.name,cls.section,cls.academic_stream].filter(Boolean).join(' · '));
      option.value=cls.id;picker.append(option);
    }
    if(!picker.options.length)return;
    field.hidden=false;
    await loadUncoveredClass();
  }
  async function loadUncoveredClass(){
    const picker=$('uncoveredClass'),classId=picker.value,day=snapshot.pulse.day,list=$('uncoveredList');
    picker.disabled=true;list.hidden=true;list.replaceChildren();
    try{
      const lessons=await client.datedTimetable(classId,day);
      if(!Array.isArray(lessons)||lessons.some(lesson=>lesson.class_id!==classId||lesson.day!==day))
        throw Error('The class timetable could not be verified.');
      for(const lesson of lessons.filter(item=>item.teacher_id===null)){
        row(list,lesson.subject,[lesson.starts_at.slice(0,5)+'–'+lesson.ends_at.slice(0,5),
          lesson.room_number&&'Room '+lesson.room_number].filter(Boolean).join(' · '));
      }
      if(!list.childElementCount)list.append(elt('p','No uncovered published periods for this class.','muted'));
      list.hidden=false;
    }finally{picker.disabled=false;}
  }
  const leaveDescriptor=x=>x.starts_on+(x.starts_on!==x.ends_on?' to '+x.ends_on:'')+(x.starts_at?' · '+x.starts_at.slice(0,5)+'–'+x.ends_at.slice(0,5):' · Full day');
  function drawLeaves(leaves){
    const target=$('leaveList');target.replaceChildren();
    const filtered=leaves.filter(x=>['pending','approved'].includes(x.status)).sort((a,b)=>
      Number(b.status==='pending')-Number(a.status==='pending')||Number(b.kind==='emergency')-Number(a.kind==='emergency'));
    if(!filtered.length){target.append(elt('p','No pending or approved leave requests.','muted'));return;}
    for(const leave of filtered){
      const card=elt('article',undefined,'panel');
      const h=elt('div',undefined,'itemhead');
      h.append(elt('strong',leave.teacher_name||'Verified teacher'),elt('span',leave.kind==='emergency'?'Emergency':'Planned','tag'));
      card.append(h,elt('p',leaveDescriptor(leave),'sub'),elt('p',leave.reason||'No reason provided','bodytext'),elt('p','Status: '+leave.status,'sub'));
      const actions=elt('div',undefined,'actions');
      if(leave.status==='pending'){
        for(const [title,decision] of [['Approve','approved'],['Decline','declined']]){
          const button=elt('button',title,decision==='approved'?'primary':'secondary');button.dataset.action=decision;
          button.addEventListener('click',()=>run(async()=>{
            if(!root.confirm('Confirm '+decision+' leave for '+(leave.teacher_name||'this teacher')+'?'))return;
            await client.review(leave.id,decision);await refresh();
            if(decision==='approved'){coverLeave={...leave,status:'approved'};await loadCover();}
          }));
          actions.append(button);
        }
      }else{
        const btn=elt('button','Plan substitute','secondary');btn.dataset.action='cover';
        btn.addEventListener('click',()=>run(async()=>{coverLeave=leave;await loadCover();}));
        actions.append(btn);
      }
      if(leave.status==='pending'){
        const preview=elt('button','Preview affected periods','secondary');preview.dataset.action='preview';
        preview.addEventListener('click',()=>run(async()=>{coverLeave=leave;await loadCover();}));
        actions.append(preview);
      }
      card.append(actions);target.append(card);
    }
  }
  async function loadCover(){
    if(!coverLeave)return;
    showPage('cover');
    $('coverHeading').textContent='Cover · '+(coverLeave.teacher_name||'Teacher');
    $('coverReviewStatus').textContent=coverLeave.status==='pending'?'Preview only — approve leave before publishing any substitute.':'Approved leave — review and publish eligible covers.';
    $('approveFromCover').hidden=coverLeave.status!=='pending';
    $('publishCover').hidden=coverLeave.status==='pending';
    const date=$('coverDate');date.min=coverLeave.starts_on;date.max=coverLeave.ends_on;
    if(!date.value||date.value<date.min||date.value>date.max)date.value=today()<date.min?date.min:today()>date.max?date.max:today();
    const rows=await client.covers(coverLeave.id,date.value);
    const target=$('coverRows');target.replaceChildren();
    if(!rows?.length){target.append(elt('p','No published teaching periods affected for this date.','muted'));return;}
    for(const rowData of rows){
      const panel=elt('article',undefined,'panel');
      panel.append(elt('strong',rowData.class_name+' · '+rowData.subject),
        elt('p',rowData.starts_at.slice(0,5)+'–'+rowData.ends_at.slice(0,5)+' · '+(rowData.room_number?'Room '+rowData.room_number:'Room unassigned'),'sub'));
      if(rowData.cover_needs_review)panel.append(elt('p','Previously published cover needs review.','warning'));
      const pick=elt('select');pick.dataset.slot=rowData.slot_id;pick.dataset.classid=rowData.class_id;
      const none=elt('option','No substitute available');none.value='';pick.append(none);
      for(const candidate of rowData.candidates||[]){
        const option=elt('option',candidate.teacher_name+' · '+(candidate.subject_match?'Subject match':'Class qualified')+' · '+candidate.periods+' periods');
        option.value=candidate.teacher_id;pick.append(option);
      }
      if(rowData.teacher_id)pick.value=rowData.teacher_id;
      else if(rowData.candidates?.length)pick.value=rowData.candidates[0].teacher_id;
      if(!rowData.candidates?.length)panel.append(elt('p','No eligible free teacher found. Requires manual school decision.','warning'));
      const lbl=elt('label','Proposed substitute','field');lbl.append(pick);panel.append(lbl);target.append(panel);
    }
  }
  async function refresh(){
    const data=await client.overview();snapshot=data;
    drawHome(data);drawLeaves(data.leaves);drawAttendanceDetails(data.pulse);
  }
  function chooseSchools(data){
    const picker=$('schoolPicker');picker.replaceChildren();
    for(const item of data.schools){
      const option=elt('option',item.name+' · '+(item.role==='principal'?'Principal':'Owner / Admin'));option.value=item.id;picker.append(option);
    }
    picker.value=data.selected.id;picker.hidden=data.schools.length===1;
  }
  function clearDashboard(school){
    snapshot=null;coverLeave=null;pendingNoticeId=null;
    $('schoolName').textContent=school?.name||'';
    $('roleLabel').textContent=school?(school.role==='principal'?'Principal':'Owner / Admin'):'';
    $('welcomeName').textContent=school?'Hello, '+school.displayName:'School leadership';
    for(const id of ['metricStudents','metricTeachers','metricPending','metricUrgent','feeTotal','feeCash','feeOnline','feeUnknown'])$(id).textContent='—';
    for(const id of ['lastSync','attendanceCoverage','teacherCoverage','periodCoverage','feeReceipts','coverReviewStatus','aiCoverReason','noticePublishStatus'])$(id).textContent='';
    for(const id of ['dailyBrief','leaveList','coverRows','studentAttendanceDetail','teacherAttendanceDetail'])$(id).replaceChildren();
    for(const id of ['openStudentRegister','openTeachingRegister'])$(id).hidden=school?.role!=='school_admin';
    for(const id of ['noticeTemplate','noticeTitle','noticeBody'])$(id).value='';
  }
  async function showAuthenticated(data){
    chooseSchools(data);clearDashboard(data.selected);gate(false);showPage('home');await refresh();
  }
  $('loginForm').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
    const data=await client.login($('email').value,$('password').value);
    $('password').value='';await showAuthenticated(data);
  });});
  $('logoutBtn').addEventListener('click',()=>run(async()=>{
    await client.logout();clearDashboard(null);
    if(fromSharedApp){root.location.replace(staffEntry);return;}
    gate(true);
  }));
  $('schoolPicker').addEventListener('change',()=>run(async()=>{
    const school=await client.choose($('schoolPicker').value);
    clearDashboard(school);showPage('home');await refresh();
  }));
  $('refreshBtn').addEventListener('click',()=>run(refresh));
  doc.querySelectorAll('[data-metric-page]').forEach(card=>card.addEventListener('click',()=>openMetric(card.dataset.metricPage)));
  $('uncoveredClass').addEventListener('change',()=>run(loadUncoveredClass));
  $('uncoveredLeaves').addEventListener('click',()=>openMetric('leaves'));
  for(const [id,section] of [['openStudentRegister','students'],['openTeachingRegister','teaching']]){
    $(id).addEventListener('click',()=>run(async()=>root.location.assign(await client.attendanceEntry(section))));
  }
  $('approveFromCover').addEventListener('click',()=>run(async()=>{
    if(!coverLeave||coverLeave.status!=='pending')throw Error('Select a pending leave.');
    if(!root.confirm('Approve leave for '+coverLeave.teacher_name+'? Covers will still require separate publication.'))return;
    await client.review(coverLeave.id,'approved');coverLeave={...coverLeave,status:'approved'};
    await refresh();await loadCover();
  }));
  $('aiSuggest').addEventListener('click',()=>run(async()=>{
    if(!coverLeave)throw Error('Choose a leave first.');
    const answer=await client.suggestCover(coverLeave.id,$('coverDate').value);
    const picks=[...$('coverRows').querySelectorAll('select[data-slot]')];
    for(const choice of answer.choices||[]){
      const input=picks.find(e=>e.dataset.slot===choice.slot_id&&e.dataset.classid===choice.class_id);
      const targetId=choice.teacher_id||'';
      if(input&&[...input.options].some(x=>x.value===targetId))input.value=targetId;
    }
    $('aiCoverReason').textContent=answer.question||answer.summary||'AI suggestions require review before approval.';
  }));
  $('noticeTemplate').addEventListener('change',()=>{
    const v=$('noticeTemplate').value;
    if(v==='weather'){
      $('noticeTitle').value='Urgent: Weather-related School Update';
      $('noticeBody').value='Due to severe weather conditions, school timings are being reviewed. Please follow the verified notice from school administration for the confirmed dismissal schedule.';
    }else if(v==='closure'){
      $('noticeTitle').value='Urgent: Change in School Dispersal Time';
      $('noticeBody').value='School will close earlier than usual today. Parents should follow the official transport and pickup instructions issued by the school.';
    }
    pendingNoticeId=null;
  });
  for(const id of ['noticeTitle','noticeBody'])$(id).addEventListener('input',()=>{pendingNoticeId=null;});
  $('sendNotice').addEventListener('click',()=>run(async()=>{
    const title=$('noticeTitle').value.trim(),body=$('noticeBody').value.trim();
    if(title.length<8||body.length<15)throw Error('Enter a complete official notice.');
    if(!root.confirm('Publish this official notice to the school feed?\\n\\n'+title+'\\n\\n'+body+'\\n\\nAndroid alerts will be queued for eligible phones.'))return;
    if(!pendingNoticeId){
      if(!root.crypto?.randomUUID)throw Error('Secure notice ID generation is not available on this device.');
      pendingNoticeId=root.crypto.randomUUID();
    }
    const notice=await client.publishUrgent(title,body,pendingNoticeId);
    const status=$('noticePublishStatus');
    status.textContent='Circular published to school feed. Checking Android alert status…';
    const delivery=await client.urgentDeliveryStatus(notice).catch(()=>null);
    const android=delivery
      ? (delivery.waiting||delivery.accepted||delivery.expired||delivery.unavailable
        ? 'Android alerts: '+delivery.waiting+' waiting, '+delivery.accepted+' accepted by Firebase, '+delivery.expired+' expired, '+delivery.unavailable+' unavailable. Phone receipt is unconfirmed.'
        : 'No Android alert registrations matched this circular.')
      : 'Android alert status is unavailable.';
    status.textContent='Circular published to school feed. '+android;
  }));
  doc.querySelectorAll('[data-nav]').forEach(button=>button.addEventListener('click',()=>{
    const destination=button.dataset.nav;
    if(destination==='cover'&&!coverLeave){note('Choose an approved leave under Leave requests to plan cover.');showPage('leaves');return;}
    showPage(destination);
  }));
  $('coverDate').addEventListener('change',()=>run(loadCover));
  $('publishCover').addEventListener('click',()=>run(async()=>{
    if(!coverLeave)throw Error('Choose approved leave first.');
    const entries=[...$('coverRows').querySelectorAll('select[data-slot]')].filter(x=>x.value)
      .map(x=>({slot_id:x.dataset.slot,class_id:x.dataset.classid,teacher_id:x.value}));
    if(!entries.length)throw Error('There is no valid cover to publish.');
    if(!root.confirm('Publish '+entries.length+' substitute assignment(s) to the teachers?'))return;
    await client.publish(coverLeave.id,$('coverDate').value,entries);
    note('Cover published. Verify delivery in Teacher App.');await loadCover();
  }));
  gate(true);
  run(async()=>{
    let staffSession;
    if(entry==='staff'){
      try{
        staffSession=JSON.parse(root.sessionStorage?.getItem(staffSessionKey)||'null');
        root.sessionStorage?.removeItem(staffSessionKey);
      }catch(_){}
    }
    const restored=staffSession
      ?await client.resumeStaff(staffSession,params.get('school'))
      :await client.restore();
    if(restored)await showAuthenticated(restored);
    else if(fromSharedApp)root.location.replace(staffEntry);
  });
  return client;
}
const api={create,mount,today};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else{root.BNLeadership=api;root.addEventListener('DOMContentLoaded',()=>mount());}
})(typeof window==='undefined'?globalThis:window);
