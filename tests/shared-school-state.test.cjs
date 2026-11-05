const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app-extracted/src/BrightNexaApp.jsx','utf8');
function fn(name, context={}) {
 const start=source.indexOf(`function ${name}(`);
 assert.notEqual(start,-1,`Missing ${name}`);
 const end=source.indexOf('\n}',start)+2;
 return vm.runInNewContext(`(${source.slice(start,end)})`,context);
}
test('newer synchronous school record wins over stale IndexedDB mirror, including empty arrays',()=>{
 const read=fn('bnReadSchoolRecord',{window:{localStorage:{getItem:()=> '[]'}}});
 assert.equal(JSON.stringify(read('students',[{id:'stale'}])), '[]');
});
test('class rename keeps student and exam placement linked without altering other classes or IDs',()=>{
 const link=fn('bnLinkClassChanges');
 const old={classes:[{id:'c1',name:'6',section:'A'}]};
 const next={classes:[{id:'c1',name:'7',section:'B'}],exams:[{id:'e1',className:'6',section:'A'}],teachers:[{id:'t1',assignedClasses:['6-A','8-A']}]};
 const result=link(old,next,[{id:'s1',className:'6',section:'A'},{id:'s2',className:'6',section:'B'}]);
 assert.equal(result.students[0].id,'s1');
 assert.equal(result.students[0].className,'7');
 assert.equal(result.students[0].section,'B');
 assert.equal(result.students[1].section,'B');
 assert.equal(result.operations.exams[0].className,'7');
 assert.equal(result.operations.teachers[0].assignedClasses[0],'7-B');
 assert.equal(old.classes[0].name,'6');
});
test('report cards can select every student while matching exam remains class restricted',()=>{
 const choose=fn('bnReportSelection');
 const students=[{id:'s1',className:'6',section:'A'},{id:'s2',className:'7',section:'A'},{id:'s3',className:'8',section:'A'}];
 const exams=[{id:'e1',className:'6',section:'A'},{id:'e2',className:'7',section:'A'}];
 assert.equal(choose(students,exams,'s2','e1').exam.id,'e2');
 assert.equal(choose(students,exams,'s3','e1').exam,null);
});

test('actual circular component shares edited final draft, blocks blanks and resets explicitly',()=>{
 const bundle=fs.readFileSync('assets/index-brightnexa-v2.js','utf8');
 const extract=name=>{
  const start=bundle.indexOf(`\nfunction ${name}(`)+1;
  assert(start>0,`Missing built ${name}`);
  return bundle.slice(start,bundle.indexOf('\n}',start)+2);
 };
 const states=[],opened=[];let cursor=0;
 const context={window:{open:(...args)=>opened.push(args)},Date,encodeURIComponent,L:'dialog',R:'label',w:{
  useState(initial){const id=cursor++;if(!(id in states))states[id]=typeof initial==='function'?initial():initial;return [states[id],value=>states[id]=value]},
  createElement(type,props,...children){return {type,props:props||{},children:children.flat(Infinity)}}
 }};
 vm.createContext(context);
 vm.runInContext(extract('bnCreateNoticeMessage')+'\n'+extract('WhatsAppNoticeDialog'),context);
 const render=()=>{cursor=0;return context.WhatsAppNoticeDialog({isOpen:true,onClose(){},schoolName:'Fixture school'})};
 const nodes=tree=>[tree,...(tree?.children||[]).filter(x=>x&&typeof x==='object').flatMap(nodes)];
 const box=tree=>nodes(tree).find(n=>n.props['aria-label']==='Final circular message');
 const send=tree=>nodes(tree).find(n=>n.type==='button'&&nodes(n).some(x=>x.children?.includes('Open WhatsApp & Broadcast')));
 let tree=render();assert(box(tree),'editable final circular message');
 box(tree).props.onChange({target:{value:'Edited circular & हिन्दी'}});tree=render();send(tree).props.onClick();
 assert.equal(new URL(opened[0][0]).searchParams.get('text'),'Edited circular & हिन्दी');
 box(tree).props.onChange({target:{value:''}});tree=render();send(tree).props.onClick();assert.equal(opened.length,1);
 nodes(tree).find(n=>n.type==='button'&&n.children.includes('Reset message from fields')).props.onClick();
 assert(box(render()).props.value.includes('Fixture school'));
});
test('class rename never guesses among two sessions sharing a placement',()=>{
 const link=fn('bnLinkClassChanges');
 const old={classes:[{id:'new',name:'6',section:'A',academicSession:'2026-27'},{id:'old',name:'6',section:'A',academicSession:'2025-26'}]};
 const next={classes:[{...old.classes[0],name:'7'},old.classes[1]],exams:[],teachers:[]};
 const result=link(old,next,[{id:'legacy',className:'6',section:'A'},{id:'current',classId:'new',className:'6',section:'A'},{id:'past',academicSession:'2025-26',className:'6',section:'A'}]);
 assert.equal(result.students[0].className,'6');
 assert.equal(result.students[1].className,'7');
 assert.equal(result.students[2].className,'6');
});
