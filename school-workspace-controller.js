/* Full-workspace sync. No authentication or UI ownership; callers confirm school selection. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.BNWorkspaceController=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var PREFIX='bn.workspace.v1.';
  function clone(v){return JSON.parse(JSON.stringify(v));}
  function fingerprint(value){if(Array.isArray(value))return '['+value.map(fingerprint).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().filter(function(k){return value[k]!==undefined;}).map(function(k){return JSON.stringify(k)+':'+fingerprint(value[k]);}).join(',')+'}';return JSON.stringify(value);}
  function institutionId(s){return s&&s.institution&&s.institution.institution&&s.institution.institution.id;}
  function create(options){
    var o=options, storage=o.storage, binding=null, record=null, disk=null, generation=0, running=null, status='local', lastError=null, serial=0, disposed=false;
    function bindingKey(id){return PREFIX+'binding.'+encodeURIComponent(id);}
    function recordKey(b){return PREFIX+'school.'+encodeURIComponent(b.localId)+'.'+encodeURIComponent(b.schoolId);}
    function state(){return {status:status,binding:!!binding,schoolId:binding&&binding.schoolId,localId:binding&&binding.localId,revision:record&&record.revision,pending:!!(record&&record.pending),error:lastError};}
    function notify(s,error){if(disposed)return;status=s;lastError=error||null;if(o.onStatus)o.onStatus(s,state());if(error&&o.onError)o.onError(error);if(typeof window!=='undefined'&&window.BNWorkspaceOnlineGuard)window.BNWorkspaceOnlineGuard.update(s,error);}
    function error(message){return new Error(message);}
    function changed(){var e=error('Another tab changed this school. Local records were retained.');e.code='CONFLICT';return e;}
    function watch(schoolId,localId){var values={};function add(b){[bindingKey(b.localId),recordKey(b)].forEach(function(k){if(!Object.prototype.hasOwnProperty.call(values,k))values[k]=storage.getItem(k);});}if(binding)add(binding);add({schoolId:String(schoolId),localId:String(localId)});return {add:add,valid:function(){return Object.keys(values).every(function(k){return storage.getItem(k)===values[k];});},check:function(){if(!this.valid())throw changed();}};}
    function save(){var value=JSON.stringify(record);storage.setItem(recordKey(binding),value);disk=value;}
    function consistent(){return binding&&storage.getItem(bindingKey(binding.localId))===JSON.stringify(binding)&&storage.getItem(recordKey(binding))===disk;}
    function sameInstitution(snapshot){return binding&&String(institutionId(snapshot))===binding.localId;}
    function conflict(e){notify('conflict',e||error('Another tab changed this school. Reload explicitly to preserve and resolve local changes.'));}
    function failed(e){if(e&&(e.status===409||e.code==='CONFLICT'||/conflict|revision/i.test(e.message||'')))conflict(e);else notify('pending',e);}
    async function backup(snapshot){
      if(o.backup){await o.backup(clone(snapshot));return;}
      var key=PREFIX+'backup.'+Date.now()+'.'+(++serial)+'.'+Math.random().toString(36).slice(2);
      var value=JSON.stringify(snapshot);storage.setItem(key,value);
      if(storage.getItem(key)!==value)throw error('Local backup could not be verified. School was not opened.');
    }
    async function initialize(){
      var id=institutionId(o.getSnapshot());binding=null;record=null;disk=null;
      if(id!=null){var saved=storage.getItem(bindingKey(String(id)));if(saved){binding=JSON.parse(saved);disk=storage.getItem(recordKey(binding));record=disk?JSON.parse(disk):null;if(!record)binding=null;}}
      if(binding&&((record.pending&&fingerprint(record.pending)!==fingerprint(o.getSnapshot()))||(!record.pending&&record.fingerprint!==fingerprint(o.getSnapshot())))){conflict(error('Restored local records differ from the saved workspace. Both copies were retained; resolve by opening the school explicitly.'));return state();}
      notify(binding?'pending':'local');return state();
    }
    async function flush(){
      if(running)return running;
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
            record.revision=result.revision;
            record.fingerprint=fingerprint(snapshot);
            if(generation===sentGeneration)record.pending=null;
            save();notify(record.pending?'pending':'synced');
          }catch(e){failed(e);break;}
        }
        return state();
      })();
      try{return await running;}finally{running=null;}
    }
    async function autosave(snapshot){
      ++generation;
      if(!binding)return state();
      if(!sameInstitution(snapshot)){binding=null;record=null;disk=null;notify('local');return state();}
      if(!consistent()){conflict();return state();}
      if(status==='conflict')return state();
      record.pending=clone(snapshot);
      try{save();}catch(e){notify('pending',e);return state();}
      if(status==='conflict')return state();
      notify('pending');return flush();
    }
    async function openSchool(schoolId){
      if(running)await running;
      var start=generation, before=clone(o.getSnapshot()),observed=watch(schoolId,institutionId(o.getSnapshot()));notify('loading');
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
        await o.applySnapshot(clone(remote.snapshot),function(){return start===generation&&observed.valid();});
        observed.check();
        if(start!==generation)throw error('Local edits occurred while applying the school. Local records were retained.');
        nextRecord.fingerprint=fingerprint(o.getSnapshot());
        storage.setItem(recordKey(next),JSON.stringify(nextRecord));storage.setItem(bindingKey(next.localId),JSON.stringify(next));
        binding=next;record=nextRecord;disk=JSON.stringify(record);++generation;notify('synced');return remote;
      }catch(e){if(e.code==='CONFLICT')conflict(e);else notify(record&&record.pending?'pending':binding?'pending':'local',e);throw e;}
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
      save();storage.setItem(bindingKey(binding.localId),JSON.stringify(binding));notify('pending');return flush();
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
        if(remote.revision!==record.revision){
          if(!remote.snapshot)throw error('The cloud workspace is empty. Local records were retained.');
          if(String(institutionId(remote.snapshot))!==binding.localId){conflict(error('Cloud institution identity changed. Open the school explicitly.'));return state();}
          await backup(o.getSnapshot());
          if(start!==generation||binding!==b||record.pending)return state();
          if(!consistent()){conflict();return state();}
          await o.applySnapshot(clone(remote.snapshot),function(){return start===generation&&binding===b&&!record.pending&&consistent();});
          if(start!==generation||binding!==b||record.pending)return state();
          if(!consistent()){conflict();return state();}
          record.fingerprint=fingerprint(o.getSnapshot());
          record.revision=remote.revision;save();
        }
        notify('synced');
      }catch(e){failed(e);}
      return state();
    }
    function disconnect(){++generation;if(binding)storage.removeItem(bindingKey(binding.localId));binding=null;record=null;disk=null;notify('local');return state();}
    function dispose(){disposed=true;++generation;binding=null;record=null;disk=null;}
    return {dispose:dispose,initialize:initialize,openSchool:openSchool,uploadLocal:uploadLocal,autosave:autosave,sync:sync,disconnect:disconnect,state:state,connect:function(){return o.client.connect();}};
  }
  return {create:create};
});
