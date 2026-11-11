/* Student profile presentation repair.
 * Does not edit stored records, Supabase permissions, forms or photo paths.
 * Delegates to the existing React Edit Record action; never fakes a cloud save.
 */
(function(root){
  'use strict';
  function repair(dialog){
    if(!dialog || !dialog.matches('[role="dialog"][aria-label$=" profile"]'))return;
    const header=dialog.querySelector('header');
    const edit=[...dialog.querySelectorAll('button')].find(b=>b.textContent.trim()==='Edit Record');
    if(!header || !edit)return;
    const tools=header.querySelector('button[aria-label="Close profile"]')?.parentElement;
    if(tools && !tools.querySelector('[data-bn-profile-edit-top]')){
      const btn=root.document.createElement('button');
      btn.type='button';
      btn.textContent='Edit details';
      btn.dataset.bnProfileEditTop='1';
      btn.setAttribute('aria-label','Edit student details');
      btn.style.cssText='padding:9px 13px;border:1px solid #bed6ed;border-radius:9px;background:#e9f5ff;color:#0b315e;font-size:13px;font-weight:750;white-space:nowrap';
      btn.addEventListener('click',()=>{
        const action=[...dialog.querySelectorAll('button')].find(b=>b.textContent.trim()==='Edit Record'&&!b.disabled);
        if(action)action.click();
      });
      tools.prepend(btn);
    }
    if(!dialog.dataset.bnProfileUx){
      dialog.dataset.bnProfileUx='1';
      dialog.style.width='min(920px, calc(100vw - 32px))';
      dialog.style.maxWidth='calc(100vw - 32px)';
      dialog.style.maxHeight='calc(100dvh - 32px)';
    }
    // The same photo is already in the profile heading. Keep attachments,
    // and never remove or change the photo in the student record.
    const avatar=header.querySelector('.record-profile-heading img');
    if(!avatar)return;
    const photo=[...dialog.querySelectorAll('.stored-identity-card')].find(card=>
      card.querySelector('strong')?.textContent.trim()==='Student Photograph');
    const second=photo?.querySelector('img');
    if(photo && second && second.getAttribute('src')===avatar.getAttribute('src')){
      photo.hidden=true;
      photo.style.display='none';
      const grid=photo.parentElement;
      if(grid && [...grid.children].every(child=>child.hidden))grid.style.display='none';
    }
  }
  function scan(){
    root.document.querySelectorAll('[role="dialog"][aria-label$=" profile"]').forEach(repair);
  }
  function start(){
    const observer=new MutationObserver(scan);
    observer.observe(root.document.body,{childList:true,subtree:true});
    scan();
  }
  if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})(typeof window!=='undefined'?window:globalThis);
