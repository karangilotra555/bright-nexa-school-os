'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const fields=['phoneNumberId','wabaId','token','appSecret','verifyToken','language','fee','absent','ptm'];
test('WhatsApp modal ignores accidental outside mouse-down while retaining explicit Close',()=>{
 const src=read('app-extracted/src/BrightNexaApp.jsx');
 const start=src.indexOf('function WhatsAppConnectModal('),end=src.indexOf('function WhatsAppQueueModal(',start);
 assert.ok(start>0&&end>start);
 const modal=src.slice(start,end);
 assert.match(modal,/dismissOnBackdrop=\{false\}/,'outside click must NOT dismiss a partially filled setup');
 assert.match(modal,/onClick=\{onClose\}>Close/,'explicit Close remains available');
 assert.match(modal,/onClose=\{onClose\}/);
 const compiled=read('assets/index-brightnexa-v2.js');
 const a=compiled.indexOf('function WhatsAppConnectModal('),b=compiled.indexOf('function WhatsAppQueueModal(',a);
 assert.match(compiled.slice(a,b),/dismissOnBackdrop:\s*false/,'hosted bundle also prevents backdrop closing');
 const generic=src.slice(src.indexOf('function L({ title:'),src.indexOf('function L({ title:')+1200);
 assert.match(generic,/dismissOnBackdrop && n\(\)/,'other modals preserve their existing behavior');
});
test('all nine Meta WhatsApp setup fields expose official portal links and clear instructions',()=>{
 for(const file of ['app-extracted/src/BrightNexaApp.jsx','assets/index-brightnexa-v2.js']){
  const src=read(file);
  const begin=src.indexOf('const BN_META_WHATSAPP_FIELD_HELP = {'),end=src.indexOf('function OfficialWhatsAppPanel',begin);
  assert.ok(begin>0&&end>begin,file+' missing help records');
  const help=src.slice(begin,end);
  for(const field of fields)assert.ok(help.includes(field+':{url:'),file+' lacks Meta source for '+field);
  assert.match(help,/Business Settings.*WhatsApp Accounts.*not email/,'WABA field must distinguish a numeric ID from saved email autofill');
  assert.match(help,/Create your own random 24\+ character token/,'Meta never issues an automatic webhook verify token');
  assert.match(src,/target=["']?_blank|target:\s*["']_blank/);
  assert.match(src,/noopener noreferrer/,'external Meta links must be isolated');
  assert.match(src,/help\.detail/);
  assert.match(src,/help\.url/);
  assert.match(src,/data-lpignore/);
  assert.match(src,/\[0-9\]\+/,'Phone number and WhatsApp account IDs must reject non-numeric text');
  assert.match(src,/Verify and save connection/,'original API setup button must remain');
  assert.match(src,/Refresh webhook verification/,'webhook workflow must remain');
 }
});
test('WhatsApp setup changes preserve source/host/desktop bundle mirrors and PWA versions',()=>{
 const original=read('assets/index-brightnexa-v2.js');
 for(const dir of ['docs','app-extracted/dist'])assert.equal(read(dir+'/assets/index-brightnexa-v2.js'),original);
 for(const filename of ['index.html','school-erp-entry.js','sw.js']){
  const content=read(filename);
  for(const dir of ['docs','app-extracted/dist'])assert.equal(read(dir+'/'+filename),content);
 }
 const index=read('index.html'),entry=read('school-erp-entry.js'),sw=read('sw.js');
 assert.match(index,/school-erp-entry\.js\?v=20261113-whatsapp-meta-help-v1/);
 assert.match(entry,/index-brightnexa-v2\.js\?v=20261113-whatsapp-meta-help-v1/);
 const digest=x=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,x))).digest('hex');
 assert.ok(sw.includes('"url":"index.html","revision":"'+digest('index.html')+'"'));
 assert.ok(sw.includes('"url":"school-erp-entry.js?v=20261113-whatsapp-meta-help-v1","revision":"'+digest('school-erp-entry.js')+'"'));
 assert.ok(sw.includes('url:"assets/index-brightnexa-v2.js",revision:"'+digest('assets/index-brightnexa-v2.js')+'"'));
});
test('editable React JSX with field help links compiles',()=>{
 const esbuild=require('esbuild');
 const result=esbuild.transformSync(read('app-extracted/src/BrightNexaApp.jsx'),{
  loader:'jsx',format:'esm',target:'es2022',jsxFactory:'w.createElement',jsxFragment:'w.Fragment'
 });
 assert.ok(result.code.includes('BN_META_WHATSAPP_FIELD_HELP'));
 assert.ok(result.code.includes('dismissOnBackdrop: false'));
});
