'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../docs/id-card-a4.html'),'utf8');
function extract(start,stop){
 const a=html.indexOf(start), b=html.indexOf(stop,a+start.length);
 assert.ok(a>=0&&b>a,'Cannot extract '+start+' -> '+stop);
 return html.slice(a,b);
}
const api=new Function(extract('    function photoFileIdentifier(fileName) {',
 '    function optimizedPhotoData(file) {')+
 'return {photoFileIdentifier,matchPhotoFileToStudent};')();
const students=[
 {id:'DEMO-1',name:'AARAV SHARMA',admissionNumber:'DEMO-2026-001',className:'Class 6'},
 {id:'DEMO-2',name:'ANANYA VERMA',admissionNumber:'DEMO-2026-002',className:'Class 6'},
 {id:'DEMO-3',name:'ROHAN MEHTA',admissionNumber:'DEMO-2026-003',className:'Class 6'}
];
test('bulk controls allow selecting many files and printing all sheets',()=>{
 for(const id of ['idBulkPhotoFiles','idBatchPhotoSummary','idUnmatchedPhotoPanel',
 'idUnmatchedPhotoRows','idPreviewAllCardsBtn','idPrintAllCardsBtn','idClearAllPhotosBtn'])
   assert.ok(html.includes('id="'+id+'"'),id+' missing');
 assert.match(html,/id="idBulkPhotoFiles"[^>]*\bmultiple\b/);
 assert.match(html,/function previewAllIdCards\(\)/);
 assert.match(html,/function printAllIdCards\(\)/);
 assert.match(html,/maxBatchPhotos=50/);
 assert.match(html,/previewAllIdCards\(\);\s*requestAnimationFrame/);
 assert.match(html,/idPhotoOverrides\.get\(idPhotoKey\(st\.id\)\)/);
});
test('match by admission/name and never guess unmatched or ambiguous photos',()=>{
 for(const filename of ['AARAV SHARMA.jpg','aarav_sharma-photo.png','DEMO-2026-001.webp'])
   assert.equal(api.matchPhotoFileToStudent(filename,students).student?.id,'DEMO-1',filename);
 assert.equal(api.matchPhotoFileToStudent('ANANYA_VERMA.png',students).student.id,'DEMO-2');
 assert.equal(api.matchPhotoFileToStudent('DEMO-2026-003.jpg',students).student.id,'DEMO-3');
 for(const filename of ['IMG_7215.jpg','Payhip_200.jpg','01.jpg'])
   assert.equal(api.matchPhotoFileToStudent(filename,students).student,null);
 assert.equal(api.matchPhotoFileToStudent('ROHAN MEHTA.jpg',[...students,
  {id:'STU-99',name:'ROHAN MEHTA',admissionNumber:'X-99'}]).student,null);
});
test('batch import applies unique files; unmatched files queue and invalid formats reject',async()=>{
 const map=new Map(),pending=[],input={disabled:false,value:'chosen'},messages=[];
 let renders=0;
 const photos=[
   {name:'AARAV SHARMA.jpg',type:'image/jpeg',size:100},
   {name:'DEMO-2026-002.png',type:'image/png',size:100},
   {name:'ROHAN MEHTA.webp',type:'image/webp',size:100},
   {name:'IMG_7215.jpg',type:'image/jpeg',size:100},
   {name:'second ROHAN MEHTA.jpg',type:'image/jpeg',size:100},
   {name:'bad.txt',type:'text/plain',size:100}
 ];
 const script=extract('    async function importBatchIdPhotos(files) {',
  '    function previewAllIdCards() {');
 const declarations='let {bulkPhotoImportBusy,batchPendingPhotos,bulkPhotoQueueId,maxBatchPhotos,'+
  'isDemoMode,activeStudents,idPhotoOverrides,optimizedPhotoData,'+
  'matchPhotoFileToStudent,updateBatchPhotoSummary,photoFeedback,'+
  'renderCards,renderUnmatchedPhotoRows,document}=stubs;';
 const factory=new Function('stubs',declarations+'\n'+script+
  '\nreturn {importBatchIdPhotos,getPending:()=>batchPendingPhotos,getBusy:()=>bulkPhotoImportBusy};');
 const app=factory({
   bulkPhotoImportBusy:false,batchPendingPhotos:pending,bulkPhotoQueueId:0,maxBatchPhotos:50,
   isDemoMode:true,activeStudents:students,idPhotoOverrides:map,
   optimizedPhotoData:async file=>'data:image/jpeg;base64,'+Buffer.from(file.name).toString('base64'),
   matchPhotoFileToStudent:api.matchPhotoFileToStudent,updateBatchPhotoSummary:t=>messages.push(t),
   photoFeedback:t=>messages.push(t),renderCards:()=>renders++,
   renderUnmatchedPhotoRows:()=>{},document:{getElementById:()=>input}
 });
 await app.importBatchIdPhotos(photos);
 assert.equal(map.size,3);
 assert.equal(map.has('demo:DEMO-1'),true);
 assert.equal(map.has('demo:DEMO-2'),true);
 assert.equal(map.has('demo:DEMO-3'),true);
 assert.equal(pending.length,2);
 assert.equal(renders,1);
 assert.equal(input.disabled,false);
 assert.equal(input.value,'');
 assert.equal(app.getBusy(),false);
 assert.ok(messages.some(s=>s.includes('3 photos auto-matched')));
 assert.ok(messages.some(s=>s.includes('2 need manual assignment')));
 assert.ok(messages.some(s=>s.includes('1 invalid')));
});
test('single photo upload does not filter down to one card automatically',()=>{
 const code=extract("    document.addEventListener('change', function(event) {",
  "    // ---------- True multi-student photo import");
 assert.match(code,/renderCards\(\); \/\/ Bulk workflow/);
 assert.doesNotMatch(code,/previewSelectedPhotoCard\(\);/);
});
test('inline ID card script is valid JavaScript',()=>{
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
   .map(m=>m[1]).filter(Boolean);
 assert.ok(scripts.some(s=>s.includes('function importBatchIdPhotos')));
 for(const script of scripts)assert.doesNotThrow(()=>new vm.Script(script));
});
