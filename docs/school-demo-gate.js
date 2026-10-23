/* Protected entrance to the fictional School OS sample.
   Actual school data is ALWAYS accessed through the Supabase-RLS staff portal.
   This browser check is UX gating only, never authorization for backend data. */
(() => {
  'use strict';
  const BASE='https://mrfvbwmyxndrakskqyas.supabase.co';
  const APIKEY='sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT';
  const KEY='bn_school_staff_session_v1';
  const LOCAL_DEMO_KEY='bn_school_local_demo_access_v1';
  function localDemoAccess(){
    const timestamp=Number(sessionStorage.getItem(LOCAL_DEMO_KEY));
    if(!Number.isFinite(timestamp)||timestamp<=0)return false;
    if(Date.now()-timestamp>12*60*60*1000){
      sessionStorage.removeItem(LOCAL_DEMO_KEY);return false;
    }
    return true;
  }
  function exitDemo(){
    sessionStorage.removeItem(LOCAL_DEMO_KEY);
    sessionStorage.removeItem('bright-nexa-school-os:demo-mode:v1');
    sessionStorage.removeItem('bright-nexa-school-os:session:v2');
    location.assign('./index.html');
  }
  const status=document.getElementById('entryStatus');
  const show=(message)=>{status.textContent='';const box=document.createElement('div');
    box.textContent=message;const a=document.createElement('a');
    a.href='./index.html';a.textContent='Go to secure school login';
    a.style.cssText='display:block;margin-top:16px;color:#095392;font-weight:700';
    status.append(box,a);};
  const getJson=async(response)=>{if(!response.ok)throw new Error('Your school session is not authorised.');return response.json()};
  async function authorisedOwner(){
    let session;try{session=JSON.parse(sessionStorage.getItem(KEY)||'null')}catch{return false}
    if(!session?.access_token)return false;
    if(session.expires_at<=Date.now()/1000+60){
      if(!session.refresh_token)return false;
      try{
        const fresh=await getJson(await fetch(BASE+'/auth/v1/token?grant_type=refresh_token',{
          method:'POST',headers:{'apikey':APIKEY,'Content-Type':'application/json'},
          body:JSON.stringify({refresh_token:session.refresh_token}),cache:'no-store'
        }));
        session={access_token:fresh.access_token,refresh_token:fresh.refresh_token,
          expires_at:Math.floor(Date.now()/1000)+(Number(fresh.expires_in)||3600)};
        sessionStorage.setItem(KEY,JSON.stringify(session));
      }catch{return false}
    }
    const headers={'apikey':APIKEY,'Authorization':'Bearer '+session.access_token};
    const me=await getJson(await fetch(BASE+'/auth/v1/user',{headers,cache:'no-store'}));
    if(!me?.id)return false;
    const own=await getJson(await fetch(BASE+'/rest/v1/school_users?select=institution_id,role,status&auth_user_id=eq.'+encodeURIComponent(me.id),{headers,cache:'no-store'}));
    const memberships=Array.isArray(own)?own.filter(x=>x.role==='school_admin'&&x.status==='active'&&x.institution_id):[];
    if(!memberships.length)return false;
    for(const member of memberships){
      const schools=await getJson(await fetch(BASE+'/rest/v1/institutions?select=id,status&id=eq.'+encodeURIComponent(member.institution_id),{headers,cache:'no-store'}));
      if(Array.isArray(schools)&&schools.some(x=>['active','trial'].includes(x.status)))return true;
    }
    return false;
  }
  async function main(){
    try{
      const isLocalDemo=localDemoAccess();
      if(!isLocalDemo && !await authorisedOwner()){
        show('Sign in as demo / demo to explore the sample School OS. Staff accounts use their own secure cloud workspace.');
        return;
      }
      // The legacy React bundle must NEVER read/write real school localStorage or IndexedDB keys.
      // This is an isolated browser-local sample even for a signed-in admin.
      sessionStorage.setItem('bright-nexa-school-os:demo-mode:v1','true');
      const banner=document.getElementById('sampleBanner');
      banner.hidden=false;
      if(isLocalDemo){
        banner.firstChild.textContent='PUBLIC DEMO — fictional school records only. No real school data or cloud permissions. ';
        const leave=document.createElement('button');
        leave.type='button';leave.textContent='Exit demo';
        leave.style.cssText='margin-left:12px;background:white;padding:5px 10px;border-radius:7px;cursor:pointer';
        leave.addEventListener('click',exitDemo);banner.append(leave);
      }
      status.remove();
      const script=document.createElement('script');
      script.type='module';script.src='./assets/index-brightnexa-v2.js?v=20261022-workspace-isolation';
      script.crossOrigin='anonymous';document.head.append(script);
      if(isLocalDemo){
        // Existing sample UI has its own demo entry on a clean browser.
        // Activate it once if the bundle doesn't restore a demo session itself.
        let clicked=false;
        const observer=new MutationObserver(()=>{
          if(clicked){observer.disconnect();return;}
          const root=document.getElementById('root');
          if(!root)return;
          const elements=[...root.querySelectorAll('button,[role="button"]')];
          const target=elements.find(el=>{
            const label=(el.textContent||'').trim().replace(/\\s+/g,' ');
            return /^(try|start|explore|enter|launch|open|use|continue|login|sign in)( the| free| as| a| school)? demo( mode| account| workspace| school)?$/i.test(label)
              || /^demo (mode|login|account|workspace)$/i.test(label);
          });
          if(target){clicked=true;observer.disconnect();target.click();}
        });
        observer.observe(document.getElementById('root'),{childList:true,subtree:true});
      }
    }catch{
      show('School access could not be verified. Sign in again; this sample must never be mistaken for the live school database.');
    }
  }
  main();
})();