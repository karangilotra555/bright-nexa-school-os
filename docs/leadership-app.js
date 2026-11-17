/* Bright Nexa Leadership App — verified school roles, Supabase only. No offline school data. */
(function(root){
'use strict';
const BASE='https://mrfvbwmyxndrakskqyas.supabase.co';
const KEY='sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT';
const allowedRoles=new Set(['school_admin','principal']);
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const escapeFilter=value=>String(value).replace(/[^a-zA-Z0-9_-]/g,'');
function create(fetcher=root.fetch?.bind(root),storage=root.BNMobileSession?.createStore('leadership')){
  let session=null,schools=[],selected=null,version=0,refreshing=null;
  async function send(path,options={},withAuth=true){
    if(withAuth)await fresh();
    if(withAuth&&!session?.access_token)throw Error('Sign in to your school account.');
    const controller=typeof AbortController!=='undefined'?new AbortController():null;
    let timer;
    try{
      const response=await Promise.race([
        fetcher(BASE+path,{...options,cache:'no-store',...(controller?{signal:controller.signal}:{}),
          headers:{apikey:KEY,'Content-Type':'application/json',...(withAuth?{Authorization:'Bearer '+session.access_token}:{}),...options.headers}}),
        new Promise((_,reject)=>{timer=setTimeout(()=>{controller?.abort();reject(Error('School network timed out. Please retry.'));},20000);})
      ]);
      const raw=await response.text();
      let data;try{data=raw?JSON.parse(raw):null;}catch(_){data=raw;}
      if(!response.ok)throw Error(data?.message||data?.msg||data?.error_description||data?.error||'School service unavailable ('+response.status+').');
      return {data,response};
    }finally{clearTimeout(timer);}
  }
  function installSession(value){
    if(!value?.access_token||!value?.refresh_token)throw Error('Invalid school authentication response.');
    session={...value,expires_at:Number(value.expires_at)||(Date.now()/1000+Number(value.expires_in||3600))};
  }
  async function refresh(token){
    const answer=await send('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:token})},false);
    installSession(answer.data);
    return answer.data;
  }
  async function fresh(){
    if(session?.expires_at>Date.now()/1000+90)return;
    if(!session?.refresh_token)throw Error('Your session has expired. Sign in again.');
    if(!refreshing)refreshing=(async()=>{
      const data=await refresh(session.refresh_token);
      await storage?.write(data.refresh_token);
    })().finally(()=>{refreshing=null;});
    await refreshing;
  }
  async function verify(){
    const user=(await send('/auth/v1/user')).data;
    if(!user?.id)throw Error('School identity could not be verified.');
    const query=new URLSearchParams({select:'id,institution_id,role,status,display_name',auth_user_id:'eq.'+escapeFilter(user.id),status:'eq.active',limit:'100'});
    const rows=(await send('/rest/v1/school_users?'+query)).data;
    if(!Array.isArray(rows))throw Error('School memberships could not be verified.');
    const verified=[];
    for(const member of rows){
      if(!allowedRoles.has(member.role)||!member.institution_id)continue;
      try{
        const params=new URLSearchParams({select:'id,name,status',id:'eq.'+escapeFilter(member.institution_id),limit:'1'});
        const institutions=(await send('/rest/v1/institutions?'+params)).data;
        const school=institutions?.[0];
        if(school&&['active','trial'].includes(school.status)){
          verified.push({id:school.id,name:school.name||'Verified school',role:member.role,displayName:member.display_name||'School leadership'});
        }
      }catch(_){/* A non-readable institution is never treated as verified. */}
    }
    if(!verified.length)throw Error('Active Owner or Principal school access is required.');
    schools=verified;
    if(!schools.some(x=>x.id===selected?.id))selected=schools[0];
    return {schools:[...schools],selected};
  }
  async function login(email,password){
    const result=await send('/auth/v1/token?grant_type=password',{method:'POST',
      body:JSON.stringify({email:String(email).trim(),password})},false);
    const previous=session;installSession(result.data);
    try{
      await verify();
      await storage?.write(session.refresh_token,true);
      storage?.activate?.();
      return {schools:[...schools],selected};
    }catch(error){session=previous;schools=[];selected=null;throw error;}
  }
  async function restore(){
    const token=await storage?.read();
    if(!token)return null;
    try{await refresh(token);return await verify();}
    catch(error){session=null;schools=[];selected=null;throw error;}
  }
  function choose(id){
    const match=schools.find(x=>x.id===id);
    if(!match)throw Error('Select a verified school.');
    selected=match;version++;return selected;
  }
  function school(){if(!selected)throw Error('Select a verified school.');return selected;}
  async function rpc(name,args={}){
    if(!/^bn_(?:list_teacher_leaves|review_teacher_leave|teacher_leave_cover_plan|publish_teacher_covers)$/.test(name))throw Error('Unsupported leadership operation.');
    const owner=school();
    return (await send('/rest/v1/rpc/'+name,{method:'POST',body:JSON.stringify({p_school:owner.id,...args})})).data;
  }
  async function count(table,filters={}){
    const owner=school(),params=new URLSearchParams({select:'id',institution_id:'eq.'+escapeFilter(owner.id),limit:'1',...filters});
    try{
      const reply=await send('/rest/v1/'+table+'?'+params,{headers:{Prefer:'count=exact'}});
      const contentRange=reply.response.headers.get('content-range')||'';
      const match=contentRange.match(/\/(\d+)$/);
      return match?Number(match[1]):null;
    }catch(_){return null;}
  }
  async function overview(){
    const owner=school();const epoch=version;
    const [leaves,students,teachers]=await Promise.all([
      rpc('bn_list_teacher_leaves'),count('school_students'),count('school_users',{role:'eq.teacher',status:'eq.active'})
    ]);
    if(epoch!==version||owner.id!==selected?.id)throw Error('School changed. Reload the dashboard.');
    if(!Array.isArray(leaves))throw Error('Leave records are not available.');
    return {school:owner,leaves,students,teachers,
      pending:leaves.filter(x=>x.status==='pending').length,
      emergency:leaves.filter(x=>x.status==='pending'&&x.kind==='emergency').length,
      approved:leaves.filter(x=>x.status==='approved').length};
  }
  async function review(id,decision){
    if(!['approved','declined'].includes(decision))throw Error('Invalid leave decision.');
    const target=String(id||'');if(!/^[0-9a-f-]{36}$/i.test(target))throw Error('Invalid leave request.');
    return rpc('bn_review_teacher_leave',{p_leave:target,p_status:decision});
  }
  async function covers(id,day){return rpc('bn_teacher_leave_cover_plan',{p_leave:id,p_day:day});}
  async function publish(id,day,entries){
    if(!Array.isArray(entries)||!entries.length)throw Error('Choose at least one valid substitute.');
    return rpc('bn_publish_teacher_covers',{p_leave:id,p_day:day,p_covers:entries});
  }
  async function logout(){
    const token=session?.access_token;
    session=null;schools=[];selected=null;version++;
    await storage?.clear();
    if(token)send('/auth/v1/logout',{method:'POST',headers:{Authorization:'Bearer '+token}},false).catch(()=>{});
  }
  return {login,restore,verify,choose,school,overview,review,covers,publish,logout,today};
}
function mount(doc=root.document,fetcher=root.fetch?.bind(root)){
  const $=id=>doc.getElementById(id), client=create(fetcher);
  let snapshot=null,coverLeave=null,view='home',busy=false;
  const elt=(tag,label,cls)=>{const e=doc.createElement(tag);if(label!==undefined)e.textContent=String(label);if(cls)e.className=cls;return e;};
  const note=(text,error=false)=>{const e=$('notice');e.textContent=text||'';e.classList.toggle('error',error);};
  const status=busyValue=>{busy=busyValue;doc.querySelectorAll('button[data-action]').forEach(btn=>btn.disabled=busyValue);};
  async function run(task){
    if(busy)return;
    status(true);note('');
    try{await task();}catch(e){note(e.message||'Could not reach the school.',true);}
    finally{status(false);}
  }
  function gate(show){$('loginPage').hidden=!show;$('mainApp').hidden=show;}
  function label(value){return value===null||value===undefined?'—':String(value);}
  function row(parent,title,detail){
    const div=elt('div',undefined,'line');
    div.append(elt('strong',title),elt('span',detail));parent.append(div);return div;
  }
  function showPage(page){
    view=page;
    doc.querySelectorAll('[data-page]').forEach(el=>el.hidden=el.dataset.page!==page);
    doc.querySelectorAll('[data-nav]').forEach(el=>el.classList.toggle('selected',el.dataset.nav===page));
  }
  function drawHome(data){
    $('schoolName').textContent=data.school.name;
    $('roleLabel').textContent=data.school.role==='principal'?'Principal':'Owner / Admin';
    $('welcomeName').textContent='Hello, '+data.school.displayName;
    const values=[label(data.students),label(data.teachers),label(data.pending),label(data.emergency)];
    ['metricStudents','metricTeachers','metricPending','metricUrgent'].forEach((id,i)=>$(id).textContent=values[i]);
    const insights=$('dailyBrief');insights.replaceChildren();
    if(data.emergency)row(insights,'Urgent leave',data.emergency+' emergency request(s) need immediate review.');
    if(data.pending)row(insights,'Approval queue',data.pending+' pending leave request(s); check teaching cover before approving.');
    if(data.approved)row(insights,'Cover reminder',data.approved+' approved leave request(s); verify all affected periods have cover.');
    if(!data.pending&&!data.approved)row(insights,'No leave backlog','Leave queue has no pending or approved requests in the current results.');
    if(data.students===null||data.teachers===null)row(insights,'Data visibility','Some counts were unavailable under this school role. No values were estimated.');
    $('lastSync').textContent='Verified live from Supabase · '+new Date().toLocaleString('en-IN');
  }
  const leaveDescriptor=x=>x.starts_on+(x.starts_on!==x.ends_on?' to '+x.ends_on:'')+(x.starts_at?' · '+x.starts_at.slice(0,5)+'–'+x.ends_at.slice(0,5):' · Full day');
  function drawLeaves(leaves){
    const target=$('leaveList');target.replaceChildren();
    const filtered=leaves.filter(x=>['pending','approved'].includes(x.status)).sort((a,b)=>
      Number(b.status==='pending')-Number(a.status==='pending')||Number(b.kind==='emergency')-Number(a.kind==='emergency'));
    if(!filtered.length){target.append(elt('p','No pending or approved leave requests.','muted'));return;}
    for(const leave of filtered){
      const card=elt('article',undefined,'panel');
      const h=elt('div',undefined,'itemhead');
      h.append(elt('strong',leave.teacher_name||'Verified teacher'),elt('span',leave.kind==='emergency'?'Emergency':'Planned','tag'));
      card.append(h,elt('p',leaveDescriptor(leave),'sub'),elt('p',leave.reason||'No reason provided','bodytext'),elt('p','Status: '+leave.status,'sub'));
      const actions=elt('div',undefined,'actions');
      if(leave.status==='pending'){
        for(const [title,decision] of [['Approve','approved'],['Decline','declined']]){
          const button=elt('button',title,decision==='approved'?'primary':'secondary');button.dataset.action=decision;
          button.addEventListener('click',()=>run(async()=>{
            if(!root.confirm('Confirm '+decision+' leave for '+(leave.teacher_name||'this teacher')+'?'))return;
            await client.review(leave.id,decision);await refresh();
            if(decision==='approved'){coverLeave={...leave,status:'approved'};await loadCover();}
          }));
          actions.append(button);
        }
      }else{
        const btn=elt('button','Plan substitute','secondary');btn.dataset.action='cover';
        btn.addEventListener('click',()=>run(async()=>{coverLeave=leave;await loadCover();}));
        actions.append(btn);
      }
      card.append(actions);target.append(card);
    }
  }
  async function loadCover(){
    if(!coverLeave)return;
    showPage('cover');
    $('coverHeading').textContent='Cover · '+(coverLeave.teacher_name||'Teacher');
    const date=$('coverDate');date.min=coverLeave.starts_on;date.max=coverLeave.ends_on;
    if(!date.value||date.value<date.min||date.value>date.max)date.value=today()<date.min?date.min:today()>date.max?date.max:today();
    const rows=await client.covers(coverLeave.id,date.value);
    const target=$('coverRows');target.replaceChildren();
    if(!rows?.length){target.append(elt('p','No published teaching periods affected for this date.','muted'));return;}
    for(const rowData of rows){
      const panel=elt('article',undefined,'panel');
      panel.append(elt('strong',rowData.class_name+' · '+rowData.subject),
        elt('p',rowData.starts_at.slice(0,5)+'–'+rowData.ends_at.slice(0,5)+' · '+(rowData.room_number?'Room '+rowData.room_number:'Room unassigned'),'sub'));
      if(rowData.cover_needs_review)panel.append(elt('p','Previously published cover needs review.','warning'));
      const pick=elt('select');pick.dataset.slot=rowData.slot_id;pick.dataset.classid=rowData.class_id;
      const none=elt('option','No substitute available');none.value='';pick.append(none);
      for(const candidate of rowData.candidates||[]){
        const option=elt('option',candidate.teacher_name+' · '+(candidate.subject_match?'Subject match':'Class qualified')+' · '+candidate.periods+' periods');
        option.value=candidate.teacher_id;pick.append(option);
      }
      if(rowData.teacher_id)pick.value=rowData.teacher_id;
      else if(rowData.candidates?.length)pick.value=rowData.candidates[0].teacher_id;
      if(!rowData.candidates?.length)panel.append(elt('p','No eligible free teacher found. Requires manual school decision.','warning'));
      const lbl=elt('label','Proposed substitute','field');lbl.append(pick);panel.append(lbl);target.append(panel);
    }
  }
  async function refresh(){
    const data=await client.overview();snapshot=data;
    drawHome(data);drawLeaves(data.leaves);
  }
  function chooseSchools(data){
    const picker=$('schoolPicker');picker.replaceChildren();
    for(const item of data.schools){
      const option=elt('option',item.name+' · '+(item.role==='principal'?'Principal':'Owner / Admin'));option.value=item.id;picker.append(option);
    }
    picker.value=data.selected.id;picker.hidden=data.schools.length===1;
  }
  async function showAuthenticated(data){
    chooseSchools(data);gate(false);showPage('home');await refresh();
  }
  $('loginForm').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
    const data=await client.login($('email').value,$('password').value);
    $('password').value='';await showAuthenticated(data);
  });});
  $('logoutBtn').addEventListener('click',()=>run(async()=>{await client.logout();snapshot=null;coverLeave=null;gate(true);}));
  $('schoolPicker').addEventListener('change',()=>run(async()=>{client.choose($('schoolPicker').value);coverLeave=null;await refresh();showPage('home');}));
  $('refreshBtn').addEventListener('click',()=>run(refresh));
  doc.querySelectorAll('[data-nav]').forEach(button=>button.addEventListener('click',()=>{
    const destination=button.dataset.nav;
    if(destination==='cover'&&!coverLeave){note('Choose an approved leave under Leave requests to plan cover.');showPage('leaves');return;}
    showPage(destination);
  }));
  $('coverDate').addEventListener('change',()=>run(loadCover));
  $('publishCover').addEventListener('click',()=>run(async()=>{
    if(!coverLeave)throw Error('Choose approved leave first.');
    const entries=[...$('coverRows').querySelectorAll('select[data-slot]')].filter(x=>x.value)
      .map(x=>({slot_id:x.dataset.slot,class_id:x.dataset.classid,teacher_id:x.value}));
    if(!entries.length)throw Error('There is no valid cover to publish.');
    if(!root.confirm('Publish '+entries.length+' substitute assignment(s) to the teachers?'))return;
    await client.publish(coverLeave.id,$('coverDate').value,entries);
    note('Cover published. Verify delivery in Teacher App.');await loadCover();
  }));
  gate(true);
  run(async()=>{const restored=await client.restore();if(restored)await showAuthenticated(restored);})
    .catch(()=>{});
  return client;
}
const api={create,mount,today};
if(typeof module!=='undefined'&&module.exports)module.exports=api;
else{root.BNLeadership=api;root.addEventListener('DOMContentLoaded',()=>mount());}
})(typeof window==='undefined'?globalThis:window);
