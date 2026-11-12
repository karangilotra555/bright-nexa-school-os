/* Bright Nexa Dashboard integrity: UI only, never changes school records.
 * Keep URL/tab in sync and never present a cloud error as a verified save.
 */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory;
  else factory(root).start();
})(typeof window!=='undefined'?window:globalThis,function(root){
  'use strict';
  const doc=root.document;
  let started=false,initialHandled=false,scheduled=false;
  let dashboardDeepLinkPending=false,routeAttempts=0,lastRouteClick=0;
  let cloudCounts=null,cloudReading=false,lastReadAt=0,cloudRequestId=0,cloudIdentity=null;
  const tabs=new Set(['Dashboard','School Profile','Class & Section Setup','Students','ID Cards & Certificates','Teachers','Non-Teaching Staff','Attendance','Homework & Notices','Exams & Marks','Report Cards','Fees','Expenses & Budget','Owner Reports','Transport & Routes','Infrastructure & Assets','Parent Messages','AI Teacher Tools','Smart Tools','Opportunity Desk','Growth Passport','School Quality Score','Settings','Contact & Support']);
  function activeTab(){
    const nav=doc?.querySelector('.navigation .nav-item.active');
    const label=nav?.textContent?.trim().replace(/\s+/g,' ');
    return tabs.has(label)?label:null;
  }
  function targetButton(label){
    return [...(doc?.querySelectorAll('.navigation button.nav-item')||[])]
      .find(b=>b.textContent.trim().replace(/\s+/g,' ')===label);
  }
  function alignRoute(){
    const chosen=activeTab();
    if(!chosen)return;
    const url=new URL(root.location.href);
    const requested=url.searchParams.get('tab');
    if(!initialHandled){
      initialHandled=true;
      dashboardDeepLinkPending=requested==='Dashboard';
    }
    // The hosted ERP may hydrate a previous Settings tab *after* the first
    // Dashboard click. Keep the original deep-link authoritative through
    // hydration, but never override a user's actual sidebar click.
    if(dashboardDeepLinkPending){
      if(chosen==='Dashboard'){
        dashboardDeepLinkPending=false;
      }else{
        const button=targetButton('Dashboard');
        const now=Date.now();
        if(button&&routeAttempts<6&&now-lastRouteClick>=500){
          routeAttempts++;lastRouteClick=now;
          button.click();
          root.setTimeout?.(schedule,650);
        }
        // Do not falsely rewrite ?tab=Dashboard to Settings while a
        // post-login Dashboard route is still being recovered.
        if(routeAttempts<6||now-lastRouteClick<650)return;
        dashboardDeepLinkPending=false;
        const area=doc.querySelector('main')||doc.body;
        if(area&&!doc.getElementById('bn-dashboard-route-error')){
          const note=doc.createElement('p');
          note.id='bn-dashboard-route-error';
          note.setAttribute('role','alert');
          note.style.cssText='margin:12px;padding:12px;border:1px solid #f2be7a;border-radius:8px;background:#fff7e9;color:#7e4216;font:13px system-ui';
          note.textContent='Dashboard could not be opened after login. Your school data was not changed. Use Dashboard in the sidebar or refresh this page.';
          area.prepend(note);
        }
      }
    }
    if(chosen==='Dashboard')doc.getElementById('bn-dashboard-route-error')?.remove();
    if(requested!==chosen){
      url.searchParams.set('tab',chosen);
      root.history.replaceState(root.history.state,'',url.pathname+url.search+url.hash);
    }
  }
  function onNavClick(event){
    if(event.isTrusted&&event.target?.closest?.('.navigation .nav-item')){
      dashboardDeepLinkPending=false;
      doc.getElementById('bn-dashboard-route-error')?.remove();
    }
  }
  function cloudErrorActive(){
    const panel=doc?.getElementById('bn-cloud-publish-status');
    if(!panel||panel.hidden||panel.getAttribute('aria-hidden')==='true')return false;
    const style=root.getComputedStyle?.(panel);
    return (style?.display||panel.style.display)!=='none' && style?.visibility!=='hidden';
  }
  function badgeSafety(){
    // An in-flight save is not a successful save. The workspace controller's
    // cloud state takes precedence over any local optimistic status text.
    const state=root.BNWorkspaceOnlineGuard?.getStatus?.();
    const cloud=String(state?.status||'local');
    const conflict=cloud==='conflict'||cloudErrorActive();
    const issue=conflict||!!state?.problem;
    const saving=!issue&&['pending','syncing','loading'].includes(cloud);
    const warning=conflict?'Sync conflict — not published'
      :issue?'Cloud save failed — not published'
      :saving?'Saving to Supabase — not yet confirmed':'';
    const badge=doc?.querySelector('.bn-sync-status-badge');
    if(!badge)return;
    if(warning){
      if(issue){
        if(badge.getAttribute('aria-invalid')!=='true')badge.setAttribute('aria-invalid','true');
        if(badge.hasAttribute('aria-busy'))badge.removeAttribute('aria-busy');
      }else{
        if(badge.hasAttribute('aria-invalid'))badge.removeAttribute('aria-invalid');
        if(badge.getAttribute('aria-busy')!=='true')badge.setAttribute('aria-busy','true');
      }
      if(badge.getAttribute('aria-label')!==warning)badge.setAttribute('aria-label',warning);
      if(badge.dataset.bnCloudWarning!==warning){
        badge.dataset.bnCloudWarning=warning;
        badge.style.borderColor=issue?'#c66a17':'#3a7bad';
        badge.style.color=issue?'#874200':'#194f77';
        badge.style.background=issue?'#fff4e5':'#e8f4ff';
      }
      if(badge.title!==warning)badge.title=warning;
    }else if(badge.dataset.bnCloudWarning||badge.hasAttribute('aria-invalid')||badge.hasAttribute('aria-busy')){
      badge.removeAttribute('aria-invalid');
      badge.removeAttribute('aria-busy');
      badge.removeAttribute('aria-label');
      delete badge.dataset.bnCloudWarning;
      badge.style.removeProperty('border-color');
      badge.style.removeProperty('color');
      badge.style.removeProperty('background');
      badge.title='School cloud status. Click to connect, refresh, or recover a conflict.';
    }
  }
  async function readCloudCounts(){
    if(activeTab()!=='Dashboard')return;
    let school,staff,erp;
    try{
      staff=JSON.parse(root.sessionStorage?.getItem('bn_school_staff_session_v1')||'null');
      erp=JSON.parse(root.sessionStorage?.getItem('bright-nexa-school-os:session:v2')||'null');
      school=String(erp?.institutionId||'');
    }catch(_){school='';}
    const valid=erp?.cloudVerified===true&&erp?.role==='OWNER'&&!!staff?.access_token
      &&/^[a-f0-9-]{36}$/i.test(school);
    // A different sign-in, school, or logout must not reuse a previous readback.
    const identity=valid?school+':'+staff.access_token:null;
    if(identity!==cloudIdentity){
      cloudIdentity=identity;cloudCounts=null;lastReadAt=0;cloudRequestId++;
    }
    if(!valid||cloudReading)return;
    if(cloudCounts?.school===school&&Date.now()-lastReadAt<60000)return;
    cloudReading=true;lastReadAt=Date.now();
    const requestId=cloudRequestId;
    const base='https://mrfvbwmyxndrakskqyas.supabase.co/rest/v1/';
    const headers={'apikey':'sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT',
      'Authorization':'Bearer '+staff.access_token,'Prefer':'count=exact'};
    async function count(table,filters){
      const qs=new URLSearchParams({select:'id',institution_id:'eq.'+school,...filters});
      const response=await root.fetch(base+table+'?'+qs,{method:'HEAD',headers,cache:'no-store'});
      if(!response.ok)throw Error('Supabase count HTTP '+response.status);
      const range=response.headers?.get('content-range')||'';
      const m=range.match(/\/(\d+)$/);
      if(!m)throw Error('Supabase count not confirmed');
      return Number(m[1]);
    }
    try{
      const [students,teachers]=await Promise.all([
        count('school_students',{status:'eq.active'}),
        count('school_users',{role:'eq.teacher',status:'eq.active'})
      ]);
      // Prevent a late readback from another session changing this school's badge.
      const current=JSON.parse(root.sessionStorage?.getItem('bright-nexa-school-os:session:v2')||'null');
      if(requestId===cloudRequestId&&current?.institutionId===school&&current?.cloudVerified===true)
        cloudCounts={students,teachers,school};
    }catch(_){
      if(requestId===cloudRequestId)cloudCounts={error:'Supabase count could not be verified',school};
    }finally{cloudReading=false;schedule();}
  }
  function metricNotes(){
    if(activeTab()!=='Dashboard')return;
    for(const card of doc.querySelectorAll('.metric-grid .metric-card')){
      const content=(card.textContent||'').toLowerCase();
      // React can reuse metric cards when switching schools or logging out.
      delete card.dataset.bnCloudCount;
      delete card.dataset.bnAttendanceNote;
      delete card.dataset.bnFeesNote;
      let currentSchool=null;
      try{currentSchool=JSON.parse(root.sessionStorage?.getItem('bright-nexa-school-os:session:v2')||'null')?.institutionId;}catch(_){}
      if(cloudCounts?.school&&cloudCounts.school===currentSchool){
        if(content.includes('total students'))
          card.dataset.bnCloudCount=cloudCounts.error||('Supabase active students: '+cloudCounts.students);
        else if(content.includes('teachers')||content.includes('faculty'))
          card.dataset.bnCloudCount=cloudCounts.error||('Supabase active teachers: '+cloudCounts.teachers);
      }
      if(content.includes("today's attendance")){
        card.dataset.bnAttendanceNote='true';
        card.title='Percentage is based on attendance entries recorded today, not proof every enrolled student was marked or synced.';
      }
      if(content.includes('fees collected this month')){
        card.dataset.bnFeesNote='true';
        card.title='Amount and receipt count cover this month only. They come from the current ERP workspace; verify cloud status before treating them as published.';
      }
    }
  }
  function addStyles(){
    if(doc.getElementById('bn-dashboard-integrity-styles'))return;
    const style=doc.createElement('style');style.id='bn-dashboard-integrity-styles';
    style.textContent=[
      '.bn-sync-status-badge[data-bn-cloud-warning]{font-size:0!important}',
      '.bn-sync-status-badge[data-bn-cloud-warning]>*{display:none!important}',
      '.bn-sync-status-badge[data-bn-cloud-warning]::after{content:attr(data-bn-cloud-warning);display:inline-flex;align-items:center;font-size:12px!important;font-weight:700;white-space:normal;line-height:1.3}',
      '.dashboard-grid .panel-title .icon-button{display:none!important}',
      '.metric-grid .metric-card[data-bn-attendance-note="true"]::after{content:"Recorded entries only · verify coverage";display:block;font-size:11px;color:#64748b;line-height:1.4;margin-top:5px}',
      '.metric-grid .metric-card[data-bn-fees-note="true"]::after{content:"Current-month receipts · verify cloud";display:block;font-size:11px;color:#64748b;line-height:1.4;margin-top:5px}',
      '.metric-grid .metric-card[data-bn-cloud-count]::after{content:attr(data-bn-cloud-count);display:block;font-size:11px;color:#155a83;line-height:1.4;margin-top:5px}'
    ].join(' ');
    doc.head.append(style);
  }
  function neutralizeDecorativePanelControls(){
    if(activeTab()!=='Dashboard')return;
    // The panel heading component renders an icon-only button with NO click
    // handler. Do not leave a keyboard-focusable control that does nothing.
    for(const button of doc.querySelectorAll('.dashboard-grid .panel-title > button.icon-button')){
      if(button.disabled)continue;
      button.disabled=true;
      button.tabIndex=-1;
      button.setAttribute('aria-hidden','true');
      button.title='Section heading decoration';
      button.style.cursor='default';
    }
  }
  function scan(){if(!doc?.defaultView||!doc.body)return;alignRoute();badgeSafety();metricNotes();neutralizeDecorativePanelControls();void readCloudCounts();}
  function schedule(){
    if(scheduled)return;scheduled=true;
    (root.requestAnimationFrame||((fn)=>Promise.resolve().then(fn)))(()=>{scheduled=false;scan();});
  }
  function start(){
    if(started||!doc)return;started=true;
    const boot=()=>{
      addStyles();
      scan();
      const obs=new root.MutationObserver(schedule);
      obs.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','role','title','aria-label']});
      doc.addEventListener('click',onNavClick,true);
      root.addEventListener('popstate',schedule);
    };
    if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  }
  return {start,scan,activeTab,cloudErrorActive};
});
