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
    const label=nav?.textContent?.trim().replace(/\\s+/g,' ');
    return tabs.has(label)?label:null;
  }
  function targetButton(label){
    return [...(doc?.querySelectorAll('.navigation button.nav-item')||[])]
      .find(b=>b.textContent.trim().replace(/\\s+/g,' ')===label);
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
    const spans=[...badge.querySelectorAll('span')];
    if(spans.length<2)return;
    const label=spans[1];
    const issue=cloudErrorActive();
    if(issue){
      if(!badge.dataset.bnOriginalText)badge.dataset.bnOriginalText=label.textContent||'';
      if(label.textContent!=='Sync issue — not published')label.textContent='Sync issue — not published';
      badge.setAttribute('aria-invalid','true');
      badge.style.borderColor='#c66a17';
      badge.style.color='#874200';
      badge.style.background='#fff4e5';
      badge.title='The school has an unresolved cloud error. Do not treat browser records as published. Review the sync conflict panel.';
      if(spans[2])spans[2].style.background='#c66a17';
    }else if(badge.hasAttribute('aria-invalid')){
      badge.removeAttribute('aria-invalid');
      if(label.textContent==='Sync issue — not published')label.textContent=badge.dataset.bnOriginalText||'Check sync status';
      delete badge.dataset.bnOriginalText;
      badge.style.removeProperty('border-color');
      badge.style.removeProperty('color');
      badge.style.removeProperty('background');
      badge.title='School cloud status. Click to connect, refresh, or recover a conflict.';
      if(spans[2])spans[2].style.removeProperty('background');
    }
  }
  function metricNotes(){
    if(activeTab()!=='Dashboard')return;
    for(const card of doc.querySelectorAll('.metric-grid .metric-card')){
      const text=(card.textContent||'').toLowerCase();
      if(text.includes("today's attendance")){
        const hint='Percentage covers recorded attendance entries only; not proof every enrolled student was marked. Check attendance coverage and cloud sync.';
        card.title=hint;
        if(!card.querySelector('[data-bn-metric-note="attendance"]')){
          const small=doc.createElement('small');small.dataset.bnMetricNote='attendance';small.textContent='Recorded entries only · verify coverage';
          small.style.cssText='display:block;color:#64748b;font-size:11px;line-height:1.4;margin-top:4px';
          card.append(small);
        }
      }
      if(text.includes('fees collected this month')){
        const helper=[...card.querySelectorAll('small,span,div,p')].find(n=>/^\\d+ valid receipts$/.test((n.textContent||'').trim()));
        if(helper)helper.textContent=helper.textContent.replace('valid receipts','receipts (all dates)');
        card.title='Collected amount is for the current month; the receipt count includes all dates in the browser workspace. Cloud confirmation must be checked separately.';
      }
    }
  }
  function scan(){alignRoute();badgeSafety();metricNotes();}
  function schedule(){
    if(scheduled)return;scheduled=true;
    (root.requestAnimationFrame||((fn)=>Promise.resolve().then(fn)))(()=>{scheduled=false;scan();});
  }
  function start(){
    if(started||!doc)return;started=true;
    const boot=()=>{
      scan();
      const obs=new root.MutationObserver(schedule);
      obs.observe(doc.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style','role']});
      root.addEventListener('popstate',schedule);
    };
    if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  }
  return {start,scan,activeTab,cloudErrorActive};
});
