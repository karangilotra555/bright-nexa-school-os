/* Atomic cloud hydration; stale remote results must never survive in the offline store. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.BNWorkspacePersistence=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function create({open,getLatest,getVersion=()=>JSON.stringify(getLatest())}) {
    async function write(read) {
      const db=await open();
      const snapshot=read();
      if(!snapshot)return false;
      await new Promise((resolve,reject)=>{
        const tx=db.transaction('records','readwrite');
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||Error('Workspace storage failed'));tx.onabort=()=>reject(tx.error||Error('Workspace storage aborted'));
        const store=tx.objectStore('records');
        store.put(snapshot.institution,'snapshot');store.put(snapshot.students,'students');store.put(snapshot.operations,'operations');
      });
      return true;
    }
    async function apply(snapshot,canApply=()=>true) {
      const before=getVersion();
      const valid=()=>canApply()&&getVersion()===before;
      if(!valid())return false;
      if(!await write(()=>valid()?snapshot:null))return false;
      if(valid())return true;
      // A local edit committed while the remote transaction was pending. Restore
      // all three records from current state; subsequent local writes queue after it.
      await write(()=>getLatest());
      return false;
    }
    return {apply};
  }
  return {create};
});
