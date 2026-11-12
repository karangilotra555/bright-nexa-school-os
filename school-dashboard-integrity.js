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
  function metricNotes(){
    if(activeTab()!=='Dashboard')return;
    for(const card of doc.querySelectorAll('.metric-grid .metric-card')){
      const content=(card.textContent||'').toLowerCase();
      if(content.includes("today's attendance")){
        card.dataset.bnAttendanceNote='true';
        card.title='Percentage is based on attendance entries recorded today, not proof every enrolled student was marked or synced.';
      }
      if(content.includes('fees collected this month')){
        card.dataset.bnFeesNote='true';
        card.title='Amount is filtered to this month. The existing receipt count covers all dates in this browser workspace; check cloud confirmation.';
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
      '.metric-grid .metric-card[data-bn-fees-note="true"]::after{content:"Receipt count includes all dates";display:block;font-size:11px;color:#64748b;line-height:1.4;margin-top:5px}'
    ].join('\\n');
    doc.head.append(style);
  }
  function scan(){alignRoute();badgeSafety();metricNotes();}
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
