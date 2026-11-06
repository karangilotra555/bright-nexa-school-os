const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const source=fs.readFileSync('teacher-access.js','utf8');
test('staff names are sourced from and saved to Supabase, not browser localStorage',()=>{
 assert.match(source,/function staffName\(s\)/);
 assert.match(source,/if\(s.display_name\)return s.display_name/);
 assert.match(source,/async function updateStaffName\(staff,newName\)/);
 assert.match(source,/display_name:newName/);
 assert.doesNotMatch(source,/bright-nexa-school-os:staff-names/);
});
test('staff portal mirrored Javascript and HTML remain synchronized',()=>{
 assert.equal(source,fs.readFileSync('docs/teacher-access.js','utf8'));
 assert.equal(fs.readFileSync('teacher-access.html','utf8'),fs.readFileSync('docs/teacher-access.html','utf8'));
});
