'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const { IDBFactory } = require('fake-indexeddb');
const { create } = require('../parents-cloud.js');

test('installed portals keep an encrypted refresh token across launches and isolate teacher and parent logout', async () => {
  const { createStore } = require('../school-mobile-session.js');
  const device = { indexedDB: new IDBFactory(), crypto: webcrypto,
    navigator: { userAgent: 'Android; wv)' }, matchMedia: () => ({ matches: false }) };
  const teacher = createStore('teacher', device);
  const parent = createStore('parent', device);
  await teacher.write('teacher-refresh');
  await parent.write('parent-refresh');
  assert.equal(await createStore('teacher', device).read(), 'teacher-refresh');
  assert.equal(await createStore('parent', device).read(), 'parent-refresh');
  assert.equal(createStore('teacher', { ...device, navigator: { userAgent: 'Android Chrome' } }), null);
  await createStore('teacher', device).clear();
  assert.equal(await teacher.read(), null);
  assert.equal(await parent.read(), 'parent-refresh');
});

test('parents renew a remembered login and use only the current verified student link', async () => {
  let saved = null;
  const store = { async read(){ return saved; }, async write(value){ saved=value; }, async clear(){ saved=null; } };
  const calls = [];
  const fetcher = async (url, options) => {
    const path = new URL(url).pathname;
    calls.push([path, options.body ? JSON.parse(options.body) : null]);
    const initial = { access_token:'first-jwt', refresh_token:'first-refresh', expires_in:3600,
      user:{ id:'guardian', app_metadata:{bn_institution_id:'school',bn_student_id:'child'} } };
    const value = path.endsWith('school-student-login')
      ? { session:initial, links:[{institution_id:'school',student_id:'child'}] }
      : path.endsWith('/token') ? { ...initial, refresh_token:'rotated-refresh' } : null;
    return {ok:true,status:200,text:async()=>JSON.stringify(value)};
  };
  await create(fetcher, store).login('ADM001','secret-password');
  assert.equal(saved,'first-refresh');
  const reopened = create(fetcher,store);
  const restored = await reopened.restore();
  assert.deepEqual(restored.links,[{institution_id:'school',student_id:'child'}]);
  assert.deepEqual(calls[1],['/auth/v1/token',{refresh_token:'first-refresh'}]);
  assert.equal(saved,'rotated-refresh');
  await reopened.logout();
  assert.equal(saved,null);
});

test('Teacher App refreshes a saved token on launch before querying verified teacher membership', async () => {
  const { readFileSync } = require('node:fs');
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(readFileSync('teacher-access.html','utf8'),{
    url:'https://school.example/teacher-access.html',runScripts:'outside-only'
  });
  const { window } = dom;
  try {
    Object.defineProperty(window.navigator,'userAgent',{value:'Android; wv)'});
    window.BNMobileSession = {createStore:()=>({
      async read(){return 'remembered-teacher';},async write(){},async clear(){}
    })};
    window.BNHomeworkFiles={create:()=>({links(){}})};
    const calls=[];
    window.fetch=async(url,options)=>{
      const path=new URL(url).pathname;
      calls.push({path,body:options.body&&JSON.parse(options.body)});
      let json={};
      if(path.endsWith('/token'))json={access_token:'jwt',refresh_token:'rotated',expires_in:3600};
      if(path.endsWith('/user'))json={id:'teacher-auth',app_metadata:{}};
      if(path.endsWith('/school_users'))json=[];
      return {ok:true,status:200,json:async()=>json};
    };
    await window.eval(readFileSync('teacher-access.js','utf8'));
    assert.deepEqual(calls.slice(0,3),[
      {path:'/auth/v1/token',body:{refresh_token:'remembered-teacher'}},
      {path:'/auth/v1/user',body:undefined},
      {path:'/rest/v1/school_users',body:undefined}
    ]);
    assert.equal(window.document.querySelector('#createFirstSchoolPanel').classList.contains('hidden'),true);
  } finally {
    window.close();
  }
});

test('canonical Teacher logout blocks remembered login even while IndexedDB deletion is pending', async () => {
  const { readFileSync } = require('node:fs');
  const { JSDOM, VirtualConsole } = require('jsdom');
  const { createStore } = require('../school-mobile-session.js');
  const dom = new JSDOM(readFileSync('teacher-access.html','utf8'),{
    url:'https://school.example/teacher-access.html',runScripts:'outside-only',virtualConsole:new VirtualConsole()
  });
  const { window } = dom;
  try {
    const device = { indexedDB:new IDBFactory(),crypto:webcrypto,localStorage:window.localStorage,
      navigator:{userAgent:'Android; wv)'},matchMedia:()=>({matches:false}) };
    const saved = createStore('teacher',device);
    await saved.write('remembered-teacher');
    window.BNMobileSession={createStore:()=>saved};
    window.BNHomeworkFiles={create:()=>({links(){}})};
    window.fetch=async()=>{throw Error('Offline');};
    window.history.replaceState(null,'','/teacher-access.html?view=timetable');
    await window.eval(readFileSync('teacher-access.js','utf8'));
    window.eval(readFileSync('school-auth-signout.js','utf8'));
    await window.BNSchoolLogout.signOut();
    assert.equal(await createStore('teacher',device).read(),null);
  } finally {
    window.close();
  }
});

test('a delayed Parent password change cannot restore a session after explicit logout', async () => {
  let saved=null,resolveUpdate;
  const store={async read(){return saved;},async write(v){saved=v;},async clear(){saved=null;}};
  const pending=new Promise(resolve=>{resolveUpdate=resolve;});
  const response=body=>({ok:true,status:200,text:async()=>JSON.stringify(body)});
  const session={access_token:'jwt',refresh_token:'first-refresh',user:{id:'parent'}};
  const api=create(async (url,options)=>{
    if(url.includes('/logout'))return response(null);
    if(JSON.parse(options.body).action==='change-password')return pending;
    return response({session,mustChangePassword:true,links:[]});
  },store);
  await api.login('ADM001','temporary');
  const change=api.changePassword('NewPassword1');
  await new Promise(resolve=>setImmediate(resolve));
  await api.logout();
  resolveUpdate(response({session:{...session,refresh_token:'late-refresh'},links:[{student_id:'child',institution_id:'school'}]}));
  await assert.rejects(change,/log in again/i);
  assert.equal(saved,null);
});

test('the shared Android launcher resumes a remembered teacher and honors an explicit Parent entry', async () => {
  const { createStore, opensTeacherOnLaunch } = require('../school-mobile-session.js');
  const preferences=new Map();
  const device={indexedDB:new IDBFactory(),crypto:webcrypto,navigator:{userAgent:'Android; wv)'},location:{search:''},
    localStorage:{getItem:key=>preferences.get(key)??null,setItem:(key,value)=>preferences.set(key,value),removeItem:key=>preferences.delete(key)}};
  const teacher=createStore('teacher',device),parent=createStore('parent',device);
  await teacher.write('teacher-refresh',true);
  teacher.activate();
  assert.equal(await opensTeacherOnLaunch(device),true);
  assert.equal(await opensTeacherOnLaunch({...device,location:{search:'?school=example'}}),false);
  await parent.write('parent-refresh',true);
  parent.activate();
  assert.equal(await opensTeacherOnLaunch(device),false);
  teacher.activate();
  const clearing=teacher.clear();
  assert.equal(await opensTeacherOnLaunch(device),false);
  await clearing;
});

test('logout from another Parent window cannot be undone by a pending password response', async () => {
  const { createStore } = require('../school-mobile-session.js');
  const preferences=new Map();
  const device={indexedDB:new IDBFactory(),crypto:webcrypto,navigator:{userAgent:'Android; wv)'},
    localStorage:{getItem:k=>preferences.get(k)??null,setItem:(k,v)=>preferences.set(k,v),removeItem:k=>preferences.delete(k)}};
  const store=createStore('parent',device);
  let resolveUpdate,requestStarted;
  const pending=new Promise(resolve=>{resolveUpdate=resolve;});
  const started=new Promise(resolve=>{requestStarted=resolve;});
  const response=body=>({ok:true,status:200,text:async()=>JSON.stringify(body)});
  const session={access_token:'jwt',refresh_token:'old-refresh',user:{id:'parent'}};
  const api=create(async (url,options)=>{
    if(JSON.parse(options.body).action==='change-password'){requestStarted();return pending;}
    return response({session,mustChangePassword:true,links:[]});
  },store);
  await api.login('ADM001','temporary');
  const change=api.changePassword('NewPassword1');
  await started;
  await createStore('parent',device).clear();
  resolveUpdate(response({session:{...session,refresh_token:'late-refresh'},links:[{student_id:'child',institution_id:'school'}]}));
  await assert.rejects(change,/log in again/i);
  assert.equal(await createStore('parent',device).read(),null);
});

test('Parent restore does not reopen a session after another window signs out', async () => {
  const { createStore } = require('../school-mobile-session.js');
  const preferences=new Map();
  const device={indexedDB:new IDBFactory(),crypto:webcrypto,navigator:{userAgent:'Android; wv)'},
    localStorage:{getItem:k=>preferences.get(k)??null,setItem:(k,v)=>preferences.set(k,v),removeItem:k=>preferences.delete(k)}};
  const store=createStore('parent',device);
  await store.write('before-logout',true);
  let respond,requestStarted;
  const started=new Promise(resolve=>{requestStarted=resolve;});
  const pending=new Promise(resolve=>{respond=resolve;});
  const api=create(async()=>{requestStarted();return pending;},store);
  const restore=api.restore();
  await started;
  await createStore('parent',device).clear();
  respond({ok:true,status:200,text:async()=>JSON.stringify({access_token:'jwt', refresh_token:'rotated',
    user:{id:'guardian',app_metadata:{bn_institution_id:'school',bn_student_id:'student'}}})});
  assert.equal(await restore,null);
  assert.equal(await store.read(),null);
});

test('the shared Android launcher resumes Leadership after reopening and clears the route on sign-out',async()=>{
 const {createStore,opensLeadershipOnLaunch}=require('../school-mobile-session.js');
 const preferences=new Map();
 const device={indexedDB:new IDBFactory(),crypto:webcrypto,navigator:{userAgent:'Android; wv)'},location:{search:''},
   localStorage:{getItem:key=>preferences.get(key)??null,setItem:(key,value)=>preferences.set(key,value),removeItem:key=>preferences.delete(key)}};
 const leadership=createStore('leadership',device);
 await leadership.write('leadership-refresh',true);
 leadership.activate();
 assert.equal(await opensLeadershipOnLaunch(device),true);
 assert.equal(await opensLeadershipOnLaunch({...device,location:{search:'?portal=parent'}}),false);
 await leadership.clear();
 assert.equal(await opensLeadershipOnLaunch(device),false);
});
