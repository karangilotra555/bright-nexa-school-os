const {test}=require('node:test'),assert=require('node:assert/strict');const {create,validate,MAX}=require('../docs/school-homework-files.js');
const pdf=()=>new File(['%PDF-1.7\nexample'], 'homework.pdf',{type:'application/pdf'});
test('homework files enforce size, allowed formats and matching signatures',async()=>{await validate(pdf());await assert.rejects(validate(new File(['text'],'fake.pdf',{type:'application/pdf'})),/format/);await assert.rejects(validate(new File(['<svg>'],'file.svg',{type:'image/svg+xml'})),/Choose/);await assert.rejects(validate({type:'application/pdf',size:MAX+1}),/10 MB/);});
test('upload creates a private attachment scoped to homework and institution',async()=>{const calls=[];const client=create({base:'https://school.example',key:'public',token:async()=>'teacher-jwt',fetcher:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>[]};}});await client.upload({id:'h',institution_id:'i'},[pdf()]);assert.equal(calls.length,2);const meta=JSON.parse(calls[0].options.body);assert.equal(meta.homework_id,'h');assert.equal(meta.institution_id,'i');assert.match(meta.storage_path,/^i\/h\/.*\.pdf$/);assert.equal(calls[1].options.headers.Authorization,'Bearer teacher-jwt');assert.equal(calls[1].options.headers['x-upsert'],'false');});
test('ambiguous homework upload retains metadata and does not claim a false success',async()=>{
 const calls=[];
 const client=create({base:'https://school.example',key:'public',token:async()=>'jwt',fetcher:async(url,options)=>{
  calls.push({url,options});
  return {ok:!url.includes('/storage/'),json:async()=>({error:'Upload failed'})};
 }});
 await assert.rejects(client.upload({id:'h',institution_id:'i'},[pdf()]),/Metadata was preserved/);
 assert.ok(calls.some(x=>x.options.method==='GET'&&x.url.includes('/storage/')));
 assert.equal(calls.some(x=>x.options.method==='DELETE'),false);
});
test('confirmed missing homework file removes only its metadata',async()=>{
 const calls=[];
 const client=create({base:'https://school.example',key:'public',token:async()=>'jwt',fetcher:async(url,options)=>{
  calls.push({url,options});
  if(url.includes('/storage/'))return {ok:false,status:404,json:async()=>({error:'Object not found'})};
  return {ok:true,json:async()=>[]};
 }});
 await assert.rejects(client.upload({id:'h',institution_id:'i'},[pdf()]),/Object not found/);
 assert.equal(calls.at(-1).options.method,'DELETE');
});
test('logged-out readers cannot fetch private homework files',async()=>{let called=false;const client=create({base:'https://school.example',key:'public',token:async()=>null,fetcher:async()=>{called=true;}});await assert.rejects(client.list(['h']),/log in/);assert.equal(called,false);});
