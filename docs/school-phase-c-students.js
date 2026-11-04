/* Phase C1 – private school-owner student profiles and document checklist.
   This module contains validation, no persistence or app secrets. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.BrightNexaStudentProfile=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 const TYPES={
   birth_certificate:'Birth certificate',
   address_proof:'Address proof',
   previous_school_tc:'Previous school transfer certificate',
   student_photo:'Student photograph',
   guardian_id:'Guardian identity document',
   admission_form:'Signed admission form',
   other:'Other document'
 };
 const STATUSES={not_received:'Not received',received:'Received (not verified)',verified:'Manually verified by school owner'};
 const fields={
   guardian_name:150,guardian_relationship:40,guardian_phone:20,guardian_email:200,
   alternate_contact_name:150,alternate_contact_phone:20,address_line:400,city:100,postal_code:20
 };
 const trimmed=v=>String(v??'').trim().replace(/\s+/g,' ');
 function date(input){
   if(!input)return null;
   const s=String(input);
   if(!/^\d{4}-\d\d-\d\d$/.test(s)||!Number.isFinite(Date.parse(s))||
      new Date(s).toISOString().slice(0,10)!==s||s>new Date().toISOString().slice(0,10))
     throw Error('Admission date must be a real date no later than today.');
   return s;
 }
 function belongs(studentId,students){
   const student=students.find(x=>x.id===studentId);
   if(!student)throw Error('Select a verified student within the current school.');
   return student;
 }
 function validateProfile(studentId,raw,students){
   belongs(studentId,students);
   const out={student_id:studentId};
   for(const [k,max] of Object.entries(fields)){
     const value=trimmed(raw?.[k]);
     if(value.length>max)throw Error(k.replaceAll('_',' ')+' exceeds '+max+' characters.');
     out[k]=value||null;
   }
   if(out.guardian_name&&out.guardian_name.length<2)throw Error('Guardian name must have at least two characters.');
   if(out.alternate_contact_name&&out.alternate_contact_name.length<2)throw Error('Alternate contact name must have at least two characters.');
   for(const field of ['guardian_phone','alternate_contact_phone']){
     const value=out[field];
     if(value&&(!/^\+?[0-9()\- ]{7,20}$/.test(value)||value.replace(/\D/g,'').length<7))
       throw Error('Enter a valid '+field.replaceAll('_',' ')+'.');
   }
   if(out.guardian_email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.guardian_email))
     throw Error('Guardian email address is invalid.');
   out.admission_on=date(raw?.admission_on);
   return out;
 }
 function validateDocument(studentId,raw,students,authUserId){
   belongs(studentId,students);
   const document_type=String(raw?.document_type||'');
   const status=String(raw?.status||'');
   if(!Object.hasOwn(TYPES,document_type))throw Error('Unknown document type.');
   if(!Object.hasOwn(STATUSES,status))throw Error('Unknown document status.');
   const notes=trimmed(raw?.notes);
   if(notes.length>300)throw Error('Document notes cannot exceed 300 characters.');
   if(status==='verified'&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(authUserId||'')))
     throw Error('A verified school owner login is required to mark a document checked.');
   return {student_id:studentId,document_type,status,notes:notes||null,
     checked_by:status==='verified'?authUserId:null,
     checked_at:status==='verified'?new Date().toISOString():null};
 }
 function confirmRow(records,identity){
   if(!Array.isArray(records)||records.length!==1)throw Error('Cloud save was not confirmed. Refresh before retrying.');
   const result=records[0];
   if(!result?.id && !result?.student_id)throw Error('Cloud save returned an invalid row.');
   for(const [k,value] of Object.entries(identity)){
     if(result[k]!==value)throw Error('Cloud save returned a different school or student. Do not retry blindly.');
   }
   return result;
 }
 function checklist(rows,studentId){
   const statuses=new Map();
   for(const row of rows||[]){
     if(row.student_id!==studentId||!Object.hasOwn(TYPES,row.document_type))continue;
     if(statuses.has(row.document_type))throw Error('Duplicate document checklist entries detected.');
     statuses.set(row.document_type,row.status);
   }
   const total=Object.keys(TYPES).length;
   const received=[...statuses.values()].filter(x=>x==='received'||x==='verified').length;
   const verified=[...statuses.values()].filter(x=>x==='verified').length;
   return {total,received,verified,missing:total-received,
     note:'These are document-status entries only. No file upload, signature authentication, government validation or issued certificate is claimed.'};
 }
 return {TYPES,STATUSES,validateProfile,validateDocument,confirmRow,checklist,date};
});
