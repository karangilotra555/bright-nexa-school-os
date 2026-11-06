// Rebuild the recovered JSX without changing dependencies, CSS or entry points.
// esbuild is pinned; install/run through npm exec rather than mutating package.json.
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const target='assets/index-brightnexa-v2.js';
const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',[
  'exec','--yes','--package=esbuild@0.25.12','--','esbuild',
  'app-extracted/src/BrightNexaApp.jsx','--format=esm',
  '--jsx-factory=w.createElement','--jsx-fragment=w.Fragment',
  '--target=es2022','--outfile='+target,
],{cwd:root,stdio:'inherit',shell:process.platform==='win32'});
if(result.error)throw result.error;
if(result.status!==0)process.exit(result.status||1);
const bundle=fs.readFileSync(path.join(root,target));
for(const mirror of ['docs','app-extracted/dist'])fs.writeFileSync(path.join(root,mirror,target),bundle);
const revision=crypto.createHash('sha256').update(bundle).digest('hex');
for(const mirror of ['','docs','app-extracted/dist']){
  const file=path.join(root,mirror,'sw.js');
  const before=fs.readFileSync(file,'utf8');
  let after=before.replace(/(url:"assets\/index-brightnexa-v2\.js",revision:)(?:null|"[^"]*")/,'$1"'+revision+'"');
  if(after===before&&!before.includes('revision:"'+revision+'"'))throw Error('Missing precache entry: '+file);
  const assets=['index.html','school-workspace-cloud.js?v=20261106','school-workspace-controller.js?v=20261106','school-workspace-persistence.js?v=20261106'];
  for(const url of assets){
    const assetPath=path.join(root,mirror,url.split('?')[0]);
    // Git stores these text assets with LF; hash the bytes deployed by CI too.
    const bytes=Buffer.from(fs.readFileSync(assetPath,'utf8').replace(/\r\n/g,'\n'));
    fs.writeFileSync(assetPath,bytes);
    const hash=crypto.createHash('sha256').update(bytes).digest('hex');
    const entry='{"url":'+JSON.stringify(url)+',"revision":'+JSON.stringify(hash)+'}';
    const escaped=JSON.stringify(url).replace(/[.*+?^${}()|[\]\\]/g,character=>'\\'+character);
    const pattern=new RegExp('\\{(?:"url"|url):'+escaped+',(?:"revision"|revision):(?:null|"[^"]*")\\},?', 'g');
    after=after.replace(pattern,'').replace('e.precacheAndRoute([','e.precacheAndRoute(['+entry+',');
  }
  fs.writeFileSync(file,after);
}
console.log('Source rebuilt; three bundle copies synchronized; precache revision updated.');
