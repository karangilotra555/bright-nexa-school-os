'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const memory=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)}};
function workspace(env){
 const source=fs.readFileSync('docs/assets/workspace-storage.js','utf8').replace(/export /g,'');
 const ctx=vm.createContext({window:env});vm.runInContext(source,ctx);
 return vm.runInContext('({workspaceStorage,beginDemoWorkspace,endDemoWorkspace,workspaceDatabaseName,isDemoWorkspace})',ctx);
}
test('demo writes cannot replace or read saved institution records; reload stays isolated',()=>{
 const env={localStorage:memory(),sessionStorage:memory()};
 env.localStorage.setItem('students','REAL');env.localStorage.setItem('accounts','OWNER');
 let w=workspace(env);assert.equal(w.workspaceStorage.getItem('students'),'REAL');
 w.beginDemoWorkspace();assert.equal(w.workspaceStorage.getItem('students'),null);
 w.workspaceStorage.setItem('students','SAMPLE');w.workspaceStorage.setItem('accounts','DEMO');
 assert.equal(env.localStorage.getItem('students'),'REAL');assert.equal(env.localStorage.getItem('accounts'),'OWNER');
 assert.equal(w.workspaceDatabaseName('school'),'school-demo');
 w=workspace(env);assert.equal(w.workspaceStorage.getItem('students'),'SAMPLE');
 w.endDemoWorkspace();assert.equal(w.workspaceStorage.getItem('students'),'REAL');assert.equal(w.workspaceDatabaseName('school'),'school');
});
test('a legacy demo session starts in isolated storage without reading the old real snapshot',()=>{
 const env={localStorage:memory(),sessionStorage:memory()};
 env.localStorage.setItem('snapshot','REAL');env.sessionStorage.setItem('bright-nexa-school-os:session:v2',JSON.stringify({demo:true}));
 const w=workspace(env);assert.equal(w.workspaceStorage.getItem('snapshot'),null);assert.equal(w.isDemoWorkspace(),true);
});
test('a normal session preserves original storage and database names',()=>{
 const env={localStorage:memory(),sessionStorage:memory()};const w=workspace(env);
 w.workspaceStorage.setItem('students','NEW');assert.equal(env.localStorage.getItem('students'),'NEW');assert.equal(w.workspaceDatabaseName('school'),'school');
});
test('print-page storage follows demo isolation and never reads the institution snapshot',()=>{
 const env={localStorage:memory(),sessionStorage:memory()};
 env.localStorage.setItem('bright-nexa-school-os:snapshot:v1','PRIVATE');
 env.localStorage.setItem('bright-nexa-demo:bright-nexa-school-os:snapshot:v1','SAMPLE');
 env.sessionStorage.setItem('bright-nexa-school-os:demo-mode:v1','true');
 vm.runInNewContext(fs.readFileSync('docs/assets/workspace-storage-classic.js','utf8'),{window:env});
 assert.equal(env.BrightNexaWorkspace.workspaceStorage.getItem('bright-nexa-school-os:snapshot:v1'),'SAMPLE');
 for(const name of ['id-card-a4.html','marksheet-a4.html','marksheet.html','tc-certificate-a4.html']){
  const html=fs.readFileSync('docs/'+name,'utf8');
  assert.match(html,/workspace-storage-classic\.js/);
  assert.doesNotMatch(html,/\blocalStorage\.getItem\(/);
 }
});
test('deployed bundle switches mode before demo writes and scopes IndexedDB',()=>{
 const source=fs.readFileSync('docs/assets/index-brightnexa-v2.js','utf8');
 const handler=source.slice(source.indexOf('Ge = async () =>'),source.indexOf('Ke = async (e) =>'));
 assert.ok(handler.indexOf('beginDemoWorkspace()')>=0);
 assert.ok(handler.indexOf('beginDemoWorkspace()')<handler.indexOf('Tn(yn)'));
 assert.match(source,/indexedDB\.open\(workspaceDatabaseName\(wt\), Et\)/);
 assert.doesNotMatch(source,/\blocalStorage\.(getItem|setItem|removeItem)\(/);
 assert.equal(source,fs.readFileSync('assets/index-brightnexa-v2.js','utf8'));
});
