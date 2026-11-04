'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const core=require('../docs/school-phase-c-students.js');
const backup=require('../docs/school-backup-core.js');
const file=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const school='11111111-1111-4111-8111-111111111111',owner='22222222-2222-4222-8222-222222222222';
const students=[{id:'student-one',name:'A',status:'active'},{id:'student-old',name:'B',status:'archived'}];
test('private student profile validates contact details and owns student scope',()=>{
 const actual=core.validateProfile('student-one',{guardian_name:'  Monika   Batra  ',
  guardian_relationship:'Mother',guardian_phone:'+91 9058514478',
  guardian_email:'parent@example.com',city:'Haridwar',admission_on:'2026-07-15'},students);
 assert.equal(actual.guardian_name,'Monika Batra');assert.equal(actual.guardian_phone,'+91 9058514478');
 assert.equal(actual.city,'Haridwar');assert.equal(actual.postal_code,null);
 assert.equal(actual.admission_on,'2026-07-15');
 assert.equal(core.validateProfile('student-old',{},students).student_id,'student-old');
 assert.throws(()=>core.validateProfile('other-school-child',{},students),/verified student/);
 assert.throws(()=>core.validateProfile('student-one',{guardian_email:'not@valid'},students),/invalid/);
 assert.throws(()=>core.validateProfile('student-one',{guardian_phone:'123'},students),/valid guardian phone/);
 assert.throws(()=>core.validateProfile('student-one',{city:'x'.repeat(101)},students),/exceeds 100/);
 assert.throws(()=>core.validateProfile('student-one',{admission_on:'2026-02-30'},students),/real date/);
});
test('document checklist permits only known types/states and manual owner attribution',()=>{
 const data=core.validateDocument('student-one',{document_type:'birth_certificate',status:'verified',notes:' Verified against original '},students,owner);
 assert.deepEqual([data.status,data.checked_by,typeof data.checked_at],['verified',owner,'string']);
 assert.equal(data.notes,'Verified against original');
 const unverified=core.validateDocument('student-one',{document_type:'address_proof',status:'received'},students,null);
 assert.equal(unverified.checked_by,null);assert.equal(unverified.checked_at,null);
 assert.throws(()=>core.validateDocument('student-one',{document_type:'unknown',status:'verified'},students,owner),/Unknown document type/);
 assert.throws(()=>core.validateDocument('student-one',{document_type:'birth_certificate',status:'published'},students,owner),/Unknown document status/);
 assert.throws(()=>core.validateDocument('student-one',{document_type:'birth_certificate',status:'verified'},students,'bad-owner'),/verified school owner/);
 assert.throws(()=>core.validateDocument('student-one',{document_type:'birth_certificate',status:'received',notes:'x'.repeat(301)},students,owner),/300/);
});
test('document counts report manually checked vs received, duplicate IDs rejected',()=>{
 const docs=[{id:'1',student_id:'student-one',document_type:'birth_certificate',status:'verified'},
  {id:'2',student_id:'student-one',document_type:'address_proof',status:'received'},
  {id:'3',student_id:'other',document_type:'guardian_id',status:'verified'}];
 const result=core.checklist(docs,'student-one');
 assert.equal(result.received,2);assert.equal(result.verified,1);assert.equal(result.missing,result.total-2);
 assert.match(result.note,/No file upload/);
 assert.throws(()=>core.checklist([...docs,{...docs[0],id:'4'}],'student-one'),/Duplicate/);
});
test('server save confirmations fail on zero rows or foreign school, student and changed contact',()=>{
 const expected={student_id:'student-one',institution_id:school,guardian_phone:'1234567890'};
 assert.equal(core.confirmRow([{...expected}],expected).student_id,'student-one');
 assert.throws(()=>core.confirmRow([],expected),/not confirmed/);
 assert.throws(()=>core.confirmRow([{...expected,student_id:'other'}],expected),/different school or student/);
 assert.throws(()=>core.confirmRow([{...expected,guardian_phone:'9999999999'}],expected),/different school or student/);
});
test('Phase C1 SQL restricts private details to school owner and guarantees tenant-safe foreign keys',()=>{
 const sql=file('supabase/migrations/20261104111500_phase_c_student_profiles_and_documents.sql');
 for(const table of ['school_student_profiles','school_student_document_checks']){
  assert.match(sql,new RegExp('create table if not exists public\\.'+table,'i'));
  assert.match(sql,new RegExp('alter table public\\.'+table+' enable row level security','i'));
  assert.match(sql,new RegExp('revoke all on table public\\.'+table+' from anon,authenticated','i'));
 }
 assert.match(sql,/foreign key\(student_id,institution_id\)/i);
 assert.match(sql,/school_private\.has_role\(institution_id,array\['school_admin'::text\]\)/);
 assert.match(sql,/create policy bn_student_documents_owner_read/i);
 assert.match(sql,/grant update \(guardian_name,guardian_relationship,guardian_phone/i);
 assert.match(sql,/grant update \(status,notes,checked_by,checked_at,updated_at\)/i);
 assert.doesNotMatch(sql,/grant select,insert,update on table/i);
 assert.doesNotMatch(sql,/to anon\s+using\s*\(true\)|service_role|storage\.objects/i);
});
test('owner Students screen gains selected-student editor and private records stay outside global state',()=>{
 const html=file('docs/real-owner-workspace.html'),ownerJs=file('docs/real-owner-workspace.js');
 const ui=file('docs/school-phase-c-students-ui.js'),sw=file('docs/owner-offline-sw.js');
 assert.ok(html.indexOf('school-phase-c-students.js')<html.indexOf('school-phase-c-students-ui.js'));
 assert.ok(html.indexOf('school-phase-c-students-ui.js')<html.indexOf('real-owner-workspace.js'));
 assert.match(ownerJs,/BrightNexaPhaseCStudentProfiles\?\.attach/);
 assert.match(ui,/inSchool\('school_student_profiles'/);
 assert.match(ui,/inSchool\('school_student_document_checks'/);
 assert.match(ui,/method:'PATCH'/);
 assert.match(ui,/method:'POST'/);
 assert.match(ui,/updated_at:'eq\.'/);
 assert.doesNotMatch(ui,/localStorage\.setItem|service_role|sb_secret_|data:image/);
 assert.ok(sw.includes('school-phase-c-students.js'));assert.ok(sw.includes('school-phase-c-students-ui.js'));
 assert.match(sw,/bright-nexa-owner-shell-v9/);
 for(const src of [ownerJs,ui,file('docs/school-phase-c-students.js')])assert.doesNotThrow(()=>new vm.Script(src));
});
test('encrypted backup includes new private tables but legacy encrypted snapshots remain verifiable',async()=>{
 for(const t of ['school_student_profiles','school_student_document_checks'])assert.ok(backup.TABLES.includes(t));
 const coreStudentRows=await backup.collect(async table=>[{id:'row',institution_id:school}],{id:school,name:'Private School'});
 assert.equal(coreStudentRows.table_names.length,18);
 assert.equal(coreStudentRows.tables.school_student_profiles.length,1);
 const older={...coreStudentRows,table_names:coreStudentRows.table_names.filter(t=>!['school_student_profiles','school_student_document_checks'].includes(t))};
 const tables=Object.fromEntries(older.table_names.map(k=>[k,older.tables[k]]));
 older.tables=tables;
 const crypto=require('node:crypto');
 if(!globalThis.crypto)globalThis.crypto=crypto.webcrypto;
 const encrypted=await backup.encrypt(older,'BackupKeyForTesting2026');
 const decrypted=await backup.decrypt(encrypted,'BackupKeyForTesting2026');
 assert.deepEqual(decrypted.table_names,older.table_names);
});
