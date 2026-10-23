/* Only signed-in academic roles (or isolated fictional demo) get the
 * browser-only Smart Tools UI. Backend data remains protected by Supabase RLS. */
(() => {
  'use strict';
  const BASE='https://mrfvbwmyxndrakskqyas.supabase.co';
  const APIKEY='sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT';
  const KEY='bn_school_staff_session_v1';
  const DEMO_KEY='bn_school_local_demo_access_v1';
  const notice=document.getElementById('accessNotice');
  const mode=document.getElementById('accessMode');
  function deny(message){
    notice.hidden=false;notice.textContent='';
    const p=document.createElement('p');p.textContent=message;
    const a=document.createElement('a');a.href='./index.html';a.textContent='← Go to School Login';
    notice.append(p,a);
  }
  function allow(message){
    mode.textContent=message;notice.hidden=true;document.body.classList.add('bn-smart-ready');
  }
  async function read(res){
    if(!res.ok)throw new Error('School access could not be verified.');
    return res.json();
  }
  async function verify(){
    try{
      const timestamp=Number(sessionStorage.getItem(DEMO_KEY));
      if(Number.isFinite(timestamp)&&timestamp>0&&Date.now()-timestamp<12*60*60*1000){
        allow('SAMPLE MODE • Fictional data only. No cloud school records are connected.');
        return;
      }
      sessionStorage.removeItem(DEMO_KEY);
      let session;try{session=JSON.parse(sessionStorage.getItem(KEY)||'null')}catch{}
      if(!session?.access_token)throw Error('Sign in with a school account first. Open Smart Tools from your dashboard.');
      if(Number(session.expires_at)<=Date.now()/1000+60){
        if(!session.refresh_token)throw Error('Your session expired. Sign in again.');
        const refreshed=await read(await fetch(BASE+'/auth/v1/token?grant_type=refresh_token',{
          method:'POST',headers:{apikey:APIKEY,'Content-Type':'application/json'},
          body:JSON.stringify({refresh_token:session.refresh_token}),cache:'no-store'
        }));
        session={access_token:refreshed.access_token,refresh_token:refreshed.refresh_token,
          expires_at:Math.floor(Date.now()/1000)+(Number(refreshed.expires_in)||3600)};
        sessionStorage.setItem(KEY,JSON.stringify(session));
      }
      const headers={apikey:APIKEY,Authorization:'Bearer '+session.access_token};
      const user=await read(await fetch(BASE+'/auth/v1/user',{headers,cache:'no-store'}));
      if(!user?.id)throw Error('Sign in with a school account first.');
      const rows=await read(await fetch(BASE+'/rest/v1/school_users?select=institution_id,role,status&auth_user_id=eq.'+encodeURIComponent(user.id),{headers,cache:'no-store'}));
      const roles=['school_admin','principal','teacher'];
      const members=Array.isArray(rows)?rows.filter(x=>x.status==='active'&&roles.includes(x.role)&&x.institution_id):[];
      if(!members.length)throw Error('Smart Tools require an active Admin, Principal or Teacher account.');
      for(const member of members){
        const schools=await read(await fetch(BASE+'/rest/v1/institutions?select=id,status&id=eq.'+encodeURIComponent(member.institution_id),{headers,cache:'no-store'}));
        if(Array.isArray(schools)&&schools.some(s=>['active','trial'].includes(s.status))){
          allow('School role: '+member.role.replaceAll('_',' ')+' • Browser-only processing, no cloud record changes.');
          return;
        }
      }
      throw Error('Your school is inactive. Contact your school administrator.');
    }catch(err){deny(err.message||'Unable to check your school access. Please sign in again.');}
  }
  verify();
})();
