/* Verified guardian portal: all sensitive data is selected via authenticated RLS. No demo fallback. */
(() => {
 'use strict';
 const BASE='https://mrfvbwmyxndrakskqyas.supabase.co';
 const KEY='sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT';
 const SESSION='bn_parent_cloud_session_v1';
 const guard=window.BrightNexaAccessGuard;
 if(!guard)throw Error('Parent access checks did not load. Refresh the page.');
 const $=id=>document.getElementById(id);
 let session=null,user=null,students=[],selectionEpoch=0;
 const show=(id,value)=>$(id).classList.toggle('hidden',!value);
 const say=(text,error=false)=>{
   const box=$('status');box.textContent=text;box.className='status'+(error?' error':'');
   box.classList.remove('hidden');box.scrollIntoView({block:'nearest'});
 };
 const text=(id,value)=>$(id).textContent=value==null?'':String(value);
 const el=(tag,body)=>{const node=document.createElement(tag);if(body!==undefined)node.textContent=String(body);return node};
 const clear=id=>$(id).replaceChildren();
 const money=n=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(Number(n)||0);
 function remember(next){
   session={access_token:next.access_token,refresh_token:next.refresh_token,
    expires_at:Math.floor(Date.now()/1000)+(Number(next.expires_in)||3600)};
   sessionStorage.setItem(SESSION,JSON.stringify(session));
 }
 async function readResponse(res){
   const data=await res.json().catch(()=>({}));
   if(!res.ok)throw Error(data.msg||data.message||data.error_description||data.error||'Request failed.');
   return data;
 }
 async function auth(path,data){
   return readResponse(await fetch(BASE+'/auth/v1/'+path,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify(data),cache:'no-store'}));
 }
 async function ensureToken(){
   if(!session?.access_token)throw Error('Sign in first.');
   if(session.expires_at>Date.now()/1000+90)return;
   if(!session.refresh_token){logout();throw Error('Session expired. Sign in again.');}
   try{remember(await auth('token?grant_type=refresh_token',{refresh_token:session.refresh_token}))}
   catch(e){logout();throw e}
 }
 const eq=value=>'eq.'+value;
 function query(o){return Object.entries(o).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&')}
 async function data(table,params={},method='GET',body=null){
   await ensureToken();
   const res=await fetch(BASE+'/rest/v1/'+table+'?'+query(params),{
     method,headers:{apikey:KEY,Authorization:'Bearer '+session.access_token,
       'Content-Type':'application/json',Prefer:method==='POST'?'return=representation':'return=minimal'},
     body:body===null?undefined:JSON.stringify(body),cache:'no-store'
   });
   return readResponse(res);
 }
 function logout(){
   const prev=session?.access_token;
   selectionEpoch++;
   session=null;user=null;students=[];
   sessionStorage.removeItem(SESSION);
   show('authPanel',true);show('parentPanel',false);show('noGuardianLink',false);show('parentData',false);
   $('parentLoginForm').reset();$('parentSignupForm').reset();
   $('childSelector').replaceChildren();
   for(const id of ['childProfile','attendanceList','feeList','homeworkList','noticesList','leaveList'])clear(id);
   if(prev)fetch(BASE+'/auth/v1/logout',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+prev}}).catch(()=>{});
 }
 function list(id,rows,format){
   clear(id);
   if(!rows.length){$(id).append(el('li','No published records.'));return}
   for(const r of rows){const li=el('li');format(li,r);$(id).append(li)}
 }
 function addLine(root,title,detail){
   root.append(el('strong',title),el('div',detail));
 }
 async function loadChildren(){
   const requested=++selectionEpoch;
   await ensureToken();
   const tokenAtStart=session.access_token;
   const verifiedUser=await readResponse(await fetch(BASE+'/auth/v1/user',{
      headers:{apikey:KEY,Authorization:'Bearer '+tokenAtStart},cache:'no-store'}));
   // Logout or a newer sign-in invalidates this in-flight request.
   if(requested!==selectionEpoch||session?.access_token!==tokenAtStart)return;
   if(!verifiedUser?.id)throw Error('Your verified account could not be identified.');
   user=verifiedUser;
   show('authPanel',false);show('parentPanel',true);
   const guardians=await data('school_guardians',{select:'id,institution_id,email,status',auth_user_id:eq(user.id),status:'eq.active'});
   text('guardianStatus',user.email||'Verified parent account');
    let links=[];
   if(guardians.length){
     const ids=guardians.map(g=>g.id);
     links=await data('school_guardian_students',{select:'guardian_id,student_id,institution_id',guardian_id:'in.('+ids.join(',')+')'});
   }
   if(!links.length){
     students=[];show('noGuardianLink',true);show('parentData',false);
     text('schoolTitle','Parent account');
     say('Signed in. School administrator approval is required before you can see a child.');
     return;
   }
   const ids=[...new Set(links.map(l=>l.student_id))];
   const all=await data('school_students',{select:'id,institution_id,class_id,admission_number,name,status',id:'in.('+ids.join(',')+')',status:'eq.active',order:'name.asc',limit:'100'});
   if(requested!==selectionEpoch)return;
   students=guard.linkedChildren(guardians,links,all);
   const select=$('childSelector');select.replaceChildren();
   for(const s of students){const opt=el('option',s.name+' · '+s.admission_number);opt.value=s.id;select.append(opt)}
   show('noGuardianLink',students.length===0);show('parentData',false);
   if(!students.length){text('schoolTitle','Parent account');return;}
   const loaded=await loadSelected();
   if(loaded)say('Your school has verified this parent-child link. School-published data refreshed.');
 }
 async function loadSelected(){
   const requested=++selectionEpoch,actorId=user?.id;
   const chosen=students.find(s=>s.id===$('childSelector').value);
   if(!chosen||!actorId)throw Error('Choose one of your linked children.');
   show('parentData',false);
   // A cached child selection does not prove that a guardian link remains active.
   const [freshGuardians,freshLinks]=await Promise.all([
     data('school_guardians',{select:'id,institution_id,status',auth_user_id:eq(actorId),status:'eq.active'}),
     data('school_guardian_students',{select:'guardian_id,student_id,institution_id',student_id:eq(chosen.id),institution_id:eq(chosen.institution_id)})
   ]);
   if(requested!==selectionEpoch||user?.id!==actorId||$('childSelector').value!==chosen.id)return false;
   if(!guard.linkedChildren(freshGuardians,freshLinks,[chosen]).length)throw Error('Parent-child access was removed. Contact the school administrator and refresh your account.');
   const [schools,classes,attendance,fees,exactBalances,homework,notices,leaves]=await Promise.all([
     data('institutions',{select:'id,name',id:eq(chosen.institution_id),limit:'1'}),
     chosen.class_id?data('school_classes',{select:'id,name,section,academic_year',id:eq(chosen.class_id),limit:'1'}):Promise.resolve([]),
     data('school_attendance',{select:'day,status',student_id:eq(chosen.id),order:'day.desc',limit:'100'}),
     data('school_fee_entries',{select:'id,kind,amount_rupees,description,reference,occurred_on',student_id:eq(chosen.id),order:'occurred_on.desc',limit:'500'}),
     data('school_fee_balances',{select:'student_id,balance_rupees,entry_count',student_id:eq(chosen.id),limit:'1'}),
     chosen.class_id?data('school_homework',{select:'subject,title,instructions,due_on,created_at',class_id:eq(chosen.class_id),order:'created_at.desc',limit:'40'}):Promise.resolve([]),
     data('school_notices',{select:'title,body,created_at',institution_id:eq(chosen.institution_id),order:'created_at.desc',limit:'40'}),
     data('school_parent_leaves',{select:'from_on,to_on,reason,status,created_at',student_id:eq(chosen.id),parent_auth_user_id:eq(user.id),order:'created_at.desc',limit:'30'})
   ]);
   if(requested!==selectionEpoch||user?.id!==actorId||$('childSelector').value!==chosen.id)return false;
   text('schoolTitle',schools[0]?.name||'Linked school');
   clear('childProfile');const cls=classes[0];
   for(const [name,value] of [['Name',chosen.name],['Admission number',chosen.admission_number],
    ['Class',cls?(cls.name+' '+cls.section):'Not assigned'],['Session',cls?.academic_year||'—']]){
     const p=el('p');p.append(el('strong',name+': '),el('span',value));$('childProfile').append(p);
   }
   text('attendanceCount',attendance.length);
   const present=attendance.filter(x=>['present','late'].includes(x.status)).length;
   text('attendancePercent',attendance.length?Math.round(100*present/attendance.length)+'%':'Not recorded');
   list('attendanceList',attendance.slice(0,30),(li,x)=>addLine(li,x.day, x.status.toUpperCase()));
   const balance=Number(exactBalances[0]?.balance_rupees||0);
   text('feeBalance',money(balance));
   clear('feeList');
   if(!fees.length){const tr=el('tr'),td=el('td','No fee entries yet');td.colSpan=4;tr.append(td);$('feeList').append(tr)}
   for(const f of fees){const tr=el('tr');for(const val of [f.occurred_on,f.kind,money(f.amount_rupees),f.description||f.reference||'—'])tr.append(el('td',val));$('feeList').append(tr)}
   list('homeworkList',homework,(li,x)=>addLine(li,x.subject+' · '+x.title,(x.instructions||'')+(x.due_on?' · Due '+x.due_on:'')));
   list('noticesList',notices,(li,x)=>addLine(li,x.title,(x.body||'')+' · '+new Date(x.created_at).toLocaleDateString('en-IN')));
   list('leaveList',leaves,(li,x)=>addLine(li,x.from_on+' to '+x.to_on,'Status: '+x.status+' · '+x.reason));
   show('parentData',true);
   return true;
 }
 const withBusy=(form,fn)=>async e=>{
   e.preventDefault();const btn=form.querySelector('button[type="submit"]');
   btn.disabled=true;
   try{await fn()}catch(err){say(err.message||'Operation failed.',true)}
   finally{btn.disabled=false}
 };
 $('parentLoginForm').addEventListener('submit',withBusy($('parentLoginForm'),async()=>{
   const email=$('parentEmail').value.trim().toLowerCase(),password=$('parentPassword').value;
   if(!email||!password)throw Error('Email and password are required.');
   remember(await auth('token?grant_type=password',{email,password}));
   $('parentPassword').value='';
   await loadChildren();
 }));
 $('parentSignupForm').addEventListener('submit',withBusy($('parentSignupForm'),async()=>{
   const email=$('registerEmail').value.trim().toLowerCase(),password=$('registerPassword').value;
   if(password.length<12)throw Error('Create a password with at least 12 characters.');
   await auth('signup?redirect_to='+encodeURIComponent(location.origin+'/parents-cloud.html'),{email,password});
   $('registerPassword').value='';
   say('If this email can be registered, a verification message will arrive. Verify first, then ask the school admin to link this email. No student data is visible until then.');
 }));
 $('childSelector').addEventListener('change',()=>loadSelected().catch(e=>say(e.message,true)));
 $('refreshParent').addEventListener('click',()=>loadChildren().catch(e=>say(e.message,true)));
 $('parentLogout').addEventListener('click',logout);
 $('leaveRequestForm').addEventListener('submit',withBusy($('leaveRequestForm'),async()=>{
   const chosen=students.find(s=>s.id===$('childSelector').value);
   if(!chosen)throw Error('Select a linked student.');
   const start=$('leaveFrom').value,end=$('leaveTo').value,reason=$('leaveReason').value.trim();
   if(!start||!end||start>end||reason.length<5||reason.length>500)throw Error('Enter valid leave dates and a reason (5–500 characters).');
   const days=(Date.parse(end)-Date.parse(start))/86400000;
   if(!Number.isFinite(days)||days>90)throw Error('Leave request cannot be more than 90 days.');
   const submitted=await data('school_parent_leaves',{},'POST',{institution_id:chosen.institution_id,student_id:chosen.id,
     parent_auth_user_id:user.id,from_on:start,to_on:end,reason});
   const saved=guard.confirmRow(submitted);
   if(saved.institution_id!==chosen.institution_id||saved.student_id!==chosen.id||saved.parent_auth_user_id!==user.id||saved.status!=='pending')throw Error('Leave request confirmation failed. Refresh before submitting again.');
   $('leaveRequestForm').reset();await loadSelected();say('Leave request submitted to the school and confirmed.');
 }));
 try{
   const fragment=new URLSearchParams(location.hash.slice(1));
   if(fragment.get('access_token')&&fragment.get('refresh_token')){
      remember({access_token:fragment.get('access_token'),refresh_token:fragment.get('refresh_token'),
        expires_in:Number(fragment.get('expires_in'))||3600});
      history.replaceState(null,'',location.pathname+location.search);
   }else{session=JSON.parse(sessionStorage.getItem(SESSION)||'null')}
 }catch{session=null}
 if(session?.access_token)loadChildren().catch(e=>{logout();say('Parent session could not be verified: '+e.message,true)});
})();
