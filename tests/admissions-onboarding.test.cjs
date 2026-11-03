'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('cloud operations source and website mirror deployed docs',()=>{
  for(const file of ['school-operations.html','school-operations.js','teacher-access.js'])
    assert.equal(read(file),read('docs/'+file),'Missing published mirror: '+file);
  for(const file of ['school-operations.js','teacher-access.js'])
    assert.doesNotThrow(()=>new vm.Script(read(file)),file+' has JS syntax error');
});
test('school email validation accepts normal addresses and rejects invalid ones',()=>{
 const code=read('teacher-access.js');
 const line=code.split('\n').find(x=>x.includes('.test(id)'));
 assert.ok(line,'No sign-in validation found');
 const m=/if\(!\/(.*)\/\.test\(id\)\)/.exec(line);
 assert.ok(m,'Cannot extract validation regex');
 const email=new RegExp(m[1]);
 assert.equal(email.test('admin@school.in'),true);
 assert.equal(email.test('owner.name+school@example.com'),true);
 assert.equal(email.test('admin@school\\xom'),false);
 assert.equal(email.test('bad-email'),false);
 assert.match(code,/requireField\('signupOwnerEmail'/);
});
test('cloud admission uses approved class and authenticated school scoped REST inserts',()=>{
 const code=read('school-operations.js'),html=read('school-operations.html');
 for(const id of ['admissionsSection','opsClassForm','admissionForm','admissionClass','admissionNumber','admissionName','admissionDOB','admissionRows','studentSearch']){
   assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(code,/const canAdmission=\(\)=>\['school_admin','principal'\]/);
 assert.match(code,/if\(!canAdmission\(\)\)throw Error\('School admin or principal access required/);
 assert.match(code,/api\('school_students',\{\},'POST'/);
 assert.match(code,/api\('school_classes',\{\},'POST'/);
 assert.match(code,/institution_id:me\.institution_id/);
 assert.match(code,/Date of birth must be a valid past date/);
 assert.match(code,/student\.dob\|\|'—'/);
 assert.doesNotMatch(code,/localStorage\.|service_role|sb_secret_/);
});
test('database prevents case-insensitive duplicate admission and unsafe public table grants',()=>{
 const sql=read('supabase/migrations/20261103132812_least_privilege_student_admissions.sql');
 assert.match(sql,/CREATE UNIQUE INDEX school_students_admission_ci_unique/);
 assert.match(sql,/lower\(btrim\(admission_number\)\)/);
 assert.match(sql,/REVOKE TRUNCATE, TRIGGER, REFERENCES/);
 assert.match(sql,/REVOKE DELETE ON TABLE/);
 assert.match(sql,/FROM anon,authenticated/);
 assert.doesNotMatch(sql,/DISABLE ROW LEVEL SECURITY/);
});
