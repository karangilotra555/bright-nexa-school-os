'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('review regression: all school writes keep tenant/class foreign keys',()=>{
 const sql=read('supabase/migrations/20261022_fix_teacher_rls_correlated_tenant_checks.sql');
 for(const name of [
  'school_attendance_student_tenant_class_fkey',
  'school_attendance_recorder_tenant_fkey',
  'school_homework_creator_tenant_fkey',
  'school_students_id_institution_class_unique'
 ])assert.ok(sql.includes(name),'Missing '+name);
 for(const name of [
  'school_attendance_insert','school_attendance_update',
  'school_homework_insert','school_homework_update',
  'teacher_assignments_insert','teacher_assignments_update'
 ])assert.ok(sql.includes('CREATE POLICY '+name),'Missing '+name);
 assert.doesNotMatch(sql,/u\.institution_id\s*=\s*u\.institution_id|s\.class_id\s*=\s*s\.class_id|s\.institution_id\s*=\s*s\.institution_id/);
 assert.match(sql,/u\.institution_id = school_attendance\.institution_id/);
 assert.match(sql,/s\.institution_id = school_attendance\.institution_id/);
 assert.match(sql,/u\.institution_id = school_homework\.institution_id/);
 assert.match(sql,/u\.institution_id = school_teacher_assignments\.institution_id/);
});

test('review regression: anonymous users have no school table grants',()=>{
 const sql=read('supabase/migrations/20261022_revoke_anonymous_school_table_grants.sql');
 for(const table of ['institutions','school_users','school_classes','school_students','school_audit_events','school_teacher_assignments','school_attendance','school_homework']){
  assert.ok(sql.includes('public.'+table),'Anonymous grants not revoked on '+table);
 }
 assert.match(sql,/FROM anon;/);
});

test('review regression: environment example has no real secret values',()=>{
 const env=read('.env.example');
 assert.match(env,/SESSION_SECRET/);
 assert.match(env,/ADMIN_API_KEY/);
 assert.match(env,/SUPABASE_SERVICE_ROLE_KEY/);
 assert.doesNotMatch(env,/^\s*(SESSION_SECRET|ADMIN_API_KEY|SUPABASE_SERVICE_ROLE_KEY)\s*=\s*\S+/m);
});

test('review regression: public teacher frontend has publishable key only',()=>{
 const js=read('teacher-access.js');
 assert.match(js,/sb_publishable_/);
 assert.doesNotMatch(js,/sb_secret_|SUPABASE_SERVICE_ROLE_KEY|service_role.*eyJ|postgres:\/\//);
});
