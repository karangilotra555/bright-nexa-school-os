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
