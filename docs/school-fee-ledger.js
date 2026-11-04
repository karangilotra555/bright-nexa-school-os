/* Payment/charge journal: append-only, server-acknowledged, retry-safe reference. */
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 else root.BrightNexaFeeLedger=api;
})(typeof globalThis==='object'?globalThis:this,function(){
 'use strict';
 function newReference(){return 'BN-'+crypto.randomUUID();}
 function draft(){
   let current=null;
   return {
     prepare(values,manualRef){
       const ref=String(manualRef??'').trim(),payload={
         institution_id:values.institution_id,student_id:values.student_id,kind:values.kind,
         amount_rupees:Number(values.amount_rupees),occurred_on:values.occurred_on,
         description:String(values.description??'').trim()
       };
       if(!payload.institution_id||!payload.student_id||!['charge','payment'].includes(payload.kind)
         ||!Number.isSafeInteger(payload.amount_rupees)||payload.amount_rupees<1||payload.amount_rupees>100000000
         ||!/^\d{4}-\d{2}-\d{2}$/.test(String(payload.occurred_on)))throw Error('Fee details are invalid.');
       if(ref.length>100)throw Error('Reference is longer than 100 characters.');
       const fingerprint=JSON.stringify(payload)+':'+ref;
       if(!current||current.fingerprint!==fingerprint)current={fingerprint,reference:ref||newReference()};
       return {...payload,reference:current.reference,created_by:values.created_by};
     },
     clear(){current=null;}
   };
 }
 function matches(actual,payload){
   return actual&&String(actual.institution_id)===String(payload.institution_id)
     &&String(actual.student_id)===String(payload.student_id)
     &&actual.kind===payload.kind
     &&Number(actual.amount_rupees)===Number(payload.amount_rupees)
     &&String(actual.occurred_on)===String(payload.occurred_on)
     &&String(actual.reference)===String(payload.reference);
 }
 async function save({payload,post,find}){
   if(typeof post!=='function'||typeof find!=='function')throw Error('Cloud fee functions are required.');
   let insertionError=null;
   try{
     const inserted=await post(payload);
     if(Array.isArray(inserted)&&inserted.length===1&&inserted[0].id&&matches(inserted[0],payload))
       return {record:inserted[0],recovered:false};
     insertionError=Error('Fee save did not return the expected record.');
   }catch(e){insertionError=e}
   // The POST could have committed before a network interruption. Never immediately retry.
   try{
     const rows=await find(payload.reference);
     if(Array.isArray(rows)&&rows.length===1&&rows[0].id&&matches(rows[0],payload))
       return {record:rows[0],recovered:true};
     if(Array.isArray(rows)&&rows.length===1)
       throw Error('Reference already belongs to different fee details. No duplicate payment was created.');
   }catch(e){
     if(/different fee details/.test(String(e.message)))throw e;
   }
   throw Error('Fee result is not confirmed. Do not change the amount or retry with a new reference. Refresh the ledger and check reference '+payload.reference+'. '+(insertionError?.message||''));
 }
 return {draft,matches,save};
});
