/* Bright Nexa Phase D1 – client-side validation for platform administration.
 * This is NOT an authorization layer. Only Supabase RLS controls platform privileges.
 */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.BrightNexaPlatformCore=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const STATUS=['trial','active','paused','ended'];
 const validId=v=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v||''));
 const trimmed=v=>String(v??'').trim();
 function validDate(value,name){
   const s=trimmed(value);
   if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)
     throw Error('Enter a valid '+name+'.');
   return s;
 }
 function formInput(raw,{institutions,plans,ownerId,existing}){
   const institution_id=String(raw?.institution_id||'');
   if(!validId(institution_id)||!(institutions||[]).some(s=>s.id===institution_id))
     throw Error('Choose an institution from the authorized platform list.');
   const plan_code=trimmed(raw?.plan_code),plan=(plans||[]).find(p=>p.code===plan_code&&p.visible);
   if(!plan)throw Error('Choose a published plan label.');
   const status=trimmed(raw?.status);
   if(!STATUS.includes(status))throw Error('Choose an allowed subscription status.');
   const starts_on=validDate(raw?.starts_on,'start date');
   const ends_on=trimmed(raw?.ends_on)?validDate(raw.ends_on,'end date'):null;
   if(ends_on&&ends_on<starts_on)throw Error('End date cannot precede the start date.');
   const admin_note=trimmed(raw?.admin_note);
   if(admin_note.length>300)throw Error('Administrative note exceeds 300 characters.');
   if(!validId(ownerId))throw Error('Verified platform administrator required.');
   if(existing&&existing.institution_id!==institution_id)
     throw Error('Cannot move a subscription record to another school.');
   return {institution_id,plan_code,status,starts_on,ends_on,admin_note:admin_note||null,
     updated_by:ownerId};
 }
 function confirm(rows,expected){
   if(!Array.isArray(rows)||rows.length!==1)throw Error('Subscription save was not confirmed. Refresh before retrying.');
   const result=rows[0];
   for(const [key,value] of Object.entries(expected)){
     if(result?.[key]!==value)throw Error('Cloud saved a different subscription value. Refresh before retrying.');
   }
   if(!validId(result.institution_id)||!validId(result.updated_by))
     throw Error('Unexpected subscription identity returned by cloud.');
   return result;
 }
 function overview(institutions,subscriptions){
   const byId=new Map();
   for(const s of subscriptions||[]){
     if(!validId(s.institution_id)||byId.has(s.institution_id))
       throw Error('Duplicate or malformed tenant subscription data.');
     byId.set(s.institution_id,s);
   }
   const names=new Set();
   const schools=(institutions||[]).map(s=>{
     if(!validId(s.id)||names.has(s.id))throw Error('Duplicate or malformed tenant entry.');
     names.add(s.id);
     return {id:s.id,name:s.name,status:s.status,subscription:byId.get(s.id)||null};
   }).sort((a,b)=>a.name.localeCompare(b.name));
   for(const key of byId.keys())if(!names.has(key))throw Error('Tenant subscription points to an inaccessible school.');
   return {
     schools,total:schools.length,
     assigned:schools.filter(x=>!!x.subscription).length,
     unassigned:schools.filter(x=>!x.subscription).length,
     administrativelyActive:schools.filter(x=>x.subscription?.status==='active').length,
     note:'Subscription records are administrative labels. Billing, payment settlement, quotas and tenant access enforcement are NOT connected.'
   };
 }
 function auditForSchool(events,schoolId){
   if(!validId(schoolId))throw Error('Choose a real school for audit history.');
   if((events||[]).some(e=>!validId(e.institution_id)))throw Error('Invalid audit event identity.');
   return (events||[]).filter(e=>e.institution_id===schoolId)
     .sort((a,b)=>String(b.recorded_at).localeCompare(String(a.recorded_at)));
 }
 return {STATUS,validId,validDate,formInput,confirm,overview,auditForSchool};
});
