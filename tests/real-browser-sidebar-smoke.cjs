'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base='https://bright-nexa-school-os.onrender.com';
const routes=[
  {id:'bn-parents-app-nav',path:'/parent-app-download.html',needle:/parents app|download/i},
  {id:'bn-teacher-access-nav',path:'/teacher-access.html',needle:/teacher\s*&\s*staff login/i},
  {id:'bn-smart-tools-nav',path:'/smart-tools.html',needle:/5 practical smart school tools/i},
];
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  for(const entry of routes){
   const context=await browser.newContext({serviceWorkers:'allow'});
   const page=await context.newPage();
   page.setDefaultTimeout(30000);
   const consoleErrors=[];
   page.on('pageerror',err=>consoleErrors.push(String(err)));
   try{
    const resp=await page.goto(base+'/',{waitUntil:'domcontentloaded',timeout:45000});
    assert.ok(resp?.ok(),'School OS homepage request failed');
    // First-run School OS can show onboarding instead of its authenticated
    // sidebar. Build an equivalent nav container for the independent links;
    // the real injected navigation shim must mount it via MutationObserver.
    const provisionNav=async()=>{
      await page.evaluate(()=>{
        if(!document.querySelector('.navigation')){
          const nav=document.createElement('nav');
          nav.className='navigation';
          document.body.append(nav);
        }
      });
      await page.locator('#'+entry.id).waitFor({state:'visible',timeout:12000});
    };
    await provisionNav();
    await page.evaluate(async()=>{
      localStorage.setItem('bn_sw_cleared','20261022-sw-standalone-v7');
      const sw=navigator.serviceWorker;
      if(!sw)return;
      await sw.register('/sw.js');
      await sw.ready;
    });
    await page.reload({waitUntil:'domcontentloaded',timeout:45000});
    await provisionNav();
    const controlled=await page.evaluate(()=>Boolean(navigator.serviceWorker?.controller));
    // Clicking the real link must navigate to its unique HTML page, not
    // a Service Worker cached copy of index.html.
    await page.locator('#'+entry.id).click();
    await page.waitForURL(u=>u.pathname===entry.path,{timeout:40000});
    const heading=(await page.locator('h1,h2').allTextContents()).join(' | ');
    assert.match(heading,entry.needle,'Expected destination heading, got '+heading);
    assert.ok(!(await page.locator('.navigation').count()),
      'Destination unexpectedly displayed the School OS SPA sidebar');
    console.log('PASS '+entry.id+' => '+page.url()+'; swControlledBeforeClick='+controlled);
   }catch(err){
    console.error('FAIL '+entry.id+' at '+page.url());
    console.error('diagnostics:',JSON.stringify(await page.evaluate(()=>({
      title:document.title,
      body:(document.body?.innerText||'').slice(0,500),
      scripts:[...document.scripts].map(x=>x.src).filter(Boolean).slice(-10),
      hasNavigation:!!document.querySelector('.navigation'),
      navAnchors:[...document.querySelectorAll('.navigation a')].map(a=>a.href),
      controlled:!!navigator.serviceWorker?.controller
    })).catch(err=>({error:String(err)})))));
    console.error('browser errors: '+consoleErrors.slice(0,8).join(' | '));
    throw err;
   }finally{await context.close();}
  }
 }finally{await browser.close();}
})().catch(err=>{console.error(err.stack||err);process.exitCode=1;});
