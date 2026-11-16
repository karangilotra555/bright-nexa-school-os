'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const source=name=>{
  const match=read(name).match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match,name+' must contain the inline page logic');
  return match[1];
};
const SID='11111111-1111-4111-8111-111111111111';
const CID='22222222-2222-4222-8222-222222222222';
async function browser(name){
  const dom=new JSDOM(read(name),{url:'https://school.example/'+name+'?schoolId='+SID,runScripts:'outside-only'});
  await new Promise(resolve=>setTimeout(resolve,0));
  let printed=0;
  dom.window.print=()=>printed++;
  return {dom,w:dom.window,printed:()=>printed};
}

test('ID cards cannot print local data without a verified Supabase readback',async()=>{
  const {dom,w,printed}=await browser('id-card-a4.html');
  w.eval(source('id-card-a4.html'));
  assert.equal(w.handlePrint(),false);
  assert.equal(printed(),0);
  assert.match(w.document.getElementById('bnPrintCloudStatus').textContent,/not verified/i);
  assert.doesNotMatch(read('id-card-a4.html'),/SAMPLE_DEMO_STUDENTS|toggleDemoMode|isDemoMode|9876543210/);
  dom.window.close();
});

test('published marksheet loads cloud UUID mapping and signed-in RPC response',async()=>{
  const {dom,w,printed}=await browser('marksheet-a4.html');
  w.sessionStorage.setItem('bn_school_staff_session_v1',JSON.stringify({access_token:'jwt-example'}));
  w.BNWorkspaceCloud={create:()=>({
    connect:async()=>[{id:SID,name:'Test School'}],
    pull:async()=>({revision:3,snapshot:{
      institution:{institution:{name:'Test School',session:'2026-2027',boardType:'CBSE',udiseCode:'1234'}},
      students:[{id:'local-one',name:'Student One',admissionNumber:'ADM-11',
        className:'11',section:'A',academicStream:'Commerce',status:'Active'}],
      operations:{}
    }})
  })};
  const reqs=[];
  w.fetch=async(url,options={})=>{
    reqs.push({url,options});
    if(url.includes('school_workspace_links'))
      return {ok:true,json:async()=>[{local_id:'local-one',cloud_id:CID}]};
    if(url.includes('bn_school_published_marksheets'))
      return {ok:true,json:async()=>[{examId:'exam-1',examName:'Annual Examination',
        publishedAt:'2026-11-12T10:00:00Z',
        subjects:[{subject:'Mathematics',obtained:84,maximum:100}]}]};
    throw Error('Unexpected request '+url);
  };
  w.eval(source('marksheet-a4.html'));
  await w.loadFromSchoolOS();
  assert.equal(w.document.getElementById('studentName').textContent,'Student One');
  assert.match(w.document.getElementById('classSection').textContent,/11.*A.*Commerce/);
  assert.match(w.document.getElementById('schoolAffil').textContent,/CBSE.*1234/);
  assert.equal(w.document.getElementById('grandTotal').textContent,'84.0 / 100.0');
  assert.equal(w.document.getElementById('bnMarksheetPrint').disabled,false);
  const rpc=reqs.find(x=>x.url.includes('bn_school_published_marksheets'));
  assert.ok(rpc);
  assert.equal(JSON.parse(rpc.options.body).p_student,CID);
  assert.equal(w.printPublishedMarksheet(),true);
  assert.equal(printed(),1);
  dom.window.close();
});

test('no published exam means no printable marksheet even with a verified roster',async()=>{
  const {dom,w,printed}=await browser('marksheet-a4.html');
  w.sessionStorage.setItem('bn_school_staff_session_v1',JSON.stringify({access_token:'jwt-example'}));
  w.BNWorkspaceCloud={create:()=>({
    connect:async()=>[{id:SID,name:'Test School'}],
    pull:async()=>({revision:1,snapshot:{
      institution:{institution:{name:'Test School'}},
      students:[{id:'local-one',name:'Student One',status:'Active'}],operations:{}
    }})
  })};
  w.fetch=async url=>({ok:true,json:async()=>url.includes('school_workspace_links')
    ?[{local_id:'local-one',cloud_id:CID}]:[]});
  w.eval(source('marksheet-a4.html'));
  await w.loadFromSchoolOS();
  assert.equal(w.document.getElementById('bnMarksheetPrint').disabled,true);
  assert.equal(w.printPublishedMarksheet(),false);
  assert.equal(printed(),0);
  assert.equal(w.document.querySelector('.a4-marksheet').style.display,'none');
  dom.window.close();
});

test('TC page cannot issue an official certificate from unsanctioned student fields',async()=>{
  const {dom,w,printed}=await browser('tc-certificate-a4.html');
  w.eval(source('tc-certificate-a4.html'));
  assert.equal(w.printVerifiedTC(),false);
  assert.equal(printed(),0);
  assert.match(w.document.getElementById('bnTCCloudStatus').textContent,/backend-issued certificate/i);
  assert.doesNotMatch(read('tc-certificate-a4.html'),/localStorage\.getItem/);
  dom.window.close();
});

test('A4 print modules are identical in hosted, docs and standalone releases',()=>{
  for(const file of ['id-card-a4.html','marksheet-a4.html','tc-certificate-a4.html']){
    for(const prefix of ['docs/','app-extracted/dist/'])
      assert.equal(read(prefix+file),read(file),prefix+file+' differs');
  }
  assert.doesNotMatch(read('marksheet-a4.html'),/sampleStudents|AARAV SHARMA|1730248|20458/);
});

test('ID card cloud roster excludes transferred, archived and incomplete student profiles',async()=>{
  const {dom,w}=await browser('id-card-a4.html');
  w.fetch=async()=>{throw Error('Unexpected direct fetch in mocked cloud test');};
  w.BNWorkspaceCloud={create:()=>({
    connect:async()=>[{id:SID,name:'Test School'}],
    pull:async()=>({revision:7,snapshot:{
      institution:{institution:{name:'Test School',session:'2026-2027'}},
      students:[
        {id:'s1',name:'Current Child',admissionNumber:'ADM-1',status:'Active',className:'11',section:'A',academicStream:'Science'},
        {id:'s2',name:'Transferred Child',admissionNumber:'ADM-2',status:'Transferred',className:'LKG',section:'A'},
        {id:'s3',name:'Incomplete Child',admissionNumber:'',status:'Active',className:'LKG',section:'A'},
        {id:'s4',name:'Archived Child',admissionNumber:'ADM-4',status:'Archived',className:'LKG',section:'A'}
      ],operations:{}
    }})
  })};
  w.eval(source('id-card-a4.html'));
  await w.refreshSchoolCloudData();
  assert.match(w.document.getElementById('countBadge').textContent,/1 Student/);
  const options=[...w.document.getElementById('studentFilter').options].map(o=>o.textContent.toLowerCase());
  assert.ok(options.some(o=>o.includes('current child')));
  assert.match(w.document.querySelector('.class-badge').textContent,/11.*A.*Science/);
  assert.ok(!options.some(o=>o.includes('transferred child')||o.includes('archived child')||o.includes('incomplete child')));
  dom.window.close();
});

test('browser print shortcut cannot bypass unissued TC or unverified ID-card checks',()=>{
  const idCard=read('id-card-a4.html');
  const tc=read('tc-certificate-a4.html');
  assert.match(idCard,/body:not\(\.bn-id-print-verified\) #pagesContainer\{display:none!important\}/);
  assert.match(idCard,/document\.body\.classList\.add\('bn-id-print-verified'\)/);
  assert.match(idCard,/window\.addEventListener\('afterprint',release/);
  assert.match(tc,/body:not\(\.bn-tc-server-issued\) \.a4-page\{display:none!important\}/);
  assert.doesNotMatch(tc,/classList\.add\('bn-tc-server-issued'\)/);
});

test('ERP marksheet starts empty and prints only the selected exam and exact subjects',async()=>{
 const {dom,w,printed}=await browser('marksheet.html');
 assert.doesNotMatch(w.document.body.textContent,/1730248|20458|AARAV SHARMA|87\.7%/i);
 assert.equal(w.document.querySelector('.a4-marksheet').hidden,true);
 assert.equal(w.document.getElementById('markPrint').disabled,true);
 const data={
  snapshot:{institution:{name:'Test School',boardType:'CBSE',udiseCode:'1234',affiliationNumber:'555'}},
  students:[{id:'s1',name:'Test Student',className:'11',section:'A',academicStream:'Science'}],
  operations:{exams:[
   {id:'term',name:'Term 1',subjects:[{name:' Science ',maximumMarks:50},{name:'Social Science',maximumMarks:50},{name:'Computer Science',maximumMarks:50}]},
   {id:'annual',name:'Annual',subjects:[{name:'Science',maximumMarks:100}]}
  ],marks:[
   {studentId:'s1',examId:'term',subject:'science',maximumMarks:50,obtainedMarks:35},
   {studentId:'s1',examId:'annual',subject:'Science',maximumMarks:100,obtainedMarks:78}
  ]}
 };
 w.BNPrivateCache={ensureUnlocked:async()=>{},storage:{getItem:key=>JSON.stringify(data[key.split(':')[1]])}};
 w.eval(source('marksheet.html'));
 await w.loadFromSchoolOS();
 const page=w.document;
 assert.match(page.getElementById('schoolAffil').textContent,/555.*1234/);
 w.switchStudent('s1');
 assert.match(page.getElementById('classSection').textContent,/11.*A.*Science/);
 w.switchExam('term');
 const rows=[...page.querySelectorAll('#subjectTableBody tr')];
 assert.deepEqual(rows.map(row=>row.cells[6].textContent),['35.0','—','—']);
 assert.equal(page.getElementById('grandTotal').textContent,'35.0 / 50.0');
 w.switchExam('annual');
 assert.equal(page.getElementById('grandTotal').textContent,'78.0 / 100.0');
 assert.equal(w.printMarksheetPreview(),true);
 assert.equal(printed(),1);
 w.switchExam('does-not-exist');
 assert.equal(w.printMarksheetPreview(),false);
 dom.window.close();
});

test('TC draft shows the selected student stream while official printing remains blocked',async()=>{
 const {dom,w,printed}=await browser('tc-certificate-a4.html');
 w.fetch=async()=>{throw Error('Unexpected request');};
 w.BNWorkspaceCloud={create:()=>({
  connect:async()=>[{id:SID,name:'Test School'}],
  pull:async()=>({snapshot:{
   institution:{institution:{name:'Test School'}},
   students:[{id:'s1',name:'Test Student',className:'12',section:'A',academicStream:'Commerce'}]
  }})
 })};
 w.eval(source('tc-certificate-a4.html'));
 await w.loadData();
 assert.match(w.document.getElementById('bnTCCloudStatus').textContent,/Verified Supabase roster/);
 w.document.getElementById('studentSelect').value='0';
 w.loadStudentTC();
 assert.match(w.document.getElementById('tcClassLast').textContent,/12.*A.*Commerce/);
 assert.equal(w.printVerifiedTC(),false);
 assert.equal(printed(),0);
 dom.window.close();
});
