/* Phase D2 platform-only school creation and owner invitation wizard.
   Browser uses a publishable key + verified JWT, never privileged server credentials.
   Edge server rechecks active platform admin and uses server-only transactional RPCs. */
(()=>{
 'use strict';
 const BASE='https://mrfvbwmyxndrakskqyas.supabase.co';
 const PUBLISHABLE='sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT';
 const core=window.BrightNexaOnboardingCore;
 const $=id=>document.getElementById(id);
 const E=(tag,t)=>{const x=document.createElement(tag);if(t!==undefined)x.textContent=String(t);return x};
 let bridge=null,selected=null,requests=[],busy=false,renderVersion=0,pendingCreate=null;
 const status=(id,txt,error=false)=>{
   const n=$(id);if(!n)return;
   n.textContent=String(txt);n.classList.toggle('error',error);
 };
 function lock(value){
   busy=value;
   for(const id of ['createSchoolRequest']){
     if($(id))$(id).disabled=value;
   }
   $('onboardingActions').querySelectorAll('button').forEach(x=>x.disabled=value);
 }
 async function call(action,fields={}){
   if(!bridge?.token)throw Error('Sign in as an authorized platform administrator.');
   const jwt=await bridge.token();
   const response=await fetch(BASE+'/functions/v1/platform-school-onboarding',{
     method:'POST',
     headers:{apikey:PUBLISHABLE,Authorization:'Bearer '+jwt,'content-type':'application/json'},
     body:JSON.stringify({action,...fields}),cache:'no-store'
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok||data.ok!==true)
     throw Error(data.error||'Onboarding operation was not confirmed. Refresh and review before retrying.');
   return data;
 }
 const row=(text,kind,detail)=>{
   const line=E('div');line.className='onboarding-step';
   const state=E('span',kind?'✓':'○');state.className=kind?'done':'pending';
   line.append(state,E('strong',text));
   if(detail)line.append(E('small',detail));
   return line;
 };
 function displayReadiness(data){
   const panel=$('onboardingReadiness');panel.replaceChildren();
   $('activateSchoolButton')?.remove();
   if(!data){panel.append(E('p','Readiness has not been checked.'));return}
   const progress=core.readiness(data);
   panel.append(E('h3',progress.ready?'School meets activation prerequisites':'Setup still pending'));
   for(const item of progress.checks)
     panel.append(row(item.title,item.ok,item.ok?'Verified':'Pending'));
   panel.append(E('p',progress.message));
   panel.append(E('p','Actual classes: '+data.classes+
     ' · Active teacher logins: '+data.teacher_accounts+
     ' · Active class assignments: '+data.teacher_assignments));
   if(progress.ready&&selected?.status==='invited'){
     const action=E('button','Activate verified school');action.id='activateSchoolButton';action.className='primary';action.type='button';
     action.addEventListener('click',()=>void perform('activate'));
     $('onboardingActions').append(action);
   }
 }
 function drawRequests(){
   const list=$('onboardingList');list.replaceChildren();
   let snapshot;
   try{snapshot=core.summarize(requests)}
   catch(e){list.append(E('p','Onboarding records failed validation: '+e.message));return}
   if(!snapshot.rows.length){list.append(E('p','No onboarding requests yet. Start with an approved school representative.'));return}
   for(const record of snapshot.rows){
     const line=E('div');line.className='onboarding-row';
     const info=E('div');
     info.append(E('strong',record.school_name),E('small',record.owner_email),
       E('small',record.status+' · '+record.id));
     const button=E('button',record.id===selected?.id?'Selected':'Review');
     button.type='button';button.setAttribute('aria-current',String(record.id===selected?.id));
     button.addEventListener('click',()=>choose(record.id));
     line.append(info,button);list.append(line);
   }
 }
 function choose(id){
   const record=requests.find(r=>r.id===id);
   if(!record)return;
   core.validOnboarding(record);
   selected=record;renderVersion++;
   const area=$('onboardingCurrent');area.replaceChildren();
   area.append(E('strong',record.school_name),
     E('small','Owner: '+record.owner_email),
     E('small','Stage: '+record.status),
     E('small','Request: '+record.id));
   const actions=$('onboardingActions');actions.replaceChildren();
   if(core.canInvite(record)){
     const btn=E('button','Send owner invitation');btn.type='button';btn.className='primary';
     btn.addEventListener('click',()=>void perform('invite'));actions.append(btn);
   }
   if(record.status==='invited'||record.status==='activated'){
     const verify=E('button','Refresh real setup status');verify.type='button';
     verify.addEventListener('click',()=>void perform('check'));actions.append(verify);
   }
   if(record.status==='needs_attention'){
     const warning=E('p','Invite or provisioning needs manual administrator reconciliation. No automatic resend is allowed.');
     warning.className='warning';actions.append(warning);
   }
   if(record.status==='inviting')actions.append(E('p','An invitation is already being processed. Check status before any action.'));
   if(record.status==='activated')actions.append(E('strong','Activated — platform server confirmed all prerequisites.'));
   displayReadiness(null);
   status('onboardingActionStatus','Review this request carefully. Email is sent only after confirmation.');
   drawRequests();
 }
 async function reload(){
   if(!bridge?.allRows)return;
   const ticket=++renderVersion;
   const records=await bridge.allRows('bn_school_onboarding_requests',{
     select:'id,request_key,school_name,owner_email,contact_phone,notes,status,institution_id,owner_auth_user_id,created_by,created_at,updated_at,invited_at,owner_verified_at,activated_at',
     order:'created_at.desc'
   });
   if(ticket!==renderVersion)return;
   requests=core.summarize(records).rows;
   const chosenId=selected?.id;selected=null;
   if(chosenId&&requests.some(x=>x.id===chosenId))choose(chosenId);
   else {drawRequests();$('onboardingActions').replaceChildren();
     $('onboardingCurrent').replaceChildren(E('strong','Choose a request'),E('small','Review invitation, setup and activation stage.'));
     displayReadiness(null);
   }
 }
 async function createRequest(event){
   event.preventDefault();if(busy)return;
   let payload,signature;
   try{
     payload=core.requestInput({
       school_name:$('newSchoolName').value,owner_email:$('newOwnerEmail').value,
       contact_phone:$('newSchoolPhone').value,notes:$('newSchoolNotes').value
     });
     signature=JSON.stringify(payload);
   }catch(e){return status('onboardingCreateStatus',e.message,true)}
   if(!pendingCreate||pendingCreate.signature!==signature)
     pendingCreate={signature,key:crypto.randomUUID()};
   lock(true);
   status('onboardingCreateStatus','Saving draft school request (no email yet)…');
   try{
     const result=await call('create',{...payload,request_key:pendingCreate.key});
     core.exactResponse(result,{school_name:payload.school_name,owner_email:payload.owner_email,status:'draft'});
     pendingCreate=null;$('onboardingForm').reset();
     status('onboardingCreateStatus','School request confirmed. Select it below, then approve the owner invitation.'+
       (result.warning?' '+result.warning:''));
     await reload();choose(result.id);
   }catch(e){status('onboardingCreateStatus',e.message,true);
     await reload().catch(()=>{});
   }finally{lock(false)}
 }
 async function perform(action){
   if(busy||!selected)return;
   const current=selected,ticket=renderVersion;
   if(action==='invite'&&!core.canInvite(current))return;
   if(action==='activate'&&current.status!=='invited')return;
   if(action==='invite'&&!confirm('Send a real Supabase email invitation to '+current.owner_email+
       ' for '+current.school_name+'? This may create a trial school. Proceed only with an authorized representative.'))return;
   if(action==='activate'&&!confirm('Activate "'+current.school_name+
       '" after verifying owner email, real classes and teacher assignment? This will change the institution from TRIAL to ACTIVE.'))return;
   lock(true);status('onboardingActionStatus',action==='invite'?'Sending verified email invite and creating trial school…':
     action==='activate'?'Confirming school activation…':'Checking real school readiness…');
   try{
     if(action==='activate'){
       const latest=await call('check',{request_id:current.id});
       if(!core.readiness(latest).ready)throw Error('School setup has changed. Prerequisites are not complete.');
     }
     const data=await call(action,{request_id:current.id});
     if(ticket!==renderVersion&&selected?.id!==current.id)return;
     const successMessage=action==='invite'?
       'Owner invitation and trial-school provisioning confirmed. Owner must accept email, set password and create real classes and teacher access.':
       action==='activate'?'School activation confirmed by the database.':
       'Readiness checked from verified school records.';
     if(action==='check'){
       displayReadiness(data);
     }else{
       await reload();
       if(action==='activate'){
         const actual=await call('check',{request_id:current.id});
         displayReadiness(actual);
       }
       if(bridge?.refreshPlatform)await bridge.refreshPlatform();
     }
     status('onboardingActionStatus',successMessage);
   }catch(e){
     if(action!=='check')await reload().catch(()=>{});
     status('onboardingActionStatus',e.message,true);
   }finally{lock(false)}
 }
 const form=$('onboardingForm');
 if(form)form.addEventListener('submit',event=>void createRequest(event));
 window.BrightNexaPlatformOnboarding={
   async refresh(nextBridge){
     bridge=nextBridge;
     if(!core)throw Error('School onboarding validation module missing.');
     await reload();
   },
   reset(){
     bridge=null;selected=null;requests=[];renderVersion++;
     $('onboardingList')?.replaceChildren();
     $('onboardingActions')?.replaceChildren();
     $('onboardingReadiness')?.replaceChildren();
     $('onboardingForm')?.reset();
   }
 };
})();
