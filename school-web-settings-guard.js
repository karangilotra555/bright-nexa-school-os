/* Bright Nexa: browser Settings truth & safety layer.
 * Cloud queries are read-only and scoped by the active Supabase user JWT.
 * This does not implement Google OAuth or grant RBAC permissions.
 */
(function (root) {
  'use strict';
  if (!root.document) return;
  const doc=root.document;
  const GOOGLE='https://drive.google.com/drive/my-drive';
  const BASE='https://mrfvbwmyxndrakskqyas.supabase.co';
  const KEY='sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT';
  const sessionKey='bn_school_staff_session_v1';
  const styles='font-size:12px;line-height:1.55;border:1px solid #eac88a;background:#fff8e7;color:#694b12;padding:10px 12px;border-radius:9px;margin:10px 0;';
  function withHeading(label) {
    const heading=[...doc.querySelectorAll('h2,h3')].find(x=>x.textContent.trim().toLowerCase()===label.toLowerCase());
    return heading?.closest('.settings-card')||null;
  }
  function note(card,key,message) {
    if (!card||card.querySelector('[data-bn-web-note="'+key+'"]'))return;
    const p=doc.createElement('p');
    p.setAttribute('data-bn-web-note',key);p.setAttribute('role','status');
    p.style.cssText=styles;p.textContent=message;
    const actions=card.querySelector('.settings-actions');
    if(actions)actions.before(p);else card.append(p);
  }
  function link(card,url,label,key) {
    if(!card||card.querySelector('[data-bn-web-link="'+key+'"]'))return;
    const a=doc.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=label;
    a.setAttribute('data-bn-web-link',key);
    a.style.cssText='display:inline-flex;align-items:center;min-height:36px;border:1px solid #bcd7ed;border-radius:9px;padding:8px 12px;text-decoration:none;color:#0b315e;background:#eaf5ff;font-size:12px;font-weight:750;margin:4px 5px 4px 0';
    (card.querySelector('.settings-actions')||card).append(a);
  }
  function action(card,text){return [...(card?.querySelectorAll('button')||[])].find(b=>b.textContent.trim()===text);}
  function onWeb(){return !(root.brightNexa||root.bharatSchool)?.googleDrive;}
  function addWarningBeforeRestore(card){
    const btn=action(card,'Restore backup file');
    if(!btn||btn.dataset.bnRestoreGuard)return;
    btn.dataset.bnRestoreGuard='1';
    btn.title='This operation can replace your current school records. Verify a separate backup before restoring.';
    btn.addEventListener('click',e=>{
      const agreed=root.confirm('Restore can REPLACE current school data. Confirm you have a separate verified encrypted backup and intend to restore this school.');
      if(!agreed){e.preventDefault();e.stopImmediatePropagation();}
    },true);
  }
  async function diagnoseCloud(card){
    if(!card||card.dataset.bnCloudCheck)return;
    card.dataset.bnCloudCheck='1';
    const box=doc.createElement('p');box.dataset.bnCloudStatus='1';box.style.cssText=styles;
    box.textContent='Cloud role check: not verified.';card.append(box);
    let session;
    try{session=JSON.parse(root.sessionStorage?.getItem(sessionKey)||'null');}catch(_){}
    if(!session?.access_token){box.textContent='Cloud role check: no signed-in staff session in this tab. Local user accounts are not Supabase roles.';return;}
    const token=session.access_token,headers={'apikey':KEY,'Authorization':'Bearer '+token};
    try {
      const who=await root.fetch(BASE+'/auth/v1/user',{headers,cache:'no-store'});
      if(!who.ok)throw Error('Cloud session not accepted (HTTP '+who.status+').');
      const user=await who.json();
      if(!user?.id)throw Error('Cloud identity missing.');
      const qs=new URLSearchParams({select:'id,institution_id,role,status',auth_user_id:'eq.'+user.id});
      const res=await root.fetch(BASE+'/rest/v1/school_users?'+qs,{headers,cache:'no-store'});
      if(!res.ok)throw Error('Membership readback denied (HTTP '+res.status+').');
      const memberships=await res.json();
      const active=Array.isArray(memberships)?memberships.filter(x=>x.status==='active'):[];
      box.textContent=active.length
       ? 'Supabase verified: '+active.length+' active membership record(s) for the signed-in account. Use Cloud Roles & Permissions to add or change staff access. Local entries here do not create cloud accounts.'
       : 'Supabase readback returned no active school membership for this login. Local user cards do not prove access.';
    }catch(err){box.textContent='Cloud role check unavailable: '+(err?.message||'Readback failed')+'. No permissions were changed.';}
  }
  function scan(){
    if(!onWeb())return;
    const backup=withHeading('Encrypted Google Drive backup');
    if(backup){
      note(backup,'drive','WEB VERSION: Google Drive is NOT connected. Download encrypted backup saves a file to this device only; it does not upload to Google. To store it remotely, upload that file manually to your own Drive. Automated Drive backup requires a separate Google Web OAuth connector.');
      link(backup,GOOGLE,'Open Google Drive to upload downloaded file','drive');
      addWarningBeforeRestore(backup);
      const restore=action(backup,'Restore latest from Drive');
      if(restore){restore.title='No Google Drive connection in browser';}
    }
    const updates=withHeading('Software Updates');
    if(updates){
      note(updates,'updates','WEB VERSION: Check for Updates and desktop installer require the Windows app. Web updates are deployed on Render; this button cannot install them.');
      const check=action(updates,'Check for Updates');if(check){check.disabled=true;check.title='Windows application only';}
    }
    const users=withHeading('Users & role permissions');
    if(users){
      note(users,'roles','These user cards and recovery keys are browser-local. They are NOT Supabase Auth users or backend role permissions. For real access, use Cloud Roles & Permissions.');
      link(users,'./teacher-access.html?view=roles','Open Cloud Roles & Permissions','roles');
      const add=action(users,'Add user');
      if(add){add.disabled=true;add.title='Local account creation cannot grant Supabase access. Open Cloud Roles & Permissions.';}
      const recovery=action(users,'Replace Recovery Key')||action(users,'Create Recovery Key');
      if(recovery){recovery.disabled=true;recovery.title='Legacy local recovery key is not the Supabase password reset key.';}
      void diagnoseCloud(users);
    }
    const audit=withHeading('Recent audit log');
    if(audit)note(audit,'audit','This is the device-local audit history, not a server-side Supabase audit log. Records shown here are not proof of cloud writes.');
  }
  let scheduled=false;
  function schedule(){
    if(scheduled)return;scheduled=true;
    root.requestAnimationFrame?root.requestAnimationFrame(()=>{scheduled=false;scan();}):Promise.resolve().then(()=>{scheduled=false;scan();});
  }
  function start(){scan();new MutationObserver(schedule).observe(doc.body,{childList:true,subtree:true});}
  if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',start,{once:true});else start();
})(typeof window!=='undefined'?window:globalThis);
