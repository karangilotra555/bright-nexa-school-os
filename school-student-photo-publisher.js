/* Publish legacy ERP passport photos through existing school-scoped private Storage.
 * No service-role key, guessed student ID, anonymous upload, or destructive
 * mutation. The published photo_path is verified with a Supabase readback.
 */
(function(root,factory){
  'use strict';
  const api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else{root.BNStudentPhotoPublisher=api;api.start();}
})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';
  const BASE='https://mrfvbwmyxndrakskqyas.supabase.co';
  const KEY='sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT';
  const STAFF='bn_school_staff_session_v1';
  const ERP='bright-nexa-school-os:session:v2';
  const MAX_BYTES=5*1024*1024;
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function parse(value){try{return JSON.parse(value||'null')}catch(_){return null}}
  function decodePhoto(value){
    if(typeof value!=='string'||value.length>7000000)
      throw Error('Student photo is not a supported private JPEG, PNG or WebP image.');
    const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(value);
    if(!match||match[2].length%4!==0)
      throw Error('Student photo is not a valid JPEG, PNG or WebP data URL.');
    if(typeof root.atob!=='function'||typeof root.Blob!=='function')
      throw Error('This browser cannot prepare the private student photo.');
    const binary=root.atob(match[2]);
    if(binary.length<1||binary.length>MAX_BYTES)
      throw Error('Student photo exceeds the private Storage 5 MB limit.');
    const chunks=[];
    for(let pos=0;pos<binary.length;pos+=65536){
      const segment=binary.slice(pos,pos+65536);
      const buffer=new Uint8Array(segment.length);
      for(let j=0;j<segment.length;j++)buffer[j]=segment.charCodeAt(j);
      chunks.push(buffer);
    }
    return new root.Blob(chunks,{type:match[1].toLowerCase()});
  }
  function create(options={}){
    const storage=options.storage||root.sessionStorage;
    const fetcher=options.fetcher||root.fetch?.bind(root);
    // Reuse the verified owner-only school client to refresh an expired staff
    // token. Never use privileged keys or refresh another account's session.
    const schoolClient=options.schoolClient||root.BNWorkspaceCloud?.create?.({sessionStorage:storage})||null;
    const photos=options.photos||(()=>root.BNStudentPhotos?.create({
      base:BASE,key:KEY,token:async()=>session()?.jwt
    }));
    let working=false,attempts=0,attemptAfter=0,lastResult={status:'not-checked'};
    function session(){
      const staff=parse(storage?.getItem(STAFF));
      const erp=parse(storage?.getItem(ERP));
      if(erp?.cloudVerified!==true||erp?.role!=='OWNER'||!UUID.test(erp.institutionId)
        ||typeof staff?.access_token!=='string'||!staff.access_token)return null;
      return {schoolId:erp.institutionId,jwt:staff.access_token};
    }
    function sameSession(s){
      const current=session();
      return !!current&&current.schoolId===s.schoolId&&current.jwt===s.jwt;
    }
    async function ensurePhotoSession(s){
      const staff=parse(storage?.getItem(STAFF));
      const expiry=Number(staff?.expires_at);
      // Older isolated clients may not record an expiry. Let RLS determine
      // access without guessing a new session or overriding credentials.
      if(!Number.isFinite(expiry)||expiry<=0||expiry>Date.now()/1000+90)return;
      if(typeof schoolClient?.connect!=='function')
        throw Error('Staff session expired. Sign in to the verified school again before checking photos.');
      // This checks an active Supabase school_admin membership and handles
      // refresh-token rotation in the existing authenticated cloud client.
      const allowed=await schoolClient.connect();
      const current=session();
      if(!current||current.schoolId!==s.schoolId||
        !Array.isArray(allowed)||!allowed.some(row=>row.id===s.schoolId))
        throw Error('Verified school session changed. Sign in again; no photo was uploaded.');
      s.jwt=current.jwt;
    }
    async function rows(s,table,filters){
      if(typeof fetcher!=='function')throw Error('Photo sync cannot contact Supabase.');
      const search=new URLSearchParams({select:filters.select,
        institution_id:'eq.'+s.schoolId,...filters.extra});
      const url=BASE+'/rest/v1/'+table+'?'+search;
      const ctrl=typeof root.AbortController==='function'?new root.AbortController():null;
      const timer=typeof root.setTimeout==='function'?root.setTimeout(()=>ctrl?.abort(),25000):null;
      let response;
      try{response=await fetcher(url,{headers:{apikey:KEY,Authorization:'Bearer '+s.jwt},
        method:'GET',cache:'no-store',...(ctrl?{signal:ctrl.signal}:{})});}
      finally{if(timer!==null&&typeof root.clearTimeout==='function')root.clearTimeout(timer);}
      if(!response?.ok)throw Error('Student photo cloud readback failed (HTTP '+(response?.status||'network')+').');
      const data=await response.json();
      if(!Array.isArray(data))throw Error('Invalid student photo cloud response.');
      return data;
    }
    function notice(error){
      const doc=root.document;
      if(!doc?.body)return;
      let panel=doc.getElementById('bn-student-photo-publish-status');
      if(!error){panel?.remove();return;}
      if(!panel){
        panel=doc.createElement('section');
        panel.id='bn-student-photo-publish-status';
        panel.setAttribute('role','alert');
        panel.style.cssText='position:fixed;right:16px;bottom:110px;z-index:2147482000;max-width:min(370px,calc(100vw - 32px));padding:12px 14px;background:#fff8ec;color:#714216;border:1px solid #d2a15a;border-radius:10px;box-shadow:0 6px 24px #0002;font:13px/1.45 system-ui';
        const msg=doc.createElement('span');msg.dataset.role='message';
        const retry=doc.createElement('button');retry.type='button';retry.textContent='Retry photo sync';
        retry.style.cssText='display:block;margin-top:8px;background:#fff;color:#714216;border:1px solid #d2a15a;padding:6px 10px;border-radius:6px;cursor:pointer';
        retry.onclick=()=>{attemptAfter=0;void run();};
        panel.append(msg,retry);doc.body.append(panel);
      }
      const node=panel.querySelector('[data-role="message"]');
      if(node){
        const message=String(error.message||error).slice(0,220);
        const denied=/HTTP (?:401|403)|session expired|login expired|session changed/i.test(message);
        node.textContent=denied
          ?'Student photo could not be checked because staff login was rejected or expired. This does not mean the photo is missing. Sign in again and recheck after resolving any school sync conflict. '+message
          :'Student photo publication could not be verified. The original photo is preserved. '+message;
      }
    }
    async function run(){
      if(working)return {status:'busy'};
      const s=session();
      if(!s){notice(null);return {status:'not-authorized'};}
      if(Date.now()<attemptAfter)return {status:'retry-later'};
      working=true;
      try{
        await ensurePhotoSession(s);
        if(!sameSession(s))return {status:'session-changed'};
        const [active,profiles,links]=await Promise.all([
          rows(s,'school_students',{select:'id,status',extra:{status:'eq.active'}}),
          rows(s,'school_student_profiles',{select:'student_id,details'}),
          rows(s,'school_workspace_links',{select:'local_id,cloud_id',extra:{entity:'eq.students'}})
        ]);
        if(!sameSession(s))return {status:'session-changed'};
        const ids=new Set(active.filter(r=>r.status==='active'&&UUID.test(r.id)).map(r=>r.id));
        const existing=new Map(profiles.filter(r=>UUID.test(r.student_id)).map(r=>[r.student_id,r.details?.photo_path||null]));
        const candidates=links.filter(l=>UUID.test(l.cloud_id)&&ids.has(l.cloud_id)
          &&typeof l.local_id==='string'&&l.local_id.length<180&&!existing.get(l.cloud_id));
        if(!candidates.length){
          attempts=0;attemptAfter=Date.now()+60000;notice(null);
          return lastResult={status:'up-to-date',published:0};
        }
        const saved=await rows(s,'school_workspaces',{select:'revision,snapshot',extra:{limit:'1'}});
        const workspace=saved.length===1?saved[0]:null;
        if(!sameSession(s)||workspace?.snapshot?.institution?.institution?.id!==s.schoolId
          ||!Array.isArray(workspace.snapshot.students))
          throw Error('Verified school photo workspace is not ready.');
        const locals=new Map(workspace.snapshot.students.filter(r=>r&&typeof r.id==='string')
          .map(r=>[r.id,r]));
        const publisher=typeof photos==='function'?photos():photos;
        if(typeof publisher?.upload!=='function')
          throw Error('Private photo upload service could not load. Refresh the app.');
        let published=0;
        for(const link of candidates.slice(0,3)){
          if(!sameSession(s))return {status:'session-changed'};
          const student=locals.get(link.local_id);
          if(typeof student?.photoDataUrl!=='string'||!student.photoDataUrl.startsWith('data:image/'))continue;
          // Another tab may have just published this student. Re-read the
          // current profile before uploading a duplicate Storage object.
          const fresh=await rows(s,'school_student_profiles',{select:'student_id,details',
            extra:{student_id:'eq.'+link.cloud_id}});
          if(fresh[0]?.details?.photo_path)continue;
          const file=decodePhoto(student.photoDataUrl);
          const result=await publisher.upload(s.schoolId,link.cloud_id,file);
          if(!sameSession(s))return {status:'session-changed'};
          const verified=await rows(s,'school_student_profiles',{select:'student_id,details',
            extra:{student_id:'eq.'+link.cloud_id}});
          if(!result?.path||verified[0]?.details?.photo_path!==result.path)
            throw Error('Photo upload was not verified in the student profile.');
          published++;
        }
        attempts=0;attemptAfter=Date.now()+60000;notice(null);
        return lastResult={status:'verified',published};
      }catch(error){
        attempts++;
        attemptAfter=Date.now()+Math.min(600000,15000*Math.pow(2,Math.min(attempts,5)));
        lastResult={status:'failed',message:String(error.message||error)};
        if(sameSession(s))notice(error);
        return lastResult;
      }finally{working=false;}
    }
    return {run,decodePhoto,getStatus:()=>lastResult};
  }
  const instance=create();
  let timer=null;
  function start(){
    if(!root.document)return;
    function schedule(delay=2000){
      if(timer!==null)root.clearTimeout?.(timer);
      timer=root.setTimeout?.(()=>{timer=null;void instance.run();},delay);
    }
    function boot(){
      schedule(7000);
      root.addEventListener?.('online',()=>schedule(2000));
      root.addEventListener?.('focus',()=>schedule(2000));
      root.addEventListener?.('bn-cloud-recheck',()=>schedule(1000));
      root.setInterval?.(()=>schedule(1000),60000);
    }
    if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',boot,{once:true});
    else boot();
  }
  return {create,start,decodePhoto,getStatus:instance.getStatus,run:instance.run};
});
