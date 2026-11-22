'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');

const school='10000000-0000-4000-8000-000000000001';
const otherSchool='20000000-0000-4000-8000-000000000002';
const homework='30000000-0000-4000-8000-000000000003';
const published='40000000-0000-4000-8000-000000000004';
const failed='40000000-0000-4000-8000-000000000005';
const publishedPath=school+'/'+homework+'/'+published+'.pdf';
const owner='50000000-0000-4000-8000-000000000001';
const teacher='50000000-0000-4000-8000-000000000002';
const principal='50000000-0000-4000-8000-000000000003';
const otherOwner='50000000-0000-4000-8000-000000000004';

test('school owners alone can remove published attachments, homework and teacher assignments',async t=>{
 const db=new PGlite();
 t.after(()=>db.close());
 await db.exec(`
   create role authenticated; create role anon;
   create schema auth; create schema storage; create schema school_private;
   grant usage on schema auth,storage,school_private to authenticated;
   create function auth.uid() returns uuid language sql stable as
     $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   create table public.institutions(id uuid primary key);
   create table public.school_users(id uuid primary key,institution_id uuid,auth_user_id uuid,role text,status text);
   create table public.school_homework(id uuid primary key,institution_id uuid,class_id uuid,subject text,created_by uuid);
   create table public.school_teacher_assignments(id uuid primary key,institution_id uuid);
   create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
   create table storage.objects(bucket_id text,name text,primary key(bucket_id,name));
   create function school_private.has_role(p_school uuid,p_roles text[]) returns boolean
     language sql stable security definer set search_path='' as $$
     select exists(select from public.school_users su where su.institution_id=p_school
       and su.auth_user_id=auth.uid() and su.role=any(p_roles) and su.status='active')
     $$;
   create function school_private.teacher_can(p_school uuid,uuid,text,text) returns boolean
     language sql stable as $$ select school_private.has_role(p_school,array['teacher']) $$;
   grant select on public.school_users to authenticated;
   grant select,delete on public.school_homework,public.school_teacher_assignments to authenticated;
   grant select,insert,delete on storage.objects to authenticated;
   alter table storage.objects enable row level security;
   alter table public.school_homework enable row level security;
   alter table public.school_teacher_assignments enable row level security;
   create policy homework_read on public.school_homework for select to authenticated using
     (school_private.has_role(institution_id,array['school_admin','principal','teacher']));
   create policy legacy_homework_delete on public.school_homework for delete to authenticated using (true);
   create policy assignments_read on public.school_teacher_assignments for select to authenticated using (true);
   create policy legacy_assignment_delete on public.school_teacher_assignments for delete to authenticated using (true);
   create policy unrelated_object_delete on storage.objects for delete to authenticated using (bucket_id='other-bucket');
   create policy unrelated_object_read on storage.objects for select to authenticated using (bucket_id='other-bucket');
 `);
 await db.exec(fs.readFileSync('supabase/homework-private-files.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261120175741_owner_only_school_deletions.sql','utf8'));
 await db.query('insert into public.institutions values($1),($2)',[school,otherSchool]);
 await db.query(`insert into public.school_users values
   ($1,$5,$1,'school_admin','active'),($2,$5,$2,'teacher','active'),
   ($3,$5,$3,'principal','active'),($4,$6,$4,'school_admin','active')`,
   [owner,teacher,principal,otherOwner,school,otherSchool]);
 await db.query("insert into public.school_homework values($1,$2,$1,'Maths',$3)",[homework,school,teacher]);
 await db.query('insert into public.school_teacher_assignments values($1,$2)',[homework,school]);
 await db.exec("insert into storage.objects values('other-bucket','other-file')");
 const signIn=async id=>{
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);
  await db.exec('set role authenticated');
 };
 const addFile=async id=>db.query("insert into public.school_homework_files(id,homework_id,institution_id,storage_path,name,mime,size) values($1,$2,$3,$4,'demo.pdf','application/pdf',128)",[id,homework,school,school+'/'+homework+'/'+id+'.pdf']);
 const deleteFile=async id=>db.query('delete from public.school_homework_files where id=$1 returning id',[id]);
 const deleteObject=async path=>db.query('delete from storage.objects where name=$1 returning name',[path]);
 const deleteHomework=async()=>db.query('delete from public.school_homework where id=$1 returning id',[homework]);
 const deleteAssignment=async()=>db.query('delete from public.school_teacher_assignments where id=$1 returning id',[homework]);
 await signIn(teacher);
 await addFile(published);
 await addFile(failed);
 await db.query("insert into storage.objects values('school-homework',$1)",[publishedPath]);
 assert.deepEqual((await deleteFile(failed)).rows,[{id:failed}]);
 await assert.rejects(deleteFile(published),error=>error.code==='42501');
 for(const actor of [teacher,principal,otherOwner]){
  await signIn(actor);
  assert.deepEqual((await deleteObject(publishedPath)).rows,[]);
  assert.deepEqual((await deleteHomework()).rows,[]);
  assert.deepEqual((await deleteAssignment()).rows,[]);
 }
 assert.deepEqual((await deleteObject('other-file')).rows,[{name:'other-file'}]);
 await signIn(owner);
 await assert.rejects(deleteHomework(),error=>error.code==='42501');
 assert.equal((await db.query('select id from public.school_homework where id=$1',[homework])).rows.length,1);
 await assert.rejects(deleteFile(published),error=>error.code==='42501');
 assert.deepEqual((await deleteObject(publishedPath)).rows,[{name:publishedPath}]);
 assert.deepEqual((await deleteFile(published)).rows,[{id:published}]);
 assert.deepEqual((await deleteHomework()).rows,[{id:homework}]);
 assert.deepEqual((await deleteAssignment()).rows,[{id:homework}]);
});

test('assignment revoke reports success only after the server returns the requested row', async () => {
 const source=fs.readFileSync('teacher-access.js','utf8');
 const apiBlock=source.match(/  async function api\(table,[\s\S]*?\n  }\n  const query/)[0]
  .replace(/\n  const query$/, '');
 const bindBlock=source.match(/      const scope=staffReadScope\(\);\n      revoke\.addEventListener\('click',\(\)=>run\(async\(\)=>\{[\s\S]*?\n      \}\)\);/)[0];
 const bind=new Function('revoke','run','staffReadScope','me','a','query','eq','reload','notify','ensureToken','timedCloudFetch','responseJson','BASE','APIKEY','session',apiBlock+'\n'+bindBlock);
 let callback, response=[], reloads=0, notice='', request, reloadFails=false;
 bind({addEventListener:(_event, fn)=>callback=fn}, task=>task(),
   ()=>({member:{institution_id:school},current:()=>true}),{institution_id:school},
   {id:homework}, params=>new URLSearchParams(params).toString(), x=>'eq.'+x,
   async()=>{reloads++;if(reloadFails)throw Error('Offline');},message=>{notice=message;},async()=>{},
   async(_url,options)=>{request=options;return response;}, async value=>value,
   'https://example.invalid','test-key',{access_token:'test-token'});
 await assert.rejects(callback(),/no authorized school record/i);
 assert.equal(reloads,0);
 assert.equal(notice,'');
 response=[{id:otherSchool}];
 await assert.rejects(callback(),/assignment removal could not be confirmed/i);
 assert.equal(reloads,0);
 response=[{id:homework}];
 await callback();
 assert.equal(request.headers.Prefer,'return=representation');
 assert.equal(reloads,1);
 assert.equal(notice,'Assignment revoked.');
 reloadFails=true;
 await callback();
 assert.match(notice,/Assignment revoked.*refresh/i);
});
