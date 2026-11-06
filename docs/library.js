/* Librarian workspace: authenticated Supabase is the only source of records. */
(()=>{'use strict';
 const BASE='https://mrfvbwmyxndrakskqyas.supabase.co',KEY='sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT',TOKEN='bn_school_staff_session_v1';
 const $=id=>document.getElementById(id);
 let session=null,member=null,studentRows=[],bookRows=[],loanRows=[],writable=false;
 const plain=v=>v==null?'':String(v);
 function show(id,visible){$(id).classList.toggle('hidden',!visible);}
 function note(message,bad=false){$('status').textContent=plain(message);$('status').classList.toggle('error',bad);show('status',true);}
 function today(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
 async function unpack(response){let data;try{data=await response.json();}catch(_){throw Error('Server sent an invalid response. No records changed on this device.');}if(!response.ok)throw Error(data.message||data.error_description||data.error||'Cloud request denied');return data;}
 async function authorize(){
  try{session=JSON.parse(sessionStorage.getItem(TOKEN)||'null');}catch(_){session=null}
  if(!session?.access_token)throw Error('Log in through the Staff Portal first.');
  if(!Number.isFinite(+session.expires_at)||session.expires_at<Date.now()/1000+90){
   if(!session.refresh_token)throw Error('Your session has expired. Sign in again.');
   const refreshed=await unpack(await fetch(BASE+'/auth/v1/token?grant_type=refresh_token',{method:'POST',cache:'no-store',headers:{apikey:KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})}));
   if(!refreshed.access_token)throw Error('Session refresh failed. Log in again.');
   session={access_token:refreshed.access_token,refresh_token:refreshed.refresh_token||session.refresh_token,expires_at:Math.floor(Date.now()/1000)+Number(refreshed.expires_in||3600)};
   sessionStorage.setItem(TOKEN,JSON.stringify(session));
  }
  const auth={apikey:KEY,Authorization:'Bearer '+session.access_token};
  const user=await unpack(await fetch(BASE+'/auth/v1/user',{headers:auth,cache:'no-store'}));
  const query=new URLSearchParams({select:'id,institution_id,auth_user_id,email,role,status',auth_user_id:'eq.'+user.id});
  const memberships=await unpack(await fetch(BASE+'/rest/v1/school_users?'+query,{headers:auth,cache:'no-store'}));
  member=memberships.find(u=>u.auth_user_id===user.id&&u.status==='active'&&['librarian','school_admin','principal'].includes(u.role));
  if(!member)throw Error('Library access requires a verified Librarian, School Admin or Principal account.');
  const schoolQuery=new URLSearchParams({select:'name,status',id:'eq.'+member.institution_id});
  const schools=await unpack(await fetch(BASE+'/rest/v1/institutions?'+schoolQuery,{headers:auth,cache:'no-store'}));
  if(!schools[0]||!['active','trial'].includes(schools[0].status))throw Error('School is inactive.');
  $('schoolLabel').textContent=schools[0].name+' · '+member.role.replaceAll('_',' ');
  writable=member.role!=='principal';
  show('editSections',writable);show('logout',true);show('dashboard',true);show('loginNotice',false);
 }
 async function api(table,params,method='GET',body=null,prefer='return=representation'){
  if(!member||!session?.access_token)throw Error('School staff login required.');
  const res=await fetch(BASE+'/rest/v1/'+table+(params?'?'+params:''),{method,cache:'no-store',headers:{apikey:KEY,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json',Prefer:prefer},body:body===null?undefined:JSON.stringify(body)});
  return unpack(res);
 }
 async function all(table,fields,extra={}){
  let results=[],offset=0;while(true){
   const query=new URLSearchParams({select:fields,institution_id:'eq.'+member.institution_id,limit:'500',offset:String(offset),...extra});
   const rows=await api(table,query);
   if(!Array.isArray(rows))throw Error('Cloud query returned invalid '+table+' data.');
   results.push(...rows);if(rows.length<500)return results;
   offset+=rows.length;if(offset>=10000)throw Error('Large school library requires pagination. Contact the administrator.');
  }
 }
 function option(select,value,label){const el=document.createElement('option');el.value=value;el.textContent=label;select.appendChild(el);}
 function row(target,values,action){
  const tr=document.createElement('tr');for(const value of values){const td=document.createElement('td');td.textContent=plain(value);tr.appendChild(td);}
  if(action){const td=document.createElement('td');td.appendChild(action);tr.appendChild(td);}
  target.appendChild(tr);
 }
 function render(){
  const active=new Map(loanRows.filter(l=>!l.returned_on).map(l=>[l.item_id,l]));
  const books=new Map(bookRows.map(i=>[i.id,i])),students=new Map(studentRows.map(i=>[i.id,i]));
  $('bookCount').textContent=bookRows.length+' copies';$('loanCount').textContent=active.size+' issued';
  $('bookList').replaceChildren();$('returnList').replaceChildren();$('issueItem').replaceChildren();$('issueStudent').replaceChildren();
  const available=bookRows.filter(i=>i.status==='active'&&!active.has(i.id));
  for(const item of available)option($('issueItem'),item.id,item.accession_no+' — '+item.title);
  for(const stu of studentRows)option($('issueStudent'),stu.id,stu.name+' ('+stu.admission_number+')');
  for(const item of bookRows)row($('bookList'),[item.accession_no,item.title,item.author,item.status==='withdrawn'?'Withdrawn':active.has(item.id)?'On loan':'Available']);
  for(const loan of loanRows.filter(l=>!l.returned_on)){
   const item=books.get(loan.item_id),student=students.get(loan.student_id);
   const b=document.createElement('button');b.type='button';b.className='outline';b.textContent='Mark returned';b.disabled=!writable;
   b.setAttribute('aria-label','Return '+plain(item?.title||loan.item_id));
   b.addEventListener('click',()=>run(async()=>{
    if(!writable)throw Error('Only a Librarian or School Admin may return books.');
    if(!confirm('Mark this copy returned to the library?'))return;
    b.disabled=true;
    try{
     const params=new URLSearchParams({id:'eq.'+loan.id,institution_id:'eq.'+member.institution_id,returned_on:'is.null'});
     const result=await api('school_library_loans',params,'PATCH',{returned_on:today(),returned_by:member.id});
     if(!Array.isArray(result)||result.length!==1)throw Error('Server did not confirm the return.');
     await reload();note('Book returned and stock updated in Supabase.');
    }finally{b.disabled=false}
   }));
   row($('returnList'),[item?item.title:'Book copy',student?student.name+' ('+student.admission_number+')':'Student',loan.issued_on,loan.due_on],b);
  }
  $('issueItem').disabled=!writable||!available.length;$('issueStudent').disabled=!writable||!studentRows.length;
 }
 async function reload(){
  [bookRows,studentRows,loanRows]=await Promise.all([
   all('school_library_items','id,institution_id,accession_no,title,author,isbn,status',{order:'title.asc'}),
   all('school_students','id,name,admission_number,status',{status:'eq.active',order:'name.asc'}),
   all('school_library_loans','id,institution_id,item_id,student_id,issued_on,due_on,returned_on',{order:'issued_on.desc'})
  ]);
  render();
 }
 async function run(action){try{await action();}catch(error){note(error.message||String(error),true);}}
 $('refresh').addEventListener('click',()=>run(async()=>{await reload();note('Latest inventory refreshed from Supabase.');}));
 $('addBook').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
  if(!writable)throw Error('Library write permission required.');
  const button=event.target.querySelector('button[type=submit]');button.disabled=true;
  try{
   const payload={institution_id:member.institution_id,accession_no:$('accession').value.trim(),title:$('title').value.trim(),author:$('author').value.trim(),isbn:$('isbn').value.trim(),status:'active'};
   const result=await api('school_library_items','','POST',payload);
   if(!Array.isArray(result)||result.length!==1)throw Error('Cloud did not confirm the book.');
   event.target.reset();await reload();note('Book copy saved in Supabase.');
  }finally{button.disabled=false}
 })});
 $('issueBook').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
  if(!writable)throw Error('Library write permission required.');
  const itemId=$('issueItem').value,studentId=$('issueStudent').value,due=$('dueOn').value,day=today();
  if(!itemId||!studentId||!/^\d{4}-\d{2}-\d{2}$/.test(due)||due<day)throw Error('Choose an available book, enrolled student and valid future due date.');
  const button=event.target.querySelector('button[type=submit]');button.disabled=true;
  try{
   const payload={institution_id:member.institution_id,item_id:itemId,student_id:studentId,issued_on:day,due_on:due,issued_by:member.id};
   const result=await api('school_library_loans','','POST',payload);
   if(!Array.isArray(result)||result.length!==1)throw Error('Cloud did not confirm the loan.');
   event.target.reset();await reload();note('Book issued and saved to Supabase.');
  }finally{button.disabled=false}
 })});
 $('logout').addEventListener('click',()=>run(async()=>{const token=session?.access_token;sessionStorage.removeItem(TOKEN);if(token)await fetch(BASE+'/auth/v1/logout',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+token}}).catch(()=>{});location.assign('./teacher-access.html');}));
 $('dueOn').min=today();
 authorize().then(()=>reload()).catch(error=>{show('loginNotice',true);show('dashboard',false);note(error.message||String(error),true);});
})();
