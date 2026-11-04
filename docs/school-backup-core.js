/* Independent encrypted school backup: AES-256-GCM + PBKDF2 310k; no secrets in files. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.BrightNexaBackupCore=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const BASE_TABLES=['school_users','school_classes','school_students','school_staff_profiles','school_attendance',
 'school_teacher_assignments','school_homework','school_guardians','school_guardian_students','school_fee_entries',
 'school_notices','school_parent_leaves','school_staff_attendance','school_staff_directory_attendance',
 'school_contact_profiles','school_module_records'];
 const TABLES=[...BASE_TABLES,'school_student_profiles','school_student_document_checks'];
 const tenc=new TextEncoder(),tdec=new TextDecoder();
 const b64=b=>typeof Buffer!=='undefined'?Buffer.from(b).toString('base64'):btoa(String.fromCharCode(...b));
 const un64=b=>typeof Buffer!=='undefined'?new Uint8Array(Buffer.from(b,'base64')):Uint8Array.from(atob(b),c=>c.charCodeAt(0));
 const provider=()=>globalThis.crypto;
 async function key(passphrase,salt){
  if(typeof passphrase!=='string'||passphrase.length<12)throw Error('Use a separate backup passphrase of at least 12 characters.');
  const crypto=provider();if(!crypto?.subtle||!crypto?.getRandomValues)throw Error('Secure browser cryptography required.');
  const raw=await crypto.subtle.importKey('raw',tenc.encode(passphrase),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:310000},raw,
    {name:'AES-GCM',length:256},false,['encrypt','decrypt']);
 }
 async function encrypt(snapshot,passphrase){
  if(!snapshot?.school_id||!snapshot?.tables||!snapshot?.created_at)throw Error('Backup manifest is incomplete.');
  const crypto=provider(),salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const k=await key(passphrase,salt);
  const plain=tenc.encode(JSON.stringify(snapshot));
  if(plain.length>25*1024*1024)throw Error('School data exceeds the single-download backup limit.');
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:tenc.encode('bright-nexa-backup-v1')},k,plain);
  return {format:'bright-nexa-encrypted-school-backup',version:1,kdf:'PBKDF2-SHA256',iterations:310000,
    encryption:'AES-256-GCM',salt:b64(salt),iv:b64(iv),ciphertext:b64(new Uint8Array(cipher))};
 }
 async function decrypt(file,passphrase){
  if(file?.format!=='bright-nexa-encrypted-school-backup'||file.version!==1||file.iterations!==310000||
    file.kdf!=='PBKDF2-SHA256'||file.encryption!=='AES-256-GCM'||typeof file.ciphertext!=='string'||file.ciphertext.length>36*1024*1024)
    throw Error('Unsupported or unsafe backup file.');
  let parsed;
  try{
    const k=await key(passphrase,un64(file.salt));
    const data=await provider().subtle.decrypt({name:'AES-GCM',iv:un64(file.iv),additionalData:tenc.encode('bright-nexa-backup-v1')},k,un64(file.ciphertext));
    parsed=JSON.parse(tdec.decode(data));
  }catch{throw Error('Incorrect backup passphrase or corrupted file.')}
  if(!parsed?.school_id||!parsed?.tables||!Array.isArray(parsed.table_names)||!BASE_TABLES.every(t=>parsed.table_names.includes(t)||parsed.omitted?.includes(t)))
    throw Error('Decrypted backup has an invalid school manifest.');
  for(const table of parsed.table_names){
    if(!Array.isArray(parsed.tables[table])||parsed.tables[table].some(row=>row.institution_id!==parsed.school_id))
      throw Error('Decrypted backup contains cross-school or invalid records.');
  }
  return parsed;
 }
 async function collect(allSchool,school){
  if(typeof allSchool!=='function'||!school?.id)throw Error('Verified school administrator required.');
  const data={};
  // Fail closed: an RLS-denied table makes the backup incomplete, so no file is offered.
  for(const table of TABLES){
    const rows=await allSchool(table,'*');
    if(!Array.isArray(rows)||rows.some(x=>x.institution_id!==school.id))
      throw Error('School backup failed tenant check for '+table+'.');
    data[table]=rows;
  }
  return {format:'bright-nexa-school-json',version:1,school_id:school.id,school_name:school.name,
    created_at:new Date().toISOString(),table_names:TABLES.slice(),tables:data};
 }
 const counts=manifest=>Object.fromEntries((manifest.table_names||[]).map(t=>[t,manifest.tables[t]?.length||0]));
 return {TABLES,encrypt,decrypt,collect,counts};
});
