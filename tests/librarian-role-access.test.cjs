const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const R=p=>fs.readFileSync(p,'utf8');
test('Librarian staff role is supported from invite through menu without other academic rights',()=>{
 const teacher=R('teacher-access.js'),html=R('teacher-access.html'),edge=R('supabase/functions/school-invite-staff/index.ts');
 assert.equal(teacher,R('docs/teacher-access.js'));assert.equal(html,R('docs/teacher-access.html'));
 assert.match(teacher,/ROLES=\[[^\]]*'librarian'/);
 assert.match(teacher,/librarian:\{classes:false,attendance:false,homework:false,notices:false,profiles:false\}/);
 assert.match(html,/value="librarian"/);
 assert.match(html,/id="librarianApp"/);
 assert.match(edge,/new Set\(\[[^\]]*"librarian"/);
});
test('Library endpoints require authenticated staff and never use a browser-only book store',()=>{
 const html=R('library.html'),js=R('library.js');
 assert.equal(html,R('docs/library.html'));assert.equal(js,R('docs/library.js'));
 assert.match(js,/school_library_items/);assert.match(js,/school_library_loans/);
 assert.match(js,/school_students/);assert.match(js,/Bearer /);
 assert.match(js,/school_users/);
 assert.doesNotMatch(js,/localStorage|indexedDB/);
 assert.match(js,/returned_on/);
 assert.match(html,/id="issueBook"/);
 assert.match(html,/id="returnList"/);
});
test('Library unreturned loan display resolves transferred/archived students and restricts issue to active',()=>{
 const js=R('library.js');
 assert.doesNotMatch(js,/all\('school_students'[^)]*status:'eq\.active'/,'student query must not filter active-only so unreturned loans resolve transferred students');
 assert.match(js,/status\s*!==\s*'active'|status\s*===\s*'active'/,'unreturned loan display must identify student status and active status');
});
test('Library schema is Supabase RLS first and forbids cross-tenant or duplicate active loans',()=>{
 const text=R('supabase/migrations/20261106140122_librarian_role_library_inventory_rls.sql');
 for(const p of [/ENABLE ROW LEVEL SECURITY/g,/CREATE POLICY library_loans_insert/,/CREATE POLICY library_items_read/,/FOREIGN KEY\(student_id,institution_id\)/,/UNIQUE INDEX school_library_one_active_loan/,/school_private\.has_role/,/school_library_loan_update_guard/])assert.match(text,p);
 assert.doesNotMatch(text,/GRANT DELETE/);
});
test('TDD RED: library portal checks bn_school_writable and shows read-only status when subscription expired',()=>{
 const js=R('library.js');
 assert.match(js,/bn_school_writable/);
 assert.match(js,/read-only/i);
});
