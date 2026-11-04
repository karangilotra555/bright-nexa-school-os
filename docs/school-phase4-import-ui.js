/* Phase 4 school-owner admissions import: preview first, single atomic batch, never silent partial writes. */
(() => {
 'use strict';
 const el=(t,v)=>{const x=document.createElement(t);if(v!==undefined)x.textContent=String(v);return x};
 function render({body,state,req,allSchool,reload,open,error}){
   const section=el('section');section.style.cssText='border-top:1px solid #d5e0eb;margin-top:20px;padding-top:15px';
   section.append(el('h3','Excel / CSV admissions import'));
   const note=el('p','Preview first. Import at most 200 students in one cloud transaction. Existing and archived admission numbers are checked; school name, class and section must match. No record is uploaded until you confirm.');
   note.className='muted';section.append(note);
   if(state.offlineReadOnly){section.append(el('p','Offline view: admissions import is disabled. Sign in online.'));body.append(section);return;}
   const controls=el('div');controls.className='form';
   const file=el('input');file.type='file';file.accept='.csv,.tsv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
   file.setAttribute('aria-label','Excel or CSV student admissions file');
   const tmpl=el('button','Download CSV template');tmpl.type='button';
   const preview=el('button','Preview import');preview.type='button';
   const submit=el('button','Import verified students');submit.type='button';submit.disabled=true;submit.className='primary';
   controls.append(file,tmpl,preview,submit);section.append(controls);
   const status=el('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');section.append(status);
   const detail=el('div');section.append(detail);body.append(section);
   let parsed=null,checked=null,working=false;
   const api=window.BrightNexaAcademics;
   if(!api||!window.BrightNexaSmart||!window.BrightNexaSheetReader){status.textContent='Import tools failed to load. Refresh while online.';preview.disabled=true;return;}
   const reset=()=>{parsed=null;checked=null;submit.disabled=true;detail.replaceChildren();status.textContent='';};
   file.addEventListener('change',reset);
   function saveCsv(){
     const template=api.csv([{admission_number:'',name:'',class:'',section:'',academic_year:'',dob:''}],['admission_number','name','class','section','academic_year','dob']);
     const url=URL.createObjectURL(new Blob(['\uFEFF'+template],{type:'text/csv;charset=utf-8'}));
     const a=el('a');a.href=url;a.download='bright-nexa-admissions-template.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
   }
   tmpl.addEventListener('click',saveCsv);
   function renderPreview(result){
     detail.replaceChildren();
     detail.append(el('p',result.rowCount+' rows · '+result.valid.length+' valid · '+result.errors.length+' errors'));
     if(result.errors.length){
       const list=el('ul');
       for(const x of result.errors.slice(0,40))list.append(el('li','Excel row '+x.row+': '+x.reason));
       if(result.errors.length>40)list.append(el('li','Additional errors not shown. Correct the file and preview again.'));
       detail.append(list);
     }
     if(result.valid.length){
       const table=el('table'),head=el('tr');
       ['Name','Admission','Class','DOB'].forEach(x=>head.append(el('th',x)));
       table.append(head);
       for(const x of result.valid.slice(0,20)){
         const row=el('tr'),cl=state.classes.find(c=>c.id===x.class_id);
         [x.name,x.admission_number,(cl?.name||'')+' '+(cl?.section||''),x.dob||'—'].forEach(y=>row.append(el('td',y)));
         table.append(row);
       }
       detail.append(table);
       if(result.valid.length>20)detail.append(el('p','Showing first 20 valid rows only. Every row was validated.'));
     }
   }
   async function getRows(){
     const f=file.files?.[0];
     if(!f)throw Error('Choose a CSV, TSV or XLSX file first.');
     if(f.size>4000000)throw Error('File is larger than 4 MB.');
     const name=f.name.toLowerCase();
     if(!/\.(csv|tsv|xlsx)$/.test(name))throw Error('Choose a .csv, .tsv or .xlsx file.');
     return name.endsWith('.xlsx')
       ?window.BrightNexaSheetReader.read(await f.arrayBuffer())
       :window.BrightNexaSmart.parseCsv(await f.text());
   }
   preview.addEventListener('click',async()=>{
     if(working)return;working=true;preview.disabled=true;submit.disabled=true;detail.replaceChildren();
     try{
       parsed=await getRows();
       checked=api.previewAdmissions(parsed,state.classes,[...state.students,...state.formerStudents]);
       renderPreview(checked);
       submit.disabled=!checked.canCommit;
       status.textContent=checked.canCommit?'Preview validated. Confirm import only if every student is correct.':'Import blocked: fix listed errors and preview again.';
     }catch(e){reset();error(e);status.textContent=e.message;}
     finally{working=false;preview.disabled=false}
   });
   submit.addEventListener('click',async()=>{
     if(working||!checked?.canCommit||!parsed)return;
     if(!confirm('Import '+checked.valid.length+' student(s) into '+state.school.name+'? This writes real records and cannot be automatically undone.'))return;
     working=true;submit.disabled=true;preview.disabled=true;file.disabled=true;
     try{
       // Re-read authoritative cloud records before the one-shot insert.
       const [currentStudents,currentClasses]=await Promise.all([
         allSchool('school_students','id,admission_number'),
         allSchool('school_classes','id,name,section,academic_year')
       ]);
       const latest=api.previewAdmissions(parsed,currentClasses,currentStudents);
       if(!latest.canCommit)throw Error('School records changed since preview. Refresh and preview the file again; no import was attempted.');
       const institution_id=state.me.institution_id;
       const records=latest.valid.map(x=>({...x,institution_id}));
       const written=await req('school_students',{method:'POST',body:records});
       if(!Array.isArray(written)||written.length!==records.length||
         new Set(written.map(x=>x.id)).size!==records.length||
         !written.every(x=>x.id&&x.institution_id===institution_id&&records.some(y=>y.admission_number===x.admission_number&&y.class_id===x.class_id)))
         throw Error('Cloud import response is incomplete. Do not retry blindly; refresh the student roster and check imported admissions.');
       status.textContent=written.length+' student admissions confirmed by cloud.';
       parsed=null;checked=null;file.value='';detail.replaceChildren();
       await reload();open('Students');
     }catch(e){
       error(e);
       status.textContent=e.message+' If network status is unclear, refresh the school roster before retrying.';
     }finally{working=false;preview.disabled=false;file.disabled=false;}
   });
 }
 window.BrightNexaAdmissionsImport={render};
})();
