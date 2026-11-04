/* Bright Nexa D2: review-led school onboarding, status and readiness rules.
   Pure validation only. Database & server enforce all authorizations. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.BrightNexaOnboardingCore=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const STATES=['draft','inviting','invited','needs_attention','activated'];
 const validId=x=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(x||''));
 const email=x=>String(x??'').trim().toLowerCase();
 const compact=x=>String(x??'').trim().replace(/\s+/g,' ');
 function requestInput(raw){
   const school_name=compact(raw?.school_name);
   const owner_email=email(raw?.owner_email);
   const contact_phone=compact(raw?.contact_phone)||null;
   const notes=compact(raw?.notes)||null;
   if(school_name.length<3||school_name.length>120)
     throw Error('School name must have 3–120 characters.');
   if(owner_email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner_email))
     throw Error('Enter a valid school owner email.');
   if(contact_phone&&(!/^\+?[0-9 ()-]{7,20}$/.test(contact_phone)||
      contact_phone.replace(/\D/g,'').length<7))
     throw Error('Enter a valid school contact phone.');
   if(notes&&notes.length>300)throw Error('Administrative notes must be at most 300 characters.');
   return {school_name,owner_email,contact_phone,notes};
 }
 function exactResponse(result,expected){
   if(!result||result.ok!==true||!validId(result.id))
     throw Error('Server did not confirm an onboarding record.');
   for(const [field,value] of Object.entries(expected)){
     if(result[field]!==value)throw Error('Server returned a different onboarding record. Refresh before retrying.');
   }
   return result;
 }
 function validOnboarding(record){
   if(!validId(record?.id)||!STATES.includes(record?.status)||
      typeof record?.school_name!=='string'||!record.school_name.trim())
     throw Error('Malformed school onboarding record.');
   if(record.institution_id!==null&&record.institution_id!==undefined&&!validId(record.institution_id))
     throw Error('Onboarding contains an invalid institution.');
   if(record.owner_auth_user_id!==null&&record.owner_auth_user_id!==undefined&&!validId(record.owner_auth_user_id))
     throw Error('Onboarding contains an invalid owner.');
   if(record.status==='activated'&&(!validId(record.institution_id)||!validId(record.owner_auth_user_id)))
     throw Error('Activated onboarding lacks school or owner identity.');
   return record;
 }
 function canInvite(record){
   validOnboarding(record);
   return record.status==='draft' && !record.institution_id && !record.owner_auth_user_id;
 }
 function readiness(data){
   const checks=[
     {key:'invite_sent',title:'Owner invitation sent',ok:data?.invite_sent===true},
     {key:'owner_verified',title:'Owner verified their email',ok:data?.owner_verified===true},
     {key:'school_created',title:'School workspace in trial',ok:validId(data?.institution_id)},
     {key:'classes_ready',title:'At least one real class configured',ok:Number.isInteger(data?.classes)&&data.classes>=1},
     {key:'teachers_ready',title:'At least one active teacher account invited',ok:Number.isInteger(data?.teacher_accounts)&&data.teacher_accounts>=1},
     {key:'assignment_ready',title:'At least one active teacher class assignment',ok:Number.isInteger(data?.teacher_assignments)&&data.teacher_assignments>=1}
   ];
   return {checks,ready:checks.every(x=>x.ok),
     message:'Activation requires a verified owner and real classes, teacher login and class assignment. No sample records are generated.'};
 }
 function summarize(records){
   const seen=new Set(),byState=Object.fromEntries(STATES.map(s=>[s,0]));
   const rows=(records||[]).map(record=>{
     validOnboarding(record);
     if(seen.has(record.id))throw Error('Duplicate onboarding request returned.');
     seen.add(record.id);byState[record.status]++;
     return record;
   }).sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
   return {rows,byState,total:rows.length};
 }
 const planSteps=[
  {id:'create',label:'Register school request'},
  {id:'invite',label:'Invite owner by verified email'},
  {id:'classes',label:'Owner adds class/section and academic year'},
  {id:'teachers',label:'Owner invites teacher and assigns class'},
  {id:'activate',label:'Platform admin verifies and activates'}
 ];
 return {STATES,planSteps,validId,requestInput,exactResponse,validOnboarding,canInvite,readiness,summarize};
});
