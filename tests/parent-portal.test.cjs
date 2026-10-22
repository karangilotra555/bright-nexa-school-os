'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const portalFactory=require('../parent-portal.cjs');

function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec("CREATE TABLE students (id TEXT PRIMARY KEY, admissionNumber TEXT UNIQUE, name TEXT, rollNumber TEXT, className TEXT, section TEXT, fatherName TEXT, busStop TEXT, bloodGroup TEXT, enrollmentStatus TEXT)");
 const ins=db.prepare('INSERT INTO students VALUES (?,?,?,?,?,?,?,?,?,?)');
 ins.run('s1','ADM001','Student One','01','Class I','A','Guardian One','','','ACTIVE');
 ins.run('s2','ADM002','Student Two','02','Class I','B','Guardian Two','','','ACTIVE');
 const handle=portalFactory({
   db,getInstitution:()=>({name:'Demo Academy',session:'2026-27'}),
   verifySessionToken:t=>t==='token1'?{sub:'ADM001'}:t==='token2'?{sub:'ADM002'}:null,
   verifyAdminAuth:req=>req.headers['x-admin-key']==='secret',
   parseJsonBody:async req=>req.body||{},
   sendJson:(res,status,body)=>{res.status=status;res.body=body},
   logAudit:()=>{}
 });
 const call=async(path,method='GET',token=null,body={},admin=false)=>{
   const req={method,headers:{...(token?{authorization:'Bearer '+token}:{}),...(admin?{'x-admin-key':'secret'}:{})},body};
   const res={};await handle(req,res,path,'127.0.0.1');return res;
 };
 return {call,db};
}
test('Parent dashboard requires session; starts without invented scores',async()=>{
 const {call}=setup();
 assert.equal((await call('/api/parent/dashboard')).status,401);
 const r=await call('/api/parent/dashboard','GET','token1');
 assert.equal(r.status,200);assert.equal(r.body.student.admissionNumber,'ADM001');
 assert.equal(r.body.attendance.percent,null);assert.equal(r.body.fees.dueRupees,null);
});
test('Admin publish validates data atomically and preserves parent privacy',async()=>{
 const {call}=setup();
 const payload={
   attendance:[{admissionNumber:'ADM001',day:'2026-10-22',status:'PRESENT'}],
   fees:[{admissionNumber:'ADM001',dueRupees:24650}],
   homework:[{id:'HW1',className:'Class I',section:'A',subject:'Math',title:'Do sums 1-5',dueDate:'2026-10-23'}],
   notices:[{id:'N1',title:'Sports Day',body:'Tomorrow at school'}]
 };
 assert.equal((await call('/api/parent/admin/publish','POST',null,payload)).status,401);
 assert.equal((await call('/api/parent/admin/publish','POST',null,payload,true)).status,200);
 const a=(await call('/api/parent/dashboard','GET','token1')).body;
 const b=(await call('/api/parent/dashboard','GET','token2')).body;
 assert.equal(a.fees.dueRupees,24650);assert.equal(a.attendance.percent,100);
 assert.equal(a.homework.length,1);assert.equal(b.homework.length,0);
 assert.equal(b.fees.dueRupees,null);assert.equal(b.attendance.percent,null);
 const bad={fees:[{admissionNumber:'ADM001',dueRupees:999}],attendance:[{admissionNumber:'ADM001',day:'not-a-day',status:'PRESENT'}]};
 assert.equal((await call('/api/parent/admin/publish','POST',null,bad,true)).status,400);
 assert.equal((await call('/api/parent/dashboard','GET','token1')).body.fees.dueRupees,24650);
});
test('Parent leave is saved only for authenticated child',async()=>{
 const {call}=setup();
 const leave={fromDay:'2026-10-22',toDay:'2026-10-23',reason:'Family function'};
 assert.equal((await call('/api/parent/leave','POST',null,leave)).status,401);
 assert.equal((await call('/api/parent/leave','POST','token1',leave)).status,201);
 assert.equal((await call('/api/parent/dashboard','GET','token1')).body.leaves.length,1);
 assert.equal((await call('/api/parent/dashboard','GET','token2')).body.leaves.length,0);
 assert.equal((await call('/api/parent/admin/leaves','GET',null,{},true)).body.leaves.length,1);
});
