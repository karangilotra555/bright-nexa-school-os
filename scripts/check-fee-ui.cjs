const fs=require('fs'),cp=require('child_process'),assert=require('assert/strict');
const {JSDOM}=require('jsdom');
const esbuild=require('esbuild');
const path=require('node:path');
const repo=path.resolve(__dirname,'..');
// The user selected current GitHub main as the preservation baseline. Older
// feature-only snapshots predate the existing class filters and WhatsApp actions.
const baselineRef=process.argv[2]||'8fd0904ce5ac31d6d75f9400fc750b216321642e';
const fixture={classes:[{name:'9'}],feeStructures:[{id:'f',className:'9',academicSession:'2026–27',category:'Tuition',frequency:'Monthly',dueDay:10,amount:1000}],feePayments:[],transportRoutes:[]};
const students=[{id:'s1',name:'Audit Learner',className:'9',section:'A',status:'Active',studentUniqueId:'FIXTURE-1'}];
const institution={name:'Audit Fixture',institutionType:'School',session:'2026–27'};
async function mount(source){
 const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://school-fixture.test/',runScripts:'outside-only',pretendToBeVisual:true});
 let failures=[];dom.window.addEventListener('error',e=>failures.push(e.error||e.message));
 const recovered=source.includes('function _Component93('); const bootstrap=source.lastIndexOf(recovered?'sa();\nCt.createRoot':'(sa(),');assert(bootstrap>0);
 const code=source.slice(0,bootstrap)+'\nwindow.__mount=(data,students,institution)=>Ct.createRoot(document.getElementById("root")).render(w.createElement('+ (recovered?'_Component93':'pi') + ',{data,students,institution,onUpdate(){throw Error("Report must not write records")}}));';
 dom.window.eval(esbuild.transformSync(code,{loader:'jsx',format:'iife',jsxFactory:'w.createElement',jsxFragment:'w.Fragment',target:'es2022'}).code);
 dom.window.__mount(structuredClone(fixture),structuredClone(students),institution);
 await new Promise(r=>setTimeout(r,100));assert.equal(failures.length,0,String(failures));return dom;
}
const button=(doc,text)=>Array.from(doc.querySelectorAll('button')).find(b=>b.textContent.trim()===text);
(async()=>{
 const baseline=cp.execFileSync('git',['show',baselineRef+':assets/index-brightnexa-v2.js'],{cwd:repo,encoding:'utf8',maxBuffer:5e6});
 const changed=fs.readFileSync(repo+'/assets/index-brightnexa-v2.js','utf8');
 const a=await mount(baseline),b=await mount(changed);const doc=b.window.document;
 const added=button(doc,'Pending fees report');assert(added,'report button must mount in existing collection header');
 assert(added.closest('.clerk-stage-head'),'report belongs in collection header');
 const comparison=doc.querySelector('#root').cloneNode(true);button(comparison,'Pending fees report').parentElement.remove();
 const baselineComparison=a.window.document.querySelector('#root').cloneNode(true);
 const baselineReport=button(baselineComparison,'Pending fees report');if(baselineReport)baselineReport.parentElement.remove();
 assert.equal(comparison.innerHTML,baselineComparison.innerHTML,'GitHub baseline fee collection DOM must be byte-identical excluding the report action');
 added.click();await new Promise(r=>setTimeout(r,60));
 const dialog=doc.querySelector('[role="dialog"]');assert(dialog);assert(dialog.textContent.includes('Future charges are not overdue'));
 assert(button(doc,'Export detailed CSV'));assert(button(dialog,'Profile'));assert(dialog.querySelector('input[type=date]'));
 button(dialog,'Profile').click();await new Promise(r=>setTimeout(r,60));assert(!doc.querySelector('[role="dialog"]'));assert(doc.body.textContent.includes('Audit Learner'));
 for(const index of [0,2]){
  a.window.document.querySelectorAll('.clerk-fee-steps button')[index].click();
  doc.querySelectorAll('.clerk-fee-steps button')[index].click();
  await new Promise(r=>setTimeout(r,60));
  assert.equal(doc.querySelector('#root').innerHTML,a.window.document.querySelector('#root').innerHTML,'existing setup and receipt DOM must be unchanged');
 }
 console.log('PASS: deployed bundle preserves collection DOM except the new header action; modal opens; CSV action present; profile navigation closes modal; existing setup and receipt DOM unchanged; no data-write handler invoked.');
 a.window.close();b.window.close();
})().catch(e=>{console.error(e);process.exitCode=1});
