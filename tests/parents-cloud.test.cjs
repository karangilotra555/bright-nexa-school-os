const {test}=require('node:test');const assert=require('node:assert/strict');const {create}=require('../docs/parents-cloud.js');
function fixture(linked=true){const calls=[];const fetcher=async(url,options)=>{calls.push({url,options});const path=new URL(url).pathname;let body=[];if(path.endsWith('/school-student-login'))body={session:{access_token:'jwt',user:{id:'parent'}},mustChangePassword:false,links:linked?[{student_id:'child',institution_id:'school'}]:[]};if(path.endsWith('school_guardians'))body=linked?[{id:'g',institution_id:'school'}]:[];if(path.endsWith('school_guardian_students'))body=[{student_id:'child',institution_id:'school'}];if(path.endsWith('school_students'))body=[{id:'child',institution_id:'school',name:'Real child',admission_number:'001',class_id:'class'}];if(path.endsWith('institutions'))body=[{name:'School'}];if(path.endsWith('school_classes'))body=[{name:'I',section:'A'}];if(path.endsWith('school_attendance'))body=[{status:'present'},{status:'absent'},{status:'holiday'}];if(path.endsWith('school_fee_entries'))body=[{kind:'charge',amount_rupees:2000},{kind:'payment',amount_rupees:500}];return {ok:true,status:200,text:async()=>options.method==='POST'&&!path.endsWith('/school-student-login')?'':JSON.stringify(body)};};return {api:create(fetcher),calls};}
test('cloud dashboard uses parent identity and scopes all student records',async()=>{const {api,calls}=fixture();const {links}=await api.login('ADM001','password');const p=await api.dashboard(links[0]);assert.equal(p.student.name,'Real child');assert.equal(p.attendance.percent,50);assert.equal(p.fees.dueRupees,1500);for(const c of calls.filter(c=>/school_attendance|school_fee_entries|school_parent_leaves/.test(c.url))){const u=new URL(c.url);assert.equal(u.searchParams.get('student_id'),'eq.child');assert.equal(u.searchParams.get('institution_id'),'eq.school');assert.equal(c.options.headers.Authorization,'Bearer jwt');}await api.leave('2026-11-06','2026-11-07','Family visit');const payload=JSON.parse(calls.at(-1).options.body);assert.equal(payload.parent_auth_user_id,'parent');assert.equal(payload.student_id,'child');await api.logout();await assert.rejects(api.dashboard(links[0]),/log in/);});
test('initial password login returns a password-change gate',async()=>{const api=create(async()=>({ok:true,status:200,text:async()=>JSON.stringify({session:{access_token:'pending',user:{id:'parent'}},mustChangePassword:true,links:[]})}));const result=await api.login('ADM001','9000000001');assert.equal(result.mustChangePassword,true);assert.deepEqual(result.links,[]);});
test('invalid leave cannot be published',async()=>{const {api}=fixture();const {links:[link]}=await api.login('ADM001','pass');await api.dashboard(link);await assert.rejects(api.leave('2026-11-07','2026-11-06','Family visit'),/Check leave/);});

test('admission number is sent to the login service and password change uses the session',async()=>{const {api,calls}=fixture();await api.login('ADM001','9000000001');assert.deepEqual(JSON.parse(calls[0].options.body),{action:'login',admissionNumber:'ADM001',password:'9000000001'});await api.changePassword('NewTest123!');assert.equal(JSON.parse(calls.at(-1).options.body).action,'change-password');assert.equal(calls.at(-1).options.headers.Authorization,'Bearer jwt');});

test('dashboard loads the published marksheet for the linked student without reading ERP drafts',async()=>{
 const calls=[];
 const api=create(async(url,options)=>{
  const path=new URL(url).pathname;calls.push({path,options});
  const body=path.endsWith('school-student-login')
   ? {session:{access_token:'parent-jwt',user:{id:'parent'}},links:[{student_id:'child',institution_id:'school'}]}
   : path.endsWith('school_students') ? [{id:'child',name:'Child'}]
   : path.endsWith('bn_school_published_marksheets') ? [{examId:'exam',examName:'Term 1',subjects:[{subject:'Math',obtained:74,maximum:100}]}]
   : [];
  return {ok:true,status:200,text:async()=>JSON.stringify(body),json:async()=>body};
 });
 const {links:[child]}=await api.login('TEST001','password');
 const dashboard=await api.dashboard(child);
 assert.equal(dashboard.marksheets[0].subjects[0].obtained,74);
 const request=calls.find(c=>c.path.endsWith('bn_school_published_marksheets'));
 assert.deepEqual(JSON.parse(request.options.body),{p_school:'school',p_student:'child'});
 assert.equal(request.options.headers.Authorization,'Bearer parent-jwt');
 assert.ok(calls.every(c=>!c.path.includes('school_workspaces')));
});
