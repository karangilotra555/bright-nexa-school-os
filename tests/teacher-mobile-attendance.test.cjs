const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
function setup({saved=[],writeConfirms=true,writeReturnsRows=writeConfirms,mobile=false}={}){
 const nodes=new Map(),calls=[];let deferred=null;
 const cloud=new Map(saved.map(row=>[row.student_id,row.status]));
 class E{constructor(){this.value='';this.dataset={};this.children=[];this.listeners={};this.disabled=false;this.classList={add(){},remove(){},toggle(){},contains(){return true}};}append(...v){this.children.push(...v)}prepend(...v){this.children.unshift(...v)}replaceChildren(...v){this.children=v}addEventListener(k,f){this.listeners[k]=f}querySelectorAll(){return this.children.flatMap(c=>c.children||[]).filter(c=>c.dataset?.studentId)}setAttribute(){}}
 const node=id=>{if(!nodes.has(id))nodes.set(id,new E());return nodes.get(id)};
 const context={window:{BNHomeworkFiles:{create:()=>({list:async()=>[],links(){}})}},Date,URLSearchParams,document:{getElementById:node,querySelectorAll:()=>[],querySelector:()=>new E(),createElement:()=>new E(),body:mobile?new E():undefined},sessionStorage:{getItem:()=>null,removeItem(){},setItem(){}},location:{hash:'',search:'',pathname:'',assign(){}},history:{replaceState(){}},fetch:async(url,opt)=>{
  calls.push({url,opt});if(deferred)await deferred;
  if(opt.method==='POST'){
   const body=JSON.parse(opt.body),rows=body.p_marks||body;
   if(body.p_marks&&rows.some(row=>(cloud.get(row.student_id)??null)!==row.expected))
    return {ok:false,status:409,json:async()=>({message:'Attendance changed. Reload latest attendance.'})};
   if(writeConfirms)for(const row of rows)cloud.set(row.student_id,row.status);
   return {ok:true,json:async()=>writeReturnsRows?rows:[]};
  }
  return {ok:true,json:async()=>[...cloud].map(([student_id,status])=>({student_id,status}))};
 }};
 vm.createContext(context);let src=fs.readFileSync(path.join(__dirname,'../docs/teacher-access.js'),'utf8');src=src.replace(/\}\)\(\);\s*$/,`globalThis.testAPI={loadAttendance,invalidateRoster,setState(s){me=s.me;allClasses=s.classes;allStudents=s.students;allAssignments=s.assignments;session={access_token:'test',expires_at:9999999999};}};})();`);vm.runInContext(src,context);
 const state={me:{id:'teacher',role:'teacher',institution_id:'school'},classes:[{id:'assigned'},{id:'other'}],students:[{id:'child',name:'Student',class_id:'assigned'},{id:'other-child',class_id:'other'}],assignments:[{school_user_id:'teacher',class_id:'assigned',active:true,can_take_attendance:true}]};context.testAPI.setState(state);node('attendanceClass').value='assigned';node('attendanceDate').value='2026-11-05';
 return {api:context.testAPI,node,calls,state,cloud,defer(){deferred=new Promise(resolve=>this.resolve=resolve);return deferred;}};
}
test('teacher app saves only the loaded assigned class, day and students',async()=>{const f=setup();await f.api.loadAttendance();const select=f.node('rosterList').querySelectorAll()[0];select.value='absent';await f.node('saveAttendance').listeners.click();const writes=f.calls.filter(c=>c.opt.method==='POST');assert.equal(writes.length,1);assert.match(writes[0].url,/\/rpc\/bn_save_class_attendance$/);assert.deepEqual(JSON.parse(writes[0].opt.body),{p_school:'school',p_class:'assigned',p_day:'2026-11-05',p_recorder:'teacher',p_marks:[{student_id:'child',status:'absent',expected:null}]});});
test('the roster renders student name and admission number in a dedicated identity block',async()=>{
 const f=setup();f.state.students[0].admission_number='HPS0002';await f.api.loadAttendance();
 const identity=f.node('rosterList').children[0].children[0];
 assert.equal(identity.className,'attendance-student');
 assert.deepEqual(identity.children.slice(0,2).map(node=>node.textContent),['Student','HPS0002']);
});
test('a saved roster is shown from Supabase and repeat Save leaves existing rows alone',async()=>{
 const f=setup({saved:[{student_id:'child',status:'absent'}]});await f.api.loadAttendance();
 const row=f.node('rosterList').children[0];
 assert.match(row.children[0].children[2].textContent,/Saved in Supabase/);
 assert.equal(row.children[1].value,'absent');
 await f.node('saveAttendance').listeners.click();
 assert.equal(f.calls.filter(c=>c.opt.method==='POST').length,0);
 assert.match(f.node('attendanceFeedback').textContent,/already saved/i);
});
test('a correction is sent alone and a full roster read-back can confirm it',async()=>{
 const f=setup({saved:[{student_id:'child',status:'absent'},{student_id:'child2',status:'present'}],writeReturnsRows:false});
 f.state.students.push({id:'child2',name:'Second',class_id:'assigned'});
 await f.api.loadAttendance();
 const row=f.node('rosterList').children[0], select=row.children[1], badge=row.children[0].children[2];
 select.value='late';select.listeners.change();
 assert.match(badge.textContent,/Unsaved change/);
 await f.node('saveAttendance').listeners.click();
 assert.match(badge.textContent,/Saved in Supabase/);
 await f.node('saveAttendance').listeners.click();
 const writes=f.calls.filter(c=>c.opt.method==='POST');
 assert.deepEqual(JSON.parse(writes[0].opt.body).p_marks,[{student_id:'child',status:'late',expected:'absent'}]);
 assert.equal(writes.length,1);
 assert.equal(f.calls.filter(c=>c.opt.method==='GET').length,2);
});
test('a write with no matching Supabase confirmation stays unsaved',async()=>{
 const f=setup({writeConfirms:false});await f.api.loadAttendance();
 const row=f.node('rosterList').children[0], select=row.children[1];
 select.value='present';select.listeners.change();await f.node('saveAttendance').listeners.click();
 assert.match(row.children[0].children[2].textContent,/Unsaved change/);
 assert.match(f.node('status').textContent,/not confirmed/);
});
test('changing date or class blocks stale roster saves',async()=>{for(const id of ['attendanceClass','attendanceDate']){const f=setup();await f.api.loadAttendance();f.node(id).value=id==='attendanceClass'?'other':'2026-11-06';await f.node('saveAttendance').listeners.click();assert.equal(f.calls.filter(c=>c.opt.method==='POST').length,0);assert.match(f.node('status').textContent,/assigned|changed/);}});
test('unassigned class cannot load; late requests cannot restore a changed roster',async()=>{const f=setup();f.node('attendanceClass').value='other';await assert.rejects(f.api.loadAttendance(),/assigned/);assert.equal(f.calls.length,0);f.node('attendanceClass').value='assigned';f.defer();const loading=f.api.loadAttendance();await Promise.resolve();f.node('attendanceDate').value='2026-11-06';f.api.invalidateRoster();f.resolve();await loading;assert.equal(f.node('rosterList').children.length,0);});
test('unmarked students cannot silently be submitted as present',async()=>{const f=setup();await f.api.loadAttendance();assert.equal(f.node('rosterList').querySelectorAll()[0].value,'');await f.node('saveAttendance').listeners.click();assert.equal(f.calls.filter(c=>c.opt.method==='POST').length,0);assert.match(f.node('status').textContent,/Mark every student/);});
test('mark remaining present preserves deliberately marked absences',async()=>{const f=setup();f.state.students.push({id:'child2',name:'Second',class_id:'assigned'});await f.api.loadAttendance();const selects=f.node('rosterList').querySelectorAll();selects[0].value='absent';await f.node('markRemainingPresent').listeners.click();assert.equal(selects[0].value,'absent');assert.equal(selects[1].value,'present');await f.node('saveAttendance').listeners.click();assert.equal(f.calls.filter(c=>c.opt.method==='POST').length,1);});

test('Teacher cannot overwrite a newer status without reloading and selecting it again',async()=>{
 const f=setup({saved:[{student_id:'child',status:'absent'}],mobile:true});
 await f.api.loadAttendance();
 f.cloud.set('child','present');
 const select=()=>f.node('rosterList').querySelectorAll()[0];
 select().value='late';select().listeners.change();
 await f.node('saveAttendance').listeners.click();
 assert.equal(f.cloud.get('child'),'present');
 assert.equal(select().value,'late');
 assert.match(f.node('attendanceFeedback').textContent,/changed.*reload/i);
 assert.equal(f.node('saveAttendance').disabled,true);
 await f.node('saveAttendance').listeners.click();
 assert.equal(f.calls.filter(c=>c.opt.method==='POST').length,1);
 await f.node('loadAttendance').listeners.click();
 assert.equal(select().value,'present');
 const badge=f.node('rosterList').children[0].children[0].children[2];
 assert.match(badge.textContent,/saved.*present.*choice.*late/i);
 await f.node('saveAttendance').listeners.click();
 assert.equal(f.calls.filter(c=>c.opt.method==='POST').length,1);
 select().value='late';select().listeners.change();
 await f.node('saveAttendance').listeners.click();
 assert.equal(f.cloud.get('child'),'late');
 assert.deepEqual(JSON.parse(f.calls.filter(c=>c.opt.method==='POST').at(-1).opt.body).p_marks,
  [{student_id:'child',status:'late',expected:'present'}]);
});
test('the shared app links both roles without changing the native APK',()=>{const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');assert.match(read('docs/parents.html'),/teacher-access\.html\?view=attendance/);assert.match(read('docs/teacher-access.html'),/id="parentApp" href="\.\/parents\.html"/);assert.match(read('docs/sw.js'),/teacher-access/);});
