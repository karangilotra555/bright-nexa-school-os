'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('service worker leaves student password recovery navigation to its own page',()=>{
 let config;const noop=()=>{};
 const define=(_deps,fn)=>fn({precacheAndRoute:noop,cleanupOutdatedCaches:noop,registerRoute:noop,createHandlerBoundToURL:noop,NavigationRoute:function(handler,options){config=options;}});
 vm.runInNewContext(fs.readFileSync('sw.js','utf8'),{self:{addEventListener:noop,define},define});
 for(const pathname of ['/parent-password-recovery.html','/parent-password-recovery.html?school=fixture']){
  assert.ok(config.denylist.some(pattern=>pattern.test(pathname)),'Recovery must not be served the ERP shell: '+pathname);
 }
 assert.ok(!config.denylist.some(pattern=>pattern.test('/school-dashboard')),'ERP navigation remains available');
});
