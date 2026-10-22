/* Bright Nexa: direct-links to tools outside the React SPA router.
 * These are independent static HTML pages, not React "screens".
 * This file is a navigation shim only; it never touches school data.
 */
(() => {
  'use strict';

  const destinations = Object.freeze({
    parents: {path:'parent-app-download.html', icon:'📱', title:'Parents App · Download', tooltip:'Download or share the parents app'},
    teachers: {path:'teacher-access.html', icon:'👩‍🏫', title:'Teachers · Online Access', tooltip:'Teacher and staff secure login'},
    smart: {path:'smart-tools.html', icon:'🧠', title:'Smart Tools · No API', tooltip:'Timetable, substitutes, performance and audits'}
  });

  const elementId = (type, place) => 'bn-'+type+'-'+place;
  // App-internal React navigation can intercept ordinary <a> clicks at the
  // root capture/bubble phase. Capture at window and perform real page
  // navigation before the SPA can swallow or prevent the click.
  function directNavigate(event) {
    if (event.defaultPrevented || (event.button !== undefined && event.button !== 0) ||
        event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const target=event.target;
    if (!target || typeof target.closest !== 'function') return;
    const anchor=target.closest('a[data-bn-direct-link]');
    if (!anchor) return;
    const kind=anchor.dataset.bnDirectLink;
    const spec=destinations[kind];
    if (!spec) return;
    if (anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;

    // Ignore spoofed targets injected by other parts of the page.
    const expected=new URL('./'+spec.path, document.baseURI);
    const actual=new URL(anchor.href, document.baseURI);
    if (actual.href !== expected.href || actual.origin !== window.location.origin) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
    window.location.assign(expected.href);
  }
  window.addEventListener('click', directNavigate, true);

  function appendLink(parent,kind,place) {
    const spec=destinations[kind],id=elementId(kind,place);
    if (!parent || document.getElementById(id)) return;
    const link=document.createElement('a');
    link.id=id;
    link.href='./'+spec.path;
    link.dataset.bnDirectLink=kind;
    link.title=spec.tooltip;
    link.setAttribute('aria-label',spec.title);
    link.className=place==='nav'?'nav-item':'secondary-button compact';
    link.style.textDecoration='none';
    link.style.display='inline-flex';
    link.style.alignItems='center';
    link.style.cursor='pointer';
    link.style.pointerEvents='auto';
    link.style.position='relative';
    if(place==='nav'){
      link.style.width='100%';
      link.style.gap='12px';
      link.style.zIndex='1';
      const emoji=document.createElement('span');
      emoji.textContent=spec.icon;
      emoji.style.fontSize='17px';
      emoji.setAttribute('aria-hidden','true');
      const label=document.createElement('span');
      label.textContent=spec.title;
      link.append(emoji,label);
      parent.append(link);
    }else{
      link.textContent=spec.icon+' '+(kind==='smart'?'Smart Tools':kind==='teachers'?'Teachers':'Parents App');
      link.style.whiteSpace='nowrap';
      link.style.justifyContent='center';
      parent.insertBefore(link,parent.firstChild);
    }
  }

  let mounting=false;
  function mount() {
    if (mounting) return;
    mounting=true;
    try {
      const nav=document.querySelector('.navigation');
      const actions=document.querySelector('.topbar-actions');
      for(const kind of Object.keys(destinations)){
        appendLink(nav,kind,'nav');
        appendLink(actions,kind,'top');
      }
    }finally{mounting=false;}
  }
  const observer=new MutationObserver(mount);
  function start(){
    mount();
    observer.observe(document.body,{subtree:true,childList:true});
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
