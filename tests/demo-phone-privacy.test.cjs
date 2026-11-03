'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const read=p=>fs.readFileSync(require('node:path').join(__dirname,'..',p),'utf8');

test('independent public demo phone guard is published and syntax-valid',()=>{
 const js=read('demo-phone-privacy.js');
 assert.equal(js,read('docs/demo-phone-privacy.js'));
 assert.equal(read('school-demo.html'),read('docs/school-demo.html'));
 assert.doesNotMatch(read('school-demo.html'),/demo-phone-privacy\.js/);
 assert.match(read('school-demo.html'),/Legacy browser-only demo retired/);
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.doesNotMatch(js,/fetch\(|localStorage\.|sessionStorage\.|service_role|sb_secret_/);
 assert.match(js,/new MutationObserver\(maskStudentProfiles\)/);
});

test('public demo profile text node mobile numbers redact on initial render and re-render',()=>{
 const script=read('demo-phone-privacy.js');
 const parent={closest:()=>null};
 const phone={nodeValue:'9876543210',parentElement:parent};
 const second={nodeValue:'Alternative mobile: 9812301001',parentElement:parent};
 const label={nodeValue:'Parent Mobile',parentElement:parent};
 const unrelated={nodeValue:'School ID 2026110310',parentElement:parent};
 let nodes=[phone,second,label,unrelated],callback;
 const dialog={classList:{contains:c=>c==='student-profile-modal'},querySelector:()=>null};
 const document={
  readyState:'complete',documentElement:{dataset:{}},body:{},
  querySelectorAll:()=>[dialog],
  createTreeWalker:()=>{let i=0;return {nextNode:()=>nodes[i++]||null};}
 };
 const context={document,NodeFilter:{SHOW_TEXT:4},
   MutationObserver:class {constructor(cb){callback=cb;}observe(){}},
   window:{addEventListener:()=>{}}};
 vm.runInNewContext(script,context);
 assert.equal(document.documentElement.dataset.demoPhonePrivacy,'active');
 assert.equal(phone.nodeValue,'987*****10');
 assert.equal(second.nodeValue,'Alternative mobile: 981*****01');
 assert.equal(label.nodeValue,'Parent Mobile');
 assert.equal(unrelated.nodeValue,'School ID 2026110310');
 // A React rerender reintroduces a raw new text node. Observer must re-mask.
 const rerender={nodeValue:'9812302001',parentElement:parent};
 nodes=[rerender,label];
 callback();
 assert.equal(rerender.nodeValue,'981*****01');
});
