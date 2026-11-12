/* Shared student admission validation: one rule set for the form and XLSX import.
 * Prevent browser-only records that the Supabase workspace projection would reject.
 * Validation is UI guidance; Supabase/RLS remains the authority.
 */
(function(root,factory){
  'use strict';
  const rules=factory();
  if(typeof module==='object'&&module.exports)module.exports=rules;
  else root.BNStudentAdmissionRules=rules;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const clean=x=>String(x==null?'':x).trim();
  const key=x=>clean(x).replace(/\s+/g,' ').toLowerCase();
  const allowedStatuses=new Set(['active','transferred','graduated','archived']);
  function normalize(row){
    return {...row,name:clean(row?.name),admissionNumber:clean(row?.admissionNumber),
      className:clean(row?.className),section:clean(row?.section),
      academicStream:clean(row?.academicStream)||undefined,
      status:clean(row?.status)||'Active'};
  }
  function validate(input,existing=[],classes=[],editingId=null){
    const row=normalize(input||{});
    const errors={};
    if(!row.name)errors.name='Student name is required to save to Supabase.';
    else if(row.name.length>180)errors.name='Student name must be 180 characters or less.';
    if(!row.admissionNumber)errors.admissionNumber='Admission number is required for student login and cloud save.';
    else if(row.admissionNumber.length>60)errors.admissionNumber='Admission number must be 60 characters or less.';
    else if((existing||[]).some(s=>s.id!==editingId&&key(s.admissionNumber)===key(row.admissionNumber)))
      errors.admissionNumber='Admission number already exists for this school.';
    if(!row.className)errors.className='Select a class already created in Class & Section Setup.';
    if(!row.section)errors.section='Select a configured section.';
    if(['11','12'].includes(row.className)&&!row.academicStream)
      errors.academicStream='Select a stream for Class 11 or 12.';
    if(row.className&&row.section){
      const matches=(classes||[]).filter(c=>
        c.status!=='Inactive'&&key(c.name)===key(row.className)&&
        key(c.section)===key(row.section)&&
        (!row.academicStream||key(c.academicStream)===key(row.academicStream)));
      if(matches.length!==1){
        const reason=matches.length?'More than one matching class / section exists. Check academic session.':
          'This class and section do not exist in School Setup. Create them first.';
        errors.className=reason;
        errors.section=reason;
      }
    }
    for(const f of ['parentMobile','studentMobile','alternateMobile']){
      if(clean(row[f])&&!/^[6-9][0-9]{9}$/.test(clean(row[f])))
        errors[f]='Enter a valid 10-digit Indian mobile number.';
    }
    if(row.dateOfBirth){
      const value=clean(row.dateOfBirth);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||
        !Number.isFinite(Date.parse(value))||
        new Date(value).toISOString().slice(0,10)!==value)
        errors.dateOfBirth='Choose a valid date of birth.';
    }
    if(!allowedStatuses.has(key(row.status)))
      errors.status='Choose Active, Transferred, Graduated or Archived.';
    return errors;
  }
  function importAllowed(row,existing,classes){
    return Object.keys(validate({...row,status:row.status||'Active'},existing,classes)).length===0;
  }
  return {normalize,validate,importAllowed};
});
