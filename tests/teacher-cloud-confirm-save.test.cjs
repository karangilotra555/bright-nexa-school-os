'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
test('Teacher record is not reported saved or modal closed until cloud acknowledges',()=>{
 const source=read('app-extracted/src/BrightNexaApp.jsx');
 const bundle=read('assets/index-brightnexa-v2.js');
 for(const js of [source,bundle]){
  assert.ok(js.includes("result?.status !== 'synced' || result.pending"));
  assert.ok(js.includes("Teacher is pending in this browser"));
  assert.ok(js.includes('cloud.controller.autosave(nextSnapshot)'));
  assert.ok(js.includes('pendingTeacherId.current'),'retries must reuse the same stable teacher ID');
  assert.ok(js.includes('if (savingToCloud) return;'),'double click must not submit twice');
  assert.ok(js.includes('Saving teacher to Supabase...'));
  const from=js.indexOf('function Sr({ data:'),end=js.indexOf('function Cr({',from);
  const section=js.slice(from,end);
  assert.ok(section.indexOf("result?.status !== 'synced'")<section.indexOf('r(false)') || section.indexOf("result?.status !== 'synced'")<section.indexOf('r2(false)'), 'modal closes only after confirmation');
 }
 for(const file of ['docs/assets/index-brightnexa-v2.js','app-extracted/dist/assets/index-brightnexa-v2.js'])assert.equal(read(file),bundle);
});
test('hosted application and PWA precache receive new teacher-save bundle',()=>{
 const e=read('school-erp-entry.js'),html=read('index.html'),sw=read('sw.js');
 assert.ok(e.includes('index-brightnexa-v2.js?v=20261111-teacher-confirm-v1'));
 assert.ok(html.includes('school-erp-entry.js?v=20261111-teacher-confirm-v1'));
 const items=[['assets/index-brightnexa-v2.js',read('assets/index-brightnexa-v2.js')],['school-erp-entry.js?v=20261111-teacher-confirm-v1',e],['index.html',html]];
 for(const [url,content] of items){
  const hash=crypto.createHash('sha256').update(content).digest('hex');
  assert.ok(sw.includes('url:"'+url+'",revision:"'+hash+'"')||sw.includes('"url":"'+url+'","revision":"'+hash+'"'), 'wrong SW hash '+url);
 }
 for(const f of ['index.html','school-erp-entry.js','sw.js'])for(const prefix of ['docs/','app-extracted/dist/'])assert.equal(read(f),read(prefix+f));
});
test('optimized server function preserves student photo records and write RLS/CAS',()=>{
 const sql=read('supabase/migrations/20261111092219_avoid_rewriting_unchanged_school_profiles_workspace_links.sql');
 assert.ok(sql.includes('school_workspace_links.payload is distinct from excluded.payload'));
 assert.ok(sql.includes('school_student_profiles.details is distinct from'));
 assert.ok(sql.includes('school_student_profiles.details||excluded.details'));
 assert.ok(sql.includes('school_private.has_role'));
 assert.ok(sql.includes('w.revision<>p_expected_revision'));
 assert.ok(sql.includes('for update'));
 assert.ok(sql.includes('return public.school_workspace_pull(p_institution_id)'));
});
