// Optional real-browser check: provide Playwright through NODE_PATH. Uses no real school data.
'use strict';
const fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('playwright'),esbuild=require('esbuild');
const source=fs.readFileSync('app-extracted/src/BrightNexaApp.jsx','utf8').replace(/\r\n/g,'\n');
const bootstrap=source.lastIndexOf('sa();\nCt.createRoot');assert.ok(bootstrap>0);
const code=esbuild.transformSync(source.slice(0,bootstrap)+'\nCt.createRoot(document.getElementById("root")).render(w.createElement(Ea));',{loader:'jsx',format:'iife',jsxFactory:'w.createElement',jsxFragment:'w.Fragment',target:'es2022'}).code;
const shell='<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/teacher-ai-cloud.js"></script><script src="/fixture.js"></script></body></html>';
const server=http.createServer((req,res)=>{
 if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');return res.end(code)}
 if(req.url==='/teacher-ai-cloud.js'){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync('teacher-ai-cloud.js'))}
 if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');return res.end(fs.readFileSync('assets/index-C1ADVAqn.css'))}
 res.setHeader('Content-Type','text/html');res.end(shell);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
 try{
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
   const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:'+server.address().port);
   await page.getByRole('heading',{name:'AI Teacher Tools',exact:true}).waitFor();
   assert.equal(await page.getByRole('link',{name:'Sign in with your school account to use AI'}).count(),1);
   assert.equal(await page.getByText('Topic / Chapter',{exact:true}).count(),0);
   await page.locator('.ai-builder > button.primary-button').click();
   await page.getByText(/Not generated: Sign in via Teachers/).waitFor();
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
   assert.equal(overflow,false,'AI tools horizontal overflow at '+viewport.width);
   assert.deepEqual(errors,[]);
   if(process.env.AUDIT_SCREENSHOTS){fs.mkdirSync(process.env.AUDIT_SCREENSHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.AUDIT_SCREENSHOTS,'teacher-tools-'+viewport.width+'.png'),fullPage:true})}
   console.log('PASS browser '+viewport.width+': teacher UI renders, no separate chapter, sign-in action, unauthenticated generation blocked, no overflow or JS errors.');
   await page.close();
  }
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
