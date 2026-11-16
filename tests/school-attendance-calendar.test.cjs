const {test}=require('node:test'),assert=require('node:assert/strict');const a=require('../docs/school-attendance-calendar.js');
test('attendance counts recorded working days only and handles late and half days',()=>{const summary=a.summarize([{day:'2026-05-01',status:'present'},{day:'2026-05-02',status:'absent'},{day:'2026-05-03',status:'late'},{day:'2026-05-04',status:'half_day'},{day:'2026-05-05',status:'excused'},{day:'2026-05-06',status:'holiday'}]);assert.equal(summary.total,4);assert.equal(summary.attended,2.5);assert.equal(summary.percent,62.5);assert.equal(summary.absent,1);});
test('empty, duplicate, invalid and unrecorded days are never treated as absent',()=>{assert.equal(a.summarize([]).percent,null);assert.equal(a.clean([{day:'2026-02-30',status:'absent'}]).length,0);assert.equal(a.summarize([{day:'2026-05-01',status:'present'},{day:'2026-05-01',status:'absent'}]).total,1);const may=a.monthModel(2026,4,[{day:'2026-05-02',status:'present'}]);assert.equal(may.first,5);assert.equal(may.length,31);assert.equal(may.statuses.get(3),undefined);assert.equal(may.summary.absent,0);});
test('academic sessions cross calendar years; leap-day alignment remains correct',()=>{assert.equal(a.academicStart('2027-03-31'),2026);assert.equal(a.academicStart('2027-04-01'),2027);assert.equal(a.monthModel(2028,1,[]).length,29);assert.equal(a.monthModel(2027,1,[]).length,28);});

test('calendar opens the latest month with attendance and distinguishes marked from unrecorded dates', t=>{
 const {JSDOM}=require('jsdom');
 const {readFileSync}=require('node:fs');
 const dom=new JSDOM('<div id="calendar"></div>',{runScripts:'outside-only'});
 t.after(()=>dom.window.close());
 const {window}=dom;
 window.Date=class extends window.Date{
  constructor(...args){super(...(args.length?args:['2026-11-16T12:00:00Z']));}
 };
 window.eval(readFileSync('docs/school-attendance-calendar.js','utf8'));
 const root=window.document.getElementById('calendar');
 window.BNAttendance.render(root,[
  {day:'2026-10-30',status:'present'},
  {day:'2026-11-12',status:'present'},
  {day:'2026-11-13',status:'absent'},
  {day:'2026-12-25',status:'holiday'}
 ],'2026–2027');
 const first=root.querySelector('details');
 assert.match(first.querySelector('summary').textContent,/November 2026/);
 assert.equal(first.open,true);
 assert.equal(root.querySelectorAll('details').length,12);
 assert.equal(first.querySelector('.present').title,'12 November 2026: present');
 assert.equal(first.querySelector('.absent').title,'13 November 2026: absent');
 assert.equal(first.querySelector('[title="14 November 2026: not recorded"]').classList.contains('unrecorded'),true);
 assert.equal(root.querySelector('.bn-att-key .present').textContent,'Present');
 assert.equal(root.querySelector('.bn-att-key .absent').textContent,'Absent');
 assert.equal(root.querySelector('.bn-att-key .unrecorded').textContent,'Not recorded');
 first.open=false;
 const october=[...root.querySelectorAll('details')].find(el=>el.querySelector('summary').textContent.includes('October 2026'));
 october.open=true;
 window.BNAttendance.render(root,[{day:'2026-11-12',status:'present'}],'2026-2027');
 assert.match(root.querySelector('details[open] summary').textContent,/October 2026/);
 const next=window.document.createElement('div');
 window.BNAttendance.render(next,[{day:'2026-10-30',status:'present'}],'2026-2027');
 window.BNAttendance.render(next,[{day:'2026-11-12',status:'present'}],'2026-2027');
 assert.match(next.querySelector('details[open] summary').textContent,/November 2026/);
});
