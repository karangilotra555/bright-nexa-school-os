const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {spawnSync}=require('node:child_process');
test('deploy script has no embedded deploy credential and fails closed without configuration',()=>{
  const source=fs.readFileSync(require.resolve('../scripts/deploy-render.cjs'),'utf8');
  assert.doesNotMatch(source,/https:\/\/api\.render\.com\/deploy\/[^\s'"`]+\?key=/);
  const result=spawnSync(process.execPath,['scripts/deploy-render.cjs'],{cwd:require('node:path').resolve(__dirname,'..'),env:{...process.env,RENDER_DEPLOY_HOOK_URL:''},encoding:'utf8'});
  assert.equal(result.status,1);
  assert.match(result.stderr,/RENDER_DEPLOY_HOOK_URL/);
});
