/* Parent-only cloud access. Database RLS verifies every student relationship. */
(function(root){
'use strict';
const BASE='https://mrfvbwmyxndrakskqyas.supabase.co';
const KEY='sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT';
function create(fetcher){
 let session=null,selected=null;
 const filesClient=typeof root.BNHomeworkFiles!=='undefined'?root.BNHomeworkFiles.create({base:BASE,key:KEY,token:async()=>session?.access_token,fetcher}):null;
 const photoClient=typeof root.BNStudentPhotos!=='undefined'?root.BNStudentPhotos.create({base:BASE,key:KEY,token:async()=>session?.access_token,fetcher}):null;
 async function request(path,options={}){
  const res=await fetcher(BASE+path,{...options,cache:'no-store',headers:{apikey:KEY,...(session?{Authorization:'Bearer '+session.access_token}:{}),'Content-Type':'application/json',...options.headers}});
  const raw=await res.text();
  let body;try{body=raw?JSON.parse(raw):null;}catch(_){throw Error('Invalid response from school service');}
  if(!res.ok){if(res.status===401){session=null;selected=null;}throw Error(body?.error||body?.msg||body?.message||body?.error_description||'School connection unavailable');}
  return body;
 }
 async function rows(table,filters){const all=[];for(let offset=0;;offset+=1000){const page=await request('/rest/v1/'+table+'?'+new URLSearchParams({select:'*',order:'id.asc',...filters,limit:'1000',offset:String(offset)}));all.push(...page);if(page.length<1000)return all;}}
 async function login(admissionNumber,password){
  session=null;selected=null;
  const next=await request('/functions/v1/school-student-login',{method:'POST',body:JSON.stringify({action:'login',admissionNumber,password,schoolId:new URLSearchParams(typeof location==='undefined'?'':location.search).get('school')||undefined})});
  if(!next.session?.access_token||!next.session?.user?.id)throw Error('Unable to verify student account');
  session=next.session;
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
  const next=await request('/functions/v1/school-student-login',{method:'POST',body:JSON.stringify({action:'change-password',newPassword})});
  if(!next.session?.access_token)throw Error('Password changed. Please log in again.');
  session=next.session;selected=null;
  return next.links||[];
 }
 // A narrowly scoped RPC returns names/subjects ONLY for teachers assigned
 // to this child's classroom. It rejects other children at the database level.
 // Keep the rest of the portal working until the migration is deployed.
 async function classTeachers(link){
  try{
   const res=await fetcher(BASE+'/rest/v1/rpc/bn_portal_class_teachers',{
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
   const res=await fetcher(BASE+'/rest/v1/rpc/bn_portal_student_timetable',{
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
  if(!session)throw Error('Please log in again');
  selected=null;
  const filter={institution_id:'eq.'+link.institution_id,student_id:'eq.'+link.student_id};
  const students=await rows('school_students',{id:'eq.'+link.student_id,institution_id:filter.institution_id,status:'eq.active'});
  const student=students[0];if(!student)throw Error('Student access is unavailable. Contact the school office.');
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
  const [teachers,timetable,photoUrl,marksheets]=await Promise.all([classTeachers(link),studentTimetable(link),studentPhoto(link,profiles[0]),publishedMarksheets(link)]);
  const attached=filesClient?await filesClient.list(homework.map(h=>h.id)):[];
  selected=link;
  const recorded=attendance.filter(a=>['present','absent','late','half_day'].includes(a.status.toLowerCase()));
  const present=recorded.reduce((n,a)=>n+(a.status.toLowerCase()==='half_day'?.5:['present','late'].includes(a.status.toLowerCase())?1:0),0);
  return {student:{name:student.name,dob:student.dob,profile:profiles[0]||{},photoUrl,admissionNumber:student.admission_number,className:classes[0]?.name,section:classes[0]?.section},school:{name:schools[0]?.name,session:classes[0]?.academic_year},attendance:{percent:recorded.length?Math.round(present/recorded.length*1000)/10:null,recordedDays:recorded.length,recent:attendance},fees:{dueRupees:fees.length?Math.max(0,fees.reduce((n,f)=>n+(f.kind==='charge'?1:-1)*Number(f.amount_rupees),0)):null},homework:homework.map(h=>({...h,files:attached.filter(f=>f.homework_id===h.id),title:[h.title,h.instructions].filter(Boolean).join(' — '),due_date:h.due_on})),notices:notices.map(n=>({...n,published_at:n.created_at})),leaves:leaves.map(l=>({...l,from_day:l.from_on,to_day:l.to_on})),teachers:teachers.rows,teachersStatus:teachers.status,timetable:timetable.rows,timetableStatus:timetable.status,marksheets:marksheets.rows,marksheetError:marksheets.error};
 }
 async function leave(from,to,reason){
  if(!session||!selected)throw Error('Please log in and select your child');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||to<from||reason.trim().length<5||reason.length>500)throw Error('Check leave dates and reason');
  await request('/rest/v1/school_parent_leaves',{method:'POST',body:JSON.stringify({institution_id:selected.institution_id,student_id:selected.student_id,parent_auth_user_id:session.user.id,from_on:from,to_on:to,reason:reason.trim(),status:'pending'})});
 }
 async function logout(){try{if(session)await request('/auth/v1/logout',{method:'POST'});}finally{session=null;selected=null;}}
 return {login,requestPasswordReset,changePassword,dashboard,leave,logout,fileLinks:(container,files)=>filesClient?.links(container,files)};
}
if(typeof module!=='undefined')module.exports={create};else root.BNParentsCloud=create(root.fetch.bind(root));
})(typeof window!=='undefined'?window:globalThis);
