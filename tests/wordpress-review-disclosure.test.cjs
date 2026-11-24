'use strict';
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict'), {test}=require('node:test');
const read=x=>fs.readFileSync(path.join(__dirname,'..',x),'utf8');
test('WordPress review policies exist and are published identically to the root copies',()=>{
 for(const p of ['privacy-policy.html','terms-of-service.html']){
   assert.equal(read(p),read('docs/'+p),p);
   assert.match(read(p),/24 November 2026/);
   assert.match(read(p),/Bright Nexa School OS/);
   assert.match(read(p),/karanloves1@gmail.com/);
 }
});
test('WordPress release retains full School OS links and explicitly documents its external intake',()=>{
 const php=read('wordpress/bright-nexa-school/bright-nexa-school.php');
 const txt=read('wordpress/bright-nexa-school/readme.txt');
 assert.match(php,/Version: 0\.2\.1/);assert.match(txt,/Stable tag: 0\.2\.1/);
 for(const feature of ['bright_nexa_admissions','bright_nexa_school_portal','workspace_links','bn_wordpress_submit_enquiry'])assert.ok(php.includes(feature),feature);
 for(const link of ['privacy-policy.html','terms-of-service.html']){assert.ok(txt.includes(link));assert.ok(php.includes(link));}
 for(const piece of ['Supabase','Render','What is sent and when','guardian name','consent','key'])assert.match(txt,new RegExp(piece,'i'));
});
