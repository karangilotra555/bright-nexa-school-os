'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const studentId='44444444-4444-4444-4444-444444444444';
const schoolId='bc80e32d-485d-48a8-903a-92338aa61005';
const classId='55555555-5555-5555-5555-555555555555';

test('student/parent web and Android target one cloud portal and one admission ID',()=>{
 const html=read('parents.html'),docs=read('docs/parents.html');
 assert.equal(html,docs);
 assert.equal(read('parents-cloud.js'),read('docs/parents-cloud.js'));
 assert.equal(read('school-attendance-calendar.js'),read('docs/school-attendance-calendar.js'));
 assert.ok(html.includes('Student & Parent'));
 assert.ok(html.includes('Student admission number'));
 assert.ok(html.includes('studentProfileSections'));
 assert.ok(html.includes('BNStudentProfile.render'));
 assert.ok(!html.includes("fetch('/api/auth/login"),'Legacy SQLite student login is prohibited');
 const android=read('android-parents/app/src/main/java/com/brightnexa/parents/MainActivity.java');
 assert.ok(android.includes('/parents.html'));
 for(const p of ['student-portal.html','docs/student-portal.html','app-extracted/dist/student-portal.html']){
  assert.ok(read(p).includes('Shared Student & Parent Portal Redirect'));
  assert.ok(read(p).includes("location.replace(next.href)"));
 }
});

test('student portal redirects duplicate logins but preserves school profile and signed QR verification',()=>{
 const html=read('student-portal.html');
 const match=html.match(/Shared Student & Parent Portal Redirect:[\s\S]*?<script>([\s\S]*?)<\/script>/);
 assert.ok(match,'Expected isolated early redirect script');
 const run=(url)=>{
  const u=new URL(url),arr=[];
  const location={search:u.search,hash:u.hash,href:u.href,replace:link=>arr.push(link)};
  vm.runInNewContext(match[1],{location,URL,URLSearchParams});
  return arr;
 };
 assert.deepEqual(run('https://school.example/student-portal.html').map(x=>new URL(x).pathname),['/parents.html']);
 assert.deepEqual(run('https://school.example/student-portal.html?action=verify&adm=ADM123'),[]);
 assert.deepEqual(run('https://school.example/student-portal.html#/school-profile'),[]);
 assert.deepEqual(run('https://school.example/student-portal.html#/demo'),[]);
 const path=run('https://school.example/student-portal.html?school='+schoolId+'&adm=NOPE');
 assert.equal(new URL(path[0]).searchParams.get('school'),schoolId);
 assert.equal(new URL(path[0]).searchParams.has('adm'),false);
 assert.equal(read('portal.js'),read('docs/portal.js'));
 assert.ok(read('portal.js').includes("window.location.assign('./parents.html')"));
});

function stubbedClient(teachersEnabled=true){
 const calls=[],data={
  institutions:[{id:schoolId,name:'Example School',status:'active'}],
  school_classes:[{id:classId,name:'6',section:'A',academic_year:'2026'}],
  school_students:[{id:studentId,institution_id:schoolId,name:'Example Student',admission_number:'ADM-01',status:'active',class_id:classId}],
  school_student_profiles:[{student_id:studentId,details:{apaar_id:'example',blood_group:'O+',student_email:'student@example.test'}}],
  school_attendance:[{status:'present',day:'2026-11-05'}],
  school_fee_entries:[{kind:'charge',amount_rupees:100}],
  school_homework:[],
  school_notices:[],
  school_parent_leaves:[]
 };
 const response=(body,code=200)=>({ok:code<300,status:code,text:async()=>JSON.stringify(body),json:async()=>body});
 const fetcher=async(url,options={})=>{
  const u=new URL(url);calls.push({path:u.pathname,method:options.method||'GET',body:options.body});
  if(u.pathname.endsWith('/school-student-login'))return response({
   session:{access_token:'fixture-token',user:{id:'fixture-parent'}},
   links:[{institution_id:schoolId,student_id:studentId}]
  });
  if(u.pathname.endsWith('/bn_portal_class_teachers')){
   const input=JSON.parse(options.body);
   assert.equal(input.p_institution_id,schoolId);
   assert.equal(input.p_student_id,studentId);
   return teachersEnabled
    ? response([{assignment_type:'class_teacher',subject:'Class teacher',teacher_name:'Teacher A'},{assignment_type:'subject_teacher',subject:'Math',teacher_name:'Teacher B'}])
    : response({code:'PGRST202'},404);
  }
  const name=u.pathname.split('/').pop();
  if(Object.hasOwn(data,name))return response(data[name]);
  throw Error('Unexpected request: '+u.pathname);
 };
 return {client:require('../parents-cloud.js').create(fetcher),calls};
}

test('one school-authorized child returns own fees/attendance/profile and assigned teacher summaries',async()=>{
 const f=stubbedClient(true),logged=await f.client.login('ADM-01','fixture-password');
 assert.equal(logged.links.length,1);
 const info=await f.client.dashboard(logged.links[0]);
 assert.equal(info.student.name,'Example Student');
 assert.equal(info.student.profile.details.apaar_id,'example');
 assert.equal(info.student.profile.details.blood_group,'O+');
 assert.equal(info.fees.dueRupees,100);
 assert.equal(info.attendance.percent,100);
 assert.equal(info.teachersStatus,'loaded');
 assert.equal(info.teachers.length,2);
 assert.equal(info.teachers[0].teacher_name,'Teacher A');
 assert.deepEqual(info.timetable,[],'No timetable should ever be invented');
 const rpc=f.calls.find(x=>x.path.endsWith('/bn_portal_class_teachers'));
 assert.ok(rpc);assert.equal(rpc.method,'POST');
});

test('absence of optional teacher RPC does not break other linked student records',async()=>{
 const f=stubbedClient(false);
 const result=await f.client.login('ADM-01','fixture-password');
 const data=await f.client.dashboard(result.links[0]);
 assert.equal(data.student.name,'Example Student');
 assert.equal(data.teachersStatus,'unavailable');
 assert.equal(data.teachers.length,0);
 assert.equal(data.timetableStatus,'unavailable','RPC missing must not be misreported as published empty data');
 const profile=read('school-student-profile.js');
 for(const text of ['Class teacher','Subject-wise teachers','Class timetable','Not published by school yet'])
  assert.ok(profile.includes(text),text);
 assert.equal(profile,read('docs/school-student-profile.js'));
});

test('teacher-name RPC requires verified guardian relationship and exposes no staff contact fields',()=>{
 const sql=read('supabase/migrations/20261107152500_student_parent_class_teachers.sql');
 assert.ok(sql.includes('school_private.parent_of(p_student_id,p_institution_id)'));
 assert.ok(sql.includes('auth.uid() IS NOT NULL'));
 assert.ok(sql.includes('s.id=p_student_id'));
 assert.ok(sql.includes("s.status='active'"));
 assert.ok(sql.includes("a.active=TRUE"));
 assert.ok(sql.includes('REVOKE ALL ON FUNCTION'));
 assert.ok(sql.includes('TO authenticated'));
 assert.ok(!sql.includes('u.email'));
 assert.ok(!sql.includes('sp.contact_mobile'));
 assert.ok(!sql.includes('sp.contact_email'));
});
