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
  let cloudCounts=null,cloudReading=false,lastReadAt=0;
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
      // The URL is authoritative when arriving at a direct dashboard link.
      // React may hydrate an old tab from the same browser session.
      if(requested==='Dashboard'&&chosen!=='Dashboard'){
        const dashboard=targetButton('Dashboard');
        if(dashboard){dashboard.click();return;}
      }
    }
    if(requested!==chosen){
      url.searchParams.set('tab',chosen);
      root.history.replaceState(root.history.state,'',url.pathname+url.search+url.hash);
    }
  }
  function cloudErrorActive(){
    const panel=doc?.getElementById('bn-cloud-publish-status');
    if(!panel||panel.getAttribute('role')!=='alert')return false;
    const style=root.getComputedStyle?.(panel);
    return (style?.display||panel.style.display)!=='none';
  }
  function badgeSafety(){
    const badge=doc?.querySelector('.bn-sync-status-badge');
    if(!badge)return;
    const issue=cloudErrorActive();
    if(issue&&badge.getAttribute('aria-invalid')!=='true'){
      badge.setAttribute('aria-invalid','true');
      badge.setAttribute('aria-label','Sync conflict — not published');
      badge.style.borderColor='#c66a17';
      badge.style.color='#874200';
      badge.style.background='#fff4e5';
      badge.title='The school has an unresolved cloud error. Browser records are not confirmed in Supabase. Review the sync conflict panel.';
    }else if(!issue&&badge.getAttribute('aria-invalid')==='true'){
      badge.removeAttribute('aria-invalid');
      badge.removeAttribute('aria-label');
      badge.style.removeProperty('border-color');
      badge.style.removeProperty('color');
      badge.style.removeProperty('background');
      badge.title='School cloud status. Click to connect, refresh, or recover a conflict.';
    }
  }
  async function readCloudCounts(){
    if(activeTab()!=='Dashboard'||cloudReading||Date.now()-lastReadAt<60000)return;
    let school,staff,erp;
    try{
      staff=JSON.parse(root.sessionStorage?.getItem('bn_school_staff_session_v1')||'null');
      erp=JSON.parse(root.sessionStorage?.getItem('bright-nexa-school-os:session:v2')||'null');
      school=String(erp?.institutionId||'');
    }catch(_){return;}
    if(erp?.cloudVerified!==true||erp?.role!=='OWNER'||!staff?.access_token
      ||!/^[a-f0-9-]{36}$/i.test(school))return;
    cloudReading=true;lastReadAt=Date.now();
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
      if(current?.institutionId===school&&current?.cloudVerified===true)cloudCounts={students,teachers,school};
    }catch(_){cloudCounts={error:'Cloud count readback unavailable',school};}
    finally{cloudReading=false;schedule();}
  }
  function metricNotes(){
    if(activeTab()!=='Dashboard')return;
    for(const card of doc.querySelectorAll('.metric-grid .metric-card')){
      const content=(card.textContent||'').toLowerCase();
      if(cloudCounts?.school){
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
      '.bn-sync-status-badge[aria-invalid="true"] span:nth-child(2){font-size:0!important}',
      '.bn-sync-status-badge[aria-invalid="true"] span:nth-child(2)::after{content:"Sync conflict — not published";font-size:12px;font-weight:700}',
      '.metric-grid .metric-card[data-bn-attendance-note="true"]::after{content:"Recorded entries only · verify coverage";display:block;font-size:11px;color:#64748b;line-height:1.4;margin-top:5px}',
      '.metric-grid .metric-card[data-bn-fees-note="true"]::after{content:"Current-month receipts · verify cloud";display:block;font-size:11px;color:#64748b;line-height:1.4;margin-top:5px}',
      '.metric-grid .metric-card[data-bn-cloud-count]::after{content:attr(data-bn-cloud-count);display:block;font-size:11px;color:#155a83;line-height:1.4;margin-top:5px}'
    ].join(' ');
    doc.head.append(style);
  }
  function scan(){if(!doc?.defaultView||!doc.body)return;alignRoute();badgeSafety();metricNotes();void readCloudCounts();}
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
      obs.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','role']});
      root.addEventListener('popstate',schedule);
    };
    if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  }
  return {start,scan,activeTab,cloudErrorActive};
});
