/* Shared school workspace adapter. Publishable credentials; authorization is enforced by RLS/RPC. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BNWorkspaceCloud=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const BASE='https://mrfvbwmyxndrakskqyas.supabase.co',KEY='sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT',TOKEN='bn_school_staff_session_v1';
 const obj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 const str=x=>x==null?'':String(x).trim();
 const norm=x=>str(x).replace(/\s+/g,' ').toLowerCase();
 function required(x,label){const value=str(x);if(!value)throw Error(label+' is required.');return value;}
 function date(x,label,optional){if(optional&&!str(x))return null;const v=str(x);if(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)throw Error(label+' must be a valid date.');return v;}
 function shape(s){if(!obj(s)||!obj(s.institution)||!obj(s.institution.institution)||!Array.isArray(s.students)||!obj(s.operations))throw Error('Invalid school workspace snapshot.');return s;}
 function rows(o,k){if(o[k]===undefined)return [];if(!Array.isArray(o[k]))throw Error('Invalid '+k+' records.');return o[k];}
 function unique(records,label,key){const seen=new Set();for(const r of records){if(!obj(r))throw Error('Invalid '+label+' record.');const id=required(key?key(r):r.id,label+' ID');if(seen.has(id))throw Error('Duplicate '+label+' identity: '+id);seen.add(id);}return records;}
 function buildProjection(snapshot,feeObligations){
  shape(snapshot);const ops=snapshot.operations,institution=snapshot.institution.institution;
  const localClasses=unique(rows(ops,'classes'),'class');
  const classes=localClasses.map(c=>({localId:required(c.id,'Class ID'),name:required(c.name,'Class name'),section:str(c.section),academicYear:required(c.academicYear||institution.session,'Academic year')}));
  unique(classes,'class name / section / year',c=>[norm(c.name),norm(c.section),norm(c.academicYear)].join('|'));
  const classIds=new Set(classes.map(c=>c.localId));
  function classFor(row){if(str(row.classId)){if(!classIds.has(str(row.classId)))throw Error('Unknown class reference: '+row.classId);return str(row.classId);}const found=localClasses.filter(c=>norm(c.name)===norm(row.className)&&norm(c.section)===norm(row.section)&&(!str(row.academicStream)||norm(c.academicStream)===norm(row.academicStream)));if(found.length!==1)throw Error('Unknown or ambiguous class / section / stream for '+(row.name||row.id)+'.');return str(found[0].id);}
  const students=unique(snapshot.students,'student').map(s=>{const status=norm(required(s.status,'Student status'));if(!['active','graduated','transferred','archived'].includes(status))throw Error('Invalid student status: '+s.status);return {localId:str(s.id),admissionNumber:required(s.admissionNumber,'Admission number'),name:required(s.name,'Student name'),classLocalId:classFor(s),dob:date(s.dateOfBirth,'Birth date',true),status,profile:{guardian_name:str(s.guardianName||s.fatherName||s.motherName)||null,guardian_phone:str(s.parentMobile)||null,address_line:str(s.address)||null,details:{...s}}};});
  unique(students,'admission number',s=>norm(s.admissionNumber));const studentMap=new Map(students.map(s=>[s.localId,s]));
  const attendance=unique(rows(ops,'attendance'),'attendance').map(a=>{const student=studentMap.get(str(a.studentId));if(!student)throw Error('Unknown attendance student reference.');const classLocalId=classFor(a);if(classLocalId!==student.classLocalId)throw Error('Attendance class does not match student class.');const status=norm(a.status);if(!['present','absent','late','excused'].includes(status))throw Error('Invalid attendance status: '+a.status);return {localId:str(a.id),studentLocalId:student.localId,classLocalId,day:date(a.date,'Attendance date'),status};});
  unique(attendance,'attendance student / day',a=>a.studentLocalId+'|'+a.day);
  const homework=unique(rows(ops,'homework'),'homework').map(h=>({localId:str(h.id),classLocalId:classFor(h),subject:required(h.subject,'Homework subject'),title:required(h.title,'Homework title'),instructions:str(h.instructions),dueOn:date(h.dueDate,'Homework due date',true)}));
  const notices=unique(rows(ops,'notices'),'notice').filter(n=>['all','all parents','parents and students'].includes(norm(n.audience))).map(n=>({localId:str(n.id),title:required(n.title,'Notice title'),body:required(n.content||n.message||n.body,'Notice body')}));
  const fees=[];if(typeof feeObligations!=='function'&&(rows(ops,'feeStructures').length||rows(ops,'feePayments').length))throw Error('The established fee calculation engine is required.');
  for(const student of snapshot.students){const obligations=feeObligations?feeObligations(ops,student,institution):[];if(!Array.isArray(obligations))throw Error('Invalid fee obligations.');unique(obligations,'fee obligation',o=>o.key);for(const obligation of obligations){const key=required(obligation.key,'Fee obligation key'),amount=Number(obligation.amount),credit=Number(obligation.credited);if(!Number.isFinite(amount)||!Number.isFinite(credit)||amount<0||credit<0||credit>amount)throw Error('Invalid fee obligation amount or credit.');const description=[obligation.structure&&obligation.structure.category,obligation.period].filter(Boolean).join(' · ')||key;let occurredOn=null;if(obligation.billingYear!=null&&obligation.billingMonth!=null)occurredOn=date(String(obligation.billingYear)+'-'+String(obligation.billingMonth).padStart(2,'0')+'-01','Fee billing date');for(const [kind,value] of [['charge',amount],['payment',credit]])fees.push({localId:JSON.stringify([str(student.id),key,kind]),studentLocalId:str(student.id),kind,amountRupees:Math.round(value*100)/100,description,occurredOn});}}
  return {classes,students,attendance,homework,notices,fees};
 }
 function create(options){
  options=options||{};const fetcher=options.fetcher||(typeof fetch==='function'?fetch.bind(globalThis):null),sessions=options.sessionStorage||(typeof sessionStorage!=='undefined'?sessionStorage:null);
  // Do not leave a school indefinitely syncing when Supabase stops responding.
  const requestTimeoutMs=Number.isInteger(options.requestTimeoutMs)&&options.requestTimeoutMs>=10&&options.requestTimeoutMs<=120000?options.requestTimeoutMs:20000;
  async function timedFetch(url,init){
    if(typeof fetcher!=='function')throw Error('Supabase network is unavailable. Changes were not saved.');
    const controller=typeof AbortController==='function'?new AbortController():null;
    let timer,expired=false;
    try{
      return await Promise.race([
        Promise.resolve().then(()=>fetcher(url,{...init,...(controller?{signal:controller.signal}:{})})),
        new Promise((_,reject)=>{
          timer=setTimeout(()=>{
            expired=true;
            if(controller)controller.abort();
            const e=Error('Supabase request timed out. Change is not saved to cloud; retry sync.');
            e.code='CLOUD_TIMEOUT';reject(e);
          },requestTimeoutMs);
        })
      ]);
    }catch(e){
      if(expired||e?.name==='AbortError'){
        const timeout=Error('Supabase request timed out. Change is not saved to cloud; retry sync.');
        timeout.code='CLOUD_TIMEOUT';throw timeout;
      }
      throw e;
    }finally{clearTimeout(timer);}
  }
  async function decode(response){let data;try{data=await response.json();}catch(_){throw Error('The cloud returned an invalid response. Local records are unchanged.');}if(!response.ok){const message=str(data.message||data.error_description||data.msg||data.error);const conflict=response.status===409||/revision.*conflict|workspace.*changed/i.test(message);const error=Error(conflict?'Cloud records changed (revision conflict). Local records are preserved. Pull the current workspace before retrying.':message||'Cloud access denied. Local records are unchanged.');error.code=conflict?'WORKSPACE_CONFLICT':response.status===401?'SESSION_EXPIRED':'CLOUD_ERROR';error.status=response.status;throw error;}return data;}
  async function token(){let session;try{session=JSON.parse(sessions&&sessions.getItem(TOKEN));}catch(_){}if(!session||!str(session.access_token))throw Error('Please sign in to school staff access first.');if(!Number.isFinite(Number(session.expires_at))||Number(session.expires_at)<=Date.now()/1000+90){if(!str(session.refresh_token))throw Error('Session expired. Please sign in again.');const refreshed=await decode(await timedFetch(BASE+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token}),cache:'no-store'}));if(!str(refreshed.access_token)||!Number.isFinite(Number(refreshed.expires_in))||Number(refreshed.expires_in)<=90)throw Error('Session refresh failed. Please sign in again.');session={access_token:refreshed.access_token,refresh_token:refreshed.refresh_token||session.refresh_token,expires_at:Math.floor(Date.now()/1000)+Number(refreshed.expires_in)};sessions.setItem(TOKEN,JSON.stringify(session));}return session.access_token;}
  // An access token may become invalid between membership verification and the write.
  // Refresh only the original session and retry the idempotent, revision-checked
  // workspace RPC once. Never retry another user's/switched school's session.
  async function renewRejectedToken(access){
    let before;try{before=JSON.parse(sessions&&sessions.getItem(TOKEN));}catch(_){}
    if(!before||before.access_token!==access)throw Error('School login changed while saving. Pending changes were kept; sign in again.');
    if(!str(before.refresh_token))throw Error('School session expired. Sign in again to publish pending changes.');
    let refreshed;
    try{
      refreshed=await decode(await timedFetch(BASE+'/auth/v1/token?grant_type=refresh_token',{
        method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},
        body:JSON.stringify({refresh_token:before.refresh_token}),cache:'no-store'
      }));
    }catch(error){const e=Error('School login expired. Sign in again and retry sync. '+(error?.message||''));e.code='SESSION_EXPIRED';throw e;}
    if(!str(refreshed.access_token)||!Number.isFinite(Number(refreshed.expires_in))||Number(refreshed.expires_in)<=90){
      const e=Error('Session refresh did not succeed. Sign in again; pending edits were kept.');e.code='SESSION_EXPIRED';throw e;
    }
    let current;try{current=JSON.parse(sessions.getItem(TOKEN));}catch(_){}
    if(!current||current.access_token!==access||current.refresh_token!==before.refresh_token){
      throw Error('School login changed during session refresh. Pending changes were kept; sign in again.');
    }
    sessions.setItem(TOKEN,JSON.stringify({
      access_token:refreshed.access_token,refresh_token:refreshed.refresh_token||before.refresh_token,
      expires_at:Math.floor(Date.now()/1000)+Number(refreshed.expires_in)
    }));
    return refreshed.access_token;
  }
  async function request(path,access,body){
    const send=jwt=>timedFetch(BASE+path,{method:body===undefined?'GET':'POST',
      headers:{apikey:KEY,Authorization:'Bearer '+jwt,'Content-Type':'application/json'},
      body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
    let response=await send(access);
    if(response.status===401&&/^\/rest\/v1\/rpc\/school_workspace_(push|pull)$/.test(path)){
      const fresh=await renewRejectedToken(access);
      response=await send(fresh);
    }
    return decode(response);
  }
  async function authorize(){const access=await token(),user=await request('/auth/v1/user',access);if(!obj(user)||!str(user.id))throw Error('Authenticated user could not be verified.');const memberships=await request('/rest/v1/school_users?'+new URLSearchParams({select:'institution_id,auth_user_id,role,status',auth_user_id:'eq.'+user.id}),access);if(!Array.isArray(memberships))throw Error('School admin membership could not be verified.');const ids=[...new Set(memberships.filter(m=>m.auth_user_id===user.id&&m.role==='school_admin'&&m.status==='active').map(m=>str(m.institution_id)).filter(Boolean))];if(!ids.length)throw Error('Active school admin access is required.');const schools=[];for(const id of ids){const result=await request('/rest/v1/institutions?'+new URLSearchParams({select:'id,name,status',id:'eq.'+id}),access);if(!Array.isArray(result))throw Error('School could not be verified.');const s=result.find(s=>s.id===id&&['active','trial'].includes(s.status));if(s)schools.push({id:s.id,name:required(s.name,'School name')});}return {access,schools};}
  function result(data,id){if(!obj(data)||!obj(data.school)||data.school.id!==id||!str(data.school.name)||!Number.isSafeInteger(data.revision)||data.revision<0||!Object.hasOwn(data,'snapshot'))throw Error('Invalid or cross-school cloud response. Local records are unchanged.');if(data.snapshot!==null)shape(data.snapshot);return data;}
  async function run(id,body){required(id,'School ID');const auth=await authorize();if(!auth.schools.some(s=>s.id===id))throw Error('School admin access is not available for this school.');return result(await request('/rest/v1/rpc/school_workspace_'+(body?'push':'pull'),auth.access,body||{p_institution_id:id}),id);}
  return {buildProjection,connect:async()=>(await authorize()).schools,pull:id=>run(id),push:async(id,revision,snapshot,projection)=>{shape(snapshot);if(!Number.isSafeInteger(revision)||revision<0)throw Error('Invalid expected revision.');if(!obj(projection)||!['classes','students','attendance','homework','notices','fees'].every(k=>Array.isArray(projection[k])))throw Error('Invalid workspace projection.');const checked=buildProjection(snapshot,()=>[]);for(const k of ['classes','students','attendance','homework','notices'])if(JSON.stringify(checked[k])!==JSON.stringify(projection[k]))throw Error('Workspace projection does not match local '+k+'.');const studentIds=new Set(checked.students.map(s=>s.localId));unique(projection.fees,'fee',f=>f.localId);for(const f of projection.fees){if(!studentIds.has(f.studentLocalId)||!['charge','payment'].includes(f.kind)||typeof f.amountRupees!=='number'||!Number.isFinite(f.amountRupees)||f.amountRupees<0)throw Error('Invalid fee projection.');date(f.occurredOn,'Fee date',true);}const saved=await run(id,{p_institution_id:id,p_expected_revision:revision,p_snapshot:snapshot,p_projection:projection});if(saved.revision<=revision||saved.snapshot===null)throw Error('Cloud did not confirm the workspace save. Local records are unchanged.');return saved;}};
 }
 return {create,buildProjection};
});
