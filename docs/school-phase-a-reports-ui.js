/* Phase A1: visible reports for authenticated owner, no automatic ledger changes.
   Every date-limited attendance report is freshly paginated from cloud, not first 200 marks. */
(function(){
 'use strict';
 const engine=window.BrightNexaOperationsReports;
 const make=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=String(text);if(cls)x.className=cls;return x};
 const now=()=>new Date().toLocaleDateString('en-CA');
 const rupees=value=>'₹'+Number(value||0).toLocaleString('en-IN');
 const td=(row,value,tag='td')=>{const cell=make(tag,value);row.append(cell);return cell};
 function download(filename,text){
  const uri=URL.createObjectURL(new Blob(['\uFEFF'+text],{type:'text/csv;charset=utf-8'}));
  const a=make('a');a.href=uri;a.download=filename;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(uri),5000);
 }
 function filterForm(state){
  const section=make('div',undefined,'phase-a-filters'),form=make('div',undefined,'phase-a-form');
  const year=make('input');year.type='month';year.value=now().slice(0,7);year.setAttribute('aria-label','Reporting month');
  const cl=make('select');cl.setAttribute('aria-label','Report class');
  cl.append(new Option('All classes','all'));
  for(const c of state.classes)cl.append(new Option([c.name,c.section,c.academic_year].filter(Boolean).join(' · '),c.id));
  const search=make('input');search.type='search';search.maxLength=120;search.placeholder='Find student / admission no.';search.setAttribute('aria-label','Search student');
  const group=make('label','Month');group.append(year);
  const group2=make('label','Class');group2.append(cl);
  const group3=make('label','Student search');group3.append(search);
  form.append(group,group2,group3);section.append(form);
  return {section,month:year,classes:cl,search};
 }
 function grid(headers,rows,action=null){
  const table=make('table');const head=make('thead'),hr=make('tr');
  for(const h of headers)td(hr,h,'th');head.append(hr);table.append(head);
  const body=make('tbody');
  for(const item of rows){
    const tr=make('tr');for(const value of item.cells)td(tr,value);
    if(action){const cell=make('td');action(item.row,cell);tr.append(cell)}
    body.append(tr);
  }
  table.append(body);
  const container=make('div',undefined,'phase-a-table');container.append(table);
  return container;
 }
 function section(body,title,summary){
  const root=make('section',undefined,'phase-a-report');
  root.append(make('h3',title));
  const p=make('p',summary,'phase-a-help');root.append(p);body.append(root);
  return root;
 }
 function receiptDialog(info){
  const old=document.getElementById('bnReceiptDialog');if(old)old.remove();
  const dlg=make('dialog');dlg.id='bnReceiptDialog';dlg.className='phase-a-receipt-dialog';
  const printable=make('div');printable.id='bnReceipt';
  printable.append(make('h2',info.school),make('p','Payment acknowledgement • Generated from verified school fee ledger'));
  const rows=[['Payment reference',info.reference],['Student',info.student],['Admission number',info.admission],
    ['Received on',info.paid_on],['Description',info.description],['Amount received',rupees(info.amount)]];
  const table=make('table');
  for(const [name,value] of rows){const tr=make('tr');td(tr,name,'th');td(tr,value);table.append(tr)}
  printable.append(table,make('p','This is a record of a confirmed payment entry, not a GST/tax invoice or proof of bank settlement.','phase-a-help'));
  dlg.append(printable);
  const actions=make('div',undefined,'phase-a-actions');
  const print=make('button','Print / Save PDF');print.type='button';print.addEventListener('click',()=>window.print());
  const close=make('button','Close');close.type='button';close.addEventListener('click',()=>dlg.close());
  actions.append(print,close);dlg.append(actions);document.body.append(dlg);
  dlg.addEventListener('close',()=>dlg.remove(),{once:true});dlg.showModal();
 }
 function showFees({body,state}){
  const root=section(body,'Fee balances & payment receipts',
    'Exact report from confirmed cloud charges and payments. Unpaid balance is not the same as overdue: payment due dates/fee plans are not configured yet.');
  if(!engine){root.append(make('p','Reports module could not load. Refresh while online.'));return}
  const f=filterForm(state);
  const include=make('label');const checkbox=make('input');checkbox.type='checkbox';
  include.append(checkbox,document.createTextNode('Include archived / transferred students'));
  f.section.append(include);root.append(f.section);
  const actions=make('div',undefined,'phase-a-actions');
  const generate=make('button','Refresh fee report');generate.type='button';
  const exportCsv=make('button','Export balances CSV');exportCsv.type='button';exportCsv.disabled=true;
  const print=make('button','Print report');print.type='button';print.disabled=true;
  actions.append(generate,exportCsv,print);root.append(actions);
  const results=make('div');root.append(results);
  let report=null;
  const refresh=()=>{
   results.replaceChildren();exportCsv.disabled=true;print.disabled=true;
   try{
    report=engine.ledgerReport([...state.students,...state.formerStudents],state.classes,state.fees,
      {asOf:now(),month:f.month.value,classId:f.classes.value,search:f.search.value,includeArchived:checkbox.checked});
    const t=report.totals;
    results.append(make('p','Current recorded charges '+rupees(t.charges)+' · Payments '+rupees(t.paid)+
      ' · Unpaid recorded balance '+rupees(t.unpaid)+' · Advance '+rupees(t.advance)));
    results.append(make('p','Collected in '+f.month.value+': '+rupees(t.monthCollected)+
      ' · Students with unpaid recorded balance: '+t.withBalance+
      ' · Students without ledger entries: '+t.noLedger,'phase-a-help'));
    if(t.issues.length){results.append(make('p',t.issues.length+' invalid ledger row(s) excluded. Resolve before financial reporting.','phase-a-alert'));return;}
    if(!report.rows.length){results.append(make('p','No students match the current filter.'));return}
    results.append(grid(['Student','Admission','Class','Charges (₹)','Paid (₹)','Unpaid (₹)','Advance (₹)','This month (₹)'],
       report.rows.map(x=>({row:x,cells:[x.name,x.admission_number,x.class_name,x.charges,x.paid,x.unpaid,x.advance,x.monthCollected]}))));
    results.append(make('p',report.note,'phase-a-help'));
    exportCsv.disabled=false;print.disabled=false;
   }catch(e){report=null;results.append(make('p',e.message,'phase-a-alert'))}
  };
  generate.addEventListener('click',refresh);
  exportCsv.addEventListener('click',()=>{
   if(!report||report.totals.issues.length)return;
   const fields=['name','admission_number','class_name','charges','paid','unpaid','advance','monthCollected'];
   download('bright-nexa-fee-balances-'+f.month.value+'.csv',engine.csv(report.rows,fields));
  });
  print.addEventListener('click',()=>window.print());
  if(!state.offlineReadOnly){
   const receipts=make('div');receipts.append(make('h4','Verified payment receipts'));
   const confirmed=state.fees.filter(x=>x.kind==='payment').sort((a,b)=>b.occurred_on.localeCompare(a.occurred_on)).slice(0,100);
   if(!confirmed.length)receipts.append(make('p','No confirmed payments have been recorded yet.','phase-a-help'));
   else receipts.append(grid(['Date','Student','Amount','Reference',''],confirmed.map(x=>({
    row:x,cells:[x.occurred_on,[...state.students,...state.formerStudents].find(s=>s.id===x.student_id)?.name||'Unknown student',rupees(x.amount_rupees),x.reference||'—']
   })),(row,cell)=>{
      const b=make('button','Receipt');b.type='button';
      b.addEventListener('click',()=>{
       try{
        const student=[...state.students,...state.formerStudents].find(s=>s.id===row.student_id);
        receiptDialog(engine.receipt(row,student,state.school));
       }catch(e){alert('Receipt unavailable: '+e.message)}
      });
      cell.append(b);
   }));
   root.append(receipts);
  }
  if(state.offlineReadOnly)root.append(make('p','Offline snapshot only: do not use these totals for fresh financial decisions.','phase-a-alert'));
  else refresh();
 }
 function showAttendance({body,state,allSchool,error}){
  const root=section(body,'Monthly class attendance report',
    'Loads complete month records from verified cloud, not the first 200 recent marks. Unmarked students are never automatically classified as absent.');
  if(!engine){root.append(make('p','Reports module could not load. Refresh while online.'));return}
  const f=filterForm(state);root.append(f.section);
  const actions=make('div',undefined,'phase-a-actions');
  const generate=make('button','Generate attendance report');generate.type='button';
  const exportCsv=make('button','Export attendance CSV');exportCsv.type='button';exportCsv.disabled=true;
  const exportDays=make('button','Export daily summary');exportDays.type='button';exportDays.disabled=true;
  actions.append(generate,exportCsv,exportDays);root.append(actions);
  const results=make('div');root.append(results);let report=null;
  generate.addEventListener('click',async()=>{
   results.replaceChildren();exportCsv.disabled=exportDays.disabled=true;generate.disabled=true;report=null;
   if(state.offlineReadOnly){results.append(make('p','Fresh attendance reports require online owner login.','phase-a-alert'));generate.disabled=false;return}
   try{
    const bounds=engine.monthBounds(f.month.value);
    results.append(make('p','Reading full month attendance from cloud…','phase-a-help'));
    const marks=await allSchool('school_attendance','id,student_id,class_id,day,status',
      {and:'(day.gte.'+bounds.start+',day.lt.'+bounds.end+')'});
    const data=engine.monthAttendance(state.students,state.classes,marks,
      {month:f.month.value,classId:f.classes.value,search:f.search.value});
    report=data;results.replaceChildren();
    const t=data.summary;
    results.append(make('p','Marked: '+t.marked+' student-days · Present: '+t.present+
      ' · Late: '+t.late+' · Absent: '+t.absent+' · Excused: '+t.excused+
      ' · Attendance among marked: '+(t.markedPercent===null?'N/A':t.markedPercent+'%')));
    results.append(make('p','Active students matching filter: '+t.totalStudents+
      ' · Days with recorded marks: '+t.recordedDates,'phase-a-help'));
    if(t.issues.length){results.append(make('p',t.issues.length+' invalid/duplicate mark(s) detected. Fix source records before exporting.','phase-a-alert'));return}
    if(!data.byStudent.length){results.append(make('p','No matching active students.'));return}
    results.append(make('h4','Student summary'));
    results.append(grid(['Student','Admission','Class','Present','Late','Absent','Excused','Marked','% of marked days'],
      data.byStudent.map(x=>({row:x,cells:[x.name,x.admission_number,x.class_name,x.present,x.late,x.absent,x.excused,x.marked,x.attendancePercent===null?'N/A':x.attendancePercent+'%']}))));
    results.append(make('h4','Daily marking coverage'));
    results.append(grid(['Day','Present','Late','Absent','Excused','Not marked'],
      data.dates.map(x=>({row:x,cells:[x.day,x.present,x.late,x.absent,x.excused,x.unmarked]}))));
    results.append(make('p',data.note,'phase-a-help'));
    exportCsv.disabled=exportDays.disabled=false;
   }catch(e){results.replaceChildren();results.append(make('p','Attendance report not available: '+e.message,'phase-a-alert'));error(e)}
   finally{generate.disabled=false}
  });
  exportCsv.addEventListener('click',()=>{
   if(!report||report.summary.issues.length)return;
   download('bright-nexa-attendance-'+f.month.value+'.csv',engine.csv(report.byStudent,
     ['name','admission_number','class_name','present','late','absent','excused','marked','attendancePercent']));
  });
  exportDays.addEventListener('click',()=>{
   if(!report||report.summary.issues.length)return;
   download('bright-nexa-attendance-daily-'+f.month.value+'.csv',engine.csv(report.dates,
     ['day','present','late','absent','excused','unmarked','marked']));
  });
 }
 window.BrightNexaPhaseAReports={showFees,showAttendance};
})();
