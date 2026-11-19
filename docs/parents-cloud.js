/* Parent-only cloud access. Database RLS verifies every student relationship. */
(function(root){
'use strict';
const BASE='https://mrfvbwmyxndrakskqyas.supabase.co';
const KEY='sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT';
function create(fetcher, deviceStore=root.BNMobileSession?.createStore('parent')){
 let session=null,selected=null,dashboardGeneration=0,authRevision=0,refreshing=null;
 function endSession(){
  authRevision++;session=null;selected=null;dashboardGeneration++;
  return deviceStore?.clear();
 }
 function setSession(next){
  session={...next,expires_at:Number(next.expires_at)||(next.expires_in?Date.now()/1000+Number(next.expires_in):null)};
 }
 async function refreshSession(refreshToken,expectedSchool){
  if(refreshing?.token===refreshToken&&refreshing.school===expectedSchool)return refreshing.promise;
  const revision=authRevision,marker=deviceStore?.marker?.();
  const stillCurrent=()=>revision===authRevision&&marker===deviceStore?.marker?.();
  const current={token:refreshToken,school:expectedSchool,promise:null};
  current.promise=(async()=>{
   try{
    const response=await timedFetch(BASE+'/auth/v1/token?grant_type=refresh_token',{
     method:'POST',cache:'no-store',headers:{apikey:KEY,'Content-Type':'application/json'},
     body:JSON.stringify({refresh_token:refreshToken})
    });
    if(!stillCurrent())return null;
    if([400,401,403].includes(response.status)){await endSession();return null;}
    if(!response.ok)throw Error('Could not verify saved login. Check your connection and try again.');
    const next=JSON.parse(await response.text());
    if(!stillCurrent())return null;
    const meta=next.user?.app_metadata;
    if(!next.access_token||!next.refresh_token||!next.user?.id||!meta?.bn_student_id
       ||!meta.bn_institution_id||meta.bn_password_pending===true){
     await endSession();return null;
    }
    const saved=await deviceStore?.write(next.refresh_token,false,marker);
    if(!stillCurrent()||saved===false||(expectedSchool&&meta.bn_institution_id!==expectedSchool))return null;
    setSession(next);
    return {links:[{institution_id:meta.bn_institution_id,student_id:meta.bn_student_id}]};
   }finally{if(refreshing===current)refreshing=null;}
  })();
  refreshing=current;
  return current.promise;
 }
 async function restore(){
  const revision=authRevision,token=await deviceStore?.read();
  if(!token||revision!==authRevision)return null;
  const schoolId=new URLSearchParams(typeof location==='undefined'?'':location.search).get('school');
  return refreshSession(token,schoolId||undefined);
 }
 async function ensureFresh(){
  if(session?.expires_at&&session.expires_at<=Date.now()/1000+90&&session.refresh_token){
   if(!await refreshSession(session.refresh_token))throw Error('Please log in again');
  }
 }
 const filesClient=typeof root.BNHomeworkFiles!=='undefined'?root.BNHomeworkFiles.create({base:BASE,key:KEY,token:async()=>session?.access_token,fetcher}):null;
 const photoClient=typeof root.BNStudentPhotos!=='undefined'?root.BNStudentPhotos.create({base:BASE,key:KEY,token:async()=>session?.access_token,fetcher}):null;
 async function timedFetch(url,options={}){
  const ctl=typeof AbortController==='function'?new AbortController():null;
  let timer,expired=false;
  try{
    return await Promise.race([
      Promise.resolve().then(()=>fetcher(url,{...options,...(ctl?{signal:ctl.signal}:{})})),
      new Promise((_,reject)=>{timer=setTimeout(()=>{
        expired=true;ctl?.abort();
        reject(Error('Student portal request timed out. No cloud save was confirmed; check connection and retry.'));
      },20000);})
    ]);
  }catch(e){
    if(expired||e?.name==='AbortError')throw Error('Student portal request timed out. No cloud save was confirmed; check connection and retry.');
    throw e;
  }finally{clearTimeout(timer);}
 }
 async function request(path,options={}){
  await ensureFresh();
  const activeSession=session;
  const res=await timedFetch(BASE+path,{...options,cache:'no-store',headers:{apikey:KEY,...(activeSession?{Authorization:'Bearer '+activeSession.access_token}:{}),'Content-Type':'application/json',...options.headers}});
  const raw=await res.text();
  let body;try{body=raw?JSON.parse(raw):null;}catch(_){throw Error('Invalid response from school service');}
  if(!res.ok){if(res.status===401&&session===activeSession){await endSession();}throw Error(body?.error||body?.msg||body?.message||body?.error_description||'School connection unavailable');}
  return body;
 }
 async function rows(table,filters){const all=[];for(let offset=0;;offset+=1000){const page=await request('/rest/v1/'+table+'?'+new URLSearchParams({select:'*',order:'id.asc',...filters,limit:'1000',offset:String(offset)}));all.push(...page);if(page.length<1000)return all;}}
 async function login(admissionNumber,password){
  await endSession();
  const revision=authRevision,marker=deviceStore?.marker?.();
  const next=await request('/functions/v1/school-student-login',{method:'POST',body:JSON.stringify({action:'login',admissionNumber,password,schoolId:new URLSearchParams(typeof location==='undefined'?'':location.search).get('school')||undefined})});
  if(!next.session?.access_token||!next.session?.user?.id)throw Error('Unable to verify student account');
  if(revision!==authRevision||marker!==deviceStore?.marker?.())throw Error('Please log in again');
  const saved=!next.mustChangePassword&&next.links?.length
   ? await deviceStore?.write(next.session.refresh_token,true,marker):null;
  if(revision!==authRevision||saved===false)throw Error('Please log in again');
  setSession(next.session);
  return {mustChangePassword:next.mustChangePassword===true,links:next.links||[]};
 }
 async function requestPasswordReset(admissionNumber,guardianEmail){
  const schoolId=new URLSearchParams(typeof location==='undefined'?'':location.search).get('school')||undefined;
  // Return a generic response irrespective of account existence.
  return request('/functions/v1/school-student-login',{method:'POST',
   body:JSON.stringify({action:'request-reset',admissionNumber,guardianEmail,schoolId})});
 }
 async function changePassword(newPassword){
  if(!session)throw Error('Please log in again');
  const revision=authRevision,marker=deviceStore?.marker?.();
  const next=await request('/functions/v1/school-student-login',{method:'POST',body:JSON.stringify({action:'change-password',newPassword})});
  if(revision!==authRevision||marker!==deviceStore?.marker?.()||!next.session?.access_token)throw Error('Please log in again.');
  const saved=next.links?.length?await deviceStore?.write(next.session.refresh_token,true,marker):null;
  if(revision!==authRevision||saved===false)throw Error('Please log in again.');
  setSession(next.session);selected=null;dashboardGeneration++;
  return next.links||[];
 }
 // A narrowly scoped RPC returns names/subjects ONLY for teachers assigned
 // to this child's classroom. It rejects other children at the database level.
 // Keep the rest of the portal working until the migration is deployed.
 async function classTeachers(link){
  try{
   const res=await timedFetch(BASE+'/rest/v1/rpc/bn_portal_class_teachers',{
    method:'POST',cache:'no-store',
    headers:{apikey:KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},
    body:JSON.stringify({p_institution_id:link.institution_id,p_student_id:link.student_id})
   });
   if(!res.ok)return {rows:[],status:'unavailable'};
   const rows=await res.json();
   return Array.isArray(rows)?{rows:rows.filter(r=>r&&typeof r.teacher_name==='string'),status:'loaded'}:{rows:[],status:'unavailable'};
  }catch(_){return {rows:[],status:'unavailable'};}
 }
 async function studentTimetable(link){
  try{
   const res=await timedFetch(BASE+'/rest/v1/rpc/bn_portal_student_timetable',{
    method:'POST',cache:'no-store',
    headers:{apikey:KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},
    body:JSON.stringify({p_institution_id:link.institution_id,p_student_id:link.student_id})
   });
   if(!res.ok)return {rows:[],status:'unavailable'};
   const data=await res.json();
   return Array.isArray(data)?{rows:data,status:data.length?'published':'not_published'}:{rows:[],status:'unavailable'};
  }catch(_){return {rows:[],status:'unavailable'};}
 }
 async function publishedMarksheets(link){
  try{
   const data=await request('/rest/v1/rpc/bn_school_published_marksheets',{
    method:'POST',body:JSON.stringify({p_school:link.institution_id,p_student:link.student_id})
   });
   if(!Array.isArray(data))throw Error('Invalid marksheet response');
   return {rows:data,error:null};
  }catch(err){return {rows:[],error:err.message};}
 }
 async function studentPhoto(link,profile){
  const path=profile?.details?.photo_path;
  if(!path||!photoClient)return null;
  try{return await photoClient.signedUrl(link.institution_id,link.student_id,path);}catch(_){return null;}
 }
 async function dashboard(link){
  await ensureFresh();
  if(!session)throw Error('Please log in again');
  const generation=++dashboardGeneration,activeSession=session;
  selected=null;
  const filter={institution_id:'eq.'+link.institution_id,student_id:'eq.'+link.student_id};
  const students=await rows('school_students',{id:'eq.'+link.student_id,institution_id:filter.institution_id,status:'eq.active'});
  if(session!==activeSession)throw Error('Please log in again');
  const student=students[0];
  if(!student){await endSession();throw Error('Student access is unavailable. Contact the school office.');}
  const [schools,classes,attendance,fees,homework,notices,leaves,profiles]=await Promise.all([
   rows('institutions',{id:filter.institution_id}),
   student.class_id?rows('school_classes',{id:'eq.'+student.class_id,institution_id:filter.institution_id}):[],
   rows('school_attendance',{...filter,order:'day.desc'}),
   rows('school_fee_entries',{...filter}),
   student.class_id?rows('school_homework',{institution_id:filter.institution_id,class_id:'eq.'+student.class_id,order:'created_at.desc'}):[],
   rows('school_notices',{institution_id:filter.institution_id,order:'created_at.desc'}),
   rows('school_parent_leaves',{...filter,parent_auth_user_id:'eq.'+session.user.id,order:'created_at.desc'}),
   rows('school_student_profiles',{order:'student_id.asc',student_id:filter.student_id,institution_id:filter.institution_id})
  ]);
  if(session!==activeSession)throw Error('Please log in again');
  const [teachers,timetable,photoUrl,marksheets]=await Promise.all([classTeachers(link),studentTimetable(link),studentPhoto(link,profiles[0]),publishedMarksheets(link)]);
  if(session!==activeSession)throw Error('Please log in again');
  const attached=filesClient?await filesClient.list(homework.map(h=>h.id)):[];
  if(session!==activeSession)throw Error('Please log in again');
  if(generation===dashboardGeneration)selected=link;
  const recorded=attendance.filter(a=>['present','absent','late','half_day'].includes(a.status.toLowerCase()));
  const present=recorded.reduce((n,a)=>n+(a.status.toLowerCase()==='half_day'?.5:['present','late'].includes(a.status.toLowerCase())?1:0),0);
  return {student:{name:student.name,dob:student.dob,profile:profiles[0]||{},photoUrl,admissionNumber:student.admission_number,className:classes[0]?.name,section:classes[0]?.section,academicStream:classes[0]?.academic_stream},school:{name:schools[0]?.name,session:classes[0]?.academic_year},attendance:{percent:recorded.length?Math.round(present/recorded.length*1000)/10:null,recordedDays:recorded.length,recent:attendance},fees:{dueRupees:fees.length?Math.max(0,fees.reduce((n,f)=>n+(f.kind==='charge'?1:-1)*Number(f.amount_rupees),0)):null},homework:homework.map(h=>({...h,files:attached.filter(f=>f.homework_id===h.id),inboxTitle:h.title,title:[h.title,h.instructions].filter(Boolean).join(' — '),due_date:h.due_on})),notices:notices.map(n=>({...n,published_at:n.created_at})),leaves:leaves.map(l=>({...l,from_day:l.from_on,to_day:l.to_on})),teachers:teachers.rows,teachersStatus:teachers.status,timetable:timetable.rows,timetableStatus:timetable.status,marksheets:marksheets.rows,marksheetError:marksheets.error};
 }
 async function leave(from,to,reason){
  if(!session||!selected)throw Error('Please log in and select your child');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||to<from||reason.trim().length<5||reason.length>500)throw Error('Check leave dates and reason');
  await request('/rest/v1/school_parent_leaves',{method:'POST',body:JSON.stringify({institution_id:selected.institution_id,student_id:selected.student_id,parent_auth_user_id:session.user.id,from_on:from,to_on:to,reason:reason.trim(),status:'pending'})});
 }
 function inboxScope(link){
  if(!session)throw Error('Please log in again');
  return {auth_user_id:session.user.id,institution_id:link.institution_id,student_id:link.student_id};
 }
 async function inboxReads(link){
  const filters=Object.fromEntries(Object.entries(inboxScope(link)).map(([key,value])=>[key,'eq.'+value]));
  return rows('school_parent_inbox_reads',{...filters,select:'item_kind,item_id',order:'item_kind.asc,item_id.asc'});
 }
 async function markInboxRead(link,kind,id){
  const scope=inboxScope(link),revision=authRevision;
  const receipt={...scope,item_kind:kind,item_id:id};
  const conflict=Object.keys(receipt).join(',');
  await request('/rest/v1/school_parent_inbox_reads?on_conflict='+conflict,{
   method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(receipt)
  });
  if(revision!==authRevision)throw Error('Please log in again');
  const filters=Object.fromEntries(Object.entries(receipt).map(([key,value])=>[key,'eq.'+value]));
  const confirmed=await rows('school_parent_inbox_reads',{...filters,select:'item_kind,item_id',order:'item_kind.asc,item_id.asc'});
  if(revision!==authRevision)throw Error('Please log in again');
  if(!confirmed.length)throw Error('Read receipt was not confirmed');
 }
 async function enableUrgentAlerts(scope,device,registration){
  await ensureFresh();
  if(!session||session.user?.id!==scope.member)throw Error('Please log in again');
  const jwt=session.access_token;
  const fields={p_school:scope.school,p_portal:'parent',p_installation:device.installation,p_registration:registration};
  const headers={Authorization:'Bearer '+jwt};
  const binding=await request('/rest/v1/rpc/bn_enable_urgent_circular_alerts',{
   method:'POST',headers,body:JSON.stringify({...fields,p_token:device.token})
  });
  return {binding,revoke:()=>timedFetch(BASE+'/rest/v1/rpc/bn_disable_urgent_circular_alerts',{
   method:'POST',keepalive:true,headers:{apikey:KEY,'Content-Type':'application/json',
    Authorization:'Bearer '+(session?.user?.id===scope.member?session.access_token:jwt)},
   body:JSON.stringify({...fields,p_binding:binding})
  })};
 }
 async function logout(){
  const jwt=session?.access_token;
  await endSession();
  if(jwt)await timedFetch(BASE+'/auth/v1/logout?scope=local',{
   method:'POST',cache:'no-store',headers:{apikey:KEY,Authorization:'Bearer '+jwt,'Content-Type':'application/json'}
  });
 }
 return {login,restore,activate:()=>deviceStore?.activate?.(),requestPasswordReset,changePassword,dashboard,inboxReads,markInboxRead,leave,logout,enableUrgentAlerts,alertIdentity:()=>session?.user?.id,fileLinks:(container,files)=>filesClient?.links(container,files)};
}
if(typeof module!=='undefined')module.exports={create};else root.BNParentsCloud=create(root.fetch.bind(root));
})(typeof window!=='undefined'?window:globalThis);
