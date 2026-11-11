'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const files=['app-extracted/src/BrightNexaApp.jsx','assets/index-brightnexa-v2.js'];
test('teacher thumbnail is keyboard-accessible and opens full-size photo',()=>{
 for(const path of files){
  const js=read(path),from=js.indexOf('function Sr({ data:'),to=js.indexOf('function Cr({',from);
  assert.ok(from>0&&to>from);
  const section=js.slice(from,to);
  assert.match(section,/type[=:]\s*["`]?button/);
  assert.ok(section.includes('Enlarge teacher photograph'));
  assert.ok(section.includes('onClick: () => setPhotoPreview')||section.includes('onClick={() => setPhotoPreview'));
  assert.ok(section.includes('photoPreview &&'));
  assert.ok(section.includes('70vh'));
  assert.ok(section.includes('Teacher Photograph'));
  assert.ok(section.includes('onClose: () => setPhotoPreview(null)')||section.includes('onClose={() => setPhotoPreview(null)}'));
 }
});
test('photograph upload compresses in browser; Aadhaar document upload remains unchanged',async()=>{
 for(const path of files){
  const js=read(path);
  const helper=js.slice(js.indexOf('async function bnOptimizePortrait('),js.indexOf('async function er(',js.indexOf('async function bnOptimizePortrait(')));
  assert.ok(helper.includes('canvas.toDataURL'));
  assert.ok(helper.includes('URL.revokeObjectURL(objectUrl)'));
  assert.ok(helper.includes('result.length <= 600000'));
  assert.ok(helper.includes("['image/jpeg','image/png','image/webp']"));
  const section=js.slice(js.indexOf('function Cr({'),js.indexOf('function _Component10({ teacher:'));
  assert.ok(section.includes('photoProcessing'));
  assert.ok(section.includes('saveDisabled'));
  assert.ok(section.includes('bnOptimizePortrait('));
  assert.ok(section.includes("'photoDataUrl' ? bnOptimizePortrait"));
  assert.ok(section.includes(': $n('),'Aadhaar documents must still use their old upload helper');
  const before=js.slice(0,js.indexOf('function Sr({ data:'));
  assert.ok(before.includes("'photoDataUrl' ? bnOptimizePortrait"),'student portrait upload must be compressed too');
  let revoked=false,drawn=[],originalCount=0;
  const canvas={
   width:0,height:0,
   getContext:()=>({fillStyle:'',fillRect:()=>{},drawImage:(_,x,y,w,h)=>drawn.push([w,h])}),
   toDataURL:()=> 'data:image/jpeg;base64,'+'A'.repeat(150000)
  };
  class FakeImage {
   naturalWidth=3200;
   naturalHeight=2400;
   set src(value){Promise.resolve().then(()=>this.onload());}
  }
  const optimize=vm.runInNewContext(helper+'; bnOptimizePortrait',{
   Image:FakeImage,
   document:{createElement:()=>canvas},
   URL:{createObjectURL:()=> 'blob:fixture',revokeObjectURL:()=>{revoked=true;}},
   nr:async()=>{originalCount++;return 'data:image/png;base64,ABC';},
  });
  await Promise.resolve().then(async()=>{
   const image=await optimize({type:'image/png',size:2800000});
   assert.ok(image.startsWith('data:image/jpeg;base64,'));
   assert.ok(image.length<=600000);
   assert.ok(drawn.length);
   assert.ok(drawn[0][0]<=900&&drawn[0][1]<=900);
   assert.ok(revoked,'object URL must be cleaned even after conversion');
   assert.equal(originalCount,0);
   await assert.rejects(optimize({type:'image/svg+xml',size:50000}),/JPG, PNG or WebP/);
   assert.equal(await optimize({type:'image/png',size:50000}),'data:image/png;base64,ABC');
   assert.equal(originalCount,1);
  });
 }
});

test('student form protects photo compression and unsaved edits; teacher upload label reflects 12 MB limit',()=>{
 for(const path of files){
  const js=read(path);
  const i=js.indexOf('function _Component6({'),j=js.indexOf('function _Component7(',i);
  assert.ok(i>0&&j>i);
  const student=js.slice(i,j);
  assert.ok(student.includes('closeStudentSafely'),'student close must preserve edits');
  assert.ok(student.includes('initialStudentDraft'));
  assert.ok(student.includes('photoProcessing'));
  assert.ok(student.includes('disabled={photoProcessing}')||student.includes('disabled: photoProcessing'));
  assert.ok(student.includes('bnOptimizePortrait('));
  const k=js.indexOf('function Or({ title:'),m=js.indexOf('function _Component13(',k);
  assert.ok(js.slice(k,m).includes('12 MB (auto-compressed)'));
 }
});
