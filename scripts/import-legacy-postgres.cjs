'use strict';
/**
 * Stage a previously exported SQLite archive into PRIVATE Supabase PostgreSQL.
 * This does not publish, overwrite, or enable student logins.
 *
 * Dry-run: node scripts/import-legacy-postgres.cjs --file /private/data.school-export.json
 * Apply:   SCHOOL_MIGRATION_DATABASE_URL='postgresql://...' node scripts/import-legacy-postgres.cjs --file /private/data.school-export.json --apply
 *
 * One-off tool needs pg v8 installed locally:
 * npm install --no-save --package-lock=false pg@8.16.3
 */
const fs=require('node:fs');
const path=require('node:path');
const {sha256,validateArchive,TABLES}=require('./export-legacy-sqlite.cjs');
function stableJson(value){
 if(Array.isArray(value))return '['+value.map(stableJson).join(',')+']';
 if(value && typeof value==='object')
  return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableJson(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
function options(argv){
 const o={apply:false};
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='--apply'){o.apply=true;continue;}
  if(argv[i]==='--file' && argv[i+1]){o.file=argv[++i];continue;}
  throw Error('Use --file <private-export.json> [--apply].');
 }
 if(!o.file)throw Error('Export file path is required.');
 return o;
}
function primaryKey(table,row){
 const col=table==='rate_limits'?'key':'id';
 const value=row[col];
 if(value===undefined||value===null||String(value)==='')throw Error('Missing '+col+' in '+table+' row.');
 return String(value);
}
function buildPlan(file){
 const stat=fs.statSync(file);
 if(stat.size>250000000)throw Error('Export is larger than the 250 MB migration safety limit.');
 const archive=JSON.parse(fs.readFileSync(file,'utf8'));
 validateArchive(archive);
 if(!/^[a-zA-Z0-9 .:_-]{3,120}$/.test(archive.sourceLabel))
  throw Error('Unrecognized backup source label.');
 if(archive.tables.institution.length!==1)throw Error('Expected exactly one legacy institution.');
 const operations=[],uniques=new Set();
 for(const table of TABLES){
  for(const row of archive.tables[table]){
   const key=primaryKey(table,row);
   const marker=table+':'+key;
   if(uniques.has(marker))throw Error('Duplicate primary key '+marker);
   uniques.add(marker);
   operations.push({table,key,row,digest:sha256(stableJson(row))});
  }
 }
 return {archive,operations};
}
async function stage(plan,connectionString){
 if(!connectionString)throw Error('SCHOOL_MIGRATION_DATABASE_URL must be set for --apply.');
 const parsed=new URL(connectionString);
 if(!['postgresql:','postgres:'].includes(parsed.protocol))throw Error('Only PostgreSQL URLs are allowed.');
 // The migration tool requires an encrypted connection.
 if(!['require','verify-full','verify-ca'].includes(parsed.searchParams.get('sslmode')))
  throw Error('Database URL must include sslmode=require or stricter.');
 const {Client}=require('pg');
 const client=new Client({connectionString,statement_timeout:30000,connectionTimeoutMillis:15000,
  application_name:'brightnexa_legacy_one_time_staging'});
 await client.connect();
 try{
  await client.query('BEGIN');
  // Supabase private schema: no client Data API/RLS policies.
  const meta=await client.query(
   `INSERT INTO school_migration.import_batches
    (source_label,content_sha256,schema_version,expected_counts,state)
    VALUES ($1,$2,1,$3::jsonb,'staged')
    ON CONFLICT (source_label,content_sha256)
    DO UPDATE SET expected_counts=EXCLUDED.expected_counts
    RETURNING id`,
   [plan.archive.sourceLabel,plan.archive.contentSha256,JSON.stringify(plan.archive.counts)]);
  const batchId=meta.rows[0].id;
  for(const op of plan.operations){
   await client.query(
    `INSERT INTO school_migration.import_rows
     (batch_id,source_table,source_key,row_sha256,payload)
     VALUES ($1,$2,$3,$4,$5::jsonb)
     ON CONFLICT (batch_id,source_table,source_key) DO NOTHING`,
    [batchId,op.table,op.key,op.digest,JSON.stringify(op.row)]);
  }
  const result=await client.query(
   `SELECT source_table, count(*)::integer AS count,
     count(*) FILTER (WHERE length(row_sha256) != 64)::integer AS invalid_digests
    FROM school_migration.import_rows WHERE batch_id=$1 GROUP BY source_table`,[batchId]);
  const readCounts=Object.fromEntries(TABLES.map(t=>[t,0]));
  for(const row of result.rows){
   if(!(row.source_table in readCounts))throw Error('Unexpected stored source table.');
   readCounts[row.source_table]=row.count;
   if(row.invalid_digests)throw Error('Invalid stored row digest.');
  }
  for(const table of TABLES)
   if(readCounts[table]!==plan.archive.counts[table])
    throw Error('Postgres row count mismatch in '+table+': '+readCounts[table]);
  // Re-read every row digest, not just counts. A replay must never accept a
  // mismatched collision under the same source key.
  const rows=await client.query(
   `SELECT source_table,source_key,row_sha256,payload
    FROM school_migration.import_rows WHERE batch_id=$1`,[batchId]);
  const received=new Map(rows.rows.map(r=>[r.source_table+':'+r.source_key,r]));
  for(const op of plan.operations){
   const row=received.get(op.table+':'+op.key);
   if(!row||row.row_sha256!==op.digest||sha256(stableJson(row.payload))!==op.digest)
    throw Error('Postgres verification failed for '+op.table+' primary key '+op.key);
  }
  await client.query('COMMIT');
  return {staged:true,batchId,sha256:plan.archive.contentSha256,counts:readCounts};
 }catch(e){
  await client.query('ROLLBACK').catch(()=>{});
  throw e;
 }finally{await client.end();}
}
async function main(){
 const o=options(process.argv.slice(2));
 const file=path.resolve(o.file);
 const plan=buildPlan(file);
 if(!o.apply){
  console.log(JSON.stringify({dryRun:true,sha256:plan.archive.contentSha256,
   counts:plan.archive.counts,operations:plan.operations.length,
   note:'No database connection made. Pass --apply only after verifying the backup and school identity.'}));
  return;
 }
 const result=await stage(plan,process.env.SCHOOL_MIGRATION_DATABASE_URL);
 console.log(JSON.stringify({...result,note:'STAGED ONLY; production school/parent APIs not switched.'}));
}
if(require.main===module){
 main().catch(e=>{console.error('Migration aborted:',e.message);process.exitCode=1;});
}
module.exports={options,primaryKey,buildPlan,stage,stableJson};
