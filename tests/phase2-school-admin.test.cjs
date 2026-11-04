'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {studentInput,staffInput,expectUpdated,allPages,PAGE_SIZE}=require('../docs/school-admin-data');
const cls=[{id:'class-a'}],students=[{id:'one',admission_number:' A001 '},{id:'two',admission_number:'A002'}];
test('student validation allows editing own admission but refuses duplicate or unknown class',()=>{
 const record={name:'  Maya Test  ',admission_number:' A001 ',class_id:'class-a',dob:'2016-01-23',status:'active'};
 assert.deepEqual(studentInput(record,cls,students,'one'),{name:'Maya Test',admission_number:'A001',class_id:'class-a',dob:'2016-01-23',status:'active'});
 assert.throws(()=>studentInput(record,cls,students),/Admission number already exists/);
 assert.throws(()=>studentInput({...record,class_id:'other'},cls,[]),/valid class/);
 assert.throws(()=>studentInput({...record,dob:'2099-01-01'},cls,[]),/future/);
 assert.throws(()=>studentInput({...record,status:'deleted'},cls,[]),/status/);
 assert.throws(()=>studentInput({...record,dob:'2026-02-31'},cls,[]),/valid date/);
});
test('staff editing handles employment type fields and rejects incorrect hours',()=>{
 const base={id:'one',display_name:'  Meena  ',designation:'Teacher',employment_type:'contract',contract_end_on:'2027-11-04'};
 assert.equal(staffInput(base,[{id:'one',display_name:'Meena'}]).contract_end_on,'2027-11-04');
 assert.throws(()=>staffInput({...base,id:'two'},[{id:'one',display_name:'Meena'}]),/already exists/);
 assert.throws(()=>staffInput({...base,employment_type:'part_time',days_per_week:8,hours_per_day:4},[]),/part-time/);
 assert.equal(staffInput({...base,employment_type:'visiting',visits_per_month:8},[]).visits_per_month,8);
 assert.throws(()=>staffInput({...base,employment_type:'external'},[]),/employment/);
});
test('write acknowledgement never treats zero-row RLS updates as success',()=>{
 assert.deepEqual(expectUpdated([{id:'student-1'}],'student-1'),{id:'student-1'});
 assert.throws(()=>expectUpdated([],'student-1'),/not confirmed/);
 assert.throws(()=>expectUpdated([{id:'other'}],'student-1'),/not confirmed/);
 assert.throws(()=>expectUpdated(null,'student-1'),/not confirmed/);
});
test('paginated reader fetches every page rather than silently returning first 1000 rows',async()=>{
 const requests=[],records=Array.from({length:1201},(_,i)=>({id:'id-'+String(i).padStart(5,'0')}));
 const result=await allPages(async (table,select,opts)=>{
  requests.push(opts);return records.slice(Number(opts.offset),Number(opts.offset)+Number(opts.limit));
 },'school_students','id',{status:'eq.active'});
 assert.equal(PAGE_SIZE,500);
 assert.equal(result.length,1201);
 assert.deepEqual(requests.map(x=>Number(x.offset)),[0,500,1000]);
 assert.ok(requests.every(x=>x.status==='eq.active' && x.order==='id.asc' && Number(x.limit)===500));
});
test('paginated reader fails closed if a page fails',async()=>{
 await assert.rejects(()=>allPages(async()=>{throw Error('network lost')},'school_students','id'),/network lost/);
 await assert.rejects(()=>allPages(async()=>({error:'failed'}),'school_students','id'),/Invalid school database/);
});
test('phase2 admin modules are loaded before owner app, and dangerous delete stays disabled',()=>{
 const root=path.join(__dirname,'..');
 const html=fs.readFileSync(path.join(root,'docs/real-owner-workspace.html'),'utf8');
 const js=fs.readFileSync(path.join(root,'docs/real-owner-workspace.js'),'utf8');
 assert.match(html,/school-admin-data\\.js/);
 assert.match(js,/BrightNexaSchoolAdmin/);
 assert.match(js,/school_students/);
 assert.match(js,/status:'archived'/);
 assert.doesNotMatch(js,/school_students\\?[^'\\n]*DELETE/);
 assert.doesNotThrow(()=>new vm.Script(js));
});
