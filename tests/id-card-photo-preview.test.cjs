'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname,'../docs/id-card-a4.html'),'utf8');
function functionSource(name, nextMarker) {
  const start=html.indexOf('    function '+name+'(');
  assert.ok(start>=0, 'Missing '+name);
  const end=html.indexOf(nextMarker,start);
  assert.ok(end>start, 'Missing end of '+name);
  return html.slice(start,end);
}
test('uploaded ID portrait data URL retains mandatory ;base64 delimiter',()=>{
  const source=functionSource('sanitizeImageUrl','    // ==========================================');
  const sanitizer=new Function(source+';return sanitizeImageUrl;')();
  const jpeg='data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAE';
  const webp='data:image/webp;base64,UklGRiIAAABXRUJQVlA4';
  for(const data of [jpeg,png,webp])assert.equal(sanitizer(data,'fallback.png'),data);
  assert.equal(sanitizer('data:text/html;base64,PHNjcmlwdD4=','fallback.png'),'fallback.png');
  assert.equal(sanitizer('data:image/svg+xml;base64,PHN2Zz4=','fallback.png'),'fallback.png');
  assert.equal(sanitizer('javascript:alert(1)','fallback.png'),'fallback.png');
  assert.equal(sanitizer('photo.jpg','fallback.png'),'photo.jpg');
});

test('ID photo flow shows an on-screen thumbnail, status, and selected student card',()=>{
  for(const id of ['idPhotoStudent','idPhotoFile','idPhotoPreview','idPhotoThumbnail',
    'idPhotoPreviewLabel','idPhotoFeedback','idPhotoPreviewBtn'])
    assert.ok(html.includes('id="'+id+'"'),id+' missing');
  assert.match(html,/function previewSelectedPhotoCard\(\)/);
  assert.match(html,/reader\.readAsDataURL\(file\)/);
  assert.match(html,/idPhotoOverrides\.set\(key,image\)/);
  assert.match(html,/updatePhotoThumbnail\(\)/);
  assert.match(html,/previewSelectedPhotoCard\(\)/);
  assert.match(html,/idPhotoOverrides\.get\(idPhotoKey\(st\.id\)\)/);
  assert.match(html,/studentFilter\.value=key/);
  assert.match(html,/scrollIntoView\(\{behavior:'smooth',block:'center'\}\)/);
  assert.match(html,/no upload to server|No upload to server/i);
  assert.match(html,/data:image\\\/\(jpeg\|png\|webp\)/);
});

test('image photos are isolated by demo vs live student source and size validated',()=>{
  assert.match(html,/'demo:' : 'live:'/);
  assert.match(html,/file\.size > 8\*1024\*1024/);
  assert.match(html,/reader\.onerror=/);
  assert.match(html,/const uploadId=\+\+idPhotoReadId/);
  assert.match(html,/idPhotoOverrides\.delete\(idPhotoKey\(studentId\)\)/);
  // Image file must only become a transient FileReader preview, not a network POST.
  const start=html.indexOf('    const idPhotoOverrides = new Map();');
  const end=html.indexOf('    function renderCards() {',start);
  const uploadBlock=html.slice(start,end);
  assert.doesNotMatch(uploadBlock,/fetch\(|XMLHttpRequest|localStorage\.setItem|sessionStorage\.setItem/);
});
