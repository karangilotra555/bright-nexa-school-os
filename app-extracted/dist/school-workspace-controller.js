/* Full-workspace sync. No authentication or UI ownership; callers confirm school selection. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.BNWorkspaceController=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var PREFIX='bn.workspace.v1.';
  function clone(v){return JSON.parse(JSON.stringify(v));}
  function canonical(value){if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().filter(function(k){return value[k]!==undefined;}).map(function(k){return JSON.stringify(k)+':'+canonical(value[k]);}).join(',')+'}';return JSON.stringify(value);}
  // Non-cryptographic, deterministic 128-bit content checksum, used solely for
  // detecting local/cloud changes (never for authentication or authorization).
  // Legacy "fingerprints" serialized the ENTIRE school JSON into localStorage.
  function hashCanonical(value){
    var a=0x811c9dc5,b=0x9e3779b9,c=0x85ebca6b,d=0xc2b2ae35;
    for(var i=0;i<value.length;i++){
      var x=value.charCodeAt(i);
      a=Math.imul(a^x,0x01000193)>>>0;
      b=Math.imul(b^(x+i),0x27d4eb2d)>>>0;
      c=Math.imul(c+x,0x85ebca77)>>>0;
      d=Math.imul(d^(x<<16|x),0xc2b2ae3d)>>>0;
    }
    return 'v2:'+value.length+':'+[a,b,c,d].map(function(x){return x.toString(16).padStart(8,'0');}).join('');
  }
  function fingerprint(value){return hashCanonical(canonical(value));}
  function institutionId(s){return s&&s.institution&&s.institution.institution&&s.institution.institution.id;}
  function create(options){
    var o=options, storage=o.storage, binding=null, record=null, disk=null, generation=0, running=null, status='local', lastError=null, serial=0, disposed=false, saving=Promise.resolve(), missingPendingRecovery=false, retryTimer=null, retryFailures=0;
    // Retry only transient errors. Cloud revision conflicts, school identity,
    // invalid projections, RLS and missing recovery backups require intervention.
    function transient(error){
      var code=Number(error&&error.status);
      if([408,425,429].includes(code)||(code>=500&&code<=599))return true;
      if(code>=400)return false;
      if(error&&error.code==='CLOUD_TIMEOUT')return true;
      return /failed to fetch|fetch failed|network|offline|timed out|temporary|connection reset|networkerror|econnreset|load failed/i.test(String(error&&error.message||''));
    }
    function clearRetry(){
      if(retryTimer!==null){
        if(typeof o.cancelRetry==='function')o.cancelRetry(retryTimer);
        else if(typeof clearTimeout==='function')clearTimeout(retryTimer);
        retryTimer=null;
      }
    }
    function scheduleRetry(error){
      if(disposed||!binding||!record?.pending||status==='conflict'||!transient(error)||retryTimer!==null)return false;
      var schedule=typeof o.scheduleRetry==='function'?o.scheduleRetry:
        typeof window!=='undefined'&&typeof window.setTimeout==='function'?window.setTimeout.bind(window):null;
      if(!schedule)return false;
      ++retryFailures;
      var delay=Math.min(30000,1200*Math.pow(2,Math.min(retryFailures-1,5))),token;
      token=schedule(async function(){
        if(retryTimer!==token)return;
        retryTimer=null;
        if(disposed||status==='conflict'||!binding||!record?.pending)return;
        if(typeof window!=='undefined'&&window.navigator?.onLine===false)return;
        return flush();
      },delay);
      retryTimer=token;
      return true;
    }
    function resumeOnline(){
      if(disposed||status==='conflict'||!binding||!record?.pending)return;
      clearRetry();
      Promise.resolve(flush()).catch(function(error){failed(error);});
    }
    if(typeof window!=='undefined'&&window.addEventListener)window.addEventListener('online',resumeOnline);
    function bindingKey(id){return PREFIX+'binding.'+encodeURIComponent(id);}
    function recordKey(b){return PREFIX+'school.'+encodeURIComponent(b.localId)+'.'+encodeURIComponent(b.schoolId);}
    function state(){return {status:status,binding:!!binding,schoolId:binding&&binding.schoolId,localId:binding&&binding.localId,revision:record&&record.revision,pending:!!(record&&(record.pending||record.pendingRef)),error:lastError};}
    function notify(s,error){if(disposed)return;if(s==='synced'){retryFailures=0;clearRetry();}else if(s==='conflict'||s==='local')clearRetry();status=s;lastError=error||null;if(o.onStatus)o.onStatus(s,state());if(error&&o.onError)o.onError(error);if(typeof window!=='undefined'&&window.BNWorkspaceOnlineGuard)window.BNWorkspaceOnlineGuard.update(s,error);}
    function error(message){return new Error(message);}
    function changed(){var e=error('Another tab changed this school. Local records were retained.');e.code='CONFLICT';return e;}
    function watch(schoolId,localId){var values={};function add(b){[bindingKey(b.localId),recordKey(b)].forEach(function(k){if(!Object.prototype.hasOwnProperty.call(values,k))values[k]=storage.getItem(k);});}if(binding)add(binding);add({schoolId:String(schoolId),localId:String(localId)});return {add:add,valid:function(){return Object.keys(values).every(function(k){return storage.getItem(k)===values[k];});},check:function(){if(!this.valid())throw changed();}};}
    // Commit the binding record only after the browser confirms the write.
    // On quota failures the whole pending snapshot is stored in IndexedDB,
    // leaving a small durable pointer in localStorage.
    function saveValue(next,value){storage.setItem(recordKey(binding),value);disk=value;Object.assign(record,next);}
    function pendingStorageAvailable(){return !!o.pendingStorage||canUseBackupDb();}
    function quotaError(e){return !!e&&(e.name==='QuotaExceededError'||e.code===22||/quota exceeded|storage quota|quotaexceeded/i.test(String(e.message||'')));}
    function canUseBackupDb(){return typeof window!=='undefined'&&window.indexedDB&&typeof window.indexedDB.open==='function';}
    // Large immutable snapshots belong in IndexedDB, never in the tiny
    // localStorage quota used for the active sync binding and pending edit.
    function backupToDb(key,value){
      return new Promise(function(resolve,reject){
        var request=window.indexedDB.open('bn-workspace-recovery-v1',1),db,settled=false;
        function fail(e){if(settled)return;settled=true;try{db&&db.close();}catch(_){}reject(e||error('Browser recovery storage is unavailable. No school records were replaced.'));}
        request.onblocked=function(){fail(error('Close other School OS tabs to unlock the recovery storage.'));};
        request.onerror=function(){fail(request.error);};
        request.onupgradeneeded=function(){request.result.createObjectStore('backups');};
        request.onsuccess=function(){
          if(settled){request.result.close();return;}db=request.result;
          try{
            var tx=db.transaction('backups','readwrite');
            tx.objectStore('backups').put(value,key);
            tx.onerror=function(){fail(tx.error);};
            tx.onabort=function(){fail(tx.error);};
            tx.oncomplete=function(){
              try{
                var check=db.transaction('backups','readonly').objectStore('backups').get(key);
                check.onerror=function(){fail(check.error);};
                check.onsuccess=function(){
                  if(check.result!==value){fail(error('Browser backup read-back failed. Local records were preserved.'));return;}
                  if(!settled){settled=true;db.close();resolve();}
                };
              }catch(e){fail(e);}
            };
          }catch(e){fail(e);}
        };
      });
    }
    function readBackupFromDb(key){
      return new Promise(function(resolve,reject){
        if(!canUseBackupDb())return reject(error('Recovery storage unavailable. Pending edits cannot be verified.'));
        var req=window.indexedDB.open('bn-workspace-recovery-v1',1),db;
        req.onerror=function(){reject(req.error||error('Cannot open pending recovery store.'));};
        req.onupgradeneeded=function(){req.result.createObjectStore('backups');};
        req.onsuccess=function(){
          db=req.result;
          try{
            var tx=db.transaction('backups','readonly'),get=tx.objectStore('backups').get(key);
            get.onerror=function(){db.close();reject(get.error||error('Pending edit cannot be read.'));};
            get.onsuccess=function(){var value=get.result;db.close();resolve(value);};
          }catch(e){db.close();reject(e);}
        };
      });
    }
    async function pendingRead(key){
      return o.pendingStorage?o.pendingStorage.read(key):readBackupFromDb(key);
    }
    async function pendingWrite(key,value){
      if(o.pendingStorage)await o.pendingStorage.write(key,value);
      else await backupToDb(key,value);
      if(await pendingRead(key)!==value)throw error('Pending edit backup verification failed. The school was not synchronized.');
    }
    async function migrateLegacyBackups(){
      if(!canUseBackupDb()||!Number.isInteger(storage.length)||typeof storage.key!=='function')return 0;
      var keys=[];for(var i=0;i<storage.length;i++){var k=storage.key(i);if(k&&k.indexOf(PREFIX+'backup.')===0)keys.push(k);}
      var moved=0;
      for(var k of keys){
        var value=storage.getItem(k);if(value===null)continue;
        await backupToDb(k,value); // read-back verified before deleting the source
        if(storage.getItem(k)===value){storage.removeItem(k);moved++;}
      }
      return moved;
    }
    function persist(next){
      var b=binding,r=record,desired={...(next||record)};
      if(desired.pending)desired.pending=clone(desired.pending);
      // Serialized writes prevent a slow IndexedDB quota fallback from
      // overwriting a newer edit captured in the same browser tab.
      var task=saving.then(async function(){
        if(!b||!r||binding!==b||record!==r)throw changed();
        var key=recordKey(b);
        if(disk!==null&&storage.getItem(key)!==disk)throw changed();
        var small={...desired,pendingRef:null};
        var value=JSON.stringify(small);
        var usePendingDb=!!(desired.pending&&r.pendingRef&&pendingStorageAvailable());
        if(!usePendingDb){
          try{saveValue(small,value);return;}
          catch(e){
            if(!quotaError(e))throw e;
            if(canUseBackupDb()){
              await migrateLegacyBackups();
              if(binding!==b||record!==r||(disk!==null&&storage.getItem(key)!==disk))throw changed();
              try{saveValue(small,value);return;}catch(retryError){if(!quotaError(retryError))throw retryError;}
            }
            if(!desired.pending||!pendingStorageAvailable())throw e;
          }
        }
        var ref=PREFIX+'pending.'+encodeURIComponent(b.schoolId)+'.'+Date.now()+'.'+(++serial)+'.'+Math.random().toString(36).slice(2);
        await pendingWrite(ref,JSON.stringify(desired.pending));
        if(binding!==b||record!==r||(disk!==null&&storage.getItem(key)!==disk))throw changed();
        var marker={...desired,pending:null,pendingRef:ref},metadata=JSON.stringify(marker);
        storage.setItem(key,metadata);
        disk=metadata;
        Object.assign(record,{...desired,pendingRef:ref});
      });
      saving=task.catch(function(){});
      return task;
    }
    function consistent(){return binding&&storage.getItem(bindingKey(binding.localId))===JSON.stringify(binding)&&storage.getItem(recordKey(binding))===disk;}
    function sameInstitution(snapshot){return binding&&String(institutionId(snapshot))===binding.localId;}
    function conflict(e){notify('conflict',e||error('Another tab changed this school. Reload explicitly to preserve and resolve local changes.'));}
    function failed(e){if(e&&(e.status===409||e.code==='CONFLICT'||/conflict|revision/i.test(e.message||''))){conflict(e);return;}var willRetry=scheduleRetry(e);notify('pending',willRetry&&retryFailures<=2?null:e);}
    async function backup(snapshot){
      if(o.backup){await o.backup(clone(snapshot));return;}
      var key=PREFIX+'backup.'+Date.now()+'.'+(++serial)+'.'+Math.random().toString(36).slice(2);
      var value=JSON.stringify(snapshot);
      if(canUseBackupDb()){
        await migrateLegacyBackups();
        await backupToDb(key,value);
        return;
      }
      storage.setItem(key,value);
      if(storage.getItem(key)!==value)throw error('Local backup could not be verified. School was not opened.');
    }
    // Only a verified owner explicitly opening the existing school can
    // resolve a restored-device conflict automatically. The existing
    // openSchool() takes verified backups of the live and pending copies
    // before applying any cloud data. Never upload either local copy here.
    function verifiedExplicitOpen(){
      if(!binding||typeof window==='undefined'||!window.sessionStorage)return false;
      try{
        var params=new URLSearchParams(window.location.search||'');
        if(params.get('openSchool')!=='true')return false;
        var account=JSON.parse(window.sessionStorage.getItem('bright-nexa-school-os:session:v2')||'null');
        var staff=JSON.parse(window.sessionStorage.getItem('bn_school_staff_session_v1')||'null');
        return account?.cloudVerified===true && account?.role==='OWNER'
          && String(account?.institutionId||'')===String(binding.schoolId)
          && typeof staff?.access_token==='string' && !!staff.access_token;
      }catch(_){return false;}
    }
    async function initialize(){
      // Migrate only our own verified legacy backups. Never clear pending edits,
      // school records, or unrelated browser keys to make room.
      try{await migrateLegacyBackups();}catch(_){ /* later backup/persist reports the actionable error */ }
      var id=institutionId(o.getSnapshot());binding=null;record=null;disk=null;
      if(id!=null){var saved=storage.getItem(bindingKey(String(id)));if(saved){binding=JSON.parse(saved);disk=storage.getItem(recordKey(binding));record=disk?JSON.parse(disk):null;if(!record)binding=null;}}
      missingPendingRecovery=false;
      if(record&&record.pendingRef){
        try{
          var queued=await pendingRead(record.pendingRef);
          if(typeof queued!=='string')throw error('Saved pending edit is missing from browser recovery storage.');
          record.pending=JSON.parse(queued);
          if(String(institutionId(record.pending))!==binding.localId)throw error('Pending edit belongs to another school.');
        }catch(e){
          missingPendingRecovery=true;
          conflict(error('Pending changes could not be verified: '+e.message+'. Browser data has not been cleared or uploaded. Do not open or overwrite this school until recovery storage is available.'));
          return state();
        }
      }
      // Migrate old unbounded fingerprints without changing any school data.
      // Hash the existing stored canonical string, which may refer to the last
      // cloud-acknowledged revision rather than the current pending edit.
      if(record&&typeof record.fingerprint==='string'&&!record.fingerprint.startsWith('v2:')){
        try{await persist({...record,fingerprint:hashCanonical(record.fingerprint)});}
        catch(e){
          conflict(error('Could not upgrade browser sync metadata without deleting records: '+e.message));
          return state();
        }
      }
      if(binding&&((record.pending&&fingerprint(record.pending)!==fingerprint(o.getSnapshot()))||(!record.pending&&record.fingerprint!==fingerprint(o.getSnapshot())))){
        conflict(error('Saved browser records differ from the school workspace. No local changes were uploaded.'));
        if(verifiedExplicitOpen()){
          // Verified explicit login: back up current and queued records, then
          // reopen the authorized cloud copy without publishing local edits.
          try{await openSchool(binding.schoolId);}
          catch(_){ /* openSchool retains an actionable conflict/error state */ }
        }
        return state();
      }
      notify(binding?'pending':'local');
      if(binding&&record&&record.pending)scheduleRetry({code:'CLOUD_TIMEOUT'});
      return state();
    }
    async function flush(){
      if(running)return running;
      clearRetry();
      if(!binding||!record||!record.pending||status==='conflict')return state();
      if(!sameInstitution(o.getSnapshot())){binding=null;record=null;notify('local');return state();}
      running=(async function(){
        while(binding&&record&&record.pending&&status!=='conflict'){
          if(!consistent()){conflict();break;}
          var b=binding,r=record,snapshot=clone(r.pending),sentGeneration=generation;
          try{
            var result=await o.client.push(b.schoolId,r.revision,snapshot,o.buildProjection?o.buildProjection(snapshot):undefined);
            if(binding!==b||record!==r)break;
            if(!consistent()){conflict();break;}
            var acknowledged={...r,revision:result.revision,fingerprint:fingerprint(snapshot),
              pending:generation===sentGeneration&&r.pending&&fingerprint(r.pending)===fingerprint(snapshot)?null:r.pending};
            await persist(acknowledged);notify(record.pending?'pending':'synced');
          }catch(e){
            // A POST can commit even if its response was lost. Before retrying
            // the same revision, read back the canonical cloud snapshot.
            // Only an exact match counts as saved: no duplicate admission.
            if(e&&(e.status===409||e.code==='WORKSPACE_CONFLICT'||/failed to fetch|network|timed out/i.test(String(e.message||'')))){
              try{
                var remote=await o.client.pull(b.schoolId);
                if(remote&&remote.snapshot&&remote.revision>r.revision
                  &&fingerprint(remote.snapshot)===fingerprint(snapshot)
                  &&binding===b&&record===r&&consistent()){
                  await persist({...r,revision:remote.revision,fingerprint:fingerprint(snapshot),
                    pending:generation===sentGeneration&&r.pending&&fingerprint(r.pending)===fingerprint(snapshot)?null:r.pending});
                  notify(record.pending?'pending':'synced');
                  continue;
                }
              }catch(checkError){if(quotaError(checkError))e=checkError;}
            }
            failed(e);break;
          }
        }
        return state();
      })();
      try{return await running;}finally{running=null;}
    }
    async function autosave(snapshot){
      ++generation;
      if(!binding){notify('local',error('Not connected to a verified Supabase school. This change exists only on this device and has NOT been published.'));return state();}
      if(!sameInstitution(snapshot)){binding=null;record=null;disk=null;notify('local',error('School identity changed. Your edit was not uploaded to Supabase. Choose the verified school again.'));return state();}
      if(!consistent()){conflict();return state();}
      if(status==='conflict')return state();
      try{await persist({...record,pending:clone(snapshot)});}catch(e){
        conflict(error('Browser could not preserve this unsent edit: '+e.message+'. The cloud was NOT updated. Do not clear this tab or browser data.'));
        return state();
      }
      if(status==='conflict')return state();
      notify('pending');return flush();
    }
    async function openSchool(schoolId){
      if(missingPendingRecovery||(record&&record.pendingRef&&!record.pending))
        throw error('Pending edit recovery is incomplete. Cloud records cannot replace this device until the original pending snapshot can be verified.');
      if(running)await running;
      var recovering=status==='conflict', start=generation, before=clone(o.getSnapshot()),observed=watch(schoolId,institutionId(o.getSnapshot()));notify('loading');
      try{
        var remote=await o.client.pull(schoolId);
        observed.check();
        if(start!==generation)throw error('Local edits occurred while opening the school. Please choose the school again.');
        if(!remote.snapshot)throw error('This school has no saved workspace. Upload local records explicitly to initialize it.');
        observed.add({schoolId:String(schoolId),localId:String(institutionId(remote.snapshot))});
        await backup(before);
        observed.check();
        if(record&&record.pending&&JSON.stringify(record.pending)!==JSON.stringify(before))await backup(record.pending);
        observed.check();
        if(start!==generation)throw error('Local edits occurred during backup. School was not opened.');
        var id=institutionId(remote.snapshot);if(id==null)throw error('The cloud workspace has no institution ID.');
        var next={schoolId:String(schoolId),localId:String(id)};
        // Check storage capacity before applying; commit binding only after the guarded apply succeeds.
        var nextRecord={revision:remote.revision,pending:null};
        var preflight=PREFIX+'preflight.'+Date.now();
        storage.setItem(preflight,JSON.stringify({binding:next,record:nextRecord}));storage.removeItem(preflight);
        var applied=await o.applySnapshot(clone(remote.snapshot),function(){return start===generation&&observed.valid();});
        if(applied===false)throw error('Cloud records could not be applied safely; local records were retained.');
        observed.check();
        if(start!==generation)throw error('Local edits occurred while applying the school. Local records were retained.');
        nextRecord.fingerprint=fingerprint(o.getSnapshot());
        storage.setItem(recordKey(next),JSON.stringify(nextRecord));storage.setItem(bindingKey(next.localId),JSON.stringify(next));
        binding=next;record=nextRecord;disk=JSON.stringify(record);++generation;notify('synced');return remote;
      }catch(e){if(e.code==='CONFLICT'||recovering)conflict(e);else notify(record&&record.pending?'pending':binding?'pending':'local',e);throw e;}
    }
    async function recoverCloudSchool(){
      if(missingPendingRecovery)throw error('Local pending snapshot cannot be recovered. School records will not be replaced or cleared. Restore browser recovery storage before proceeding.');
      if(status!=='conflict'||!binding)return state();
      if(!sameInstitution(o.getSnapshot()))throw error('School identity changed. Sign in to the correct school before recovery.');
      // Explicit recovery never pushes a pending snapshot; openSchool first
      // backs up the current device and any separately retained pending copy.
      await openSchool(binding.schoolId);
      return state();
    }
    async function uploadLocal(schoolId){
      if(running)await running;
      if(binding&&binding.schoolId!==String(schoolId))throw error('Disconnect the current school before uploading to another school.');
      var start=generation, snapshot=clone(o.getSnapshot()),id=institutionId(snapshot);
      if(id==null)throw error('Local institution ID is required.');
      var observed=watch(schoolId,id);
      var remote=await o.client.pull(schoolId);
      try{observed.check();}catch(e){conflict(e);throw e;}
      if(remote.snapshot)throw error('The selected school already contains a workspace. Open it explicitly instead.');
      await backup(snapshot);
      try{observed.check();}catch(e){conflict(e);throw e;}
      if(start!==generation)throw error('Local edits occurred during upload preparation. Please retry.');
      binding={schoolId:String(schoolId),localId:String(id)};record={revision:remote.revision,pending:snapshot};
      await persist();storage.setItem(bindingKey(binding.localId),JSON.stringify(binding));notify('pending');return flush();
    }
    async function sync(){
      if(!binding)return state();
      if(!sameInstitution(o.getSnapshot())){binding=null;record=null;notify('local');return state();}
      if(status==='conflict')return state();
      if(record.pending)return flush();
      if(!consistent()){conflict();return state();}
      var start=generation,b=binding,r=record;
      try{
        var remote=await o.client.pull(b.schoolId);
        if(start!==generation||binding!==b||record!==r||record.pending)return state();
        if(!consistent()){conflict();return state();}
        // Staff/student portals write relational records without changing the
        // workspace revision. Pull is a live overlay, so compare canonical content
        // as well as revision or those teacher-side changes never reach the ERP.
        if(!remote.snapshot)throw error('The cloud workspace is empty. Local records were retained.');
        var remoteFingerprint=fingerprint(remote.snapshot);
        if(remote.revision!==record.revision||remoteFingerprint!==record.fingerprint){
          if(String(institutionId(remote.snapshot))!==binding.localId){conflict(error('Cloud institution identity changed. Open the school explicitly.'));return state();}
          var localFingerprint=fingerprint(o.getSnapshot());
          if(localFingerprint!==record.fingerprint){
            conflict(error('Unsaved local edits were detected while updating the cloud view. Your changes were preserved. Resolve the school sync conflict before reloading.'));
            return state();
          }
          await backup(o.getSnapshot());
          if(start!==generation||binding!==b||record.pending)return state();
          if(!consistent()||fingerprint(o.getSnapshot())!==localFingerprint){conflict();return state();}
          await o.applySnapshot(clone(remote.snapshot),function(){
            return start===generation&&binding===b&&!record.pending&&consistent()&&fingerprint(o.getSnapshot())===localFingerprint;
          });
          if(start!==generation||binding!==b||record.pending)return state();
          if(!consistent()){conflict();return state();}
          await persist({...record,fingerprint:fingerprint(o.getSnapshot()),revision:remote.revision});
        }
        notify('synced');
      }catch(e){failed(e);}
      return state();
    }
    function disconnect(){clearRetry();++generation;if(binding)storage.removeItem(bindingKey(binding.localId));binding=null;record=null;disk=null;notify('local');return state();}
    function dispose(){disposed=true;clearRetry();if(typeof window!=='undefined'&&window.removeEventListener)window.removeEventListener('online',resumeOnline);++generation;binding=null;record=null;disk=null;if(typeof window!=='undefined'&&window.BNWorkspaceOnlineGuard?.setRetry)window.BNWorkspaceOnlineGuard.setRetry(null);if(typeof window!=='undefined'&&window.BNWorkspaceOnlineGuard?.setRecover)window.BNWorkspaceOnlineGuard.setRecover(null);}
    if(typeof window!=='undefined'&&window.BNWorkspaceOnlineGuard?.setRetry)window.BNWorkspaceOnlineGuard.setRetry(function(){return sync();});
    if(typeof window!=='undefined'&&window.BNWorkspaceOnlineGuard?.setRecover)window.BNWorkspaceOnlineGuard.setRecover(function(){return recoverCloudSchool();});
    return {dispose:dispose,initialize:initialize,openSchool:openSchool,uploadLocal:uploadLocal,autosave:autosave,sync:sync,recoverCloudSchool:recoverCloudSchool,disconnect:disconnect,state:state,connect:function(){return o.client.connect();}};
  }
  return {create:create};
});
