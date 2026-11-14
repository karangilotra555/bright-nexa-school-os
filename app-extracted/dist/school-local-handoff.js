/* One-way, explicit, same-device handoff from legacy local School OS to
   a verified brand-new Supabase institution. No credentials or secrets stored. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.BNSchoolLocalHandoff=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const KEYS={institution:'bright-nexa-school-os:snapshot:v1',
             students:'bright-nexa-school-os:students:v1',
             operations:'bright-nexa-school-os:operations:v1'};
 function parse(raw){if(raw==null)return null;try{return JSON.parse(raw)}catch(_){return null}}
 function read(storage){
   if(!storage||typeof storage.getItem!=='function')return null;
   const institution=parse(storage.getItem(KEYS.institution));
   const school=institution?.institution;
   if(!school||typeof school.name!=='string'||school.name.trim().length<3)return null;
   return {name:school.name.trim().slice(0,120),
     email:typeof school.email==='string'?school.email.trim():'',
     institution,students:parse(storage.getItem(KEYS.students)),
     operations:parse(storage.getItem(KEYS.operations)),
     hasStudents:!!storage.getItem(KEYS.students),
     hasOperations:!!storage.getItem(KEYS.operations)};
 }
 function prepare(draft,cloud,buildProjection){
   if(!draft||!cloud?.snapshot||!cloud?.school?.id||typeof buildProjection!=='function')
     throw Error('Verified empty cloud school and local import adapter are required.');
   if(!Array.isArray(draft.students)&&draft.hasStudents)
     throw Error('Local student records could not be read. They were not deleted or imported.');
   if((!draft.operations||typeof draft.operations!=='object')&&draft.hasOperations)
     throw Error('Local module records could not be read. They were not deleted or imported.');
   const ops=draft.operations||cloud.snapshot.operations;
   // Never claim a financial migration when fee calculations are missing.
   if((ops?.feeStructures||[]).length||(ops?.feePayments||[]).length||
      (ops?.studentFeeDues||[]).length||(ops?.classFeeCharges||[]).length)
     throw Error('This device contains local financial records. Export and reconcile them before cloud import; no partial fee migration was attempted.');
   const src=draft.institution.institution;
   const official=cloud.school;
   const allowed=['institutionType','city','session','address','state','pinCode','contactNumber',
      'email','boardType','schoolLevel','medium','directorName','principalName'];
   const profile={...cloud.snapshot.institution.institution};
   for(const key of allowed){
     if(typeof src[key]==='string'&&src[key].trim())profile[key]=src[key].trim();
   }
   profile.id=official.id;profile.name=official.name;
   const snapshot={...cloud.snapshot,
     institution:{...cloud.snapshot.institution,institution:profile},
     students:draft.students||[],
     operations:ops};
   const projection=buildProjection(snapshot,()=>[]);
   return {snapshot,projection};
 }
 return {KEYS,read,prepare};
});
