// Rebuild the recovered JSX without changing dependencies, CSS or entry points.
// esbuild is pinned; install/run through npm exec rather than mutating package.json.
const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
require('./build-private-cache.cjs');
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
for(const name of ['teacher-ai-cloud.js','teacher-ai-form-bridge.js']){
  const content=fs.readFileSync(path.join(root,name),'utf8').replace(/\r\n/g,'\n');
  for(const mirror of ['','docs','app-extracted/dist'])fs.writeFileSync(path.join(root,mirror,name),content);
}
require('./refresh-precache.cjs');
console.log('Source rebuilt; bundle mirrors and precache synchronized.');
