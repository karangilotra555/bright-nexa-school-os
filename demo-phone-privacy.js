/* Standalone safety display guard for the PUBLIC FICTIONAL demo only.
 * Does not read or write actual school APIs, browser storage, or editable fields.
 * Uses text nodes rather than fragile compiled React class names.
 */
(() => {
  'use strict';
  const phonePattern=/(?<![0-9])([6-9][0-9]{2})[0-9]{5}([0-9]{2})(?![0-9])/g;
  function isProfileDialog(dialog) {
    if (dialog.classList?.contains('student-profile-modal')) return true;
    if (/student\s+profile/i.test(dialog.getAttribute?.('aria-label') || '')) return true;
    const heading=dialog.querySelector?.('h1,h2,h3,[class*="modal-title"],[class*="modal-heading"]');
    return /\bstudent\s+profile\b/i.test(heading?.textContent || '');
  }
  function maskStudentProfiles() {
    for(const dialog of document.querySelectorAll('[role="dialog"],.student-profile-modal')){
      if(!isProfileDialog(dialog))continue;
      const walker=document.createTreeWalker(dialog,NodeFilter.SHOW_TEXT);
      let textNode;
      while((textNode=walker.nextNode())){
        const parent=textNode.parentElement;
        if(!parent || parent.closest('input,textarea,script,style,[contenteditable="true"]'))continue;
        const before=textNode.nodeValue || '';
        const after=before.replace(phonePattern,'$1*****$2');
        if(after!==before)textNode.nodeValue=after;
      }
    }
  }
  function start(){
    // Mark script as running for debugging. It does not contain any personal data.
    document.documentElement.dataset.demoPhonePrivacy='active';
    // MutationObserver executes before a new modal is painted in a normal DOM update.
    const observer=new MutationObserver(maskStudentProfiles);
    observer.observe(document.body,{subtree:true,childList:true,characterData:true});
    maskStudentProfiles();
    window.addEventListener('pageshow',maskStudentProfiles);
  }
  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',start,{once:true});
  }else{start();}
})();
