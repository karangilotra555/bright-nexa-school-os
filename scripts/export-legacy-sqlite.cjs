'use strict';
/**
 * Read-only, lossless legacy SQLite archive export.
 *
 * Execute only where an existing (not reseeded) school.db can be accessed.
 * The source DB is NEVER modified. The exported JSON contains sensitive student
 * and guardian data and must remain private; do not attach to public issues.
 *
 * node scripts/export-legacy-sqlite.cjs --db /secure/path/school.db --out /secure/path/backup.school-export.json
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const TABLES=Object.freeze(['institution','students','audit_logs','rate_limits']);
function sha256(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function rowsSorted(table,rows) {
 const key=table==='institution'?'id':table==='students'?'id':table==='audit_logs'?'id':'key';
 return rows.sort((a,b)=>String(a[key]).localeCompare(String(b[key]),'en',{numeric:true}));
}
function createArchive(dbPath,sourceLabel='bright-nexa-legacy-api'){
 if(!fs.existsSync(dbPath))throw Error('Source SQLite database does not exist. Refusing to create seed data.');
 const db=new DatabaseSync(dbPath,{readOnly:true});
 // One read transaction guarantees every table comes from the same snapshot.
 db.exec('BEGIN');
 try{
  const integrity=db.prepare('PRAGMA integrity_check').all();
  if(integrity.length!==1||integrity[0].integrity_check!=='ok')throw Error('SQLite integrity_check failed; do not migrate.');
  const tables={};
  for(const table of TABLES){
   const found=db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name=?").get(table);
   if(!found?.n)throw Error('Required table '+table+' missing; wrong database or schema.');
   tables[table]=rowsSorted(table,db.prepare('SELECT * FROM "'+table+'"').all());
  }
  const counts=Object.fromEntries(TABLES.map(t=>[t,tables[t].length]));
  const stable=JSON.stringify({schemaVersion:1,sourceLabel,tables});
  return {
   schemaVersion:1,
   sourceLabel,
   createdAt:new Date().toISOString(),
   counts,
   contentSha256:sha256(stable),
   tables
  };
 }finally{db.exec('ROLLBACK');db.close();}
}
function validateArchive(archive){
 if(!archive||archive.schemaVersion!==1||typeof archive.sourceLabel!=='string'||
 !archive.tables||typeof archive.contentSha256!=='string')throw Error('Invalid export archive.');
 for(const table of TABLES){
  if(!Array.isArray(archive.tables[table]))throw Error('Missing '+table+' in archive.');
  if(archive.tables[table].length!==archive.counts?.[table])throw Error('Count mismatch: '+table);
 }
 const actual=sha256(JSON.stringify({schemaVersion:1,sourceLabel:archive.sourceLabel,tables:archive.tables}));
 if(actual!==archive.contentSha256)throw Error('Backup checksum mismatch. Archive damaged or modified.');
 return archive.counts;
}
function argv(args){
 const out={};
 for(let i=0;i<args.length;i++){
  if(!args[i].startsWith('--')||i+1>=args.length)throw Error('Use --db <path> --out <path> [--source-label <name>].');
  out[args[i].slice(2)]=args[++i];
 }
 if(!out.db||!out.out)throw Error('Use --db <path> --out <path> [--source-label <name>].');
 return out;
}
function cli(){
 const opts=argv(process.argv.slice(2));
 const dbPath=path.resolve(opts.db),outPath=path.resolve(opts.out);
 if(dbPath===outPath)throw Error('Cannot write over SQLite database.');
 if(outPath.toLowerCase().includes('public')||outPath.toLowerCase().includes('docs/'))
   throw Error('Refusing to write backups into public directories.');
 const arch=createArchive(dbPath,opts['source-label']||'bright-nexa-legacy-api');
 validateArchive(arch);
 // exclusive create, owner-only. Never overwrite an earlier backup.
 const fd=fs.openSync(outPath,'wx',0o600);
 try{fs.writeFileSync(fd,JSON.stringify(arch,null,2));fs.fsyncSync(fd);}
 finally{fs.closeSync(fd);}
 console.log(JSON.stringify({saved:true,sha256:arch.contentSha256,counts:arch.counts,
  warning:'BACKUP CONTAINS SENSITIVE STUDENT DATA. Keep offline/encrypted; never commit it to GitHub.'}));
}
if(require.main===module){
 try{cli();}catch(e){console.error('Export aborted:',e.message);process.exitCode=1;}
}
module.exports={createArchive,validateArchive,sha256,TABLES};
