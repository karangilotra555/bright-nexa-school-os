'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
const {createArchive,validateArchive,sha256,TABLES}=require('../scripts/export-legacy-sqlite.cjs');
const {buildPlan,primaryKey,stableJson}=require('../scripts/import-legacy-postgres.cjs');

function sample(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nexa-migration-'));
 const dbFile=path.join(dir,'existing.school.db');
 const db=new DatabaseSync(dbFile);
 db.exec(`
 CREATE TABLE institution(id TEXT PRIMARY KEY,name TEXT);
 CREATE TABLE students(id TEXT PRIMARY KEY,admissionNumber TEXT,name TEXT,dob TEXT);
 CREATE TABLE audit_logs(id INTEGER PRIMARY KEY,timestamp TEXT,event TEXT);
 CREATE TABLE rate_limits(key TEXT PRIMARY KEY,attempts INTEGER);
 INSERT INTO institution VALUES ('default','Example School');
 INSERT INTO students VALUES ('1','X-001','Sample One','2014-10-01');
 INSERT INTO students VALUES ('2','X-002','Sample Two','2015-08-02');
 INSERT INTO audit_logs VALUES (1,'2026-10-22','login');
 INSERT INTO rate_limits VALUES ('example:127.0.0.1',2);
 `);
 db.close();
 return {dir,dbFile,close(){fs.rmSync(dir,{recursive:true,force:true})}};
}
test('read-only SQLite snapshot includes all four tables, exact record counts and checksum',()=>{
 const s=sample();
 try{
  const a=createArchive(s.dbFile);
  assert.deepEqual(a.counts,{institution:1,students:2,audit_logs:1,rate_limits:1});
  assert.equal(a.tables.students[0].admissionNumber,'X-001');
  assert.equal(a.tables.students[1].dob,'2015-08-02');
  assert.equal(validateArchive(a),a.counts);
  assert.equal(a.contentSha256.length,64);
  const same=createArchive(s.dbFile);
  assert.equal(a.contentSha256,same.contentSha256,'Snapshot checksum must be stable across reads');
 }finally{s.close();}
});
test('archive tampering and missing database fail closed',()=>{
 const s=sample();
 try{
  const a=createArchive(s.dbFile);
  a.tables.students[0].name='Tampered';
  assert.throws(()=>validateArchive(a),/checksum mismatch/);
  assert.throws(()=>createArchive(path.join(s.dir,'absent.db')),/does not exist/);
  assert.equal(fs.existsSync(path.join(s.dir,'absent.db')),false,'Export must not seed a new database');
 }finally{s.close();}
});
test('Postgres importer dry-run verifies source before building any row plan',()=>{
 const s=sample();
 try{
  const a=createArchive(s.dbFile);
  const file=path.join(s.dir,'test.school-export.json');
  fs.writeFileSync(file,JSON.stringify(a),{mode:0o600});
  const plan=buildPlan(file);
  assert.equal(plan.operations.length,5);
  assert.ok(TABLES.every(t=>plan.operations.some(r=>r.table===t)));
  assert.equal(plan.archive.contentSha256,a.contentSha256);
  assert.equal(primaryKey('rate_limits',{key:'x'}),'x');
  assert.throws(()=>primaryKey('students',{}),/Missing id/);
 }finally{s.close();}
});
test('row checksums survive PostgreSQL JSONB key reordering',()=>{
 const first={name:'Tara',id:1,nested:{z:9,a:1}};
 const reordered={nested:{a:1,z:9},id:1,name:'Tara'};
 assert.equal(stableJson(first),stableJson(reordered));
 assert.equal(sha256(stableJson(first)),sha256(stableJson(reordered)));
});
test('private staging migration contains no public data API access policies',()=>{
 const sql=fs.readFileSync(path.join(__dirname,'..','supabase/migrations/20261022_private_sqlite_export_staging_v1.sql'),'utf8');
 assert.match(sql,/CREATE SCHEMA IF NOT EXISTS school_migration/);
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/g);
 assert.match(sql,/REVOKE ALL ON ALL TABLES IN SCHEMA school_migration FROM PUBLIC, anon, authenticated/);
 assert.match(sql,/UNIQUE\(source_label, content_sha256\)/);
 assert.doesNotMatch(sql,/CREATE POLICY.*USING\s*\(true\)/i);
});
test('Node 24 runtime lock and private backup gitignore',()=>{
 const pkg=require('../package.json');
 assert.equal(pkg.engines.node,'>=24 <25');
 assert.equal(fs.readFileSync(path.join(__dirname,'..','.node-version'),'utf8').trim(),'24');
 const ignored=fs.readFileSync(path.join(__dirname,'..','.gitignore'),'utf8');
 assert.match(ignored,/\*\.school-export\.json/);
 assert.match(ignored,/\.env/);
});
