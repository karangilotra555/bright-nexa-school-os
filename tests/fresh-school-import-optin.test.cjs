'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname,'..',name),'utf8');

test('local school draft is imported ONLY if owner explicitly checks import',()=>{
 const source=read('teacher-access.js');
 const selection=source.match(/const importing=([^;]+);/);
 assert.ok(selection,'The actual import selection expression must exist');
 // Test the actual expression used by the submit handler, not a reimplementation.
 const decide=new Function('LOCAL_DRAFT','$','return '+selection[1]);
 const exists={name:'Old Device School'};
 assert.equal(decide(exists,()=>({checked:false})),false,'unchecked is fresh cloud school');
 assert.equal(decide(exists,()=>({checked:true})),true,'explicit checkbox allows import');
 assert.equal(decide(null,()=>({checked:true})),false,'no local draft means no import');
 assert.doesNotMatch(source,/if\(FROM_LOCAL&&!LOCAL_DRAFT&&localStorage\.getItem/,'a stale unreadable local draft must not block starting fresh');
 assert.match(source,/localStorage\.removeItem\('bn_school_cloud_handoff_intent_v1'\)/);
});

test('new school registration does not prefill a stale school name or auto-upload it',()=>{
 const src=read('teacher-access.js');
 assert.doesNotMatch(src, /\$\('firstSchoolName'\)\.value=LOCAL_DRAFT\.name/);
 assert.match(src, /Leave import unchecked to create a new empty school in Supabase/);
 assert.match(src, /if\(importing\)\{[\s\S]*LOCAL_DRAFT\.name!==name/);
 assert.equal(read('teacher-access.js'),read('docs/teacher-access.js'));
 assert.equal(read('teacher-access.html'),read('docs/teacher-access.html'));
});
