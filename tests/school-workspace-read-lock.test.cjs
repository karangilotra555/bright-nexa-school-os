'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('Supabase school pull migration is read-only for existing workspace and preserves role checks',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'../supabase/migrations/20261111070007_school_workspace_pull_nonlocking_read_20261111.sql'),'utf8');
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.school_workspace_pull\(/);
 assert.match(sql,/school_private\.has_role/);
 assert.doesNotMatch(sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION')),/for update/i);
 assert.match(sql,/select \* into w from public\.school_workspaces where institution_id=p_institution_id;/i);
 assert.match(sql,/if not found then/);
 assert.match(sql,/insert into public\.school_workspaces\(institution_id\)/);
 assert.match(sql,/return jsonb_build_object\('revision'/);
});
