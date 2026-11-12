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
      institution:{institution:{name:'Test School',session:'2026-2027'}},
      students:[{id:'local-one',name:'Student One',admissionNumber:'ADM-11',
        className:'LKG',section:'A',status:'Active'}],
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
