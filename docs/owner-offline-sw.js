/* Offline shell for school owner ONLY. Never cache Auth, REST, API or other users' pages.
   No student records in CacheStorage: sensitive records live encrypted in IndexedDB. */
'use strict';
const CACHE='bright-nexa-owner-shell-v7';
const FILES=['real-owner-workspace.html','real-owner-workspace.js','school-owner-shell.css','school-owner-navigation.js','school-owner-settings.js','school-phase-a-reports.js','school-phase-a-reports-ui.js','school-phase-a-daily.js','school-phase-a-daily-ui.js','school-extra-modules.js','school-fee-ledger.js','school-backup-core.js','school-auto-backup.js','school-auto-backup-ui.js','school-admin-data.js','smart-tools-engine.js','school-xlsx-reader.js','school-phase4-academics.js','school-phase4-import-ui.js','offline-vault.js','owner-offline-ui.js'];
const allowed=new Set(FILES);
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.allSettled(FILES.map(file=>cache.add(new Request('./'+file,{cache:'reload'}))));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    await Promise.all((await caches.keys()).filter(x=>x.startsWith('bright-nexa-owner-shell-')&&x!==CACHE).map(x=>caches.delete(x)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET'||req.mode==='navigate'&&new URL(req.url).origin!==self.location.origin)return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin || !allowed.has(url.pathname.split('/').pop()))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try {
      const res=await fetch(req,{cache:'no-store'});
      if(res.ok){await cache.put(req,res.clone());return res;}
      return (await cache.match(req,{ignoreSearch:true}))||res;
    } catch(e) {
      const cached=await cache.match(req,{ignoreSearch:true});
      if(cached)return cached;
      throw e;
    }
  })());
});
