/* Bright Nexa Phase 2: tenant-scoped pagination and school record validation.
   No browser credentials or service-role access. Auth and RLS remain server-enforced. */
(function (root, factory) {
  'use strict';
  const api=factory();
  if(typeof module==='object' && module.exports)module.exports=api;
  else root.BrightNexaSchoolAdmin=api;
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const PAGE_SIZE=500,MAX_PAGES=80;
  const statusValues=new Set(['active','archived','transferred','graduated']);
  function requiredText(value,field,min,max){
    const v=String(value??'').trim();
    if(v.length<min||v.length>max)throw Error(field+' must have '+min+'–'+max+' characters.');
    return v;
  }
  function exactDate(value,allowFuture=false){
    if(!value)return null;
    const s=String(value);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)throw Error('Enter a valid date of birth.');
    if(!allowFuture && s>new Date().toISOString().slice(0,10))throw Error('Date of birth cannot be in the future.');
    return s;
  }
  function studentInput(values,classes,students,editingId){
    const name=requiredText(values.name,'Student name',2,180);
    const admission_number=requiredText(values.admission_number,'Admission number',1,60);
    const class_id=String(values.class_id||'');
    if(!classes.some(c=>c.id===class_id))throw Error('Select a valid class in this school.');
    const status=values.status||'active';
    if(!statusValues.has(status))throw Error('Invalid student status.');
    if(students.some(s=>s.id!==editingId&&String(s.admission_number).trim().toLowerCase()===admission_number.toLowerCase()))throw Error('Admission number already exists in this school.');
    return {name,admission_number,class_id,dob:exactDate(values.dob),status};
  }
  function staffInput(values,existing){
    const display_name=requiredText(values.display_name,'Staff name',2,150);
    const designation=requiredText(values.designation,'Designation',2,120);
    if(existing.some(s=>s.id!==values.id&&String(s.display_name).trim().toLowerCase()===display_name.toLowerCase()))throw Error('This staff name already exists.');
    const employment_type=String(values.employment_type);
    if(!['permanent','contract','part_time','visiting'].includes(employment_type))throw Error('Invalid employment type.');
    const row={display_name,designation,employment_type,contract_end_on:null,days_per_week:null,hours_per_day:null,visits_per_month:null};
    if(employment_type==='contract'){
      row.contract_end_on=exactDate(values.contract_end_on,true);
      if(!row.contract_end_on)throw Error('Contract end date required.');
    }
    if(employment_type==='part_time'){
      row.days_per_week=Number(values.days_per_week);row.hours_per_day=Number(values.hours_per_day);
      if(!Number.isInteger(row.days_per_week)||row.days_per_week<1||row.days_per_week>7||!Number.isFinite(row.hours_per_day)||row.hours_per_day<0.5||row.hours_per_day>12)throw Error('Enter valid part-time hours and days.');
    }
    if(employment_type==='visiting'){
      row.visits_per_month=Number(values.visits_per_month);
      if(!Number.isInteger(row.visits_per_month)||row.visits_per_month<1||row.visits_per_month>31)throw Error('Enter valid monthly visits.');
    }
    return row;
  }
  function expectUpdated(rows,expectedId){
    if(!Array.isArray(rows)||rows.length!==1||rows[0]?.id!==expectedId)throw Error('School record update was not confirmed. Refresh and check permissions before retrying.');
    return rows[0];
  }
  async function allPages(inSchool,table,select,filters={}){
    if(typeof inSchool!=='function')throw Error('Authenticated school reader required.');
    const limit=PAGE_SIZE,order=filters.order||'id.asc',result=[];
    for(let page=0;page<MAX_PAGES;page++){
      const rows=await inSchool(table,select,{...filters,order,limit:String(limit),offset:String(page*limit)});
      if(!Array.isArray(rows))throw Error('Invalid school database response.');
      result.push(...rows);
      if(rows.length<limit)return result;
    }
    throw Error('Too many school records; use a filtered report. No incomplete totals were shown.');
  }
  return {studentInput,staffInput,exactDate,expectUpdated,allPages,PAGE_SIZE};
});
