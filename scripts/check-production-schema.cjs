// Offline compatibility check against an exported catalog; never connects to hosted PostgreSQL.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const q=s=>'"'+s.replaceAll('"','""')+'"';
(async()=>{
 const catalog=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 const db=new PGlite();
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create schema school_private; create schema school_migration; create schema extensions;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb,raw_app_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
 grant usage on schema public,auth,school_private to authenticated,anon,service_role;
 set check_function_bodies=off;`);
 for(const t of catalog.types||[])await db.exec(`create type ${q(t.schema)}.${q(t.name)} as enum (${t.labels.map(x=>"'"+x.replaceAll("'","''")+"'").join(',')})`);
 for(const t of catalog.tables)await db.exec(`create table ${q(t.schema)}.${q(t.name)} (${t.columns.map(c=>`${q(c.name)} ${c.type}${c.default?' default '+c.default:''}${c.notnull?' not null':''}`).join(',')})`);
 for(const f of catalog.functions||[])await db.exec(f);
 for(const c of [...catalog.constraints].sort((a,b)=>(a.type==='f')-(b.type==='f')))await db.exec(`alter table ${c.table} add constraint ${q(c.name)} ${c.definition}`);
 for(const v of catalog.views||[])await db.exec(`create view ${q(v.schema)}.${q(v.name)}${v.options?' with ('+v.options.join(',')+')':''} as ${v.definition}`);
 for(const t of catalog.triggers||[])await db.exec(t);
 for(const t of catalog.tables)if(t.rls)await db.exec(`alter table ${q(t.schema)}.${q(t.name)} enable row level security`);
 for(const p of catalog.policies||[])await db.exec(`create policy ${q(p.policyname)} on ${q(p.schemaname)}.${q(p.tablename)} as ${p.permissive} for ${p.cmd} to ${p.roles.map(q).join(',')}${p.qual?' using ('+p.qual+')':''}${p.with_check?' with check ('+p.with_check+')':''}`);
 for(const g of catalog.grants||[])await db.exec(`grant ${g.privilege_type} on ${q(g.table_schema)}.${q(g.table_name)} to ${q(g.grantee)}`);
 for(const g of catalog.column_grants||[])await db.exec(`grant ${g.privilege_type} (${q(g.column_name)}) on ${q(g.table_schema)}.${q(g.table_name)} to ${q(g.grantee)}`);
 const backup=process.argv[3]?JSON.parse(fs.readFileSync(process.argv[3],'utf8')):null;
 if(backup){
  for(const name of ['institutions','school_users','school_classes','school_students','school_student_profiles','school_attendance','school_homework','school_notices','school_fee_entries']){
   await db.query('insert into public.'+q(name)+' select * from jsonb_populate_recordset(null::public.'+q(name)+',$1::jsonb)',[JSON.stringify(backup[name])]);
  }
 }
 await db.exec(fs.readFileSync('supabase/migrations/20261105200548_school_workspace_sync.sql','utf8'));
 assert.equal((await db.query("select count(*)::int n from pg_proc where proname in ('school_workspace_pull','school_workspace_push')")).rows[0].n,2);
 if(backup){
  const sorted=rows=>rows.map(row=>JSON.stringify(Object.fromEntries(Object.entries(row).sort(([a],[b])=>a.localeCompare(b))))).sort();
  for(const [name,rows] of Object.entries(backup)){
   const restored=(await db.query('select to_jsonb(t) row from public.'+q(name)+' t')).rows.map(x=>x.row);
   assert.deepEqual(sorted(restored),sorted(rows),'Restored records preserved: '+name);
  }
  console.log('PASS: nine affected-table backups restore locally and migration preserves every backed-up field. This is a scoped backup, not Auth/Storage or whole-project recovery.');
 }
 const school='99999999-1111-1111-1111-111111111111',admin='99999999-2222-2222-2222-222222222222',teacher='99999999-3333-3333-3333-333333333333',parent='99999999-4444-4444-4444-444444444444';
 await db.query('insert into institutions(id,name,status) values($1,$2,$3)',[school,'Offline Test School','active']);
 for(const [id,role] of [[admin,'school_admin'],[teacher,'teacher']])await db.query('insert into school_users(id,institution_id,auth_user_id,email,role) values($1,$2,$1,$3,$4)',[id,school,role+'@example.invalid',role]);
 await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
 const snapshot={institution:{institution:{id:'offline-school',name:'Offline Test School'}},students:[{id:'s'}],operations:{classes:[{id:'c'}]}};
 const projection={classes:[{localId:'c',name:'6',section:'A',academicYear:'2026'}],students:[{localId:'s',admissionNumber:'TEST-1',name:'Demo Student',classLocalId:'c',status:'active'}],attendance:[{localId:'a',studentLocalId:'s',classLocalId:'c',day:'2026-11-06',status:'present'}],homework:[],notices:[],fees:[]};
 const push=rev=>db.query('select school_workspace_push($1,$2,$3,$4) result',[school,rev,snapshot,projection]);
 let result=(await push(0)).rows[0].result;
 const cid=(await db.query('select id from school_classes where institution_id=$1',[school])).rows[0].id;
 const sid=(await db.query('select id from school_students where institution_id=$1',[school])).rows[0].id;
 await db.exec('reset role');
 await db.query("insert into school_teacher_assignments(institution_id,school_user_id,class_id,assignment_type,can_take_attendance) values($1,$2,$3,'class_teacher',true)",[school,teacher,cid]);
 await db.query('insert into auth.users(id,email) values($1,$2)',[parent,'parent@example.invalid']);
 await db.query('insert into school_guardians(id,institution_id,auth_user_id,email) values($1,$2,$1,$3)',[parent,school,'parent@example.invalid']);
 await db.query('insert into school_guardian_students(institution_id,guardian_id,student_id) values($1,$2,$3)',[school,parent,sid]);
 await db.exec('set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[teacher]);
 assert.equal((await db.query('select * from school_workspaces')).rows.length,0);
 assert.equal((await db.query('update school_attendance set status=$1,recorded_by=$2 where student_id=$3 returning status',['absent',teacher,sid])).rows.length,1);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[parent]);
 assert.equal((await db.query('select status from school_attendance where student_id=$1',[sid])).rows[0].status,'absent');
 assert.equal((await db.query('select * from school_workspaces')).rows.length,0);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);
 await assert.rejects(push(result.revision),/revision conflict/);
 result=(await db.query('select school_workspace_pull($1) result',[school])).rows[0].result;
 assert.equal(result.snapshot.operations.attendance[0].status,'Absent');
 console.log('PASS: actual catalog policies permit admin import and assigned teacher edit; parent reads the update; stale admin save conflicts. All writes were local fixtures.');
 console.log('PASS: exported production tables, constraints, policies, grants, functions and triggers restored locally; workspace migration applies. Auth is stubbed; hosted auth and data restore remain unverified.');
 await db.close();
})().catch(e=>{console.error(e.message);process.exitCode=1;});
