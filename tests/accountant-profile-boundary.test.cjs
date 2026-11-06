'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const portal=fs.readFileSync('teacher-access.js','utf8');
const rls=fs.readFileSync('supabase/migrations/20261106144841_accountant_finance_only_student_profile_boundary.sql','utf8');
test('Accountant student-profile visibility cannot be reenabled by checkbox',()=>{
 assert.match(portal,/accountant:\{classes:true,attendance:false,homework:false,notices:true,profiles:false\}/);
 assert.match(portal,/if\(next.accountant\)next.accountant.profiles=false/);
 assert.match(portal,/cb.disabled=true;cb.title='Finance-only/);
 assert.equal(portal,fs.readFileSync('docs/teacher-access.js','utf8'));
});
test('RLS restricts accountant profile reads regardless of client setting',()=>{
 assert.match(rls,/AS RESTRICTIVE FOR SELECT TO authenticated/);
 assert.match(rls,/NOT school_private.has_role\(institution_id,ARRAY\['accountant'\]\)/);
 assert.match(rls,/ARRAY\['receptionist'\]/);
});
