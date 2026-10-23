/* Retire cached legacy React homepage so the public root shows role login.
   Never touch school records in localStorage or IndexedDB. */
(() => {
  'use strict';
  const key='bn-secure-entry-sw-cleanup-20261023';
  async function retire(){
    if(!('serviceWorker' in navigator))return;
    let controlled=Boolean(navigator.serviceWorker.controller);
    try{
      const regs=await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r=>r.unregister()));
      if('caches' in window){
        const names=await caches.keys();
        await Promise.all(names.filter(n=>n.includes('workbox-precache')).map(n=>caches.delete(n)));
      }
    }catch{return}
    if(controlled && sessionStorage.getItem(key)!=='done'){
      sessionStorage.setItem(key,'done');
      location.reload();
    }
  }
  retire();
})();