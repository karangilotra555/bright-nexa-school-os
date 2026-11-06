const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),path=require('node:path');
test('offline shell caches the exact cloud scripts with current content hashes',()=>{
 const root=path.resolve(__dirname,'..');
 for(const mirror of ['','docs','app-extracted/dist']){
  const base=path.join(root,mirror),html=fs.readFileSync(path.join(base,'index.html'),'utf8');let entries;
  const noop=()=>{};const define=(_deps,fn)=>fn({precacheAndRoute:rows=>entries=rows,cleanupOutdatedCaches:noop,registerRoute:noop,NavigationRoute:function(){},createHandlerBoundToURL:noop});
  vm.runInNewContext(fs.readFileSync(path.join(base,'sw.js'),'utf8'),{self:{addEventListener:noop,define},define});
  const urls=['index.html',...Array.from(html.matchAll(/src="\.\/(school-workspace-[^"]+|teacher-generator-engine\.js\?v=[^"]+|teacher-drafts-cloud\.js\?v=[^"]+)"/g),m=>m[1])];assert.equal(urls.length,6);
  for(const url of urls){const matches=entries.filter(e=>e.url===url);assert.equal(matches.length,1,url);assert.equal(matches[0].revision,crypto.createHash('sha256').update(fs.readFileSync(path.join(base,url.split('?')[0]))).digest('hex'));}
 }
});
