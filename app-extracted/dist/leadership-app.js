/* Bright Nexa Leadership App — verified school roles, Supabase only. No offline school data. */
(function(root){
'use strict';
const BASE='https://mrfvbwmyxndrakskqyas.supabase.co';
const KEY='sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT';
const allowedRoles=new Set(['school_admin','principal']);
const staffSessionKey='bn_school_staff_session_v1';
const staffSchoolKey='bn_school_staff_selected_school_v1';
const erpSessionKey='bright-nexa-school-os:session:v2';
const pendingNoticeKey='bn_leadership_pending_notice_v1';
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
          verified.push({id:school.id,name:school.name||'Verified school',role:member.role,memberId:member.id,displayName:member.display_name||'School leadership'});
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
    if(!/^bn_(?:list_teacher_leaves|review_teacher_leave|school_dated_timetable|teacher_leave_cover_plan|publish_teacher_covers|leadership_school_pulse|leadership_fee_snapshot|leadership_publish_urgent_notice|leadership_urgent_delivery_status|leadership_emergency_leave|leadership_at_risk_students|leadership_class_attendance_summary|leadership_fee_followups)$/.test(name))throw Error('Unsupported leadership operation.');
    const owner=school();
    return (await send('/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify({p_school:owner.id,...args})})).data;
  }
  async function registerEmergencyAlerts(scope,device,registration){
    await fresh();
    if(selected?.id!==scope.school||selected?.memberId!==scope.member)throw schoolAccessError();
    const headers={Authorization:'Bearer '+session.access_token};
    const fields={p_school:scope.school,p_portal:'leadership',p_installation:device.installation,p_registration:registration};
    const binding=(await send('/rest/v1/rpc/bn_enable_urgent_circular_alerts',{
      method:'POST',headers,body:JSON.stringify({...fields,p_token:device.token})
    },false)).data;
    return {binding,revoke:()=>send('/rest/v1/rpc/bn_disable_urgent_circular_alerts',{
      method:'POST',headers,keepalive:true,body:JSON.stringify({...fields,p_binding:binding})
    },false)};
  }
  async function emergencyLeave(id){
    return rpc('bn_leadership_emergency_leave',{p_leave:id});
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
      approved:leaves.filter(x=>x.status==='approved'&&x.ends_on>=(pulse?.day||day)).length};
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
    if(!['approved','declined','cancelled'].includes(decision))throw Error('Invalid leave decision.');
    const target=String(id||'');if(!/^[0-9a-f-]{36}$/i.test(target))throw Error('Invalid leave request.');
    return rpc('bn_review_teacher_leave',{p_leave:target,p_status:decision});
  }
  async function covers(id,day){return rpc('bn_teacher_leave_cover_plan',{p_leave:id,p_day:day});}
  async function publish(id,day,entries){
    if(!Array.isArray(entries)||!entries.length)throw Error('Choose at least one period to update.');
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
    for(const key of [staffSessionKey,staffSchoolKey,erpSessionKey,pendingNoticeKey])root.sessionStorage?.removeItem(key);
    await storage?.clear();
    if(token)send('/auth/v1/logout?scope=local',{method:'POST',keepalive:true,headers:{Authorization:'Bearer '+token}},false).catch(()=>{});
  }
  async function intelligenceList(name,args){
    const epoch=version;
    const data=await rpc(name,args);
    if(epoch!==version||!Array.isArray(data))throw Error('School intelligence could not be verified.');
    return data;
  }
  function atRiskStudents(threshold=75,classId=null){
    return intelligenceList('bn_leadership_at_risk_students',{p_threshold:threshold,p_class:classId});
  }
  function classAttendanceSummary(day=today()){
    return intelligenceList('bn_leadership_class_attendance_summary',{p_day:day});
  }
  function feeFollowups(){
    return intelligenceList('bn_leadership_fee_followups');
  }
  async function intelligence(day=today(),threshold=75){
    const [atRisk,classSummary,followups]=await Promise.all([
      atRiskStudents(threshold).catch(()=>null),
      classAttendanceSummary(day).catch(()=>null),
      feeFollowups().catch(()=>null)
    ]);
    return {atRisk,classSummary,followups};
  }
  return {login,resumeStaff,restore,verify,choose,school,overview,registerEmergencyAlerts,emergencyLeave,attendanceEntry,timetableClasses,datedTimetable,review,covers,publish,publishUrgent,urgentDeliveryStatus,suggestCover,logout,today,atRiskStudents,classAttendanceSummary,feeFollowups,intelligence};
}
function mount(doc=root.document,fetcher=(...args)=>(root.fetch||fetch)(...args)){
  const $=id=>doc.getElementById(id), client=create(fetcher);
  const params=new URLSearchParams(root.location?.search||'');
  const entry=params.get('entry');
  const fromSharedApp=entry==='staff'||entry==='launcher';
  let snapshot=null,coverLeave=null,busy=false,page='home',pendingNotice=null,publishedNotice=null;
  let cachedIntelligence=null,intelligenceVersion=0;
  let leaveView='today';
  const leaveFilters=[...doc.querySelectorAll('[data-leave-view]')];
  const idPattern=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  const requestedLeave=params.get('leave'), requestedSchool=params.get('school');
  let openAlert=idPattern.test(requestedLeave)&&idPattern.test(requestedSchool);
  const emergencyAlerts=root.BNUrgentCircularAlerts?.create({
    bridge:root.BrightNexaLeadershipAlerts,button:$('emergencyAlertToggle'),status:$('emergencyAlertStatus'),
    register:client.registerEmergencyAlerts
  });
  if(emergencyAlerts)$('emergencyAlertSettings').hidden=false;
  const bindAlerts=school=>emergencyAlerts?.setScope({school:school.id,member:school.memberId});
  const elt=(tag,label,cls)=>{const e=doc.createElement(tag);if(label!==undefined)e.textContent=String(label);if(cls)e.className=cls;return e;};
  const note=(text,error=false)=>{const e=$('notice');if(!e)return;e.textContent=text||'';e.classList.toggle('error',error);};
  const status=busyValue=>{
    busy=busyValue;
    const picker=$('schoolPicker'),coverDate=$('coverDate');
    if(picker)picker.disabled=busyValue;
    if(coverDate)coverDate.disabled=busyValue;
    doc.querySelectorAll('button[data-action]').forEach(btn=>btn.disabled=busyValue);
  };
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
  function showPage(destination){
    if(destination==='leaves'&&page!=='leaves'){
      leaveView='today';
      drawLeaves(snapshot?.leaves||[]);
    }
    page=destination;
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
  function intelligenceAlerts(pulse,intel){
    const alerts=[];
    const dropped=intel.classSummary?.find(c=>c.trend==='dropped');
    if(dropped){
      alerts.push({icon:'📉',text:'Class '+dropped.class_label+' attendance dropped from '+dropped.week_percent+'% to '+dropped.today_percent+'% (vs previous 7 days)'});
    }else if(!intel.classSummary){
      alerts.push({icon:'⚠️',text:'Class attendance trends unavailable. Refresh to retry.'});
    }else if(pulse.student_percent!=null){
      alerts.push({icon:'📊',text:'School student attendance at '+pulse.student_percent+'% today'});
    }else{
      alerts.push({icon:'📊',text:'School attendance awaiting complete marks'});
    }

    if(!intel.followups){
      alerts.push({icon:'⚠️',text:'Fee follow-ups unavailable. Refresh to retry.'});
    }else if(intel.followups.length){
      const count=intel.followups.length;
      alerts.push({icon:'✏️',text:count+(count===1?' student has a pending fee balance':' students have pending fee balances')});
    }else{
      alerts.push({icon:'✏️',text:'No pending fee balances found'});
    }

    if(pulse.uncovered_periods==null||!pulse.scheduled_periods){
      alerts.push({icon:'📅',text:'No published timetable verified for '+pulse.day});
    }else if(pulse.uncovered_periods>0){
      alerts.push({icon:'⚠️',text:pulse.uncovered_periods+' published period(s) require substitute teacher cover'});
    }else{
      alerts.push({icon:'📅',text:'All '+pulse.scheduled_periods+' published periods have teacher cover'});
    }
    return alerts;
  }
  async function drawIntelligence(data){
    if(!$('schoolIntelligenceCard'))return;
    const pulse=data.pulse,fees=data.fees;
    $('intelAttendanceVal').textContent=pulse.student_percent!==null?pulse.student_percent+'%':'—';
    $('intelAttendanceSub').textContent=(pulse.students_marked||0)+' / '+(pulse.students||0)+' marked';

    const totalFee=Number(fees.total||0);
    let feeDisplay='₹'+totalFee.toLocaleString('en-IN');
    if(totalFee>=100000){
      feeDisplay='₹'+(totalFee/100000).toFixed(1)+'L';
    }else if(totalFee>=1000){
      feeDisplay='₹'+(totalFee/1000).toFixed(1)+'k';
    }
    $('intelFeeVal').textContent=feeDisplay;
    $('intelFeeSub').textContent=(fees.receipt_count||0)+' receipts recorded';

    const share=$('shareWhatsAppDigestBtn');
    const requestVersion=++intelligenceVersion;
    cachedIntelligence=null;
    if(share)share.disabled=true;
    const alertsList=$('intelAlertsList');
    alertsList?.replaceChildren();
    $('intelAtRiskVal').textContent='—';
    $('intelAtRiskSub').textContent='Checking attendance…';

    const intel=await client.intelligence(pulse.day,75);
    if(requestVersion!==intelligenceVersion||snapshot!==data)return;
    if(intel.atRisk&&intel.classSummary&&intel.followups){
      cachedIntelligence=intel;
      if(share)share.disabled=false;
    }
    $('intelAtRiskVal').textContent=intel.atRisk?String(intel.atRisk.length):'—';
    $('intelAtRiskSub').textContent=intel.atRisk?'<75% or 3+ consecutive absences':'Unavailable. Refresh to retry.';

    if(alertsList){
      for(const item of intelligenceAlerts(pulse,intel)){
        const div=elt('div',undefined,'intel-alert-item');
        div.append(elt('span',item.icon,'intel-alert-icon'),elt('span',item.text,'intel-alert-text'));
        alertsList.append(div);
      }
    }
  }
  function parseIntelQuery(text){
    const classMatch=text.match(/\b(\d{1,2})\s*(?:[-/]\s*|\s+)?([a-z])\b/i);
    const classLabel=classMatch?classMatch[1]+'-'+classMatch[2].toUpperCase():null;
    const pctMatch=text.match(/(?:\b(?:less\s+than|below|under)\s+|(<=|<)\s*)([+-]?\d+(?:\.\d+)?)\s*%?/i);
    const threshold=pctMatch?Number(pctMatch[2]):null;
    const stream=text.match(/\b(science|commerce|arts|humanities|vocational)\b/i)?.[1].toLowerCase()||null;
    return {classLabel,stream,threshold,inclusive:pctMatch?.[1]==='<=',unsupportedThreshold:/\b(?:above|over|greater\s+than|more\s+than)\s+\d|>\s*=?\s*\d/i.test(text),wantsFees:/\b(?:fees?|balances?|dues|payments?)\b/i.test(text)};
  }
  function guardianDraft(phone,message,buttonLabel){
    const url=root.BNWhatsApp.buildWhatsAppUrl(phone,message,'wa_me');
    if(!url)return '';
    const link=elt('a',buttonLabel,'intel-wa-pill');
    link.href=url;
    link.referrerPolicy='no-referrer';
    return link;
  }
  async function runIntelligenceQuery(){
    const input=$('intelQueryInput');
    const queryStr=input?.value?.trim()||'';
    const parsed=parseIntelQuery(queryStr);
    const panel=$('intelQueryResult'),itemsContainer=$('intelQueryItems'),heading=$('intelQueryHeading');
    if(!panel||!itemsContainer)return;
    itemsContainer.replaceChildren();
    panel.hidden=false;

    const schoolName=client.school().name;
    const waEngine=root.BNWhatsApp;
    const matchesClass=s=>{
      if(parsed.stream&&String(s.academic_stream||'').trim().toLowerCase()!==parsed.stream)return false;
      if(!parsed.classLabel)return true;
      const label=s.class_name!=null&&s.section!=null?s.class_name+'-'+s.section:String(s.class_label).split(' (')[0];
      return label.replace(/^class\s+/i,'').replace(/\s+/g,'').toUpperCase()===parsed.classLabel;
    };
    const classLabel=(parsed.classLabel?'Class '+parsed.classLabel:'All Classes')+
      (parsed.stream?' · '+parsed.stream.charAt(0).toUpperCase()+parsed.stream.slice(1):'');
    const operator=parsed.inclusive?'≤':'<';
    if(heading)heading.textContent=parsed.wantsFees?'Fee Follow-ups ('+classLabel+')':
      parsed.threshold===null?'At-Risk Students ('+classLabel+')':'Attendance '+operator+parsed.threshold+'% ('+classLabel+')';

    if(!parsed.wantsFees&&parsed.unsupportedThreshold){
      itemsContainer.append(elt('p','For attendance, use “below 80%” or “<= 80%”.','warning'));
      return;
    }
    if(!parsed.wantsFees&&parsed.threshold!==null&&(parsed.threshold<0||parsed.threshold>100)){
      itemsContainer.append(elt('p','Enter an attendance percentage from 0 to 100.','warning'));
      return;
    }

    const rows=await (parsed.wantsFees?client.feeFollowups():
      client.atRiskStudents(parsed.threshold===null?75:parsed.threshold+(parsed.inclusive?0.1:0))).catch(()=>null);
    if(!rows){
      itemsContainer.append(elt('p',(parsed.wantsFees?'Fee follow-ups':'Attendance results')+' unavailable. Try again.','warning'));
      return;
    }
    const filtered=rows.filter(s=>matchesClass(s)&&(parsed.wantsFees||parsed.threshold===null||
      (s.attendance_percent!=null&&(parsed.inclusive?s.attendance_percent<=parsed.threshold:s.attendance_percent<parsed.threshold))));
    if(!filtered.length){
      itemsContainer.append(elt('p',parsed.wantsFees?'No pending fee balances found.':'No students match this attendance query.','sub'));
      return;
    }
    for(const s of filtered){
      const rowDiv=elt('div',undefined,'intel-student-row');
      const info=elt('div',undefined,'intel-student-info');
      const details=parsed.wantsFees?' · Balance: ₹'+Number(s.balance_rupees).toLocaleString('en-IN')+(s.guardian_phone?' · 📞 '+s.guardian_phone:' · No phone'):
        ' · '+s.attendance_percent+'% attendance · '+(s.consecutive_absent||0)+' consecutive absences';
      info.append(elt('strong',s.name+' ('+s.admission_number+')'),elt('span','Class '+s.class_label+details));
      rowDiv.append(info);
      if(s.guardian_phone&&waEngine){
        const common={schoolName,studentName:s.name,className:s.class_label};
        const message=parsed.wantsFees?waEngine.createFeeReminderMessage({
          ...common,admissionNumber:s.admission_number,amountDue:s.balance_rupees,dueDate:null,schoolPhone:''
        }):waEngine.createAttendanceFollowupMessage({
          ...common,attendancePercent:s.attendance_percent,consecutiveAbsences:s.consecutive_absent
        });
        const link=guardianDraft(s.guardian_phone,message,parsed.wantsFees?'💬 Remind Fee':'💬 WhatsApp Guardian');
        if(link)rowDiv.append(link);
      }
      itemsContainer.append(rowDiv);
    }
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
    if(page==='uncovered'||page==='leaves')return run(refreshVisiblePage);
  }
  async function loadUncovered(){
    const pulse=snapshot?.pulse;
    const summary=$('uncoveredSummary'),field=$('uncoveredClassField'),list=$('uncoveredList');
    field.hidden=true;list.hidden=true;list.replaceChildren();
    if(!pulse){summary.textContent='Use Refresh live status to load today’s timetable.';return;}
    if(!pulse.scheduled_periods){summary.textContent='No periods have been published for '+pulse.day+'.';return;}
    if(!pulse.uncovered_periods){summary.textContent='All published periods are covered on '+pulse.day+'.';return;}
    summary.textContent=pulse.uncovered_periods+' of '+pulse.scheduled_periods+' published periods are uncovered on '+pulse.day+'.';
    const picker=$('uncoveredClass'),previousClass=picker.value;
    const classes=await client.timetableClasses();
    picker.replaceChildren();
    for(const cls of classes){
      const option=elt('option',[cls.name,cls.section,cls.academic_stream].filter(Boolean).join(' · '));
      option.value=cls.id;picker.append(option);
    }
    if(!picker.options.length)return;
    if(classes.some(cls=>cls.id===previousClass))picker.value=previousClass;
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
  function leaveViewFor(leave,day){
    if(!['pending','approved'].includes(leave.status)||leave.ends_on<day)return 'history';
    return leave.starts_on>day?'upcoming':'today';
  }
  function drawLeaves(leaves,focusedLeave){
    const target=$('leaveList');target.replaceChildren();
    const day=snapshot?.pulse.day||today();
    if(focusedLeave){
      leaveView=leaveViewFor(focusedLeave,day);
      leaves=[...leaves.filter(leave=>leave.id!==focusedLeave.id),focusedLeave];
    }
    for(const button of leaveFilters)button.setAttribute('aria-pressed',String(button.dataset.leaveView===leaveView));
    const filtered=leaves.filter(leave=>leaveViewFor(leave,day)===leaveView).sort((a,b)=>{
      if(leaveView==='history')return b.ends_on.localeCompare(a.ends_on);
      return Number(b.status==='pending')-Number(a.status==='pending')||Number(b.kind==='emergency')-Number(a.kind==='emergency')||a.starts_on.localeCompare(b.starts_on);
    });
    if(!filtered.length){
      const empty={today:'No pending or approved leave for today.',upcoming:'No upcoming leave requests.',history:'No leave history yet.'};
      target.append(elt('p',empty[leaveView],'muted'));
      return;
    }
    for(const leave of filtered){
      const card=elt('article',undefined,'panel');
      card.dataset.leave=leave.id;
      if(leave.id===focusedLeave?.id)card.tabIndex=-1;
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
            if(decision==='approved'&&leave.ends_on>=(snapshot?.pulse.day||day)){
              coverLeave={...leave,status:'approved'};await loadCover();
            }
          }));
          actions.append(button);
        }
      }else if(leave.status==='approved'&&leaveView!=='history'){
        const btn=elt('button','Plan substitute','secondary');btn.dataset.action='cover';
        btn.addEventListener('click',()=>run(async()=>{coverLeave=leave;await loadCover();}));
        actions.append(btn);
      }
      if(leave.status==='pending'&&leaveView!=='history'){
        const preview=elt('button','Preview affected periods','secondary');preview.dataset.action='preview';
        preview.addEventListener('click',()=>run(async()=>{coverLeave=leave;await loadCover();}));
        actions.append(preview);
      }
      if(leave.can_cancel===true){
        const cancel=elt('button',leave.status==='pending'?'Cancel request':'Cancel leave','secondary');
        cancel.dataset.action='cancelled';
        cancel.addEventListener('click',()=>run(async()=>{
          const message=leave.status==='approved'?'Cancel this leave and revoke its published substitute covers?':'Cancel this pending leave request?';
          if(!root.confirm(message))return;
          await client.review(leave.id,'cancelled');
          if(coverLeave?.id===leave.id)coverLeave=null;
          await refresh();
          note('Leave cancelled.');
        }));
        actions.append(cancel);
      }
      if(actions.childElementCount)card.append(actions);
      target.append(card);
    }
    if(leaveView==='history'&&leaves.length>=100)target.append(elt('p','History shows past requests from the 100 records returned by the school.','muted'));
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
    const target=$('coverRows');target.replaceChildren();
    const rows=await client.covers(coverLeave.id,date.value);
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
      pick.value=rowData.teacher_id||'';
      if(!rowData.candidates?.length)panel.append(elt('p','No eligible free teacher found. Requires manual school decision.','warning'));
      const lbl=elt('label','Proposed substitute','field');lbl.append(pick);panel.append(lbl);target.append(panel);
    }
  }
  async function refresh(){
    $('intelQueryItems')?.replaceChildren();
    const queryResult=$('intelQueryResult');
    if(queryResult)queryResult.hidden=true;
    let data;
    try{data=await client.overview();}
    catch(error){
      cachedIntelligence=null;
      intelligenceVersion++;
      const share=$('shareWhatsAppDigestBtn');
      if(share)share.disabled=true;
      $('lastSync').textContent=snapshot
        ? 'Refresh failed. Showing last verified data for '+snapshot.pulse.day+'.'
        : 'School data could not be refreshed.';
      throw error;
    }
    snapshot=data;
    drawHome(data);drawLeaves(data.leaves);drawAttendanceDetails(data.pulse);
    void drawIntelligence(data);
  }
  async function refreshVisiblePage(){
    await refresh();
    if(page==='uncovered')await loadUncovered();
  }
  function resumeDashboard(){
    if(doc.hidden||$('mainApp').hidden||!['home','student-attendance','teacher-attendance','leaves','uncovered'].includes(page))return;
    void run(refreshVisiblePage);
  }
  function chooseSchools(data){
    const picker=$('schoolPicker');picker.replaceChildren();
    for(const item of data.schools){
      const option=elt('option',item.name+' · '+(item.role==='principal'?'Principal':'Owner / Admin'));option.value=item.id;picker.append(option);
    }
    picker.value=data.selected.id;picker.hidden=data.schools.length===1;
  }
  function clearDashboard(school){
    snapshot=null;coverLeave=null;pendingNotice=null;publishedNotice=null;
    cachedIntelligence=null;
    intelligenceVersion++;
    const share=$('shareWhatsAppDigestBtn');
    if(share)share.disabled=true;
    leaveView='today';
    $('refreshNoticeStatus').hidden=true;
    $('uncoveredClassField').hidden=true;
    $('uncoveredList').hidden=true;
    $('schoolName').textContent=school?.name||'';
    $('roleLabel').textContent=school?(school.role==='principal'?'Principal':'Owner / Admin'):'';
    $('welcomeName').textContent=school?'Hello, '+school.displayName:'School leadership';
    for(const id of ['metricStudents','metricTeachers','metricPending','metricUrgent','feeTotal','feeCash','feeOnline','feeUnknown','intelAttendanceVal','intelFeeVal','intelAtRiskVal']){
      const el=$(id);if(el)el.textContent='—';
    }
    for(const id of ['lastSync','attendanceCoverage','teacherCoverage','periodCoverage','feeReceipts','coverReviewStatus','aiCoverReason','noticePublishStatus','uncoveredSummary','intelAttendanceSub','intelFeeSub','intelAtRiskSub']){
      const el=$(id);if(el)el.textContent='';
    }
    for(const id of ['dailyBrief','leaveList','coverRows','studentAttendanceDetail','teacherAttendanceDetail','uncoveredClass','uncoveredList','intelAlertsList','intelQueryItems']){
      const el=$(id);if(el)el.replaceChildren();
    }
    if($('intelQueryResult'))$('intelQueryResult').hidden=true;
    if($('intelQueryInput'))$('intelQueryInput').value='';
    for(const id of ['openStudentRegister','openTeachingRegister'])$(id).hidden=school?.role!=='school_admin';
    for(const id of ['noticeTemplate','noticeTitle','noticeBody'])$(id).value='';
  }
  async function showAuthenticated(data){
    const alert=openAlert;
    openAlert=false;
    if(alert&&requestedSchool!==data.selected.id&&data.schools.some(school=>school.id===requestedSchool)){
      data={...data,selected:await client.choose(requestedSchool)};
    }
    chooseSchools(data);clearDashboard(data.selected);bindAlerts(data.selected);gate(false);
    showPage(alert?'leaves':'home');
    await refresh();
    if(!alert)return;
    if(requestedSchool!==data.selected.id){note('This alert belongs to a different school.',true);return;}
    const leave=await client.emergencyLeave(requestedLeave);
    if(!leave){note('This emergency leave request is unavailable.',true);return;}
    drawLeaves(snapshot?.leaves||[],leave);
    $('leaveList').querySelector('[data-leave="'+requestedLeave+'"]')?.focus();
  }
  $('loginForm').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
    const data=await client.login($('email').value,$('password').value);
    $('password').value='';await showAuthenticated(data);
  });});
  $('logoutBtn').addEventListener('click',()=>run(async()=>{
    emergencyAlerts?.clear();await client.logout();clearDashboard(null);
    if(fromSharedApp){root.location.replace(staffEntry);return;}
    gate(true);
  }));
  $('schoolPicker').addEventListener('change',()=>run(async()=>{
    const school=await client.choose($('schoolPicker').value);
    clearDashboard(school);bindAlerts(school);showPage('home');await refresh();
  }));
  $('refreshBtn').addEventListener('click',()=>run(refresh));
  for(const button of leaveFilters)button.addEventListener('click',()=>{
    leaveView=button.dataset.leaveView;
    drawLeaves(snapshot?.leaves||[]);
  });
  doc.addEventListener('visibilitychange',()=>{
    if(!doc.hidden&&!$('mainApp').hidden)emergencyAlerts?.resume();
    resumeDashboard();
  });
  root.addEventListener('online',resumeDashboard);
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
  });
  async function requestIdForNotice(title,body){
    const school=client.school();
    const content=JSON.stringify([school.id,school.memberId,title,body]);
    const digest=await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(content));
    const fingerprint=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
    if(!pendingNotice){
      try{pendingNotice=JSON.parse(root.sessionStorage?.getItem(pendingNoticeKey)||'null');}catch(_){}
    }
    if(pendingNotice?.fingerprint!==fingerprint){
      pendingNotice={fingerprint,id:root.crypto.randomUUID()};
      try{root.sessionStorage?.setItem(pendingNoticeKey,JSON.stringify(pendingNotice));}catch(_){}
    }
    return pendingNotice.id;
  }
  async function refreshNoticeDelivery(){
    if(!publishedNotice)return;
    const status=$('noticePublishStatus');
    status.textContent='Circular published to school feed. Checking Android alert status…';
    const delivery=await client.urgentDeliveryStatus(publishedNotice).catch(()=>null);
    const android=delivery
      ? (delivery.waiting||delivery.accepted||delivery.expired||delivery.unavailable
        ? 'Android alerts: '+delivery.waiting+' waiting, '+delivery.accepted+' accepted by Firebase, '+delivery.expired+' expired, '+delivery.unavailable+' unavailable. Phone receipt is unconfirmed.'
        : 'No Android alert registrations matched this circular.')
      : 'Android alert status is unavailable. Use Refresh delivery status to retry.';
    status.textContent='Circular published to school feed. '+android;
  }
  $('refreshNoticeStatus').addEventListener('click',()=>run(refreshNoticeDelivery));
  $('sendNotice').addEventListener('click',()=>run(async()=>{
    const title=$('noticeTitle').value.trim(),body=$('noticeBody').value.trim();
    if(title.length<8||body.length<15)throw Error('Enter a complete official notice.');
    if(!root.confirm('Publish this official notice to the school feed?\n\n'+title+'\n\n'+body+'\n\nAndroid alerts will be queued for eligible phones.'))return;
    const requestId=await requestIdForNotice(title,body);
    const notice=await client.publishUrgent(title,body,requestId);
    if(notice!==requestId)throw Error('Notice publication could not be confirmed. Retry the same draft.');
    publishedNotice=notice;
    pendingNotice=null;
    try{root.sessionStorage?.removeItem(pendingNoticeKey);}catch(_){}
    if($('noticeTitle').value.trim()===title&&$('noticeBody').value.trim()===body){
      for(const id of ['noticeTemplate','noticeTitle','noticeBody'])$(id).value='';
    }
    $('refreshNoticeStatus').hidden=false;
    await refreshNoticeDelivery();
  }));
  doc.querySelectorAll('[data-nav]').forEach(button=>button.addEventListener('click',()=>{
    const destination=button.dataset.nav;
    if(destination==='cover'&&!coverLeave){note('Choose an approved leave under Leave requests to plan cover.');showPage('leaves');return;}
    if(destination==='leaves')return openMetric('leaves');
    showPage(destination);
  }));
  $('coverDate').addEventListener('change',()=>run(loadCover));
  $('publishCover').addEventListener('click',()=>run(async()=>{
    if(!coverLeave)throw Error('Choose approved leave first.');
    const rows=[...$('coverRows').querySelectorAll('select[data-slot]')];
    if(!rows.length)throw Error('There are no affected periods for this date.');
    const entries=rows.map(x=>({
      slot_id:x.dataset.slot,class_id:x.dataset.classid,teacher_id:x.value||null
    }));
    const assignedCount=entries.filter(x=>x.teacher_id).length;
    const confirmMessage=assignedCount>0
      ? 'Publish '+assignedCount+' substitute assignment(s) to the teachers?'
      : 'Clear all substitute assignments for this date?';
    if(!root.confirm(confirmMessage))return;
    await client.publish(coverLeave.id,$('coverDate').value,entries);
    note(assignedCount>0?'Cover published. Verify delivery in Teacher App.':'Cover cleared. Affected periods are now uncovered.');
    await loadCover();
    await refresh();
  }));
  $('copyWhatsAppCover').addEventListener('click',()=>run(async()=>{
    if(!coverLeave)throw Error('Choose approved leave first.');
    const rows=[...$('coverRows').querySelectorAll('article.panel')];
    if(!rows.length)throw Error('No teaching periods affected for this date.');
    const date=$('coverDate').value;
    const teacher=coverLeave.teacher_name||'Teacher';
    const lines=[
      '📋 *Bright Nexa School OS · Teacher Substitution Slip*',
      'School: '+(client.school?.()?.name||''),
      'Date: '+date,
      'Teacher on Leave: '+teacher+' ('+(coverLeave.kind==='emergency'?'Emergency':'Planned')+' Leave)',
      '',
      '*Period Arrangements:*'
    ];
    for(const row of rows){
      const title=row.querySelector('strong')?.textContent||'Period';
      const timeInfo=row.querySelector('p.sub')?.textContent||'';
      const select=row.querySelector('select[data-slot]');
      const chosenText=select?.options[select.selectedIndex]?.text||'';
      const assigned=select?.value?chosenText:'No substitute (Self-study / Unassigned)';
      lines.push('• '+title+' ('+timeInfo+')\n  ↳ Cover: '+assigned);
    }
    const text=lines.join('\n');
    try{
      if(root.navigator?.clipboard?.writeText){
        await root.navigator.clipboard.writeText(text);
        note('WhatsApp substitution slip copied to clipboard.');
      }else{
        note('Clipboard unavailable on this device.',true);
      }
    }catch(_){
      note('Could not copy slip to clipboard.',true);
    }
  }));
  $('intelQueryBtn')?.addEventListener('click',()=>run(runIntelligenceQuery));
  $('intelQueryInput')?.addEventListener('keydown',e=>{
    if(e.key==='Enter'){e.preventDefault();run(runIntelligenceQuery);}
  });
  $('intelQueryClose')?.addEventListener('click',()=>{
    if($('intelQueryResult'))$('intelQueryResult').hidden=true;
  });
  $('shareWhatsAppDigestBtn')?.addEventListener('click',()=>run(async()=>{
    const pulse=snapshot?.pulse,fees=snapshot?.fees,intel=cachedIntelligence;
    const waEngine=root.BNWhatsApp;
    if(!pulse||!fees||!intel||!waEngine)throw Error('Verified school intelligence unavailable. Refresh before sharing.');
    const message=waEngine.createDailyIntelligenceDigestMessage({
      schoolName:snapshot.school.name,
      date:pulse.day,
      attendancePercent:pulse.student_percent,
      studentsPresent:pulse.students_present,
      totalStudents:pulse.students,
      feeTotal:fees.total,
      feeReceiptCount:fees.receipt_count,
      atRiskCount:intel.atRisk.length,
      insights:intelligenceAlerts(pulse,intel).map(item=>item.text),
      uncoveredPeriods:pulse.uncovered_periods,
      scheduledPeriods:pulse.scheduled_periods
    });

    // Navigate in the current frame so Android WebViews can hand off to WhatsApp.
    const link=elt('a');
    link.href='https://wa.me/?text='+encodeURIComponent(message);
    link.referrerPolicy='no-referrer';
    const currentSnapshot=snapshot;
    const clipboard=root.navigator?.clipboard;
    note('WhatsApp draft requested.');
    try{
      if(clipboard?.writeText){
        Promise.resolve(clipboard.writeText(message)).then(
          ()=>{if(snapshot===currentSnapshot)note('WhatsApp draft requested and brief copied.');},
          ()=>{if(snapshot===currentSnapshot)note('WhatsApp draft requested. Clipboard copy failed.');}
        );
      }
    }catch(_){note('WhatsApp draft requested. Clipboard copy failed.');}
    link.click();
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
    else if(fromSharedApp&&!openAlert)root.location.replace(staffEntry);
  });
  return client;
}
const api={create,mount,today};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else{root.BNLeadership=api;root.addEventListener('DOMContentLoaded',()=>mount());}
})(typeof window==='undefined'?globalThis:window);
