/* Phase D1 – separately authenticated platform tenant administration.
 * Browser holds only a Supabase publishable key, never privileged server credentials.
 * All cross-tenant authority is checked again by Supabase RLS, not this UI.
 */
(()=>{
 'use strict';
 const BASE='https://mrfvbwmyxndrakskqyas.supabase.co';
 const KEY='sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT';
 const SESSION='bn_platform_admin_session_v1';
 const domain=window.BrightNexaPlatformCore;
 const $=id=>document.getElementById(id);
 let session=null,user=null,schools=[],subscriptions=[],plans=[],chosen=null;
 let loadGeneration=0,working=false;
 const E=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);return n};
 const show=(id,on)=>$(id).classList.toggle('hidden',!on);
 function status(id,msg,error=false){const n=$(id);n.textContent=String(msg);n.classList.toggle('error',error);}
 function localDate(){
   const d=new Date();
   return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 }
 function uri(table,params={}){return table+'?'+new URLSearchParams(params).toString();}
 async function parse(response){
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.message||data.error_description||data.error||'Authorized request was denied.');
   return data;
 }
 async function authRequest(path,body){
   return parse(await fetch(BASE+'/auth/v1/'+path,{
     method:'POST',headers:{apikey:KEY,'content-type':'application/json'},
     body:JSON.stringify(body),cache:'no-store'
   }));
 }
 async function currentToken(){
   if(!session?.access_token)throw Error('Platform session expired. Sign in again.');
   if(Number(session.expires_at||0)>Date.now()/1000+90)return session.access_token;
   const updated=await authRequest('token?grant_type=refresh_token',{refresh_token:session.refresh_token});
   session={access_token:updated.access_token,refresh_token:updated.refresh_token,
     expires_at:Math.floor(Date.now()/1000)+(Number(updated.expires_in)||3600)};
   sessionStorage.setItem(SESSION,JSON.stringify(session));
   return session.access_token;
 }
 async function request(path,{method='GET',body,range}={}){
   const jwt=await currentToken();
   const headers={apikey:KEY,Authorization:'Bearer '+jwt,'content-type':'application/json'};
   if(method!=='GET')headers.Prefer='return=representation';
   if(range){headers['Range-Unit']='items';headers.Range=range[0]+'-'+range[1];}
   return parse(await fetch(BASE+'/rest/v1/'+path,{
     method,headers,body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'
   }));
 }
 async function allRows(table,params){
   const max=10000,page=500,results=[];
   for(let offset=0;offset<max;offset+=page){
     const rows=await request(uri(table,params),{range:[offset,offset+page-1]});
     if(!Array.isArray(rows))throw Error('Unexpected platform API response for '+table+'.');
     results.push(...rows);
     if(rows.length<page)return results;
   }
   throw Error('The tenant list exceeds the supported page limit; use a paginated server report.');
 }
 function forget(){
   loadGeneration++;
   session=null;user=null;schools=[];subscriptions=[];plans=[];chosen=null;
   sessionStorage.removeItem(SESSION);
   show('platformView',false);show('loginView',true);show('logout',false);
   $('password').value='';
 }
 async function authorize(){
   if(!domain)throw Error('Platform validation module is missing.');
   const jwt=await currentToken();
   const identity=await parse(await fetch(BASE+'/auth/v1/user',{
     headers:{apikey:KEY,Authorization:'Bearer '+jwt},cache:'no-store'
   }));
   if(!domain.validId(identity?.id))throw Error('Verified Supabase identity is missing.');
   const adminRows=await request(uri('bn_platform_admins',{
     select:'auth_user_id,active',auth_user_id:'eq.'+identity.id
   }));
   if(!Array.isArray(adminRows)||adminRows.length!==1||
       adminRows[0].auth_user_id!==identity.id||adminRows[0].active!==true)
     throw Error('This account is not an active platform administrator. Contact the authorized platform owner.');
   user=identity;
 }
 async function refresh(){
   if(working)return;
   const ticket=++loadGeneration;
   status('overviewStatus','Checking platform authorization and reading verified tenants…');
   await authorize();
   const [inst,sub,catalog]=await Promise.all([
     allRows('institutions',{select:'id,name,status,created_at',order:'name.asc'}),
     allRows('bn_school_subscriptions',{
       select:'institution_id,plan_code,status,starts_on,ends_on,admin_note,updated_by,updated_at',
       order:'institution_id.asc'
     }),
     allRows('bn_saas_plans',{select:'code,name,description,visible',visible:'eq.true',order:'name.asc'})
   ]);
   if(ticket!==loadGeneration)return;
   const overview=domain.overview(inst,sub);
   schools=inst;subscriptions=sub;plans=catalog;
   $('totalSchools').textContent=String(overview.total);
   $('assignedSchools').textContent=String(overview.assigned);
   $('unassignedSchools').textContent=String(overview.unassigned);
   $('activeSchools').textContent=String(overview.administrativelyActive);
   show('loginView',false);show('platformView',true);show('logout',true);
   status('overviewStatus','Authorized school records refreshed. '+
     overview.assigned+' of '+overview.total+' schools have an administrative plan label.');
   drawSchools();
   if(chosen&&schools.some(x=>x.id===chosen))await selectSchool(chosen);
   else resetSelection();
 }
 function resetSelection(){
   chosen=null;
   $('subscriptionForm').classList.add('hidden');
   $('schoolDetail').replaceChildren(E('strong','No school selected'),
     E('small','Choose Manage in the school table.'));
   $('auditLog').replaceChildren(E('p','Select a school to view audit history.'));
 }
 function drawSchools(){
   const list=domain.overview(schools,subscriptions).schools;
   const search=$('schoolFilter').value.trim().toLowerCase();
   const matched=list.filter(x=>!search||String(x.name).toLowerCase().includes(search)||x.id.includes(search));
   const parent=$('schoolTable');parent.replaceChildren();
   if(!matched.length){parent.append(E('p','No matching school in authorized portfolio.'));return;}
   const table=E('table'),thead=E('thead'),tr=E('tr');
   ['Verified school','Actual school status','Admin plan label','Plan state','Manage'].forEach(x=>tr.append(E('th',x)));
   thead.append(tr);table.append(thead);
   const tbody=E('tbody');
   for(const school of matched){
     const row=E('tr');row.dataset.current=String(chosen===school.id);
     const name=E('td');name.append(E('strong',school.name),E('br'),E('small',school.id));row.append(name);
     const actual=E('td');actual.append(E('span',school.status));row.append(actual);
     const plan=E('td',school.subscription?.plan_code||'Not assigned');row.append(plan);
     const statusCell=E('td');statusCell.append(E('span',school.subscription?.status||'—'));row.append(statusCell);
     const buttonCell=E('td'),button=E('button','Manage');
     button.type='button';button.addEventListener('click',()=>{void selectSchool(school.id).catch(e=>status('saveStatus',e.message,true));});
     buttonCell.append(button);row.append(buttonCell);tbody.append(row);
   }
   table.append(tbody);parent.append(table);
 }
 async function selectSchool(schoolId){
   const school=schools.find(x=>x.id===schoolId);
   if(!school)throw Error('School not present in authorized portfolio.');
   chosen=schoolId;drawSchools();
   $('schoolDetail').replaceChildren(E('strong',school.name),
     E('small',school.id+' · Actual institution status: '+school.status));
   const existing=subscriptions.find(x=>x.institution_id===schoolId);
   const form=$('subscriptionForm');form.classList.remove('hidden');
   const select=$('plan');select.replaceChildren();
   for(const plan of plans)select.append(new Option(plan.name+' ('+plan.code+')',plan.code));
   if(!plans.length){form.classList.add('hidden');status('saveStatus','No selectable plan labels configured.',true);return;}
   select.value=existing?.plan_code||plans[0].code;
   $('status').value=existing?.status||'trial';
   $('startsOn').value=existing?.starts_on||localDate();
   $('endsOn').value=existing?.ends_on||'';
   $('adminNote').value=existing?.admin_note||'';
   $('saveSubscription').textContent=existing?'Save plan changes':'Create plan record';
   status('saveStatus',existing?'Current plan loaded. Changes are recorded only after confirmation.':
     'No subscription record exists yet for this school.');
   $('auditLog').replaceChildren(E('p','Reading school change history…'));
   const key=schoolId;
   const events=await allRows('bn_subscription_events',{
     select:'id,institution_id,operation,old_plan,new_plan,old_status,new_status,actor_id,recorded_at',
     institution_id:'eq.'+key,order:'recorded_at.desc',limit:'100'
   });
   if(chosen!==key)return;
   const rows=domain.auditForSchool(events,key);
   const box=$('auditLog');box.replaceChildren();
   if(!rows.length){box.append(E('p','No server-recorded subscription changes for this school.'));return;}
   for(const event of rows){
     const line=E('div');line.className='audit-line';
     line.append(E('strong',(event.operation==='created'?'Created':'Updated')+
       ': '+(event.old_plan||'No plan')+' → '+event.new_plan),
       E('small',(event.old_status||'—')+' → '+event.new_status+' · '+event.recorded_at));
     box.append(line);
   }
 }
 async function submit(event){
   event.preventDefault();if(working)return;
   if(!chosen||!user?.id)return status('saveStatus','Select an authorized school first.',true);
   const school=schools.find(s=>s.id===chosen),prior=subscriptions.find(s=>s.institution_id===chosen);
   if(!school)return status('saveStatus','Selected school no longer exists.',true);
   let planned;
   try{
     planned=domain.formInput({
       institution_id:chosen,plan_code:$('plan').value,status:$('status').value,
       starts_on:$('startsOn').value,ends_on:$('endsOn').value,admin_note:$('adminNote').value
     },{institutions:schools,plans,ownerId:user.id,existing:prior});
   }catch(e){return status('saveStatus',e.message,true)}
   if(!confirm('Save the administrative plan record for "'+school.name+
     '"? This logs the change, but does NOT activate billing, change school access or collect a payment.'))return;
   working=true;$('saveSubscription').disabled=true;
   try{
     const savedAt=new Date().toISOString();
     const payload={...planned,updated_at:savedAt};
     let result;
     if(prior){
       const {institution_id:unchangedId,...fields}=payload;
       result=await request(uri('bn_school_subscriptions',{
         institution_id:'eq.'+chosen,updated_at:'eq.'+prior.updated_at
       }),{method:'PATCH',body:fields});
     }else{
       result=await request('bn_school_subscriptions',{method:'POST',body:payload});
     }
     domain.confirm(result,planned);
     status('saveStatus','Subscription plan change confirmed by school database. Reloading the audit trail.');
   }catch(e){status('saveStatus','Plan save failed: '+e.message,true);return}
   finally{working=false;$('saveSubscription').disabled=false}
   await refresh().catch(e=>status('overviewStatus',e.message,true));
 }
 async function signIn(event){
   event.preventDefault();
   const email=$('email').value.trim(),password=$('password').value;
   if(!email||password.length<8)return status('loginStatus','Enter a valid email and password.',true);
   $('loginButton').disabled=true;
   try{
     const data=await authRequest('token?grant_type=password',{email,password});
     session={access_token:data.access_token,refresh_token:data.refresh_token,
       expires_at:Math.floor(Date.now()/1000)+(Number(data.expires_in)||3600)};
     // Do not persist non-admin account sessions. Authorize before storing.
     await authorize();
     sessionStorage.setItem(SESSION,JSON.stringify(session));
     $('password').value='';
     await refresh();
   }catch(e){forget();status('loginStatus',e.message,true)}
   finally{$('loginButton').disabled=false}
 }
 $('loginForm').addEventListener('submit',signIn);
 $('subscriptionForm').addEventListener('submit',submit);
 $('refresh').addEventListener('click',()=>{refresh().catch(e=>status('overviewStatus',e.message,true));});
 $('schoolFilter').addEventListener('input',drawSchools);
 $('logout').addEventListener('click',forget);
 try{
   session=JSON.parse(sessionStorage.getItem(SESSION)||'null');
   if(session?.access_token)refresh().catch(e=>{forget();status('loginStatus',e.message,true)});
 }catch{forget()}
})();
