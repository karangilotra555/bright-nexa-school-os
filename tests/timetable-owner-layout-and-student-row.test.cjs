'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

test('owner timetable deep link is one focused module, not duplicated sidebar workspace',()=>{
 const html=read('teacher-access.html'),js=read('teacher-access.js');
 assert.match(html,/id="ownerTimetableNav"/);
 assert.match(html,/body\.bn-owner-timetable \.portal-layout>\.portal-nav\{display:none!important\}/);
 assert.match(html,/body\.bn-owner-timetable \[data-view="timetable"\]/);
 assert.match(html,/href="\.\/index\.html\?openSchool=true&amp;tab=Dashboard">← Back to School OS/);
 assert.match(js,/const focused=isAdmin\(\)&&name==='timetable'/);
 assert.match(js,/document\.body\.classList\.toggle\('bn-owner-timetable',focused\)/);
 assert.match(js,/display\('ownerTimetableNav',focused\)/);
 assert.match(js,/new URLSearchParams\(location\.search\)\.get\('view'\)==='timetable'/);
 assert.equal(html,read('docs/teacher-access.html'));
 assert.equal(js,read('docs/teacher-access.js'));
});
test('owner remembered login re-verifies Supabase on timetable navigation',()=>{
 const js=read('teacher-access.js');
 assert.match(js,/requested==='timetable'&&verifiedErp\?\.cloudVerified===true/);
 assert.match(js,/verifiedErp\?\.role==='OWNER'&&verifiedErp\?\.cloudUserId/);
 assert.match(js,/run\(\(\)=>load\(\)\)/);
 const authCheck=js.indexOf("identity=await responseJson(await timedCloudFetch(BASE+'/auth/v1/user'");
 const membershipCheck=js.indexOf("const memberships=await api('school_users'");
 assert.ok(authCheck>=0 && membershipCheck>authCheck);
 assert.match(js,/if\(me\.role==='teacher'&&!isMobileAppContext\(\)\)/);
});
test('student list photo and name never overlay',()=>{
 const css=read('school-student-roster-layout.css');
 assert.match(css,/grid-template-columns:44px minmax\(0,1fr\)/);
 assert.match(css,/\.students-page \.student-cell>span:first-child img/);
 assert.match(css,/object-fit:cover/);
 assert.match(css,/\.students-page \.student-cell>div strong,/);
 assert.equal(css,read('docs/school-student-roster-layout.css'));
 assert.equal(css,read('app-extracted/dist/school-student-roster-layout.css'));
 for(const p of ['index.html','docs/index.html','app-extracted/dist/index.html'])
  assert.match(read(p),/school-student-roster-layout\.css\?v=20261112-student-photo-row-v1/);
});
