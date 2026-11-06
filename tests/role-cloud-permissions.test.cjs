const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const js=fs.readFileSync('teacher-access.js','utf8');
test('portal mirrors match',()=>assert.equal(js,fs.readFileSync('docs/teacher-access.js','utf8')));
test('roles are loaded and saved through Supabase rather than localStorage',()=>{
 assert.match(js,/async function loadRolePermissions\(\)/);
 assert.match(js,/api\('school_role_module_permissions','on_conflict=institution_id,role,module_key','POST'/);
 assert.doesNotMatch(js,/bright-nexa-school-os:role-permissions/);
});
test('shortcuts and profile edits respect effective role and class rights',()=>{
 assert.match(js,/isTabVisibleForRole\('attendance',me.role\)\&\&writableClasses/);
 assert.match(js,/isTabVisibleForRole\('homework',me.role\)\&\&writableClasses/);
 assert.match(js,/const viewer=!isAdmin\(\)/);
 assert.match(js,/field.disabled=viewer/);
});
