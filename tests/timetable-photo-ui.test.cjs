'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const engine=require('../school-timetable-cloud.js');
const photo=require('../school-student-photo-cloud.js');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('Indian school bell builder schedules Mon–Sat periods, breaks and lunch without overlaps',()=>{
 const slots=engine.buildBellSchedule({
  start:'08:00',periods:8,duration:40,breakAfter:3,breakMinutes:15,
  lunchAfter:5,lunchMinutes:30,days:[1,2,3,4,5,6],year:'2026'
 });
 assert.equal(slots.length,60);
 for(let d=1;d<=6;d++){
  const day=slots.filter(x=>x.weekday===d);
  assert.equal(day.filter(x=>x.kind==='period').length,8);
  assert.equal(day.filter(x=>x.kind==='break').length,1);
  assert.equal(day.filter(x=>x.kind==='lunch').length,1);
  assert.equal(day[0].starts_at,'08:00:00');
  assert.equal(day[day.length-1].ends_at,'14:05:00');
  for(let i=1;i<day.length;i++){
   assert.equal(day[i].slot_index,i+1);
   assert.equal(day[i-1].ends_at,day[i].starts_at,'Periods and breaks must not overlap');
  }
 }
 assert.throws(()=>engine.buildBellSchedule({year:'2026',periods:18}),/period/i);
 assert.throws(()=>engine.buildBellSchedule({year:'2026',duration:15}),/20–90/i);
 assert.throws(()=>engine.buildBellSchedule({year:'2026',start:'25:00'}),/time/i);
});

test('auto generator fills only empty periods with assigned subject teachers and avoids clashes',()=>{
 const classId='class-A',other='class-B',schoolId='school-A';
 const slots=[{id:'p1',weekday:1,slot_index:1,kind:'period',academic_year:'2026'},
 {id:'p2',weekday:1,slot_index:2,kind:'period',academic_year:'2026'},
 {id:'p3',weekday:2,slot_index:1,kind:'period',academic_year:'2026'}];
 const drafts=[{class_id:classId,slot_id:'p1',subject:'Mathematics',teacher_user_id:'teacher-M'}];
 const published=[{class_id:other,slot_id:'p2',subject:'Mathematics',teacher_user_id:'teacher-M'}];
 const assignments=[{class_id:classId,active:true,assignment_type:'subject_teacher',subject:'Mathematics',school_user_id:'teacher-M'},
 {class_id:classId,active:true,assignment_type:'subject_teacher',subject:'English',school_user_id:'teacher-E'}];
 const targets=[{subject:'Mathematics',teacher_user_id:'teacher-M',count:2},
 {subject:'English',teacher_user_id:'teacher-E',count:1}];
 const plan=engine.autoFill({slots,drafts,published,assignments,targets,classId,schoolId,year:'2026'});
 assert.equal(plan.length,2);
 assert.deepEqual(new Set(plan.map(x=>x.slot_id)),new Set(['p2','p3']));
 assert.equal(plan.find(x=>x.slot_id==='p2').teacher_user_id,'teacher-E');
 assert.equal(plan.find(x=>x.slot_id==='p3').teacher_user_id,'teacher-M');
 assert.ok(!plan.some(x=>x.slot_id==='p1'));
 assert.ok(plan.every(x=>x.institution_id===schoolId&&x.academic_year==='2026'));
 assert.throws(()=>engine.autoFill({slots,drafts,published,assignments,targets:[{...targets[0],count:8}],classId,schoolId,year:'2026'}),/exceed/);
 assert.throws(()=>engine.autoFill({slots,drafts,published,assignments,targets:[{subject:'Biology',teacher_user_id:'unassigned',count:1}],classId,schoolId,year:'2026'}),/assigned/);
});

test('private photo uploader validates tenant/student IDs, file types and uses signed URLs',async()=>{
 const school='11111111-1111-1111-1111-111111111111',student='22222222-2222-2222-2222-222222222222';
 const BASE='https://example.supabase.co',requests=[];
 const fetcher=async(url,options={})=>{
  requests.push({url,method:options.method,headers:options.headers,body:options.body});
  const result=url.includes('/object/sign/')?{signedURL:'/object/sign/school-student-photos/path?token=test'}:{ok:true};
  return {ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>result};
 };
 const client=photo.create({base:BASE,key:'publishable-test',token:async()=> 'test-user-jwt',fetcher});
 assert.throws(()=>client.validate({type:'image/svg+xml',size:100}),/JPG/);
 assert.throws(()=>client.validate({type:'image/jpeg',size:8*1024*1024}),/5 MB/);
 await assert.rejects(client.upload('invalid-id',student,{type:'image/png',size:100}),/valid school/i);
 const result=await client.upload(school,student,{type:'image/webp',size:1200});
 assert.ok(result.path.startsWith(school+'/'+student+'/photo-'));
 assert.ok(result.path.endsWith('.webp'));
 assert.ok(result.url.startsWith(BASE+'/storage/v1/object/sign/'));
 const upload=requests.find(x=>x.url.includes('/storage/v1/object/school-student-photos/'));
 assert.ok(upload);assert.equal(upload.headers['x-upsert'],'false');
 assert.equal(upload.headers.Authorization,'Bearer test-user-jwt');
 const link=requests.find(x=>x.url.includes('/rpc/bn_save_student_photo'));
 assert.ok(link);
 assert.equal(JSON.parse(link.body).p_student_id,student);
 assert.equal(JSON.parse(link.body).p_storage_path,result.path);
 assert.ok(!result.url.includes('public'));
});

test('school timetable & student-photo features preserve the mirrored approved portal',()=>{
 for(const p of ['teacher-access.html','teacher-access.js','school-student-photo-cloud.js','school-student-profile.js','parents.html','parents-cloud.js','parents-download-menu.js']){
  assert.equal(read(p),read('docs/'+p),p);
 }
 for(const keyword of ['schoolTimetableRoot','timetableTab','studentPhotoWrap','studentPhotoInput','uploadStudentPhoto']){
  assert.ok(read('teacher-access.html').includes(keyword),keyword);
 }
 assert.ok(read('teacher-access.js').includes('window.BNTimetable.activate'));
 assert.ok(read('parents-cloud.js').includes('bn_portal_student_timetable'));
 assert.ok(read('parents-cloud.js').includes('studentPhoto(link,profiles[0])'));
 assert.ok(read('parents-download-menu.js').includes('teacher-access.html?view=timetable'));
 assert.ok(read('docs/parents.html').includes('school-student-photo-cloud.js'));
});
