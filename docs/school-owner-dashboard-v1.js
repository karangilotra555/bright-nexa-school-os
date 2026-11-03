/* School owner home: presentation only. Access to school records remains
   verified by Supabase Auth and per-table RLS in existing modules. */
(()=>{
 'use strict';
 const app=document.getElementById('opsApp');
 if(!app)return;
 const views=new Map(Array.from(app.querySelectorAll('[data-ops-panel]')).map(el=>[el.dataset.opsPanel,el]));
 const nav=Array.from(app.querySelectorAll('[data-ops-open]'));
 const url=new URL(window.location.href);
 const wanted=url.searchParams.get('section');
 let current=views.has(wanted)?wanted:'home';
 const safeText=(id,text)=>{const el=document.getElementById(id);if(el&&el.textContent!==String(text))el.textContent=String(text);};
 const authorised=key=>{
   const panel=views.get(key);
   return !!panel && (key==='home'||!panel.classList.contains('hidden'));
 };
 function refreshRole(){
   const role=document.getElementById('staffRole')?.textContent||'';
   const heading=/school admin/i.test(role)?'School Owner Dashboard':
     /principal/i.test(role)?'Principal Dashboard':
     /accountant/i.test(role)?'School Finance Dashboard':'School Dashboard';
   safeText('ownerDashboardHeading',heading);
   // Buttons only navigate. Hidden sections stay inaccessible until the
   // verified database membership and existing RLS checks enable them.
   for(const button of nav){
     if(button.closest('#ownerDashboard'))continue;
     const target=button.dataset.opsOpen;
     button.classList.toggle('hidden',!authorised(target));
   }
   for(const button of app.querySelectorAll('#ownerDashboard button[data-ops-open]')){
     button.classList.toggle('hidden',!authorised(button.dataset.opsOpen));
   }
 }
 function refreshStats(){
   if(app.classList.contains('hidden'))return;
   const classSelect=document.getElementById('admissionClass');
   const admissionCount=document.getElementById('admissionCount')?.textContent||'';
   const loaded=admissionCount.match(/of (\d+) loaded/);
   const cls=classSelect&&classSelect.options.length?classSelect.options.length-1:null;
   safeText('ownerStatClasses',cls==null?'—':cls);
   safeText('ownerStatStudents',loaded?loaded[1]:'—');
   const staffRows=document.querySelectorAll('#staffDirectoryRows tr');
   let teachers=0,housekeeping=0,ready=false;
   for(const row of staffRows){
     if(row.cells.length<4)continue;
     ready=true;
     const type=row.cells[1].textContent.trim();
     if(type==='Teacher')teachers++;
     else if(type==='Housekeeping')housekeeping++;
   }
   safeText('ownerStatTeachers',ready?teachers:'—');
   safeText('ownerStatHousekeeping',ready?housekeeping:'—');
 }
 function open(key,{scroll=false,updateURL=true}={}){
   if(!authorised(key))return false;
   current=key;
   for(const [name,panel] of views){
     panel.classList.toggle('ops-collapsed',name!==key);
   }
   for(const button of nav){
     const active=button.dataset.opsOpen===key;
     if(button.closest('#opsMainNav')){
       if(active)button.setAttribute('aria-current','page');
       else button.removeAttribute('aria-current');
     }
   }
   if(updateURL){
     const u=new URL(window.location.href);
     if(key==='home')u.searchParams.delete('section');
     else u.searchParams.set('section',key);
     window.history.replaceState(null,'',u.pathname+u.search+u.hash);
   }
   if(scroll){
     const destination=document.getElementById('opsMainNav');
     destination?.scrollIntoView({block:'start',behavior:'smooth'});
   }
   return true;
 }
 app.addEventListener('click',event=>{
   const button=event.target.closest('[data-ops-open]');
   if(!button)return;
   event.preventDefault();
   const key=button.dataset.opsOpen;
   if(!open(key,{scroll:true})){
     const msg=document.getElementById('status');
     if(msg){msg.textContent='This section requires the correct school role and permissions.';
       msg.className='status error';msg.classList.remove('hidden');}
   }
 });
 const school=document.getElementById('schoolName');
 const role=document.getElementById('staffRole');
 const studentCount=document.getElementById('admissionCount');
 const classSelect=document.getElementById('admissionClass');
 const staffRows=document.getElementById('staffDirectoryRows');
 const watcher=new MutationObserver(()=>{
   if(app.classList.contains('hidden'))return;
   refreshRole();refreshStats();
   if(current!=='home'&&!authorised(current))open('home',{updateURL:false});
   else if(current!== 'home' && authorised(current) &&
     views.get(current).classList.contains('ops-collapsed'))open(current,{updateURL:false});
 });
 const observe=(el,options)=>{if(el)watcher.observe(el,options)};
 observe(app,{attributes:true,attributeFilter:['class']});
 observe(school,{childList:true,characterData:true,subtree:true});
 observe(role,{childList:true,characterData:true,subtree:true});
 observe(studentCount,{childList:true,characterData:true,subtree:true});
 observe(classSelect,{childList:true,subtree:true});
 observe(staffRows,{childList:true,subtree:true});
 for(const [key,panel] of views)if(key!=='home')observe(panel,{attributes:true,attributeFilter:['class']});
 // Default owner landing is ALWAYS dashboard; explicit section URLs are allowed
 // only after authenticated modules have loaded and authorised that section.
 open('home',{updateURL:false});
 refreshRole();refreshStats();
 if(current!=='home'){
   const initial=current;
   current='home';
   const tryOpen=()=>{
     if(authorised(initial))open(initial,{updateURL:false});
   };
   observe(app,{attributes:true,attributeFilter:['class']});
   tryOpen();
   const onReady=new MutationObserver(()=>{
     if(app.classList.contains('hidden'))return;
     if(authorised(initial)){tryOpen();onReady.disconnect();}
   });
   onReady.observe(app,{attributes:true,attributeFilter:['class']});
   for(const [name,panel] of views)if(name===initial)
     onReady.observe(panel,{attributes:true,attributeFilter:['class']});
 }
})();
