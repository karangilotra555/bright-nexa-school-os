/* Bright Nexa Smart School Tools — deterministic, offline-in-browser algorithms.
 * No AI provider, API key, remote network, or server-side student processing.
 * All inputs are untrusted; validate them before interpretation.
 */
(function(root, factory) {
  const engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = engine;
  else root.BrightNexaSmart = engine;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const DATASETS=['students','teachers','fees','attendance','marks'];
  const headers={
    students:{id:['studentid','admissionno','admissionnumber','scholarid','admno','id'],name:['studentname','student','name','fullname'],class:['class','classname','grade'],section:['section','sec']},
    teachers:{teacher:['teacher','teachername','staffname','name'],subjects:['subjects','subject','teachingsubjects'],classes:['classes','assignedclasses','classname','class'],maxdaily:['maxdaily','maxperiodsperday','maximumdaily'],unavailable:['unavailable','unavailableperiods']},
    fees:{id:['studentid','admissionnumber','admissionno','admno'],receipt:['receipt','receiptno','receiptnumber'],total:['total','totalfee','feeamount','amountdue'],paid:['paid','amountpaid','collected','received'],balance:['balance','outstanding','pending','due']},
    attendance:{id:['studentid','admissionnumber','admissionno','admno'],date:['date','day','attendancedate'],status:['status','attendance','attendancestatus']},
    marks:{id:['studentid','admissionnumber','admissionno','admno'],name:['studentname','student','name'],subject:['subject','subjectname'],marks:['marks','marksscored','obtained','score'],max:['maxmarks','totalmarks','maximum','outof'],previous:['previousmarks','lastmarks','previousscore'],attendance:['attendancepercent','attendancepct','attendancepercentage']}
  };
  const norm=x=>String(x==null?'':x).trim();
  const key=x=>norm(x).toLowerCase().replace(/[^a-z0-9]/g,'');
  const number=x=>norm(x)===''?NaN:Number(String(x).replace(/,/g,''));
  const finite=x=>Number.isFinite(x);
  function parseCsv(text,delimiter) {
    if(typeof text!=='string'||text.length>4000000)throw Error('CSV is missing or larger than 4 MB.');
    text=text.replace(/^\uFEFF/,'');
    if(!delimiter){const first=text.split(/\r?\n/,1)[0]||'';delimiter=(first.match(/\t/g)||[]).length>(first.match(/,/g)||[]).length?'\t':',';}
    const result=[],row=[];let field='',quote=false;
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(quote){
        if(c==='"'&&text[i+1]==='"'){field+='"';i++;}
        else if(c==='"')quote=false;
        else field+=c;
      } else if(c==='"'&&field==='')quote=true;
      else if(c===delimiter){row.push(field);field='';}
      else if(c==='\n'||c==='\r'){
        if(c==='\r'&&text[i+1]==='\n')i++;
        row.push(field);if(row.some(v=>norm(v)!==''))result.push(row.slice());
        row.length=0;field='';
        if(result.length>10001)throw Error('Maximum 10,000 rows per import.');
      } else field+=c;
    }
    if(quote)throw Error('CSV has an unclosed quoted field.');
    row.push(field);if(row.some(v=>norm(v)!==''))result.push(row);
    if(result.length<2)throw Error('File needs a header row and at least one data row.');
    if(result[0].length>64)throw Error('Maximum 64 columns supported.');
    const heads=result[0].map(norm);
    if(new Set(heads.map(key)).size!==heads.length)throw Error('Duplicate column headings found.');
    return result.slice(1).map(cells=>Object.fromEntries(heads.map((h,i)=>[h,norm(cells[i])]))).filter(row=>Object.values(row).some(Boolean));
  }
  function mapColumns(rows,kind) {
    if(!DATASETS.includes(kind))throw Error('Unknown dataset: '+kind);
    const names=Object.keys(rows[0]||{}),schema=headers[kind],map={};
    for(const [field,aliases] of Object.entries(schema)){
      map[field]=names.find(name=>aliases.includes(key(name)))||'';
    }
    return map;
  }
  function canonical(rows,kind) {
    if(!Array.isArray(rows)||rows.length>10000)throw Error('Invalid or oversized dataset.');
    const mapping=mapColumns(rows,kind);
    const records=rows.map((r,index)=>{
      const x={_row:index+2};
      for(const [field,col] of Object.entries(mapping))x[field]=col?norm(r[col]):'';
      return x;
    });
    return {records,mapping,columns:Object.keys(rows[0]||{}),count:records.length};
  }
  function schedule(input){
    const teachers=(input.teachers||[]).map((t,i)=>({
      name:norm(t.teacher||t.name),subjects:String(t.subjects||'').split(/[;|]/).map(norm).filter(Boolean),
      classes:String(t.classes||'').split(/[;|]/).map(norm).filter(Boolean),
      maxdaily:finite(number(t.maxdaily))?Math.max(0,Math.min(12,number(t.maxdaily))):6,
      unavailable:String(t.unavailable||'').split(/[;|]/).map(norm).filter(Boolean),
      index:i
    })).filter(t=>t.name);
    const demands=(input.demands||[]).map(d=>({class:norm(d.class),subject:norm(d.subject),remaining:number(d.periods)})).filter(d=>d.class&&d.subject&&Number.isInteger(d.remaining)&&d.remaining>0);
    const days=(input.days||['Mon','Tue','Wed','Thu','Fri']).map(norm).filter(Boolean);
    const periodCount=Number(input.periods||6);
    if(!teachers.length||!demands.length)throw Error('Add teachers and class subject-period requirements.');
    if(days.length<1||days.length>7||!Number.isInteger(periodCount)||periodCount<1||periodCount>12)throw Error('Days/periods not supported.');
    if(demands.length>200||teachers.length>200)throw Error('Maximum 200 teachers and 200 requirements.');
    const names=new Set(),issues=[];
    for(const t of teachers){if(names.has(key(t.name)))issues.push('Duplicate teacher: '+t.name);names.add(key(t.name));}
    const classes=[...new Set(demands.map(d=>d.class))];
    if(classes.length>40)throw Error('Maximum 40 classes.');
    for(const c of classes){
      const total=demands.filter(d=>d.class===c).reduce((a,d)=>a+d.remaining,0);
      if(total>days.length*periodCount)issues.push(c+': '+total+' requested periods exceed '+(days.length*periodCount)+' available.');
    }
    // Most-constrained-first deterministic greedy search. No double-booking.
    const rows=[],busy=new Set(),daily=new Map(),assigned=new Map(),perDaySubject=new Map();
    for(const day of days)for(let period=1;period<=periodCount;period++){
      const reserved=new Set();
      const ordered=classes.slice().sort((a,b)=>{
        const ac=demands.filter(x=>x.class===a&&x.remaining>0).reduce((n,x)=>n+x.remaining,0);
        const bc=demands.filter(x=>x.class===b&&x.remaining>0).reduce((n,x)=>n+x.remaining,0);
        return bc-ac||a.localeCompare(b);
      });
      for(const cls of ordered){
        const candidates=[];
        for(const d of demands.filter(x=>x.class===cls&&x.remaining>0)){
          const eligible=teachers.filter(t=>t.subjects.some(s=>key(s)===key(d.subject))&&(!t.classes.length||t.classes.some(c=>key(c)===key(cls)))&&!reserved.has(t.index)&&!busy.has(day+'|'+period+'|'+t.index)&&!t.unavailable.some(u=>key(u)===key(day+'-'+period)));
          for(const t of eligible){
            const load=daily.get(day+'|'+t.index)||0;
            if(load>=t.maxdaily)continue;
            const dailySubject=perDaySubject.get(day+'|'+cls+'|'+key(d.subject))||0;
            const score=d.remaining*4-dailySubject*9-load*2-(assigned.get(t.index)||0)*0.2;
            candidates.push({d,t,score});
          }
        }
        candidates.sort((a,b)=>b.score-a.score||a.t.name.localeCompare(b.t.name)||a.d.subject.localeCompare(b.d.subject));
        const chosen=candidates[0];
        if(chosen){
          const {d,t}=chosen;d.remaining--;reserved.add(t.index);
          busy.add(day+'|'+period+'|'+t.index);
          daily.set(day+'|'+t.index,(daily.get(day+'|'+t.index)||0)+1);
          assigned.set(t.index,(assigned.get(t.index)||0)+1);
          const sKey=day+'|'+cls+'|'+key(d.subject);
          perDaySubject.set(sKey,(perDaySubject.get(sKey)||0)+1);
          rows.push({day,period,class:cls,subject:d.subject,teacher:t.name});
        }else rows.push({day,period,class:cls,subject:'Study / Open',teacher:'',unfilled:true});
      }
    }
    for(const d of demands)if(d.remaining>0)issues.push(d.class+' '+d.subject+': '+d.remaining+' periods could not be assigned.');
    return {rows,issues,teachers,days,classes,periods:periodCount,requested:input.demands.reduce((n,x)=>n+(number(x.periods)||0),0),assigned:rows.filter(r=>r.teacher).length};
  }
  function substitutes(plan,absence,day,period){
    const original=plan.rows.filter(r=>key(r.teacher)===key(absence)&&r.day===day&&(period==null||Number(r.period)===Number(period)));
    return original.map(slot=>{
      const used=new Set(plan.rows.filter(r=>r.day===slot.day&&r.period===slot.period&&r.teacher).map(r=>key(r.teacher)));
      const suggestions=plan.teachers.filter(t=>key(t.name)!==key(absence)&&!used.has(key(t.name))
        &&t.subjects.some(s=>key(s)===key(slot.subject))
        &&(!t.classes.length||t.classes.some(c=>key(c)===key(slot.class)))
        &&!t.unavailable.some(u=>key(u)===key(slot.day+'-'+slot.period)))
        .map(t=>({teacher:t.name,load:plan.rows.filter(r=>r.day===slot.day&&key(r.teacher)===key(t.name)).length}))
        .filter(t=>t.load<(plan.teachers.find(x=>x.name===t.teacher)?.maxdaily||6))
        .sort((a,b)=>a.load-b.load||a.teacher.localeCompare(b.teacher));
      return {...slot,suggestions};
    });
  }
  // Session-only daily planning: never edits the original weekly timetable.
  const dailyIdentity=x=>norm(x).normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
  const dailySlotId=r=>JSON.stringify([r.day,Number(r.period),r.class]);
  function dailySubstitutions(plan,{date,absentTeachers=[],assignments=[]}={}){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)
      throw Error('Choose a valid worksheet date.');
    if(!plan||!Array.isArray(plan.rows)||!Array.isArray(plan.teachers)||!Array.isArray(plan.days))throw Error('Generate a valid timetable first.');
    const day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(date+'T00:00:00Z').getUTCDay()];
    if(!plan.days.includes(day))throw Error('This date is not a working day in the generated timetable.');
    if(!Array.isArray(absentTeachers)||!absentTeachers.length)throw Error('Select at least one absent teacher.');
    if(!Array.isArray(assignments)||assignments.length>plan.rows.length)throw Error('Invalid worksheet confirmations.');
    const roster=new Map();
    for(const teacher of plan.teachers){
      const id=dailyIdentity(teacher.name);
      if(!id||roster.has(id))throw Error('Duplicate or ambiguous teacher name in timetable.');
      if(!Array.isArray(teacher.subjects)||!Array.isArray(teacher.classes)||!Array.isArray(teacher.unavailable))throw Error('Invalid teacher qualifications.');
      roster.set(id,teacher);
    }
    const absent=new Set(absentTeachers.map(dailyIdentity));
    for(const name of absent)if(!roster.has(name))throw Error('Absent teacher is not in this timetable.');
    const original=plan.rows.filter(r=>r.day===day),slots=new Set(),busy=new Set(),loads=new Map();
    for(const row of original){
      const slot=dailySlotId(row),period=Number(row.period),teacher=dailyIdentity(row.teacher);
      if(slots.has(slot)||!Number.isInteger(period)||period<1||period>plan.periods)throw Error('Duplicate or invalid timetable slot.');
      slots.add(slot);
      if(teacher){
        if(!roster.has(teacher))throw Error('Timetable teacher is missing from roster.');
        const occupied=period+'|'+teacher;
        if(busy.has(occupied))throw Error('Original timetable has a teacher clash. Review it before confirming covers.');
        busy.add(occupied);loads.set(teacher,(loads.get(teacher)||0)+1);
      }
    }
    const affected=original.filter(r=>r.teacher&&absent.has(dailyIdentity(r.teacher)));
    const bySlot=new Map(affected.map(r=>[dailySlotId(r),r])),confirmed=new Map();
    function eligible(teacher,row){
      const id=dailyIdentity(teacher.name),limit=teacher.maxdaily==null?6:Number(teacher.maxdaily);
      return !absent.has(id)&&!busy.has(Number(row.period)+'|'+id)&&Number.isFinite(limit)&&limit>=0&&(loads.get(id)||0)<limit
        &&teacher.subjects.some(s=>dailyIdentity(s)===dailyIdentity(row.subject))
        &&(!teacher.classes.length||teacher.classes.some(c=>dailyIdentity(c)===dailyIdentity(row.class)))
        &&!teacher.unavailable.some(u=>key(u)===key(day+'-'+row.period));
    }
    for(const approval of assignments){
      if(approval.date!==date)throw Error('Confirmation date does not match this worksheet.');
      const row=bySlot.get(approval.slotId),teacher=roster.get(dailyIdentity(approval.teacher));
      if(!row)throw Error('Confirmed period is no longer affected by these absences.');
      if(confirmed.has(approval.slotId))throw Error('Duplicate confirmation for the same period.');
      if(approval.originalTeacher!==row.teacher||!norm(approval.approvedBy))throw Error('Confirmation is stale or reviewer name is missing.');
      if(!teacher||!eligible(teacher,row))throw Error('Confirmed substitute is no longer qualified, available or within daily capacity.');
      confirmed.set(approval.slotId,{...approval,teacher:teacher.name});
      const id=dailyIdentity(teacher.name);busy.add(Number(row.period)+'|'+id);loads.set(id,(loads.get(id)||0)+1);
    }
    const rows=affected.map(row=>{
      const slotId=dailySlotId(row),approval=confirmed.get(slotId)||null;
      const suggestions=approval?[]:plan.teachers.filter(t=>eligible(t,row))
        .map(t=>({teacher:t.name,load:loads.get(dailyIdentity(t.name))||0}))
        .sort((a,b)=>a.load-b.load||a.teacher.localeCompare(b.teacher));
      return {...row,slotId,approval,suggestions};
    });
    return {date,day,rows,confirmed:confirmed.size,uncovered:rows.length-confirmed.size,
      alreadyOpen:original.filter(r=>!r.teacher).length};
  }
  function confirmDailyCover(plan,options){
    const reviewer=norm(options.approvedBy);
    if(reviewer.length<2||reviewer.length>100)throw Error('Enter the reviewer name (2–100 characters).');
    const sheet=dailySubstitutions(plan,options),row=sheet.rows.find(r=>r.slotId===options.slotId);
    if(!row||row.approval)throw Error('This affected period is missing or already confirmed.');
    const candidate=row.suggestions.find(t=>dailyIdentity(t.teacher)===dailyIdentity(options.teacher));
    if(!candidate)throw Error('Selected teacher is not qualified, available or within daily capacity.');
    return [...(options.assignments||[]),{date:options.date,slotId:row.slotId,teacher:candidate.teacher,
      originalTeacher:row.teacher,approvedBy:reviewer}];
  }
  function performance(records,weakThreshold=40){
    const groups=new Map(),issues=[];
    for(const r of records){
      const id=r.id||r.name,subject=norm(r.subject);
      const score=number(r.marks),max=number(r.max);
      if(!id||!subject){issues.push('Row '+r._row+': student or subject missing');continue;}
      if(!finite(score)||!finite(max)||max<=0||score<0||score>max){issues.push('Row '+r._row+': invalid marks');continue;}
      const pct=score/max*100,k=id.toLowerCase();
      if(!groups.has(k))groups.set(k,{id,name:r.name||id,subjects:[],attendance:[]});
      const g=groups.get(k);let delta=null;
      const prev=number(r.previous);
      if(finite(prev)&&prev>=0&&prev<=max)delta=(score-prev)/max*100;
      g.subjects.push({subject,percentage:+pct.toFixed(1),change:delta===null?null:+delta.toFixed(1),weak:pct<weakThreshold});
      const att=number(r.attendance);
      if(finite(att)&&att>=0&&att<=100)g.attendance.push(att);
    }
    return {students:[...groups.values()].map(g=>({
      id:g.id,name:g.name,subjects:g.subjects,
      average:+(g.subjects.reduce((n,x)=>n+x.percentage,0)/g.subjects.length).toFixed(1),
      attendance:g.attendance.length?+(g.attendance.reduce((a,b)=>a+b,0)/g.attendance.length).toFixed(1):null,
      weak:g.subjects.filter(x=>x.weak).map(x=>x.subject)
    })).sort((a,b)=>a.average-b.average),issues};
  }
  function detect(datasets){
    const findings=[],push=(kind,severity,row,message)=>findings.push({kind,severity,row,message});
    const list=(k)=>Array.isArray(datasets[k])?datasets[k]:[];
    const students=list('students'),ids=new Set();
    for(const r of students){
      const id=key(r.id);
      if(!id)push('students','error',r._row,'Missing admission/student ID.');
      else if(ids.has(id))push('students','error',r._row,'Duplicate admission/student ID: '+r.id);
      else ids.add(id);
      if(!r.name)push('students','warning',r._row,'Student name missing.');
      if(!r.class)push('students','warning',r._row,'Class missing.');
    }
    const receipts=new Set();
    for(const r of list('fees')){
      const total=number(r.total),paid=number(r.paid),balance=number(r.balance);
      if(!r.id)push('fees','warning',r._row,'Student ID missing.');
      if(r.receipt){const k=key(r.receipt);if(receipts.has(k))push('fees','error',r._row,'Duplicate receipt: '+r.receipt);receipts.add(k);}
      if(!finite(total)||!finite(paid)||total<0||paid<0)push('fees','error',r._row,'Invalid total or paid amount.');
      else{
        if(paid>total+.01)push('fees','error',r._row,'Amount paid exceeds total fee.');
        if(finite(balance)&&Math.abs(total-paid-balance)>.02)push('fees','warning',r._row,'Balance does not match total minus paid.');
      }
    }
    const attendance=new Set();
    for(const r of list('attendance')){
      const k=key(r.id)+'|'+norm(r.date);
      if(!r.id||!r.date)push('attendance','error',r._row,'Student ID or date missing.');
      else if(attendance.has(k))push('attendance','warning',r._row,'Duplicate attendance student/date: '+r.id+' '+r.date);
      else attendance.add(k);
      if(r.status&&!['present','absent','late','excused','p','a','l'].includes(key(r.status)))push('attendance','warning',r._row,'Unexpected attendance status.');
    }
    // Attendance coverage check: for the dates present in an imported attendance
    // sheet, flag enrolled/imported students without a row. Holidays and section
    // calendars are unknown; label these as review suggestions, never absence.
    const knownDates=[...new Set(list('attendance').map(r=>norm(r.date)).filter(Boolean))];
    const uniqueStudents=[...new Map(students.filter(r=>r.id).map(r=>[key(r.id),r])).values()];
    if(knownDates.length && uniqueStudents.length){
      let checked=0;
      for(const date of knownDates){
        for(const student of uniqueStudents){
          if(++checked>20000)break;
          if(!attendance.has(key(student.id)+'|'+date))
            push('attendance','warning',student._row,'No attendance row for '+student.id+' on '+date+' (check holiday/class calendar).');
        }
        if(checked>20000)break;
      }
    }
    for(const r of list('marks')){
      const val=number(r.marks),max=number(r.max);
      if(!finite(val)||!finite(max)||max<=0||val<0||val>max)push('marks','error',r._row,'Marks outside 0 to maximum range.');
    }
    return findings;
  }
  function toCsv(rows,columns) {
    if(!Array.isArray(rows)||!rows.length)return '';
    const cols=columns||Object.keys(rows[0]);
    const escape=value=>{
      let s=norm(value);
      // Prevent spreadsheet CSV formula injection in exports.
      if(/^[\s]*[=+@\-]/.test(s)&&!/^-[0-9.]+$/.test(s))s="'"+s;
      return /[,\r\n"]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
    };
    return [cols.map(escape).join(','),...rows.map(row=>cols.map(col=>escape(row[col])).join(','))].join('\r\n');
  }
  return Object.freeze({parseCsv,mapColumns,canonical,schedule,substitutes,dailySubstitutions,confirmDailyCover,performance,detect,toCsv,DATASETS});
});
