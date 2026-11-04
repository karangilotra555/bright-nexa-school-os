/* Bright Nexa School owner Settings. RLS is the authority for cloud updates;
   browser preference controls never modify another user or school's records. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const nav=window.BrightNexaNavigation;
 const allowedTabs=new Set(['school','access','backup','offline','appearance','help']);
 const el=(tag,value)=>{const e=document.createElement(tag);if(value!==undefined)e.textContent=String(value);return e};
 let context=null,chosenTab='school',preferenceKey=null,pref=nav?.defaults(),bound=false,contact=null;
 const status=(id,message,error=false)=>{
   const node=$(id);if(!node)return;node.textContent=message;node.classList.toggle('is-error',error);
 };
 function scopedPrefs(state){
   return nav.preferenceKey(state.school.id,state.authUserId);
 }
 function savePrefs(){
   if(!preferenceKey)return;
   try{localStorage.setItem(preferenceKey,JSON.stringify(pref))}
   catch(e){status('settingsAppearanceStatus','Browser preferences could not be saved: '+e.message,true);return}
   status('settingsAppearanceStatus','Preferences saved on this browser for this school owner.');
 }
 function applyPrefs(){
   document.documentElement.dataset.ownerDensity=pref.density;
   const density=$('settingsDensity'),landing=$('settingsLanding');
   if(density)density.value=pref.density;
   if(landing)landing.value=pref.landing;
 }
 function readPrefs(){
   try{return nav.prefs(JSON.parse(localStorage.getItem(preferenceKey)||'null'))}
   catch{return nav.defaults()}
 }
 function showTab(tab){
   if(!allowedTabs.has(tab))tab='school';
   chosenTab=tab;
   document.querySelectorAll('[data-settings-tab]').forEach(button=>{
     const active=button.dataset.settingsTab===tab;
     button.setAttribute('aria-current',active?'page':'false');
   });
   document.querySelectorAll('[data-settings-page]').forEach(page=>{
     const active=page.dataset.settingsPage===tab;
     page.hidden=!active;
   });
   if(tab==='school')void loadContacts();
 }
 function refresh(){
   const state=context?.state;if(!state?.school)return;
   const vals={
     settingsSchoolHeader:state.school.name,
     settingsSchoolStatus:state.school.status==='trial'?'Trial':'Active',
     settingsStudentCount:String(state.students.length),
     settingsStaffCount:String(state.staff.length),
     settingsClassCount:String(state.classes.length),
     settingsSchoolId:state.school.id,
     settingsOwnerEmail:state.me?.email||'Verified school account'
   };
   for(const [id,value] of Object.entries(vals))if($(id))$(id).textContent=value;
   const years=[...new Set(state.classes.map(x=>x.academic_year).filter(Boolean))].sort();
   $('settingsAcademicYears').textContent=years.length?years.join(', '):'Not configured';
   if($('settingsSchoolName')&&document.activeElement!==$('settingsSchoolName'))
     $('settingsSchoolName').value=state.school.name;
   if(state.offlineReadOnly){
     for(const id of ['settingsSchoolName','settingsSaveSchoolName','settingsPhone','settingsSavePhone'])if($(id))$(id).disabled=true;
     status('settingsSchoolStatusMessage','Read-only offline copy: reconnect and sign in to edit school profile.');
   }
 }
 async function loadContacts(){
   if(!context?.state?.school||context.state.offlineReadOnly)return;
   if(contact?.institution_id===context.state.school.id)return;
   try{
     const rows=await context.inSchool('school_contact_profiles','institution_id,owner_email,contact_mobile',{limit:'1'});
     contact=Array.isArray(rows)?rows.find(x=>x.institution_id===context.state.school.id)||null:null;
     if(contact){
       $('settingsOwnerEmail').textContent=contact.owner_email||context.state.me.email||'—';
       $('settingsPhone').value=contact.contact_mobile||'';
     }else{
       status('settingsPhoneStatus','No registered school contact profile. Phone editing is unavailable.');
       $('settingsPhone').disabled=true;$('settingsSavePhone').disabled=true;
     }
   }catch(e){status('settingsPhoneStatus','Unable to read school contact: '+e.message,true);}
 }
 async function renameSchool(ev){
   ev.preventDefault();
   if(!context||context.state.offlineReadOnly)return;
   const state=context.state;
   const input=$('settingsSchoolName'),name=input.value.trim().replace(/\s+/g,' ');
   if(name.length<3||name.length>120){status('settingsSchoolStatusMessage','School name must be 3–120 characters.',true);return}
   if(name===state.school.name){status('settingsSchoolStatusMessage','School name is already up to date.');return}
   if(!confirm('Change the official school name from "'+state.school.name+'" to "'+name+'"?'))return;
   const save=$('settingsSaveSchoolName');save.disabled=true;
   try{
     const schoolId=state.school.id;
     const rows=await context.req('institutions?'+new URLSearchParams({
       id:'eq.'+schoolId,name:'eq.'+state.school.name,select:'id,name,status'}),{
       method:'PATCH',body:{name}
     });
     if(!Array.isArray(rows)||rows.length!==1||rows[0].id!==schoolId||rows[0].name!==name)
       throw Error('Official school name was not confirmed by cloud. Reload and verify before retrying.');
     state.school={...state.school,name};
     $('sideSchool').textContent=$('topSchool').textContent=name;
     if($('heading')&&$('heading').textContent!== 'Settings')$('heading').textContent=name;
     refresh();
     status('settingsSchoolStatusMessage','Official school name updated and confirmed in cloud.');
   }catch(e){status('settingsSchoolStatusMessage',e.message,true)}
   finally{save.disabled=false}
 }
 async function savePhone(ev){
   ev.preventDefault();
   if(!context||context.state.offlineReadOnly)return;
   const phone=$('settingsPhone').value.trim();
   if(phone&&!/^[+0-9()\- ]{7,20}$/.test(phone)){
     status('settingsPhoneStatus','Enter a valid contact number (7–20 characters).',true);return;
   }
   const save=$('settingsSavePhone');save.disabled=true;
   try{
     const schoolId=context.state.school.id;
     const rows=await context.req('school_contact_profiles?'+new URLSearchParams({
       institution_id:'eq.'+schoolId,select:'institution_id,contact_mobile'}),{
       method:'PATCH',body:{contact_mobile:phone||null}
     });
     if(!Array.isArray(rows)||rows.length!==1||rows[0].institution_id!==schoolId||
        (rows[0].contact_mobile||'')!==phone)
       throw Error('School contact number was not confirmed. Refresh before trying again.');
     contact={...(contact||{}),institution_id:schoolId,contact_mobile:phone||null};
     status('settingsPhoneStatus','School contact number updated in the cloud.');
   }catch(e){status('settingsPhoneStatus',e.message,true)}
   finally{save.disabled=false}
 }
 function attach(args){
   context=args;
   if(!nav){status('settingsAppearanceStatus','Navigation settings module failed to load.',true);return;}
   preferenceKey=scopedPrefs(args.state);
   pref=readPrefs();applyPrefs();refresh();
   if(bound)return;bound=true;
   document.querySelectorAll('[data-settings-tab]').forEach(button=>
     button.addEventListener('click',()=>showTab(button.dataset.settingsTab)));
   document.querySelectorAll('[data-settings-open]').forEach(button=>
     button.addEventListener('click',()=>args.open(button.dataset.settingsOpen)));
   $('settingsIdentityForm').addEventListener('submit',renameSchool);
   $('settingsContactForm').addEventListener('submit',savePhone);
   $('settingsDensity').addEventListener('change',e=>{
     pref=nav.prefs({...pref,density:e.target.value});applyPrefs();savePrefs();
   });
   $('settingsLanding').addEventListener('change',e=>{
     pref=nav.prefs({...pref,landing:e.target.value});applyPrefs();savePrefs();
   });
   showTab('school');
 }
 function landing(){return pref?.landing||'Dashboard'}
 window.BrightNexaSettings={attach,openTab:showTab,refresh,landing};
})();