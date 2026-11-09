const test=require('node:test'); const assert=require('node:assert/strict');
const {create}=require('../school-workspace-controller.js');
const snap=(id='local',n=1)=>({institution:{institution:{id,name:id}},students:[{id:n}],operations:{}});
function fixture(storage){let current=snap();const data=storage||new Map();const store={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};let remote={revision:1,snapshot:snap()},fail=false;const pushes=[],statuses=[];const client={connect:async()=>[{id:'school',name:'School'}],pull:async()=>remote,push:async(id,revision,snapshot)=>{if(fail)throw Error('offline');if(revision!==remote.revision){const e=Error('Conflict');e.status=409;throw e;}pushes.push(snapshot);return remote={revision:revision+1,snapshot};}}; const opts={client,storage:store,getSnapshot:()=>current,applySnapshot:async s=>{current=s},buildProjection:s=>s.students,onStatus:s=>statuses.push(s)};return {opts,client,data,store,pushes,statuses,get current(){return current},set current(s){current=s},get remote(){return remote},set remote(r){remote=r},set fail(v){fail=v},make:()=>create(opts)};}
test('initialize never uploads demo or requires network',async()=>{const f=fixture();f.client.connect=()=>{throw Error('network')};const c=f.make();await c.initialize();await c.autosave(snap());assert.equal(f.pushes.length,0);assert.equal(c.state().status,'local');});
test('offline pending survives reload and retries original revision',async()=>{const f=fixture();let c=f.make();await c.openSchool('school');f.fail=true;f.current=snap('local',2);await c.autosave(f.current);assert.equal(c.state().status,'pending');c=f.make();await c.initialize();assert.equal(c.state().schoolId,'school');f.fail=false;await c.sync();assert.equal(f.pushes.at(-1).students[0].id,2);assert.equal(c.state().status,'synced');});
test('stale revision stays conflict and preserves pending',async()=>{const f=fixture();const c=f.make();await c.openSchool('school');f.remote={revision:9,snapshot:snap('local',9)};await c.autosave(snap('local',2));assert.equal(c.state().status,'conflict');await c.sync();assert.equal(f.pushes.length,0);assert.ok([...f.data.values()].some(v=>v.includes('"pending":{')));});
test('backup failure prevents replacing local data',async()=>{const f=fixture();f.opts.storage={...f.store,setItem(){throw Error('quota')}};const c=f.make();await assert.rejects(c.openSchool('school'));assert.equal(f.current.students[0].id,1);});
test('local edits during pull are not overwritten',async()=>{const f=fixture();const c=f.make();await c.openSchool('school');let release;f.client.pull=()=>new Promise(r=>release=r);const sync=c.sync();await c.autosave(snap('local',2));release({revision:2,snapshot:snap('local',9)});await sync;assert.notEqual(f.current.students[0].id,9);});
test('edits during upload are queued using acknowledged revision',async()=>{const f=fixture();const c=f.make();await c.openSchool('school');let release;const push=f.client.push;f.client.push=async(...a)=>{if(!release)await new Promise(r=>release=r);return push(...a)};const first=c.autosave(snap('local',2));await Promise.resolve();const second=c.autosave(snap('local',3));release();await Promise.all([first,second]);await c.sync();assert.deepEqual(f.pushes.map(s=>s.students[0].id),[2,3]);});
test('changing local institution never uploads into old school',async()=>{const f=fixture();const c=f.make();await c.openSchool('school');f.current=snap('other',3);await c.autosave(f.current);assert.equal(f.pushes.length,0);assert.equal(c.state().status,'local');});
test('uploadLocal refuses a nonempty school',async()=>{const f=fixture();const c=f.make();await assert.rejects(c.uploadLocal('school'));assert.equal(f.pushes.length,0);});
test('explicit reload backs up unsent snapshot before replace',async()=>{const f=fixture();const c=f.make();await c.openSchool('school');f.fail=true;f.current=snap('local',7);await c.autosave(f.current);await c.openSchool('school');assert.ok([...f.data.entries()].some(([k,v])=>k.includes('backup')&&JSON.parse(v).students[0].id===7));});
test('another tab updating the school pauses instead of overwriting its pending data',async()=>{const f=fixture();const c=f.make();await c.openSchool('school');const other=f.make();await other.initialize();f.fail=true;await other.autosave(snap('local',8));await c.autosave(snap('local',2));assert.equal(c.state().status,'conflict');assert.ok([...f.data.values()].some(v=>v.includes('"students":[{"id":8}]')));});
test('empty school upload binds and uses its expected revision',async()=>{const f=fixture();f.remote={revision:0,snapshot:null};const c=f.make();await c.uploadLocal('school');assert.equal(c.state().schoolId,'school');assert.equal(c.state().revision,1);assert.equal(f.pushes.length,1);});
test('authentication failure keeps changes pending',async()=>{const f=fixture();const c=f.make();await c.openSchool('school');f.client.push=async()=>{const e=Error('Session expired');e.status=401;throw e};await c.autosave(snap('local',6));assert.equal(c.state().status,'pending');assert.equal(c.state().pending,true);});
test('async apply can guard against edits made during persistence',async()=>{const f=fixture();const c=f.make();await c.openSchool('school');f.remote={revision:2,snapshot:snap('local',9)};let release,seenGuard;f.opts.applySnapshot=async(s,guard)=>{seenGuard=guard;await new Promise(r=>release=r);if(guard())f.current=s};const pulling=c.sync();while(!release)await Promise.resolve();f.fail=true;f.current=snap('local',4);await c.autosave(f.current);release();await pulling;assert.equal(typeof seenGuard,'function');assert.equal(f.current.students[0].id,4);assert.equal(c.state().status,'pending');});

test('failed apply does not commit a school binding',async()=>{const f=fixture();f.opts.applySnapshot=async()=>{throw Error('IndexedDB write failed')};const c=f.make();await assert.rejects(c.openSchool('school'));assert.equal(c.state().schoolId,null);assert.equal([...f.data.keys()].filter(k=>k.includes('binding.')).length,0);});
test('disconnect keeps local records and durable pending recovery',async()=>{const f=fixture();const c=f.make();await c.openSchool('school');f.fail=true;f.current=snap('local',7);await c.autosave(f.current);c.disconnect();assert.equal(c.state().status,'local');assert.equal(f.current.students[0].id,7);assert.ok([...f.data.values()].some(v=>v.includes('"pending":{')));});
test('initial upload saves backup before sending any cloud write',async()=>{const f=fixture();f.remote={revision:0,snapshot:null};f.opts.backup=async()=>{throw Error('backup unavailable')};const c=f.make();await assert.rejects(c.uploadLocal('school'),/backup/);assert.equal(f.pushes.length,0);assert.equal(c.state().schoolId,null);});
test('restored clean binding is unchecked until server confirms',async()=>{const f=fixture();await f.make().openSchool('school');const c=f.make();await c.initialize();assert.equal(c.state().status,'pending');await c.sync();assert.equal(c.state().status,'synced');});
test('divergent local restore retains both copies and requires explicit resolution',async()=>{const f=fixture();const first=f.make();await first.openSchool('school');f.fail=true;await first.autosave(snap('local',8));f.current=snap('local',9);const c=f.make();await c.initialize();f.fail=false;await c.sync();assert.equal(c.state().status,'conflict');assert.equal(f.pushes.length,0);assert.equal(f.current.students[0].id,9);assert.ok([...f.data.values()].some(v=>v.includes('"students":[{"id":8}]')));});
test('dispose invalidates outstanding pull without disconnecting durable binding',async()=>{const f=fixture();const c=f.make();await c.openSchool('school');let release;f.client.pull=()=>new Promise(r=>release=r);const pulling=c.sync();c.dispose();release({revision:2,snapshot:snap('local',9)});await pulling;assert.equal(f.current.students[0].id,1);assert.equal([...f.data.keys()].filter(k=>k.includes('binding.')).length,1);});
test('conflict edits do not erase the older pending recovery snapshot',async()=>{const f=fixture();const first=f.make();await first.openSchool('school');f.fail=true;await first.autosave(snap('local',8));f.current=snap('local',9);const c=f.make();await c.initialize();await c.autosave(snap('local',10));assert.ok([...f.data.values()].some(v=>v.includes('"pending":{')&&v.includes('"students":[{"id":8}]')));});
test('sync retains another tab pending edit created during backup',async()=>{const f=fixture();const c=f.make();await c.openSchool('school');const other=f.make();await other.initialize();let release;f.opts.backup=()=>new Promise(r=>release=r);f.remote={revision:2,snapshot:snap('local',9)};const sync=c.sync();while(!release)await Promise.resolve();f.fail=true;await other.autosave(snap('local',8));release();await sync;assert.equal(c.state().status,'conflict');assert.ok([...f.data.values()].some(v=>v.includes('"pending":{')&&v.includes('"students":[{"id":8}]')));assert.equal(f.current.students[0].id,1);});
test('sync apply guard rejects another tab pending edit during persistence',async()=>{const f=fixture();const c=f.make();await c.openSchool('school');const other=f.make();await other.initialize();let release;f.opts.applySnapshot=async(s,guard)=>{await new Promise(r=>release=r);if(guard())f.current=s};f.remote={revision:2,snapshot:snap('local',9)};const sync=c.sync();while(!release)await Promise.resolve();f.fail=true;await other.autosave(snap('local',8));release();await sync;assert.equal(c.state().status,'conflict');assert.equal(f.current.students[0].id,1);assert.ok([...f.data.values()].some(v=>v.includes('"pending":{')&&v.includes('"students":[{"id":8}]')));});
test('explicit open detects another tab edit while backup is pending',async()=>{const f=fixture();const c=f.make();await c.openSchool('school');const other=f.make();await other.initialize();let release;f.opts.backup=()=>new Promise(r=>release=r);const opening=c.openSchool('school');while(!release)await Promise.resolve();f.fail=true;await other.autosave(snap('local',8));release();await assert.rejects(opening);assert.equal(c.state().status,'conflict');assert.ok([...f.data.values()].some(v=>v.includes('"pending":{')&&v.includes('"students":[{"id":8}]')));});
test('initial upload detects another tab binding while backup is pending',async()=>{const f=fixture();f.remote={revision:0,snapshot:null};let release;f.opts.backup=()=>new Promise(r=>release=r);const c=f.make();const upload=c.uploadLocal('school');while(!release)await Promise.resolve();f.store.setItem('bn.workspace.v1.binding.local',JSON.stringify({schoolId:'other',localId:'local'}));release();await assert.rejects(upload);assert.equal(f.pushes.length,0);assert.equal(JSON.parse(f.store.getItem('bn.workspace.v1.binding.local')).schoolId,'other');});
test('restored clean workspace detects different local records with same institution',async()=>{const f=fixture();await f.make().openSchool('school');f.current=snap('local',99);const c=f.make();await c.initialize();await c.sync();assert.equal(c.state().status,'conflict');assert.equal(f.pushes.length,0);assert.equal(f.current.students[0].id,99);});
test('acknowledged fingerprint uses normalized applied local snapshot',async()=>{const f=fixture();f.opts.applySnapshot=async s=>{s.operations.defaults=[];f.current=s};await f.make().openSchool('school');const c=f.make();await c.initialize();assert.equal(c.state().status,'pending');});
test('successful upload remembers the acknowledged snapshot across reload',async()=>{const f=fixture();f.remote={revision:0,snapshot:null};await f.make().uploadLocal('school');const c=f.make();await c.initialize();assert.equal(c.state().status,'pending');await c.sync();assert.equal(c.state().status,'synced');});
test('explicit open apply guard detects another tab edit during persistence',async()=>{const f=fixture();const c=f.make();await c.openSchool('school');const other=f.make();await other.initialize();let release;f.opts.applySnapshot=async(s,guard)=>{await new Promise(r=>release=r);if(guard())f.current=s};f.remote={revision:2,snapshot:snap('local',9)};const opening=c.openSchool('school');while(!release)await Promise.resolve();f.fail=true;await other.autosave(snap('local',8));release();await assert.rejects(opening);assert.equal(c.state().status,'conflict');assert.equal(f.current.students[0].id,1);});

test('teacher portal changes refresh into the ERP even when workspace revision stays the same',async()=>{
 const f=fixture(),c=f.make();
 await c.openSchool('school');
 assert.equal(c.state().revision,1);
 f.remote={revision:1,snapshot:snap('local',29)};
 await c.sync();
 assert.equal(f.current.students[0].id,29);
 assert.equal(c.state().revision,1);
 assert.equal(c.state().status,'synced');
});
test('unsaved local edits block a portal change at the same revision instead of being overwritten',async()=>{
 const f=fixture(),c=f.make();
 await c.openSchool('school');
 f.current=snap('local',77);
 f.remote={revision:1,snapshot:snap('local',29)};
 await c.sync();
 assert.equal(f.current.students[0].id,77);
 assert.equal(c.state().status,'conflict');
});
test('unchanged cloud projection does not create repeated backups',async()=>{
 const f=fixture(),c=f.make();
 await c.openSchool('school');
 const before=[...f.data.keys()].filter(k=>k.includes('.backup.')).length;
 await c.sync();
 await c.sync();
 assert.equal([...f.data.keys()].filter(k=>k.includes('.backup.')).length,before);
});

test('explicit recovery preserves both a divergent restored copy and an older pending edit',async()=>{
 const f=fixture();
 await f.make().openSchool('school');
 f.fail=true;
 const previous=f.make();
 await previous.initialize();
 f.current=snap('local',8);
 await previous.autosave(f.current);
 f.current=snap('local',9);
 const recovering=f.make();
 await recovering.initialize();
 assert.equal(recovering.state().status,'conflict');
 await recovering.recoverCloudSchool();
 assert.equal(recovering.state().status,'synced');
 assert.equal(f.current.students[0].id,1,'verified cloud snapshot opened');
 assert.equal(f.pushes.length,0,'no pending copy was silently pushed to cloud');
 const backups=[...f.data.entries()].filter(([key])=>key.includes('.backup.')).map(([,value])=>JSON.parse(value));
 assert.ok(backups.some(x=>x.students[0].id===9),'divergent device copy backed up');
 assert.ok(backups.some(x=>x.students[0].id===8),'previous pending edit backed up');
});

test('recovery backup failure keeps conflict and all unsent data unchanged',async()=>{
 const f=fixture();
 await f.make().openSchool('school');
 f.fail=true;
 const prior=f.make();await prior.initialize();
 f.current=snap('local',8);await prior.autosave(f.current);
 f.current=snap('local',9);
 f.opts.backup=async()=>{throw Error('backup storage full');};
 const c=f.make();await c.initialize();
 await assert.rejects(c.recoverCloudSchool(),/backup storage full/);
 assert.equal(c.state().status,'conflict');
 assert.equal(f.current.students[0].id,9);
 assert.ok([...f.data.values()].some(v=>v.includes('"pending":{')&&v.includes('"students":[{"id":8}]')));
});

test('verified owner explicit login opens existing cloud after preserving divergent and pending device backups',async()=>{
 const f=fixture();
 const initial=f.make();await initial.openSchool('school');
 f.fail=true;f.current=snap('local',8);await initial.autosave(f.current);
 f.current=snap('local',9);
 const original=global.window;
 global.window={location:{search:'?openSchool=true&tab=Dashboard'},sessionStorage:{getItem:key=>key==='bright-nexa-school-os:session:v2'
   ? JSON.stringify({cloudVerified:true,role:'OWNER',institutionId:'school'})
   :key==='bn_school_staff_session_v1'?JSON.stringify({access_token:'test-session'}):null},
   BNWorkspaceOnlineGuard:{update(){}}};
 try{
  const next=f.make();await next.initialize();
  assert.equal(next.state().status,'synced');
  assert.equal(next.state().pending,false);
  assert.equal(f.current.students[0].id,1);
  const backups=[...f.data.entries()].filter(([k])=>k.includes('.backup.')).map(([,v])=>JSON.parse(v));
  assert.ok(backups.some(v=>v.students[0].id===8),'unpublished pending edit is backed up');
  assert.ok(backups.some(v=>v.students[0].id===9),'restored device snapshot is backed up');
  assert.equal(f.pushes.length,0,'no unreviewed device edit was uploaded');
 }finally{if(original===undefined)delete global.window;else global.window=original;}
});
test('cross-school, unverified or wrong-role sessions cannot auto-replace divergent records',async()=>{
 for(const identity of [
  {cloudVerified:false,role:'OWNER',institutionId:'school'},
  {cloudVerified:true,role:'OWNER',institutionId:'another-school'},
  {cloudVerified:true,role:'TEACHER',institutionId:'school'}
 ]){
  const f=fixture();await f.make().openSchool('school');f.current=snap('local',99);
  const original=global.window;
  global.window={location:{search:'?openSchool=true&tab=Dashboard'},sessionStorage:{getItem:key=>key==='bright-nexa-school-os:session:v2'
   ?JSON.stringify(identity):JSON.stringify({access_token:'test-session'})},BNWorkspaceOnlineGuard:{update(){}}};
  try{const next=f.make();await next.initialize();assert.equal(next.state().status,'conflict');assert.equal(f.current.students[0].id,99);}
  finally{if(original===undefined)delete global.window;else global.window=original;}
 }
});
