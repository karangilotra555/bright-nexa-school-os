/* Bright Nexa School OS: non-invasive Parents App navigation.
 * The school UI is precompiled; this mounts alongside React and does not touch
 * student records, admin data or authentication/session state.
 */
(() => {
  'use strict';
  const target = './parent-app-download.html';
  const navId = 'bn-parents-app-nav';
  const topId = 'bn-parents-app-top';
  function mount(){
    const nav = document.querySelector('.navigation');
    if(nav && !document.getElementById(navId)){
      const link=document.createElement('a');
      link.id=navId;
      link.className='nav-item';
      link.href=target;
      link.title='Download or share Bright Nexa Parents App';
      link.style.textDecoration='none';
      link.style.display='flex';
      link.style.alignItems='center';
      const icon=document.createElement('span');
      icon.textContent='📱';
      icon.setAttribute('aria-hidden','true');
      icon.style.fontSize='17px';
      const label=document.createElement('span');
      label.textContent='Parents App · Download';
      link.append(icon,label);
      nav.appendChild(link);
    }
    const actions=document.querySelector('.topbar-actions');
    if(actions && !document.getElementById(topId)){
      const link=document.createElement('a');
      link.id=topId;
      link.className='secondary-button compact';
      link.href=target;
      link.textContent='📱 Parents App';
      link.title='Parents App download and share';
      link.style.textDecoration='none';
      link.style.whiteSpace='nowrap';
      link.style.display='inline-flex';
      link.style.alignItems='center';
      link.style.justifyContent='center';
      actions.insertBefore(link,actions.firstChild);
    }
  }
  const observer=new MutationObserver(mount);
  function start(){
    mount();
    observer.observe(document.body,{subtree:true,childList:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();