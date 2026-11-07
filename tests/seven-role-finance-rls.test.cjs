'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const sql=read('supabase/patches/role_finance_permissions_20261107.sql');
const staff=read('teacher-access.js');
const html=read('teacher-access.html');
const entry=require('../school-role-entry.js');

test('finance student RPC is tenant checked and intentionally reveals only id/name/admission',()=>{
 assert.match(sql,/FUNCTION public\.bn_finance_students\(p_institution_id uuid\)/);
 assert.match(sql,/RETURNS TABLE\(id uuid,name text,admission_number text\)/);
 assert.match(sql,/school_private\.has_role\(p_institution_id,ARRAY\['school_admin','accountant'\]\)/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.bn_finance_students\(uuid\) FROM PUBLIC,anon/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.bn_finance_students\(uuid\) TO authenticated/);
 assert.doesNotMatch(sql,/RETURNS TABLE\([^)]*(?:dob|guardian_email|phone)/);
});

test('finance payment insert checks same-school active student without broadening accountant student RLS',()=>{
 assert.match(sql,/FUNCTION school_private\.finance_student_active\(/);
 assert.match(sql,/s\.id=p_student_id AND s\.institution_id=p_institution_id AND s\.status='active'/);
 assert.match(sql,/CREATE POLICY fee_entries_insert[\s\S]*school_private\.finance_student_active\(institution_id,student_id\)/);
 assert.doesNotMatch(sql,/CREATE POLICY accountant_students_read/);
});

test('no-member staff-module helper is parent-scoped rather than universally true',()=>{
 assert.match(sql,/WHEN NOT EXISTS[\s\S]*THEN school_private\.parent_in_school\(p_institution_id\)/);
 assert.doesNotMatch(sql,/WHEN NOT EXISTS[\s\S]{0,100}THEN TRUE/);
 assert.match(sql,/su\.role <> 'accountant'/);
});

test('old class assignment must not remain visible after staff role changes from teacher',()=>{
 assert.match(sql,/CREATE POLICY teacher_assignments_read[\s\S]*u\.role='teacher'/);
});

test('accountant fee form uses server verified finance roster, not generic student data',()=>{
 assert.match(staff,/api\('rpc\/bn_finance_students','','POST',\{p_institution_id:me\.institution_id\}\)/);
 assert.match(staff,/feeStudentRoster=financeStudents/);
 assert.match(staff,/for\(const student of feeStudentRoster\)/);
 assert.match(staff,/feeStudentRoster\.some\(s=>s\.id===studentId\)/);
 assert.match(staff,/created_by:me\.id/);
 assert.doesNotMatch(staff,/for\(const student of allStudents\)\{[\s\S]{0,120}feeStudent/);
});

test('finance roster cleared whenever account or school changes',()=>{
 assert.match(staff,/feeStudentRoster=\[\];recoveryMode=false/);
 assert.match(staff,/rolePermissions=null;feeStudentRoster=\[\];invalidateRoster/);
});
test('all seven role destinations remain valid with no cross-role ERP bypass',()=>{
 const roles={school_admin:'classes',principal:'classes',teacher:'attendance',accountant:'fees',librarian:'account',receptionist:'profiles',transport_staff:'notices'};
 for(const [role,view] of Object.entries(roles))assert.equal(entry.preferredView(role),view);
 assert.equal(entry.roleDestination({role:'accountant',verified:true,membershipCount:1}),null);
 assert.equal(entry.roleDestination({role:'transport_staff',verified:true,membershipCount:1}),null);
});
test('Render and GitHub Pages copies are identical, and staff JS cache is bumped',()=>{
 assert.equal(staff,read('docs/teacher-access.js'));
 assert.equal(html,read('docs/teacher-access.html'));
 assert.match(html,/teacher-access\.js\?v=20261107-role-finance-qa/);
 assert.doesNotMatch(staff,/SUPABASE_SERVICE_ROLE_KEY/);
});
