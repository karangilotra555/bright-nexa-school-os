/* Bright Nexa Smart Tools UI — no external service calls; file inputs remain in memory. */
(() => {
'use strict';
const E=window.BrightNexaSmart;
if(!E)throw Error('Smart Tools engine missing.');
const $=id=>document.getElementById(id);
const state={datasets:{},imports:{},plan:null,substitutes:[],analysis:null,findings:null};
const DEMO={
 teachers:'teacher,subjects,classes,maxdaily,unavailable\nAsha Sharma,Mathematics;Science,Class 6-A;Class 7-A,4,Mon-1\nMeera Singh,English;Hindi,Class 6-A;Class 7-A,4,\nAmit Verma,Mathematics,Class 6-A;Class 7-A,4,\nRitu Gupta,Science;English,Class 6-A;Class 7-A,4,\nPooja Joshi,Hindi;Mathematics,Class 6-A;Class 7-A,4,',
 demands:'class,subject,periods\nClass 6-A,Mathematics,5\nClass 6-A,English,5\nClass 6-A,Science,4\nClass 6-A,Hindi,4\nClass 7-A,Mathematics,5\nClass 7-A,English,5\nClass 7-A,Science,4\nClass 7-A,Hindi,4',
 students:'student_id,student_name,class,section\nBN-001,Aarav,6,A\nBN-001,Duplicate,6,A\nBN-003,,7,A',
 fees:'student_id,receipt_no,total_fee,paid,balance\nBN-001,RC-001,5000,2000,3000\nBN-002,RC-001,5000,5500,-500\nBN-003,RC-003,5000,2000,2500',
 attendance:'student_id,date,status\nBN-001,2026-10-20,Present\nBN-001,2026-10-20,Absent\nBN-003,2026-10-20,Unknown',
 marks:'student_id,student_name,subject,marks,max_marks,previous_marks,attendance_percent\nBN-001,Aarav,Mathematics,28,100,20,79\nBN-001,Aarav,English,72,100,68,79\nBN-002,Sara,Mathematics,87,100,74,94\nBN-002,Sara,English,81,100,85,94\nBN-003,Imran,Science,32,80,21,88'
};
const n=x=>String(x??'');
function msg(message,bad=false){
 const box=$('status');box.textContent=message;box.classList.remove('hidden');box.classList.toggle('bad',bad);
 box.scrollIntoView({block:'nearest'});
}
function clear(){ $('status').classList.add('hidden'); }
function dom(tag,value,className){
 const e=document.createElement(tag);if(value!==undefined)e.textContent=n(value);
 if(className)e.className=className;
 return e;
}
function wipe(id){const e=$(id);e.replaceChildren();e.classList.add('hidden');return e;}
function table(id,columns,records){
 const root=wipe(id);
 if(!records.length){root.classList.remove('hidden');root.append(dom('p','No results to display.','small'));return;}
 const tab=dom('table'),thead=dom('thead'),tr=dom('tr');
 for(const c of columns)tr.append(dom('th',c.label));
 thead.append(tr);tab.append(thead);
 const body=dom('tbody');
 for(const row of records.slice(0,1200)){
   const line=dom('tr');
   for(const c of columns){
     const cell=dom('td',typeof c.value==='function'?c.value(row):row[c.key]);
     line.append(cell);
   }body.append(line);
 }
 tab.append(body);root.append(tab);root.classList.remove('hidden');
}
function metric(root,title,value){
 const card=dom('div',undefined,'metric');card.append(dom('span',title),dom('strong',value));root.append(card);
}
function download(name,text){
 if(!text){msg('Nothing available to export.',true);return;}
 const blob=new Blob(['\uFEFF',text],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob);
 const a=dom('a');a.href=url;a.download=name;a.style.display='none';document.body.append(a);a.click();
 a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function loadDataset(kind,text){
 const entries=E.parseCsv(text);
 const mapped=E.canonical(entries,kind);
 state.datasets[kind]=mapped.records;
 state.imports[kind]=mapped;
 return mapped;
}
function showImport(kind){
 const info=state.imports[kind];
 const stats=wipe('importStats');const mapping=wipe('importMapping');
 if(!info){$('exportClean').disabled=true;return;}
 stats.classList.remove('hidden');
 metric(stats,'Records read',info.count);metric(stats,'Recognized fields',Object.values(info.mapping).filter(Boolean).length);
 metric(stats,'Possible issues',E.detect({[kind]:info.records}).length);
 const assignments=Object.entries(info.mapping).map(([k,v])=>k+' ← '+(v||'not found')).join('  |  ');
 mapping.textContent='Detected columns: '+assignments;mapping.classList.remove('hidden');
 const fields=Object.keys(info.mapping).filter(k=>info.mapping[k]);
 const cols=[{key:'_row',label:'File row'},...fields.map(k=>({key:k,label:k}))];
 table('importPreview',cols,info.records.slice(0,100));
 $('exportClean').disabled=!info.count;
}
function useSample(kind){
 const imp=loadDataset(kind,DEMO[kind]);$('datasetType').value=kind;
 showImport(kind);msg('Loaded '+kind+' sample data (fictional). Nothing uploaded.');
}
function rowUrl(kind){return Object.keys(E.mapColumns([],kind));}
function parseDemandCsv(csv){
 const rows=E.parseCsv(csv);
 const keys=Object.keys(rows[0]||{});
 const pick=(r,names)=>r[keys.find(k=>names.includes(k.toLowerCase().replace(/[^a-z0-9]/g,'')))]||'';
 return rows.map((r,i)=>({
  class:pick(r,['class','classname','grade']),
  subject:pick(r,['subject','subjectname']),
  periods:pick(r,['periods','weeklyperiods','lessons'])
 })).filter(x=>x.class&&x.subject);
}

const editor={teachers:[],demands:[]};let editSeq=0;
const uid=()=>++editSeq;
const skills=s=>String(s||'').split(';').map(v=>v.trim()).filter(Boolean);
function invalidateTimetable(){
 state.plan=null;state.substitutes=[];
 $('exportTimetable').disabled=true;$('printTimetable').disabled=true;$('exportSubstitute').disabled=true;
 $('scheduleSummary').textContent='Details changed — generate a new timetable.';
 wipe('scheduleTable');wipe('substituteTable');
}
function demandChoices(field){
 return [...new Set(editor.demands.map(d=>String(d[field]||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
}
function suggest(){
 for(const [key,id] of [['class','ttClassesList'],['subject','ttSubjectsList']]){
  const list=$(id);list.replaceChildren();
  for(const v of demandChoices(key)){const o=dom('option');o.value=v;list.append(o);}
 }
}
function field(title,value,onChange,options={}){
 const wrap=dom('div'),label=dom('label',title),input=dom('input');
 input.value=String(value??'');input.type=options.number?'number':'text';
 input.autocomplete='off';input.setAttribute('aria-label',title);
 if(options.number){input.min='1';input.max=String(options.max||12);input.step='1';}
 if(options.list)input.setAttribute('list',options.list);
 input.addEventListener('input',()=>{onChange(input.value,false);invalidateTimetable();});
 input.addEventListener('change',()=>onChange(input.value,true));
 wrap.append(label,input);return wrap;
}
function renderDemands(){
 suggest();const list=$('demandsEditor');list.replaceChildren();
 if(!editor.demands.length)list.append(dom('p','Click + Add Subject to get started.','tt-help'));
 for(const d of editor.demands){
  const line=dom('div',undefined,'tt-formrow');
  line.append(
   field('Class / section',d.class,(v,done)=>{d.class=v;if(done){suggest();renderTeachers();}},{list:'ttClassesList'}),
   field('Subject',d.subject,(v,done)=>{d.subject=v;if(done){suggest();renderTeachers();}},{list:'ttSubjectsList'}),
   field('Periods / week',d.periods,v=>{d.periods=v;},{number:true,max:60})
  );
  const btn=dom('button','Remove','danger');btn.type='button';
  btn.setAttribute('aria-label','Remove subject '+d.subject+' for '+d.class);
  btn.addEventListener('click',()=>{
   editor.demands=editor.demands.filter(x=>x.id!==d.id);
   renderDemands();renderTeachers();invalidateTimetable();
  });line.append(btn);list.append(line);
 }
}
function checkChoices(card,title,values,choices){
 card.append(dom('span',title,'tt-small-label'));
 const row=dom('div',undefined,'tt-checkrow');
 for(const choice of choices){
  const lab=dom('label'),c=dom('input');c.type='checkbox';c.value=choice;
  c.checked=values.some(x=>x.toLowerCase()===choice.toLowerCase());
  c.addEventListener('change',()=>{
   const index=values.findIndex(x=>x.toLowerCase()===choice.toLowerCase());
   if(c.checked&&index<0)values.push(choice);
   if(!c.checked&&index>=0)values.splice(index,1);
   invalidateTimetable();
  });
  lab.append(c,dom('span',choice));row.append(lab);
 }
 if(!choices.length)row.append(dom('span','Add class and subject rows above first.','tt-help'));
 card.append(row);
}
function renderTeachers(){
 const root=$('teachersEditor');root.replaceChildren();
 const subjects=demandChoices('subject'),classes=demandChoices('class');
 if(!editor.teachers.length)root.append(dom('p','Click + Add Teacher to begin.','tt-help'));
 for(const teacher of editor.teachers){
  const card=dom('article',undefined,'tt-teacher'),top=dom('div',undefined,'tt-teacher-header');
  top.append(field('Teacher name',teacher.name,v=>{teacher.name=v;}),
    field('Max periods/day',teacher.maxdaily,v=>{teacher.maxdaily=v;},{number:true,max:12}));
  const remove=dom('button','Remove','danger');remove.type='button';
  remove.setAttribute('aria-label','Remove teacher '+teacher.name);
  remove.addEventListener('click',()=>{
   editor.teachers=editor.teachers.filter(x=>x.id!==teacher.id);
   renderTeachers();invalidateTimetable();
  });
  top.append(remove);card.append(top);
  checkChoices(card,'SUBJECTS',teacher.subjects,subjects);
  checkChoices(card,'CLASSES',teacher.classes,classes);
  const unavailable=dom('div',undefined,'tt-unavailable');
  unavailable.append(field('Unavailable slots (optional, Mon-1; Tue-2)',teacher.unavailable,v=>{teacher.unavailable=v;}));
  card.append(unavailable);root.append(card);
 }
}
function renderEditor(){renderDemands();renderTeachers();}
function loadEditorCsv(teacherCsv,demandCsv){
 const rawTeachers=E.canonical(E.parseCsv(teacherCsv),'teachers').records;
 const rawDemands=parseDemandCsv(demandCsv);
 if(!rawDemands.length)throw Error('No valid class-subject requirements found.');
 if(rawTeachers.length>200||rawDemands.length>200)throw Error('Maximum 200 rows each.');
 const t=rawTeachers.map(r=>({id:uid(),name:r.teacher,subjects:skills(r.subjects),
   classes:skills(r.classes),maxdaily:Number(r.maxdaily||6),unavailable:r.unavailable||''}));
 const d=rawDemands.map(r=>({id:uid(),class:r.class,subject:r.subject,periods:Number(r.periods)}));
 editor.teachers=t;editor.demands=d;
 $('teachersCsv').value=teacherCsv;$('demandsCsv').value=demandCsv;
 renderEditor();invalidateTimetable();
}
function validatedTimetableInputs(){
 if(!editor.demands.length||!editor.teachers.length)throw Error('Add teachers and weekly subject requirements.');
 const seen=new Set(),demands=[];
 for(const d of editor.demands){
  const cls=String(d.class||'').trim(),subject=String(d.subject||'').trim(),periods=Number(d.periods);
  if(!cls||!subject||!Number.isInteger(periods)||periods<1||periods>60)throw Error('Complete all class, subject and weekly periods (1–60).');
  const k=(cls+'|'+subject).toLowerCase();
  if(seen.has(k))throw Error('Duplicate class/subject: '+cls+' / '+subject);
  seen.add(k);demands.push({class:cls,subject,periods});
 }
 const usedNames=new Set(),teachers=[],allSubs=demandChoices('subject'),allClasses=demandChoices('class');
 for(const t of editor.teachers){
  const name=String(t.name||'').trim(),maxdaily=Number(t.maxdaily);
  if(!name||usedNames.has(name.toLowerCase()))throw Error(name?'Duplicate teacher: '+name:'Teacher name missing.');
  usedNames.add(name.toLowerCase());
  if(!Number.isInteger(maxdaily)||maxdaily<1||maxdaily>12)throw Error('Max periods/day must be 1–12 for '+name);
  const subjects=t.subjects.filter(x=>allSubs.includes(x)),classes=t.classes.filter(x=>allClasses.includes(x));
  if(!subjects.length||!classes.length)throw Error('Select subjects and classes for '+name);
  teachers.push({teacher:name,subjects:subjects.join(';'),classes:classes.join(';'),
    maxdaily,unavailable:String(t.unavailable||'').trim()});
 }
 return {teachers,demands};
}

function runTimetable(){
 clear();
 const {teachers,demands}=validatedTimetableInputs();
 if(!demands.length)throw Error('Class requirement rows were not recognized. Use class,subject,periods.');
 const days=Number($('daysSelect').value)===6?['Mon','Tue','Wed','Thu','Fri','Sat']:['Mon','Tue','Wed','Thu','Fri'];
 state.plan=E.schedule({teachers,demands,days,periods:Number($('periodsSelect').value)});
 const plan=state.plan;
 const sel=$('timetableFilter');sel.replaceChildren();const all=dom('option','All classes');all.value='all';sel.append(all);
 for(const c of plan.classes){const o=dom('option',c);o.value=c;sel.append(o)}
 const teachersSel=$('absentTeacher');teachersSel.replaceChildren();
 for(const t of plan.teachers){const o=dom('option',t.name);o.value=t.name;teachersSel.append(o)}
 const daySel=$('absenceDay');daySel.replaceChildren();
 for(const d of plan.days){const o=dom('option',d);o.value=d;daySel.append(o)}
 const pSel=$('absencePeriod');pSel.replaceChildren();const allPeriods=dom('option','All affected periods');allPeriods.value='all';pSel.append(allPeriods);
 for(let p=1;p<=plan.periods;p++){const o=dom('option','Period '+p);o.value=p;pSel.append(o)}
 $('exportTimetable').disabled=false;$('printTimetable').disabled=false;
 renderSchedule();
 const warnings=plan.issues.length?'\nWarnings: '+plan.issues.join(' | '):'';
 msg('Timetable generated: '+plan.assigned+' teaching periods assigned; '+plan.rows.filter(r=>r.unfilled).length+' open periods.'+warnings,!!plan.issues.length);
}
function renderSchedule(){
 const p=state.plan;if(!p)return;
 const filter=$('timetableFilter').value;
 const rows=p.rows.filter(r=>filter==='all'||r.class===filter);
 $('scheduleSummary').textContent='Allocated: '+p.assigned+'/'+p.requested+' requested lessons. Open slots are explicitly marked. Conflicting teacher slots are not permitted.';
 table('scheduleTable',[
  {key:'day',label:'Day'},{key:'period',label:'Period'},{key:'class',label:'Class'},
  {key:'subject',label:'Subject'},{key:'teacher',label:'Teacher'}
 ],rows);
}
function renderSubstitutes(){
 const p=state.plan;if(!p)throw Error('Generate a timetable first.');
 const teacher=$('absentTeacher').value,day=$('absenceDay').value,period=$('absencePeriod').value;
 const results=E.substitutes(p,teacher,day,period==='all'?null:Number(period));
 state.substitutes=results;
 table('substituteTable',[
  {key:'day',label:'Day'},{key:'period',label:'Period'},{key:'class',label:'Class'},
  {key:'subject',label:'Subject'},{key:'teacher',label:'Absent Teacher'},
  {label:'Free qualified substitutes',value:r=>r.suggestions.length?r.suggestions.map(x=>x.teacher+' ('+x.load+' periods that day)').join(', '):'None available'}
 ],results);
 $('exportSubstitute').disabled=!results.length;
 msg(results.length+' affected period(s). '+results.filter(r=>!r.suggestions.length).length+' without a qualified free substitute.');
}
function analyze(){
 const records=state.datasets.marks;if(!records?.length)throw Error('Import Marks dataset first or choose Load Demo Marks.');
 const threshold=Number($('threshold').value);
 state.analysis=E.performance(records,threshold);
 const root=wipe('performanceMetrics');root.classList.remove('hidden');
 const students=state.analysis.students;
 metric(root,'Students analyzed',students.length);
 metric(root,'Students below threshold',students.filter(s=>s.weak.length).length);
 metric(root,'Invalid mark rows',state.analysis.issues.length);
 table('performanceTable',[
  {key:'id',label:'Student ID'},{key:'name',label:'Name'},{key:'average',label:'Average %'},
  {label:'Review subjects',value:s=>s.weak.join(', ')||'None below threshold'},
  {label:'Attendance %',value:s=>s.attendance===null?'Not provided':s.attendance},
  {label:'Subject summary',value:s=>s.subjects.map(x=>x.subject+': '+x.percentage+'%'+(x.change===null?'':' ('+(x.change>=0?'+':'')+x.change+' pp)')).join('; ')}
 ],students);
 $('exportAnalysis').disabled=!students.length;
 msg('Performance analysis complete. '+state.analysis.issues.length+' invalid row(s) excluded.',!!state.analysis.issues.length);
}
function audit(){
 const report=E.detect(state.datasets);state.findings=report;
 const box=wipe('auditStats');box.classList.remove('hidden');
 metric(box,'Datasets loaded',Object.keys(state.datasets).length);
 metric(box,'Errors',report.filter(x=>x.severity==='error').length);
 metric(box,'Warnings',report.filter(x=>x.severity==='warning').length);
 table('auditTable',[
  {key:'kind',label:'Dataset'},{key:'severity',label:'Severity'},{key:'row',label:'File Row'},{key:'message',label:'Finding'}
 ],report);
 $('exportFindings').disabled=!report.length;
 msg(report.length?'Audit found '+report.length+' item(s) to review. No records were changed.':'No rule violations detected in currently loaded data.');
}
function guessTemplates(kind){
 const fields={
  students:['student_id','student_name','class','section'],
  teachers:['teacher','subjects','classes','maxdaily','unavailable'],
  fees:['student_id','receipt_no','total_fee','paid','balance'],
  attendance:['student_id','date','status'],
  marks:['student_id','student_name','subject','marks','max_marks','previous_marks','attendance_percent']
 };
 return E.toCsv([Object.fromEntries(fields[kind].map(f=>[f,'']))],fields[kind]);
}
/* Minimal XLSX reader for local Excel files, using browser-native ZIP decompression.
 * Only reads the first worksheet; does not evaluate Excel formulas/macros.
 * No third-party CDN or API. Converts cell values to text for safe mapping.
 */
async function xlsxRows(buffer){
 if(buffer.byteLength>4000000)throw Error('Maximum file size is 4 MB.');
 const d=new DataView(buffer),u=new Uint8Array(buffer);
 const u16=p=>d.getUint16(p,true),u32=p=>d.getUint32(p,true);
 if(buffer.byteLength<22||u32(0)!==0x04034b50)throw Error('Invalid XLSX/ZIP file.');
 let eocd=-1;
 for(let i=buffer.byteLength-22;i>=Math.max(0,buffer.byteLength-65557);i--){
  if(u32(i)===0x06054b50){eocd=i;break;}
 }
 if(eocd<0)throw Error('XLSX ZIP directory not found.');
 const decoder=new TextDecoder(),count=u16(eocd+10),start=u32(eocd+16);
 if(count>4000||start>=buffer.byteLength)throw Error('Unsupported Excel ZIP archive.');
 let offset=start;const entries=new Map();
 for(let j=0;j<count;j++){
  if(offset+46>buffer.byteLength||u32(offset)!==0x02014b50)throw Error('Corrupted XLSX directory.');
  const method=u16(offset+10),size=u32(offset+20),uncompressed=u32(offset+24),nameLen=u16(offset+28),extra=u16(offset+30),comment=u16(offset+32),local=u32(offset+42);
  const filename=decoder.decode(u.slice(offset+46,offset+46+nameLen));
  if(uncompressed>16000000||size>4000000)throw Error('Spreadsheet part too large.');
  entries.set(filename,{method,size,uncompressed,local});
  offset+=46+nameLen+extra+comment;
 }
 async function part(name){
  const e=entries.get(name);if(!e)return '';
  const p=e.local;
  if(p+30>buffer.byteLength||u32(p)!==0x04034b50)throw Error('Bad XLSX local header.');
  const start=p+30+u16(p+26)+u16(p+28),end=start+e.size;
  if(end>buffer.byteLength)throw Error('Corrupted XLSX content.');
  const bytes=u.slice(start,end);
  let output;
  if(e.method===0)output=bytes;
  else if(e.method===8&&typeof DecompressionStream==='function'){
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    output=new Uint8Array(await new Response(stream).arrayBuffer());
  }else throw Error('This browser cannot open compressed XLSX. Save Excel as CSV and retry.');
  if(output.byteLength!==e.uncompressed||output.byteLength>16000000)throw Error('Corrupted or oversized Excel content.');
  return decoder.decode(output);
 }
 function xml(text){
  if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('Excel XML document contains unsupported entities.');
  const doc=new DOMParser().parseFromString(text,'application/xml');
  if(doc.getElementsByTagName('parsererror').length)throw Error('Invalid Excel XML.');
  return doc;
 }
 const stringsXml=await part('xl/sharedStrings.xml');
 const shared=stringsXml?[...xml(stringsXml).getElementsByTagName('si')].map(si=>[...si.getElementsByTagName('t')].map(t=>t.textContent).join('')):[];
 const name=[...entries.keys()].filter(k=>/^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
 if(!name)throw Error('No standard Excel worksheet found.');
 const sheet=xml(await part(name));
 const rows=[],elems=[...sheet.getElementsByTagName('row')];
 if(elems.length>10001)throw Error('Maximum 10,000 Excel rows.');
 function indexFromCell(cell){
  const letters=(cell.getAttribute('r')||'').match(/^[A-Z]+/i)?.[0]?.toUpperCase()||'A';
  let n=0;for(const l of letters)n=n*26+l.charCodeAt(0)-64;return n-1;
 }
 for(const row of elems){
  const values=[];
  for(const c of row.getElementsByTagName('c')){
   const col=indexFromCell(c);if(col>63)throw Error('Maximum 64 columns.');
   const type=c.getAttribute('t');const v=c.getElementsByTagName('v')[0]?.textContent||'';
   values[col]=type==='s'?(shared[Number(v)]||''):type==='inlineStr'?[...c.getElementsByTagName('t')].map(t=>t.textContent).join(''):type==='b'?(v==='1'?'TRUE':'FALSE'):v;
  }
  if(values.some(v=>n(v).trim()))rows.push(values);
 }
 if(rows.length<2)throw Error('First worksheet needs header and data.');
 const csv=rows.map(r=>Array.from({length:Math.max(rows[0].length,r.length)},(_,i)=>{
  const val=n(r[i]);return '"'+val.replace(/"/g,'""')+'"';
 }).join(',')).join('\n');
 return E.parseCsv(csv);
}
async function handleFile(){
 const file=$('importFile').files[0];if(!file)return;
 if(file.size>4000000)throw Error('File is larger than 4MB.');
 const kind=$('datasetType').value;
 const name=file.name.toLowerCase();
 if(!/\.(csv|tsv|xlsx)$/.test(name))throw Error('Only .csv, .tsv and .xlsx are supported.');
 const rows=name.endsWith('.xlsx')?await xlsxRows(await file.arrayBuffer()):E.parseCsv(await file.text());
 const data=E.canonical(rows,kind);state.datasets[kind]=data.records;state.imports[kind]=data;
 showImport(kind);msg(file.name+': '+data.count+' row(s) read and mapped in your browser. No server upload.');
}
function task(fn){try{const result=fn();if(result&&typeof result.then==='function')result.catch(e=>msg(e.message||'Unable to process file.',true));}catch(e){msg(e.message||'Invalid input.',true)}}
for(const btn of document.querySelectorAll('[data-tab]')){
 btn.addEventListener('click',()=>{
  for(const b of document.querySelectorAll('[data-tab]'))b.classList.toggle('active',b===btn);
  for(const view of document.querySelectorAll('[data-view]'))view.classList.toggle('hidden',view.dataset.view!==btn.dataset.tab);
 });
}
$('sampleTimetable').addEventListener('click',()=>{ $('teachersCsv').value=DEMO.teachers;$('demandsCsv').value=DEMO.demands;msg('Timetable sample loaded. Click Generate to calculate.');});
$('generateTimetable').addEventListener('click',()=>task(runTimetable));
$('timetableFilter').addEventListener('change',()=>task(renderSchedule));
$('exportTimetable').addEventListener('click',()=>task(()=>download('bright-nexa-timetable.csv',E.toCsv(state.plan.rows,['day','period','class','subject','teacher']))));
$('printTimetable').addEventListener('click',()=>window.print());
$('findSubstitutes').addEventListener('click',()=>task(renderSubstitutes));
$('exportSubstitute').addEventListener('click',()=>task(()=>download('bright-nexa-substitutes.csv',E.toCsv(state.substitutes.map(r=>({day:r.day,period:r.period,class:r.class,subject:r.subject,absent:r.teacher,suggested:r.suggestions.map(x=>x.teacher).join('; ')})),['day','period','class','subject','absent','suggested']))));
$('sampleMarks').addEventListener('click',()=>task(()=>{useSample('marks');analyze()}));
$('analyzeMarks').addEventListener('click',()=>task(analyze));
$('exportAnalysis').addEventListener('click',()=>task(()=>download('bright-nexa-performance.csv',E.toCsv(state.analysis.students.map(s=>({id:s.id,name:s.name,average:s.average,attendance:s.attendance??'',weak:s.weak.join('; ')})),['id','name','average','attendance','weak']))));
$('datasetType').addEventListener('change',()=>showImport($('datasetType').value));
$('importSample').addEventListener('click',()=>task(()=>useSample($('datasetType').value)));
$('downloadTemplate').addEventListener('click',()=>task(()=>download('bright-nexa-'+$('datasetType').value+'-template.csv',guessTemplates($('datasetType').value))));
$('importFile').addEventListener('change',()=>task(handleFile));
$('exportClean').addEventListener('click',()=>task(()=>{
 const kind=$('datasetType').value,records=state.datasets[kind];if(!records)return;
 const cols=Object.keys(E.mapColumns([],kind));download('bright-nexa-'+kind+'-mapped.csv',E.toCsv(records,cols));
}));
$('clearImports').addEventListener('click',()=>{
 state.datasets={};state.imports={};state.analysis=null;state.findings=null;
 $('importFile').value='';wipe('importStats');wipe('importPreview');wipe('importMapping');wipe('auditTable');wipe('auditStats');wipe('performanceTable');wipe('performanceMetrics');
 $('exportClean').disabled=true;$('exportFindings').disabled=true;$('exportAnalysis').disabled=true;
 msg('All imported browser data cleared from this page.');
});
$('runAudit').addEventListener('click',()=>task(audit));
$('sampleErrors').addEventListener('click',()=>task(()=>{for(const kind of ['students','fees','attendance','marks'])loadDataset(kind,DEMO[kind]);audit()}));
$('exportFindings').addEventListener('click',()=>task(()=>download('bright-nexa-data-audit.csv',E.toCsv(state.findings,['kind','severity','row','message']))));
$('teachersCsv').value=DEMO.teachers;$('demandsCsv').value=DEMO.demands;
msg('Smart Tools ready. Start with Generate Timetable, or choose Import to analyze your own CSV / XLSX. No external AI API is used.');
})();
