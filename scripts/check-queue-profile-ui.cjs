'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom'),esbuild=require('esbuild');
const repo=path.resolve(__dirname,'..');
const source=process.argv[2]?cp.execFileSync('git',['show',process.argv[2]+':app-extracted/src/BrightNexaApp.jsx'],{cwd:repo,encoding:'utf8',maxBuffer:5e6}):fs.readFileSync(path.join(repo,'app-extracted/src/BrightNexaApp.jsx'),'utf8');
const wait=()=>new Promise(resolve=>setTimeout(resolve,60));
const student={id:'fixture-student',name:'Fixture Learner',admissionNumber:'FIXTURE-001',studentUniqueId:'FIXTURE-ID',className:'6',section:'A',parentMobile:'9876543210',dateOfBirth:'2015-01-01',fatherName:'Fixture Guardian',address:'Fixture address',status:'Active'};
const fixtureOps={classes:[{id:'fixture-class',name:'6',section:'A',academicSession:'2026–27',subjects:['Mathematics']}],feeStructures:[{id:'fee',className:'6',academicSession:'2026–27',category:'Tuition',frequency:'Monthly',dueDay:10,amount:1000}],feePayments:[]};
const dialogs=[];
async function mount(component,props={},apiMock){
 const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://school-fixture.test/',runScripts:'outside-only',pretendToBeVisual:true});dialogs.push(dom);
 const errors=[];dom.window.addEventListener('error',event=>errors.push(event.error||event.message));
 dom.window.structuredClone=structuredClone;dom.window.confirm=()=>false;dom.window.fetch=async()=>{throw Error('Network disabled for isolated UI verification')};
 dom.window.BNSchoolWhatsApp=apiMock;
 dom.window.__props=props;dom.window.__student=student;dom.window.__ops=fixtureOps;
 const bootstrap=source.lastIndexOf('sa();\nCt.createRoot');assert(bootstrap>0,'recovered source bootstrap');
 const overrides=`\nconst fixtureSnapshot={...yn,role:'OWNER',institution:{...yn.institution,name:'Fixture School',session:'2026–27',institutionType:'School'}};const fixtureOperations={...Oi(),...window.__ops};\nwn=()=>fixtureSnapshot;Dn=()=>[window.__student];Ai=()=>fixtureOperations;Qt=()=>({role:'OWNER',name:'Fixture Admin'});kn=async()=>({snapshot:fixtureSnapshot,students:[window.__student]});Mi=async()=>fixtureOperations;Tn=On=ji=()=>{};bnScheduleCloudSync=()=>{};localStorage.setItem(ms,'fixture');\nCt.createRoot(document.getElementById('root')).render(w.createElement(${component},window.__props));`;
 const code=esbuild.transformSync(source.slice(0,bootstrap)+overrides,{loader:'jsx',format:'iife',jsxFactory:'w.createElement',jsxFragment:'w.Fragment',target:'es2022'}).code;
 dom.window.eval(code);await wait();assert.equal(errors.length,0,String(errors));return dom;
}
const button=(doc,label)=>[...doc.querySelectorAll('button')].find(b=>b.textContent.trim()===label);
async function testProfile(){
 const dom=await mount('Ds'),doc=dom.window.document;const input=doc.querySelector('input[placeholder^="Search students, classes"]');assert(input);
 input.focus();Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype,'value').set.call(input,'Fixture Learner');input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));await wait();
 const view=[...doc.querySelectorAll('span')].find(n=>n.textContent.trim()==='View →');assert(view,'search result View action');view.click();await wait();
 const profile=doc.querySelector('[role="dialog"][aria-label="Fixture Learner profile"]');assert(profile,'search View must open the selected complete profile');assert(profile.textContent.includes('Fixture Guardian'));assert(profile.textContent.includes('9876543210'));assert(profile.textContent.includes('2015-01-01'));
 const maximize=profile.querySelector('button[aria-label="Maximize"]');assert(maximize,'student profile maximize');maximize.click();await wait();assert.equal(profile.style.width,'96vw');profile.querySelector('button[aria-label="Restore"]').click();await wait();assert.equal(profile.style.width,'');
 profile.querySelector('button[aria-label="Close profile"]').click();await wait();assert(!doc.querySelector('[role="dialog"]'));
 input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await wait();assert(doc.querySelector('[role="dialog"][aria-label="Fixture Learner profile"]'),'Enter opens selected profile too');
 console.log('PASS full dashboard: search View and Enter open full matching profile; existing fields visible; maximize and restore work.');
}
async function testQueue(){
 const items=[{id:'one',name:'Fixture parent',phone:'9876543210',text:'Fixture only'},{id:'two',name:'Missing phone fixture',phone:'',text:'Fixture only'}];
 const dom=await mount('WhatsAppQueueModal',{isOpen:true,items,onClose(){},title:'Fixture queue'}),doc=dom.window.document;let opens=0;
 dom.window.open=()=>{opens++;return null};
 const open=button(doc,'Open WhatsApp draft');assert(open,'draft action must not claim sending');open.click();await wait();assert(doc.body.textContent.includes('Popup blocked'));assert.equal(opens,1);assert(!doc.body.textContent.includes('Sent ✅'));assert(button(doc,'I sent it in WhatsApp').disabled);
 dom.window.open=()=>{opens++;return {closed:false}};button(doc,'Open WhatsApp draft').click();await wait();assert(doc.body.textContent.includes('Draft opened — unverified'));assert(!button(doc,'I sent it in WhatsApp').disabled);assert(doc.body.textContent.includes('Verified sent: 0'));
 button(doc,'I sent it in WhatsApp').click();await wait();assert(doc.body.textContent.includes('Manually confirmed'));assert(doc.body.textContent.includes('Missing phone fixture'));assert(button(doc,'Open WhatsApp draft').disabled);assert.equal(opens,2,'no timed automatic popup for remaining rows');
 button(doc,'Skip').click();await wait();assert(doc.body.textContent.includes('Sending and delivery have not been independently verified'));
 console.log('PASS queue: blocked popup, unverified draft, explicit confirmation, missing phone and skip never produce fake sent status. No messages sent.');
}
async function testFeeQueue(){
 const dom=await mount('PendingFeeReportDialog',{data:{feeStructures:fixtureOps.feeStructures,feePayments:[],studentFeeDues:[],classFeeCharges:[],feeAccounts:[]},students:[student],institution:{name:'Fixture School',session:'2026–27'},filterLabel:'Fixture',onClose(){},onOpenStudent(){}}),doc=dom.window.document;
 const queueButton=[...doc.querySelectorAll('button')].find(b=>b.textContent.includes('WhatsApp Defaulters Queue'));assert(queueButton,'fee reminder queue action');queueButton.click();await wait();
 const dialogs=[...doc.querySelectorAll('[role="dialog"]')];const queue=dialogs.find(el=>el.getAttribute('aria-label')?.includes('WhatsApp Fee Reminder'));assert(queue,'fee queue opens from report');assert(queue.textContent.includes('9876543210'),'fee queue uses saved parentMobile');assert(button(queue,'Open WhatsApp draft'));
 console.log('PASS fee report integration: queue receives registered parentMobile from actual student records.');
}
async function testModal(){const dom=await mount('L',{title:'Fixture report',onClose(){},children:'Fixture table'}),doc=dom.window.document;doc.querySelector('button[aria-label="Maximize"]').click();await wait();const modal=doc.querySelector('[role="dialog"]');assert.equal(modal.style.width,'96vw');assert.equal(parseFloat(modal.querySelector('.simple-modal-body').style.minHeight),0);console.log('PASS shared dialog: maximize expands body with a flexible scroll area.');}
async function testOfficial(){
 let calls=0;
 const apiMock={request:async(path,body)=>{calls++;if(path==='/connection')return {school:'Fixture School',connected:true,webhookVerified:true};if(path==='/preview')return {digest:'fixture',rows:[{name:'Fixture Learner',phone:'919876543210',state:'ready',preview:'Approved fixture text'}]};if(path==='/batches')return {id:'fixture-batch'};return {batch:{id:'fixture-batch'},rows:[{id:'r',phone:'919876543210',state:'accepted'}]};}};
 const dom=await mount('OfficialWhatsAppPanel',{},apiMock);await wait();assert.equal(calls,1,'connection default items must not cause an effect/render loop');dom.window.close();
 const items=[{id:student.id,phone:student.parentMobile,kind:'fee',meta:{admissionNumber:student.admissionNumber},values:{amount:1,dueDate:'2026-11-10'}}];
 const page=await mount('OfficialWhatsAppPanel',{items},apiMock),doc=page.window.document;button(doc,'Preview numbers and approved messages').click();await wait();assert(doc.body.textContent.includes('Approved fixture text'));const send=button(doc,'Send automatically to reviewed numbers');assert(send.disabled);doc.querySelector('input[type="checkbox"]').click();await wait();assert(!button(doc,'Send automatically to reviewed numbers').disabled);button(doc,'Send automatically to reviewed numbers').click();await wait();assert(doc.body.textContent.includes('Accepted: 1'));assert(doc.body.textContent.includes('Sent: 0'));button(doc,'Prepare another batch (previous sending continues)').click();await wait();assert(button(doc,'Preview numbers and approved messages'));assert(!doc.body.textContent.includes('Approved fixture text'));
 console.log('PASS official API panel: stable setup rendering, actual template preview, consent gate, accepted is not sent, next batch reset. Mock API only.');
}
(async()=>{try{await testProfile();await testQueue();await testFeeQueue();await testModal();await testOfficial();}finally{for(const dom of dialogs)dom.window.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
