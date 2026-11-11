/* Bright Nexa School OS — read-only Owner Reports.
 * Uses the existing ERP school snapshot. It never fetches a different tenant,
 * mutates attendance/payments, or marks an unconfirmed change as synced.
 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BNOwnerReports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  const list = value => Array.isArray(value) ? value : [];
  const amount = value => {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  };
  const sum = (rows, property) => rows.reduce((total, row) => total + (amount(row[property]) || 0), 0);
  const currency = value => value === null || value === undefined
    ? 'Not configured' : '₹' + Math.round(value).toLocaleString('en-IN');
  function monthDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}/.test(value) ? value.slice(0,7) : ''; }
  function validMonth(value) { return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value); }
  function isActive(record) { return String(record.status || '').toLowerCase() !== 'inactive'; }
  function holidayFor(holiday, category) {
    return holiday.appliesTo === 'All' || holiday.appliesTo === category;
  }
  function attendanceScheduled(month, holidays, category, throughDate) {
    const [year, mo] = month.split('-').map(Number);
    const count = new Date(year, mo, 0).getDate();
    let scheduled = 0;
    for (let d=1; d<=count; d++) {
      const day = month+'-'+String(d).padStart(2,'0');
      if (throughDate && day > throughDate) continue;
      if (new Date(year,mo-1,d).getDay()===0) continue;
      if (holidays.some(h=>h.date===day && holidayFor(h,category))) continue;
      scheduled++;
    }
    return scheduled;
  }
  function aggregate(ops, studentList, month, asOfDate) {
    if (!validMonth(month)) throw Error('Choose a valid reporting month (YYYY-MM).');
    const data = ops || {};
    // Do not count future school days as missing attendance.
    const today = asOfDate || [new Date().getFullYear(),String(new Date().getMonth()+1).padStart(2,'0'),String(new Date().getDate()).padStart(2,'0')].join('-');
    const students = new Map(list(studentList).map(student=>[student.id,student]));
    const holidays = list(data.holidays).filter(h=>monthDate(h.date)===month);
    const fees = list(data.feePayments).filter(p=>monthDate(p.paymentDate)===month)
      .map(p=>({
        id:p.id||p.receiptNumber||'',date:p.paymentDate||'',receipt:p.receiptNumber||'',
        student:students.get(p.studentId)?.name||'Student not in roster',
        admission:students.get(p.studentId)?.admissionNumber||'',
        category:p.category||'',method:p.method||'',
        amount:amount(p.amount)||0,status:p.status||'Posted'
      })).sort((a,b)=>b.date.localeCompare(a.date));
    const validFees = fees.filter(p=>p.status!=='Reversed');
    const expenses = list(data.expenses).filter(p=> {
      if (monthDate(p.expenseDate)) return monthDate(p.expenseDate)===month;
      return Number(p.expenseYear)===Number(month.slice(0,4)) && Number(p.expenseMonth)===Number(month.slice(5));
    }).map(p=>{
      const total = amount(p.totalAmount) ?? Math.max(0,(amount(p.amount)||0)+(amount(p.taxAmount)||0)-(amount(p.discountAmount)||0));
      // For old paid-only records, default to recorded paid amount only when paid status is explicit.
      const paid=amount(p.amountPaid) ?? (p.paymentStatus==='Paid'?total:0);
      return {id:p.id||'',date:p.expenseDate||'',title:p.title||p.purpose||p.category||'Expense',
        category:p.category||'',department:p.department||'',payee:p.paidTo||'',
        method:p.paymentMethod||'',reference:p.transactionReference||p.invoiceNumber||'',
        total,paid:Math.min(total,paid),due:Math.max(0,total-paid),
        status:p.paymentStatus||'Not specified'};
    }).sort((a,b)=>b.date.localeCompare(a.date));
    const attend=list(data.staffAttendance).filter(a=>monthDate(a.date)===month);
    const unique=new Map();
    for (const a of attend) {
      if (!a.staffId||!a.date) continue;
      unique.set([a.staffType,a.staffId,a.date].join('|'),a);
    }
    const attendance=[...unique.values()];
    const roster=[
      ...list(data.teachers).filter(isActive).map(p=>({...p,staffType:'Teaching'})),
      ...list(data.nonTeachingStaff).filter(isActive).map(p=>({...p,staffType:'Non-Teaching'}))
    ];
    const staff=roster.map(person=>{
      const type=person.staffType,category=type==='Teaching'?'Teaching Staff':'Non-Teaching Staff';
      const records=attendance.filter(a=>a.staffType===type && a.staffId===person.id);
      const present=records.filter(a=>a.status==='Present').length;
      const absent=records.filter(a=>a.status==='Absent').length;
      const paidLeave=records.filter(a=>a.status==='Paid Leave').length;
      const allowance=amount(person.paidLeaveAllowedPerMonth)||0;
      const scheduled=attendanceScheduled(month,holidays,category);
      const excludedHolidays=holidays.filter(h=>holidayFor(h,category)).length;
      const elapsedScheduled=attendanceScheduled(month,holidays,category,today);
      const deductible=absent+Math.max(0,paidLeave-allowance);
      const monthlySalary=person.salaryFrequency==='Monthly' ? amount(person.salary) : null;
      const estimated=monthlySalary!==null&&scheduled>0
        ? Math.max(0,monthlySalary-monthlySalary/scheduled*deductible) : null;
      return {id:person.id||'',name:person.name||person.employeeCode||'Unnamed staff',
        code:person.employeeCode||'',category,department:person.department||person.subjects?.join(', ')||'',
        salaryFrequency:person.salaryFrequency||'Not set',monthlySalary,estimated,
        present,absent,paidLeave,allowance,excludedHolidays,deductible,scheduled,
        pending:Math.max(0,elapsedScheduled-records.filter(r=>r.date<=today).length)};
    }).sort((a,b)=>a.category.localeCompare(b.category)||a.name.localeCompare(b.name));
    return {month,fees,expenses,staff,holidays,
      feeCollected:sum(validFees,'amount'),feeReceipts:validFees.length,
      expenseTotal:sum(expenses,'total'),expensePaid:sum(expenses,'paid'),expenseDue:sum(expenses,'due'),
      monthlySalaryConfigured:sum(staff.filter(s=>s.monthlySalary!==null),'monthlySalary'),
      estimatedPayroll:sum(staff.filter(s=>s.estimated!==null),'estimated'),
      missingSalary:staff.filter(s=>s.monthlySalary===null).length,
      paidLeaves:sum(staff,'paidLeave'),unmarked:sum(staff,'pending'),
      categories: [...new Set(expenses.map(e=>e.category||'Uncategorized'))]
    };
  }
  function csv(rows, columns) {
    const cell = value => '"' + String(value==null?'':value).replace(/^[=+\-@\t\r]/,'\u0027$&').replace(/"/g,'""') + '"';
    return '\ufeff' + [columns.map(x=>cell(x[0])).join(','), ...rows.map(row=>columns.map(([_,key])=>cell(row[key])).join(','))].join('\r\n');
  }
  function download(name, rows, columns) {
    if (typeof document==='undefined') return;
    const blob = new Blob([csv(rows,columns)],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement('a');anchor.href=url;anchor.download=name;document.body.appendChild(anchor);anchor.click();anchor.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  let cachedView=null;
  function getView(React) {
    if (cachedView) return cachedView;
    const h=React.createElement;
    const tableColumns={
      fees:[['Date','date'],['Receipt','receipt'],['Student','student'],['Admission No.','admission'],['Fee Head','category'],['Method','method'],['Amount','amount'],['Status','status']],
      expenses:[['Date','date'],['Expense','title'],['Category','category'],['Department','department'],['Paid To','payee'],['Method','method'],['Reference','reference'],['Billed','total'],['Paid','paid'],['Due','due'],['Status','status']],
      staff:[['Staff','name'],['Unmarked so far','pending'],['Employee Code','code'],['Role','category'],['Department / Subjects','department'],['Salary Type','salaryFrequency'],['Monthly Salary','monthlySalary'],['Estimated Payable','estimated'],['Working Days','scheduled'],['Present','present'],['Absent','absent'],['Paid Leave','paidLeave'],['Leave Allowance','allowance'],['School Holidays','excludedHolidays']],
      holidays:[['Date','date'],['Holiday','name'],['Applies To','appliesTo'],['Notes','notes']]
    };
    function Table({title,rows,columns,filename,description}) {
      return h('section',{className:'bn-report-section'},h('div',{className:'bn-report-section-head'},
        h('div',null,h('h2',null,title),h('p',null,description)),
        h('button',{type:'button',className:'secondary-button',disabled:!rows.length,onClick:()=>download(filename,rows,columns)},'Export CSV')),
        rows.length ? h('div',{className:'bn-report-scroll'},
          h('table',null,h('thead',null,h('tr',null,...columns.map(([label,key])=>h('th',{key},label)))),
          h('tbody',null,...rows.map((row,index)=>h('tr',{key:row.id||index},...columns.map(([label,key])=>h('td',{key},['amount','total','paid','due','monthlySalary','estimated'].includes(key)
            ? currency(row[key]) : String(row[key]??''))))))))
          : h('p',{className:'bn-report-empty'},'No recorded entries for the selected month.'));
    }
    function ReportView({data,students,institution,syncStatus}) {
      const [month,setMonth]=React.useState(()=>new Date().toISOString().slice(0,7));
      const report=React.useMemo(()=>aggregate(data,students,month),[data,students,month]);
      const cards=[['Fee collection',currency(report.feeCollected),'Confirmed receipts: '+report.feeReceipts],
        ['Recorded expenses',currency(report.expenseTotal),'Paid: '+currency(report.expensePaid)],
        ['Unpaid expenses',currency(report.expenseDue),'From recorded bills only'],
        ['Estimated monthly payroll',currency(report.estimatedPayroll),report.missingSalary+' staff need monthly salary setup'],
        ['Paid-leave days',String(report.paidLeaves),'Total marked staff paid-leave days'],
        ['Unmarked elapsed staff days',String(report.unmarked),'Future working days are excluded; do not treat missing marks as absences']];
      return h('section',{className:'bn-owner-reports'},
        h('div',{className:'bn-report-heading'},
          h('div',null,h('span',{className:'bn-report-eyebrow'},'OWNER CONTROL CENTRE'),h('h1',null,'Owner Reports & Analytics'),
            h('p',null,'Monthly fee collection, expenses, staff salaries, attendance, paid leave and school holidays — in one place.')),
          h('label',{className:'bn-report-month'},'Reporting month',h('input',{type:'month',value:month,'aria-label':'Reporting month',onChange:e=>setMonth(e.target.value||month)}))),
        h('div',{className:'bn-report-source'},'School: '+(institution?.name||'Current school')+' · ERP sync: '+(syncStatus||'unknown')+'. Figures use this ERP workspace snapshot. Pending/conflicted edits may not yet exist in Supabase.'),
        h('div',{className:'bn-report-cards'},...cards.map(([name,value,notes])=>h('article',{key:name,className:'bn-report-card'},
          h('small',null,name),h('strong',null,value),h('p',null,notes)))),
        h('p',{className:'bn-report-note'},'Payroll is a provisional estimate from configured monthly salaries and marked attendance—not proof of payment. Daily/hourly salary is not estimated. Paid salary expenses may already be recorded in the expense ledger; do not add estimated payroll to recorded expenses. General school holidays are not employee leave.'),
        h(Table,{title:'Fee collection details',rows:report.fees,columns:tableColumns.fees,
          filename:'fee-collection-'+month+'.csv',description:'Receipt-wise collection, including reversals. Reversed receipts are excluded from collected totals.'}),
        h(Table,{title:'Monthly expense ledger',rows:report.expenses,columns:tableColumns.expenses,
          filename:'expenses-'+month+'.csv',description:'Recorded billed, paid and unpaid expense amounts by category and vendor.'}),
        h(Table,{title:'Teacher and staff salary / leave report',rows:report.staff,columns:tableColumns.staff,
          filename:'staff-payroll-'+month+'.csv',description:'Teaching and non-teaching staff, attendance, monthly salary, provisional payable and unmarked elapsed workdays.'}),
        h(Table,{title:'School holidays',rows:report.holidays,columns:tableColumns.holidays,
          filename:'school-holidays-'+month+'.csv',description:'School-wide holidays and role-specific holidays; these are separate from individual paid leave.'})
      );
    }
    cachedView=ReportView;
    return cachedView;
  }
  return {aggregate,csv,getView};
});
