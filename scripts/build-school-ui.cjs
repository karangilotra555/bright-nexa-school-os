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
],{cwd:root,stdio:'inherit',shell:false});
if(result.error)throw result.error;
if(result.status!==0)process.exit(result.status||1);
const bundle=fs.readFileSync(path.join(root,target));
for(const mirror of ['docs','app-extracted/dist'])fs.writeFileSync(path.join(root,mirror,target),bundle);
const revision=crypto.createHash('sha256').update(bundle).digest('hex');
for(const mirror of ['','docs','app-extracted/dist']){
  const file=path.join(root,mirror,'sw.js');
  const before=fs.readFileSync(file,'utf8');
  const after=before.replace(/(url:"assets\/index-brightnexa-v2\.js",revision:)(?:null|"[a-f0-9]+")/,'$1"'+revision+'"');
  if(after===before&&!before.includes('revision:"'+revision+'"'))throw Error('Missing precache entry: '+file);
  fs.writeFileSync(file,after);
}
console.log('Source rebuilt; three bundle copies synchronized; precache revision updated.');
