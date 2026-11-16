const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');

test('deploy script has no embedded deploy credential and fails closed without configuration',()=>{
  const scriptPath=path.resolve(__dirname,'../scripts/deploy-render.cjs');
  if(!fs.existsSync(scriptPath))return;
  const source=fs.readFileSync(scriptPath,'utf8');
  assert.doesNotMatch(source,/https:\/\/api\.render\.com\/deploy\/[^\s'"`]+\?key=/);
  const result=spawnSync(process.execPath,[scriptPath],{cwd:path.resolve(__dirname,'..'),env:{...process.env,RENDER_DEPLOY_HOOK_URL:''},encoding:'utf8'});
  assert.equal(result.status,1);
  assert.match(result.stderr,/RENDER_DEPLOY_HOOK_URL/);
});
