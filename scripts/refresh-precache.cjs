'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sw=read('sw.js');
const match=sw.match(/e\.precacheAndRoute\((\[[\s\S]*?\]),\{\}\)/);
if(!match)throw Error('Missing Workbox precache manifest');
const existing=vm.runInNewContext('('+match[1]+')',{}, {timeout:1000});
const current=new Set();
for(const html of ['index.html','teacher-access.html','smart-tools.html']){
 for(const m of read(html).matchAll(/(?:src|href)="\.\/([^"?#]+\.(?:js|css)(?:\?v=[^"#]+)?)"/g))current.add(m[1]);
}
for(const m of read('school-erp-entry.js').matchAll(/\.\/([^'"`]+\.js\?v=[^'"`]+)/g))current.add(m[1]);
const urls=new Set(['index.html','assets/index-brightnexa-v2.js',...current.values()]);
for(const entry of existing){
 const file=entry.url.split('?')[0];
 // Authentication/QR verification is online-only; the legacy desktop redirect
 // has intentionally different markup and must not share a root HTML cache key.
 if(file==='student-portal.html')continue;
 if(![...current].some(url=>url.split('?')[0]===file)||current.has(entry.url))urls.add(entry.url);
}
const entries=[];
for(const url of urls){
 const file=url.split('?')[0];
 const absolute=path.resolve(root,file);
 if(!absolute.startsWith(root+path.sep)||!fs.existsSync(absolute))throw Error('Missing precache asset: '+url);
 let bytes=fs.readFileSync(absolute);
 if(/\.(?:js|css|html|json|webmanifest|svg)$/.test(file))bytes=Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n'));
 fs.writeFileSync(absolute,bytes);
 for(const mirror of ['docs','app-extracted/dist']){
  const target=path.join(root,mirror,file);
  // Only source-owned runtime assets are mirrored. Standalone desktop pages
  // can have distinct markup and must not be overwritten by this builder.
  if(/\.(?:js|css|svg|png|ico|webmanifest)$/.test(file)||file==='index.html'){
   fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);
  }
 }
 entries.push({url,revision:crypto.createHash('sha256').update(bytes).digest('hex')});
}
const manifest=JSON.stringify(entries).replace(/\{"url":"assets\/index-brightnexa-v2\.js","revision":"([a-f0-9]+)"\}/, '{url:"assets/index-brightnexa-v2.js",revision:"$1"}');
const output=sw.replace(match[0],'e.precacheAndRoute('+manifest+',{})').replace(/\r\n/g,'\n');
for(const mirror of ['','docs','app-extracted/dist'])fs.writeFileSync(path.join(root,mirror,'sw.js'),output);
console.log('Verified and refreshed '+entries.length+' precache assets across all three distributions.');
