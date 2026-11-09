/* Bright Nexa School OS: cloud-admin ERP entry, before React local-auth shell.
   Front-end checks guide navigation; Supabase Auth + RLS remain authoritative. */
(function(root,factory){
  'use strict';
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.BNErpEntry=api;api.start().catch(error=>api.showError(error));}
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const BASE='https://mrfvbwmyxndrakskqyas.supabase.co';
  const KEY='sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT';
  const STAFF_KEY='bn_school_staff_session_v1';
  const CHOSEN_KEY='bn_school_staff_selected_school_v1';
  const ERP_KEY='bright-nexa-school-os:session:v2';
  const BUNDLE='./assets/index-brightnexa-v2.js?v=20261109-cloud-first-v2';
  const ROOT='./teacher-access.html';
  const errorText='Unable to open this school. Your records have not been changed.';

  function parse(value){try{return JSON.parse(value||'null')}catch(_){return null}}
  function validUUID(id){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(id||''));}
  function cloudEntryRequired({search,staffSession,erpSession}){
    const params=new URLSearchParams(search||'');
    return !!(staffSession?.access_token||erpSession?.cloudVerified||params.get('openSchool')==='true'||params.has('tab'));
  }
  async function parseResponse(response,label){
    const data=await response.json().catch(()=>null);
    if(!response.ok)throw Error(data?.message||data?.error_description||data?.error||label||'Cloud verification failed');
    if(!data)throw Error(label||'Invalid cloud response');
    return data;
  }
  function showStatus(message){
    if(typeof document==='undefined')return;
    const node=document.getElementById('root');if(!node)return;
    node.replaceChildren();
    const holder=document.createElement('main');
    holder.setAttribute('role','status');
    holder.style.cssText='font:16px system-ui,sans-serif;max-width:520px;margin:12vh auto;padding:24px;color:#0b315e;line-height:1.6';
    const title=document.createElement('h2');title.textContent='Bright Nexa School OS';
    const p=document.createElement('p');p.textContent=message;
    holder.append(title,p);node.append(holder);
    return holder;
  }
  function localSchoolDraft(storage){
    try{
      const value=parse(storage?.getItem('bright-nexa-school-os:snapshot:v1'));
      const institution=value?.institution;
      if(!institution || typeof institution.name!=='string')return null;
      const name=institution.name.trim().slice(0,120);
      return name.length>=3?{name,email:typeof institution.email==='string'?institution.email:''}:null;
    }catch(_){return null;}
  }
  // Hosted schools must have a verified Supabase session. A browser-only
  // school is a local draft, NOT an activated institution or a cloud save.
  function showCloudGate(){
    // One canonical school sign-in. A local school draft is not a login error.
    // Keep Supabase callback fragments intact if email redirects to the root.
    const target=new URL(ROOT,window.location.href);
    const fragment=new URLSearchParams(window.location.hash.replace(/^#/,''));
    if((fragment.has('access_token')&&fragment.has('refresh_token'))||fragment.has('error'))target.hash=window.location.hash;
    const holder=showStatus('Opening secure school sign-in…');
    if(holder){
      const link=document.createElement('a');
      link.href=target.href;
      link.textContent='Continue to sign in';
      link.style.cssText='display:inline-block;margin-top:14px;padding:12px 18px;background:#087dcc;color:#fff;border-radius:9px;font-weight:700;text-decoration:none';
      holder.append(link);
    }
    window.setTimeout(()=>window.location.replace(target.href),0);
  }
  function showError(error){
    if(typeof document==='undefined')return;
    const message=error?.message||errorText,holder=showStatus(message);
    if(!holder)return;
    const link=document.createElement('a');
    link.href=ROOT;
    link.textContent='Return to secure sign in';
    link.style.cssText='color:#087dcc;font-weight:700;display:inline-block;margin-top:12px';
    holder.append(link);
  }
  async function verify(options){
    const settings=options||{};
    const store=settings.store||window.sessionStorage;
    const fetcher=settings.fetcher||window.fetch.bind(window);
    let session=parse(store.getItem(STAFF_KEY));
    if(!session?.access_token)throw Error('School Admin session not found. Sign in to the existing school first.');
    const authURL=BASE+'/auth/v1/';
    if(!Number.isFinite(Number(session.expires_at))||Number(session.expires_at)<=Date.now()/1000+90){
      if(!session.refresh_token)throw Error('School session expired. Sign in again.');
      const next=await parseResponse(await fetcher(authURL+'token?grant_type=refresh_token',{
        method:'POST',cache:'no-store',headers:{apikey:KEY,'Content-Type':'application/json'},
        body:JSON.stringify({refresh_token:session.refresh_token})
      }),'Session refresh failed');
      if(!next.access_token)throw Error('Session refresh did not return an access token.');
      session={access_token:next.access_token,refresh_token:next.refresh_token||session.refresh_token,
        expires_at:Math.floor(Date.now()/1000)+Number(next.expires_in||3600)};
      store.setItem(STAFF_KEY,JSON.stringify(session));
    }
    const headers={apikey:KEY,Authorization:'Bearer '+session.access_token};
    const user=await parseResponse(await fetcher(authURL+'user',{headers,cache:'no-store'}),'Unable to verify login');
    if(!validUUID(user.id))throw Error('Unverified school identity.');
    const members=await parseResponse(await fetcher(BASE+'/rest/v1/school_users?'+new URLSearchParams({
      select:'id,institution_id,auth_user_id,role,status,display_name,email',auth_user_id:'eq.'+user.id
    }),{headers,cache:'no-store'}),'Unable to verify school permissions');
    if(!Array.isArray(members))throw Error('Invalid school membership response.');
    const accepted=members.filter(m=>m.auth_user_id===user.id&&m.status==='active'&&m.role==='school_admin'&&validUUID(m.institution_id));
    const chosen=store.getItem(CHOSEN_KEY);
    const member=chosen?accepted.find(m=>m.institution_id===chosen):accepted.length===1?accepted[0]:null;
    if(!member)throw Error('Only a verified School Admin can open Full ERP. Choose the authorized school in Staff Login.');
    const schools=await parseResponse(await fetcher(BASE+'/rest/v1/institutions?'+new URLSearchParams({
      select:'id,name,status',id:'eq.'+member.institution_id
    }),{headers,cache:'no-store'}),'School verification failed');
    const school=Array.isArray(schools)&&schools.find(x=>x.id===member.institution_id&&['trial','active'].includes(x.status));
    if(!school)throw Error('This school is not active or is not accessible to your account.');
    async function rpc(name,args){
      return parseResponse(await fetcher(BASE+'/rest/v1/rpc/'+name,{
        method:'POST',cache:'no-store',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(args)
      }),'School workspace could not be opened');
    }
    let workspace=await rpc('school_workspace_pull',{p_institution_id:school.id});
    if(!workspace || workspace.school?.id!==school.id)throw Error('Wrong-school workspace response was rejected.');
    if(workspace.snapshot===null){
      workspace=await rpc('bn_initialize_school_workspace',{p_institution_id:school.id});
    }
    if(!workspace?.snapshot||workspace.school?.id!==school.id||
       workspace.snapshot.institution?.institution?.name!==school.name){
      throw Error('School records are not ready to open. Contact school admin support.');
    }
    // This is a UI bridge for legacy local-auth shell, not a new backend grant.
    // On every app load the bridge re-verifies Supabase identity and role.
    store.setItem(ERP_KEY,JSON.stringify({
      accountId:'cloud:'+user.id,name:member.display_name||member.email||'School Admin',
      role:'OWNER',cloudVerified:true,cloudUserId:user.id,institutionId:school.id
    }));
    store.setItem(CHOSEN_KEY,school.id);
    return {schoolId:school.id,name:school.name,revision:workspace.revision};
  }
  async function clearImportedDeviceDraft(verified){
    const pending=parse(window.localStorage.getItem('bn_school_import_pending_clear_v1'));
    if(!pending||pending.schoolId!==verified?.schoolId)return;
    if(!Number.isSafeInteger(pending.revision)||verified.revision<pending.revision)
      throw Error('Supabase has not confirmed the local-school import revision. Device data was retained.');
    if(window.indexedDB){
      await new Promise((resolve,reject)=>{
        const request=window.indexedDB.deleteDatabase('bright-nexa-school-os');
        request.onsuccess=resolve;
        request.onerror=()=>reject(Error('Cloud import was saved, but device cleanup failed. Please reload.'));
        request.onblocked=()=>reject(Error('Cloud import was saved. Close other School OS tabs so old local records can be cleared safely, then reload.'));
      });
    }
    for(const key of [
      'bright-nexa-school-os:snapshot:v1','bright-nexa-school-os:students:v1',
      'bright-nexa-school-os:operations:v1','bright-nexa-school-os:accounts:v1',
      'bright-nexa-school-os:auth-profile:v1','bright-nexa-school-os:recovery-attempts:v1']){
      window.localStorage.removeItem(key);
    }
    for(const key of Object.keys(window.localStorage)){
      if(key.startsWith('bright-nexa-school-os:cloud:v1:'))window.localStorage.removeItem(key);
    }
    window.localStorage.removeItem('bn_school_import_pending_clear_v1');
    window.localStorage.removeItem('bn_school_cloud_handoff_intent_v1');
  }
  async function start(){
    const store=window.sessionStorage,staff=parse(store.getItem(STAFF_KEY));
    const erp=parse(store.getItem(ERP_KEY));
    const search=window.location.search;
    const hosted=window.location.protocol==='https:'||window.location.protocol==='http:';
    if(hosted&&!staff?.access_token){
      // A sign-out must not leave the cloud conflict overlay covering the login.
      // Never erase local workspace, pending edits, or their conflict backups.
      if(erp?.cloudVerified)window.BNWorkspaceOnlineGuard?.update('synced');
      store.removeItem(ERP_KEY);
      showCloudGate();
      return false; // Never start the local login/onboarding bundle on hosted ERP.
    }
    if(hosted||cloudEntryRequired({search,staffSession:staff,erpSession:erp})){
      showStatus('Verifying School Admin and opening your existing school…');
      try{
        const verified=await verify({store});
        await clearImportedDeviceDraft(verified);
        window.BNWorkspaceOnlineGuard?.update('loading');
        const url=new URL(window.location.href);
        if(!url.searchParams.has('tab'))url.searchParams.set('openSchool','true');
        window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);
      }catch(error){
        // A previously verified cloud session must never survive failed re-verification.
        if(parse(store.getItem(ERP_KEY))?.cloudVerified)store.removeItem(ERP_KEY);
        showError(error);return false;
      }
    }
    const script=document.createElement('script');
    script.type='module';
    script.src=BUNDLE;
    script.onerror=()=>showError(Error('School OS application did not load. Refresh the page.'));
    document.head.append(script);
    return true;
  }
  return {start,verify,cloudEntryRequired,localSchoolDraft,showCloudGate,showError,showStatus,parse,validUUID};
});
