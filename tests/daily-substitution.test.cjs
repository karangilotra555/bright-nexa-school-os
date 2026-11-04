const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../smart-tools-engine.js');
function plan(){return {days:['Mon','Tue'],periods:3,teachers:[
 {name:'Absent A',subjects:['Math'],classes:[],maxdaily:3,unavailable:[]},
 {name:'Absent B',subjects:['Math'],classes:[],maxdaily:3,unavailable:[]},
 {name:'Cover',subjects:['Math'],classes:[],maxdaily:2,unavailable:[]},
 {name:'English only',subjects:['English'],classes:[],maxdaily:3,unavailable:[]},
 {name:'Zero',subjects:['Math'],classes:[],maxdaily:0,unavailable:[]},
 {name:'Busy',subjects:['Math'],classes:[],maxdaily:3,unavailable:[]},
 {name:'Unavailable',subjects:['Math'],classes:[],maxdaily:3,unavailable:['Mon-1']},
 {name:'Other class',subjects:['Math'],classes:['9-Z'],maxdaily:3,unavailable:[]}
 ],rows:[
 {day:'Mon',period:1,class:'9-A',subject:'Math',teacher:'Absent A'},
 {day:'Mon',period:1,class:'9-B',subject:'Math',teacher:'Absent B'},
 {day:'Mon',period:1,class:'9-C',subject:'Math',teacher:'Busy'},
 {day:'Mon',period:2,class:'9-A',subject:'Math',teacher:'Absent A'},
 {day:'Mon',period:3,class:'9-A',subject:'Math',teacher:'Absent A'}
 ]};}
const date='2026-11-02',absentTeachers=['Absent A','Absent B'];
function sheet(p=plan(),assignments=[]){assert.equal(typeof E.dailySubstitutions,'function','daily worksheet must be implemented');return E.dailySubstitutions(p,{date,absentTeachers,assignments});}
function confirm(p,a,row,teacher='Cover',extra={}){assert.equal(typeof E.confirmDailyCover,'function');return E.confirmDailyCover(p,{date,absentTeachers,assignments:a,slotId:row.slotId,teacher,approvedBy:'Principal fixture',...extra});}
test('multiple absent teachers are excluded from qualified free suggestions',()=>{
 const s=sheet();assert.equal(s.day,'Mon');assert.equal(s.rows.length,4);assert.equal(s.uncovered,4);
 assert.deepEqual(s.rows[0].suggestions.map(x=>x.teacher),['Cover']);
});
test('confirming one period prevents the same teacher covering another class simultaneously',()=>{
 const p=plan(),s=sheet(p);const a=confirm(p,[],s.rows[0]);const next=sheet(p,a);
 assert.equal(next.confirmed,1);assert.equal(next.rows[1].suggestions.length,0);
 assert.throws(()=>confirm(p,a,next.rows[1]),/available|eligible|qualified/i);
});
test('daily limit includes previous covers and zero daily capacity is respected',()=>{
 const p=plan();let s=sheet(p),a=confirm(p,[],s.rows[0]);s=sheet(p,a);a=confirm(p,a,s.rows[2]);s=sheet(p,a);
 assert.ok(!s.rows[3].suggestions.some(x=>x.teacher==='Cover'));
 assert.ok(s.rows.every(r=>!r.suggestions.some(x=>x.teacher==='Zero')));
});
test('already scheduled periods count toward cover capacity',()=>{
 const p=plan();p.rows.push({day:'Mon',period:3,class:'8-A',subject:'Math',teacher:'Cover'});
 const a=confirm(p,[],sheet(p).rows[0]);assert.ok(!sheet(p,a).rows[2].suggestions.some(x=>x.teacher==='Cover'));
});
test('rejects stale date, duplicate slot and forged busy assignment',()=>{
 const p=plan(),a=confirm(p,[],sheet(p).rows[0]);
 assert.throws(()=>sheet(p,[{...a[0],date:'2026-11-03'}]),/date/i);
 assert.throws(()=>sheet(p,[a[0],a[0]]),/already|duplicate/i);
 assert.throws(()=>sheet(p,[{...a[0],teacher:'Busy'}]),/available|eligible|qualified/i);
});
test('invalid/nonworking dates and unknown/duplicate teachers fail explicitly',()=>{
 assert.equal(typeof E.dailySubstitutions,'function');
 for(const d of ['2026-02-30','2026-11-01'])assert.throws(()=>E.dailySubstitutions(plan(),{date:d,absentTeachers}),/date|day/i);
 assert.throws(()=>E.dailySubstitutions(plan(),{date,absentTeachers:['Unknown']}),/teacher/i);
 const p=plan();p.teachers.push({...p.teachers[0],name:' absent a '});assert.throws(()=>sheet(p),/duplicate|ambiguous/i);
});
test('confirmations need a named reviewer and do not change the original plan',()=>{
 const p=plan(),before=JSON.stringify(p);const s=sheet(p);assert.throws(()=>confirm(p,[],s.rows[0],'Cover',{approvedBy:''}),/reviewer|name/i);
 const a=confirm(p,[],s.rows[0]);assert.equal(a[0].originalTeacher,'Absent A');assert.equal(a[0].date,date);assert.equal(JSON.stringify(p),before);assert.equal(sheet(p,a).uncovered,3);
});
test('ambiguous original timetable cannot be approved',()=>{
 const p=plan();p.rows.push({...p.rows[0],class:'9-Z'});assert.throws(()=>sheet(p),/clash|duplicate|ambiguous/i);
});
