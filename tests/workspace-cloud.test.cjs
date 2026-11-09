const {test}=require('node:test');
const assert=require('node:assert/strict');
const cloud=require('../school-workspace-cloud.js');
const snapshot=()=>({institution:{institution:{id:'school',name:'School',session:'2026-27'},services:[]},students:[{id:'student',name:'Student',admissionNumber:'A1',className:'6',section:'A',status:'Active',dateOfBirth:'2015-02-03'}],operations:{classes:[{id:'class',name:'6',section:'A'}],attendance:[{id:'attendance',studentId:'student',classId:'class',date:'2026-11-06',status:'Present'}],homework:[],notices:[],feeStructures:[],feePayments:[]}});
function harness(options={}){
 const calls=[],local=new Map([['records','unchanged']]);
 let rejected=false;
 let session=options.noSession?null:JSON.stringify({access_token:'token',refresh_token:'refresh',expires_at:options.expired?1:Date.now()/1000+3600});
 const sessionStorage={getItem:()=>session,setItem:(_,v)=>session=v,removeItem:()=>session=null};
 const fetcher=async(url,init)=>{calls.push({url,init});let data;
 if(options.denyRefresh&&url.includes('/token?'))return {ok:false,status:401,json:async()=>({message:'Refresh revoked'})};
 if(url.includes('/token?'))data={access_token:'new-token',refresh_token:'new-refresh',expires_in:3600};
 else if(url.endsWith('/user'))data={id:'user'};
 else if(url.includes('/school_users?'))data=[{institution_id:'school',auth_user_id:'user',role:options.role||'school_admin',status:'active'}];
 else if(url.includes('/institutions?'))data=[{id:'school',name:'School',status:'active'}];
 else if(options.once401&&url.includes('school_workspace_push')&&!rejected){rejected=true;return {ok:false,status:401,json:async()=>({message:'JWT expired'})};}
 else if(options.conflict)return {ok:false,status:409,json:async()=>({message:'revision conflict'})};
 else data={revision:2,school:{id:options.crossSchool?'other':'school',name:'School'},snapshot:snapshot()};
 return {ok:true,status:200,json:async()=>data};};
 return {client:cloud.create({fetcher,storage:{setItem:()=>assert.fail('local writes forbidden'),getItem:k=>local.get(k)},sessionStorage}),calls,local};
}
test('verified connect and pull never mutate local records',async()=>{const h=harness();assert.deepEqual(await h.client.connect(),[{id:'school',name:'School'}]);assert.equal((await h.client.pull('school')).revision,2);assert.equal(h.local.get('records'),'unchanged');assert.ok(h.calls.filter(x=>!x.url.includes('/rpc/')).every(x=>!x.init.method||x.init.method==='GET'));});
test('push sends complete snapshot and expected revision',async()=>{const h=harness(),s=snapshot(),p=cloud.buildProjection(s,()=>[]);await h.client.push('school',1,s,p);const call=h.calls.find(x=>x.url.includes('school_workspace_push'));assert.deepEqual(JSON.parse(call.init.body),{p_institution_id:'school',p_expected_revision:1,p_snapshot:s,p_projection:p});});
test('conflict preserves records and reports recovery',async()=>{const h=harness({conflict:true});await assert.rejects(h.client.push('school',1,snapshot(),cloud.buildProjection(snapshot(),()=>[])),/conflict|changed/i);assert.equal(h.local.get('records'),'unchanged');});
test('missing session, wrong role and cross-school responses fail closed',async()=>{await assert.rejects(harness({noSession:true}).client.connect(),/sign in|log in/i);await assert.rejects(harness({role:'teacher'}).client.pull('school'),/admin|access/i);await assert.rejects(harness({crossSchool:true}).client.pull('school'),/school/i);});
test('expired session is refreshed before authenticating user',async()=>{const h=harness({expired:true});await h.client.connect();assert.ok(h.calls[0].url.includes('grant_type=refresh_token'));assert.equal(h.calls[1].init.headers.Authorization,'Bearer new-token');});
test('projection retains IDs, preserves snapshot, uses fee engine credits including concessions/reversal',()=>{const s=snapshot(),before=structuredClone(s);s.operations.notices=[{id:'notice',audience:'All parents',title:'Hello',content:'World'},{id:'private',audience:'Teachers',title:'Private'}];const p=cloud.buildProjection(s,()=>[{key:'obligation',amount:1000,credited:250,period:'November',structure:{category:'Tuition'},billingYear:2026,billingMonth:11,payments:[{amount:300,concession:50,reversed:100}]}]);assert.equal(p.students[0].localId,'student');assert.equal(p.classes[0].localId,'class');assert.deepEqual(p.fees.map(f=>[f.kind,f.amountRupees]),[['charge',1000],['payment',250]]);assert.equal(p.notices.length,1);assert.deepEqual(s.students,before.students);assert.deepEqual(p,cloud.buildProjection(s,()=>[{key:'obligation',amount:1000,credited:250,period:'November',structure:{category:'Tuition'},billingYear:2026,billingMonth:11}]));});
test('invalid identity, dates, references, streams fail before RPC',async()=>{for(const mutate of [s=>s.students[0].admissionNumber='',s=>s.students.push({...s.students[0]}),s=>s.students[0].classId='missing',s=>s.students[0].dateOfBirth='2015-02-30',s=>s.operations.attendance[0].status='unknown',s=>s.operations.classes.push({id:'other',name:'6',section:'A',academicStream:'Arts'})]){const s=snapshot();mutate(s);assert.throws(()=>cloud.buildProjection(s,()=>[]));}});
test('push independently rejects invalid local references before network',async()=>{const h=harness(),s=snapshot(),p=cloud.buildProjection(s,()=>[]);s.students[0].classId='missing';await assert.rejects(h.client.push('school',1,s,p),/class/i);assert.equal(h.calls.length,0);});
test('real fee engine keeps reversal unpaid and concessions credited without calculating a second balance',()=>{const fs=require('node:fs'),vm=require('node:vm'),src=fs.readFileSync(require('node:path').join(__dirname,'../app-extracted/src/BrightNexaApp.jsx'),'utf8'),start=src.indexOf('var Rn = ['),end=src.indexOf('var Zn = ',start),context={};vm.createContext(context);vm.runInContext(src.slice(start,end)+';this.fees=Xn;',context);const s=snapshot();s.operations.feeStructures=[{id:'tuition',category:'Tuition',className:'6',academicSession:'2026-27',amount:1000,frequency:'Monthly',dueDay:10}];s.operations.feePayments=[{studentId:'student',category:'Tuition',amount:1000,billingMonth:4,billingYear:2026,status:'Reversed'},{studentId:'student',category:'Tuition',amount:0,concessionAmount:1000,billingMonth:5,billingYear:2026}];const fees=cloud.buildProjection(s,context.fees).fees;assert.equal(fees.find(f=>f.kind==='payment'&&f.occurredOn==='2026-04-01').amountRupees,0);assert.equal(fees.find(f=>f.kind==='payment'&&f.occurredOn==='2026-05-01').amountRupees,1000);});

test('hung Supabase requests fail visibly with a retryable timeout',async()=>{
 let aborted=false;
 const sessionStorage={getItem:()=>JSON.stringify({access_token:'token',refresh_token:'refresh',expires_at:Date.now()/1000+3600})};
 const client=cloud.create({requestTimeoutMs:20,sessionStorage,fetcher:(_url,options)=>{
  options.signal?.addEventListener('abort',()=>{aborted=true});
  return new Promise(()=>{});
 }});
 await assert.rejects(client.connect(),error=>error.code==='CLOUD_TIMEOUT'&&/not saved to cloud/i.test(error.message));
 assert.equal(aborted,true);
});
test('hung session refresh does not falsely connect',async()=>{
 const sessionStorage={getItem:()=>JSON.stringify({access_token:'old',refresh_token:'refresh',expires_at:1})};
 const client=cloud.create({requestTimeoutMs:20,sessionStorage,fetcher:()=>new Promise(()=>{})});
 await assert.rejects(client.connect(),error=>error.code==='CLOUD_TIMEOUT'&&/retry sync/i.test(error.message));
});

test('401 on verified workspace push refreshes only the same school session and retries exactly once',async()=>{
 const h=harness({once401:true}),s=snapshot(),p=cloud.buildProjection(s,()=>[]);
 const result=await h.client.push('school',1,s,p);
 assert.equal(result.revision,2);
 const writes=h.calls.filter(c=>c.url.endsWith('/rpc/school_workspace_push'));
 assert.equal(writes.length,2);
 assert.equal(writes[0].init.headers.Authorization,'Bearer token');
 assert.equal(writes[1].init.headers.Authorization,'Bearer new-token');
 assert.deepEqual(JSON.parse(writes[0].init.body),JSON.parse(writes[1].init.body));
 assert.equal(h.calls.filter(c=>c.url.includes('grant_type=refresh_token')).length,1);
 assert.equal(h.local.get('records'),'unchanged');
});
test('revoked refresh keeps local records and does not retry unauthorized workspace write',async()=>{
 const h=harness({once401:true,denyRefresh:true}),s=snapshot();
 await assert.rejects(h.client.push('school',1,s,cloud.buildProjection(s,()=>[])),/login expired|sign in again/i);
 assert.equal(h.calls.filter(c=>c.url.includes('grant_type=refresh_token')).length,1);
 assert.equal(h.calls.filter(c=>c.url.endsWith('/rpc/school_workspace_push')).length,1);
 assert.equal(h.local.get('records'),'unchanged');
});

test('class transfer preserves historical attendance in the original class',()=>{
 const s=snapshot();
 s.operations.classes.push({id:'new-class',name:'7',section:'A'});
 s.students[0].classId='new-class';
 s.students[0].className='7';
 // Previously published attendance must still point to the attended Class 6.
 const p=cloud.buildProjection(s,()=>[]);
 assert.equal(p.students[0].classLocalId,'new-class');
 assert.equal(p.attendance[0].classLocalId,'class');
 assert.equal(p.attendance[0].studentLocalId,'student');
});
test('historical attendance rejects a class missing from this school',()=>{
 const s=snapshot();
 s.operations.classes.push({id:'new-class',name:'7',section:'A'});
 s.students[0].classId='new-class';
 s.operations.attendance[0].classId='foreign-class';
 assert.throws(()=>cloud.buildProjection(s,()=>[]),/unknown class reference/i);
});
