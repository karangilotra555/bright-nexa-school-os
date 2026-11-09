'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');

function portal(url='https://bright-nexa-school-os.onrender.com/teacher-access.html?fromLocal=1'){
  const dom=new JSDOM(read('teacher-access.html'),{url,runScripts:'outside-only'});
  const {window}=dom;
  window.BNHomeworkFiles={create:()=>({})};
  window.BNStudentPhotos={create:()=>({validate:()=>{},upload:async()=>{},signedUrl:async()=>null})};
  window.BNSchoolLocalHandoff={read:()=>({name:'Hps',email:'owner@school.test',operations:{}})};
  window.localStorage.setItem('bright-nexa-school-os:snapshot:v1','{"institution":{"name":"Hps"}}');
  window.eval(read('teacher-access.js'));
  return dom;
}
const visible=element=>!element.classList.contains('hidden');
const byId=(window,id)=>window.document.getElementById(id);

test('entry from a saved local school opens one clean login form, without repeating draft warning',()=>{
  const dom=portal();const {window}=dom;
  assert.equal(visible(byId(window,'loginForm')),true);
  for(const id of ['ownerSignupForm','forgotPasswordForm','activation','createFirstSchoolPanel','localSchoolNotice']){
    assert.equal(visible(byId(window,id)),false,id+' must not be visible');
  }
  assert.equal(byId(window,'loginForm').querySelectorAll('input[type="password"]').length,1);
  assert.equal(byId(window,'authHeading').textContent,'Welcome back');
  assert.equal(window.localStorage.getItem('bright-nexa-school-os:snapshot:v1'),'{"institution":{"name":"Hps"}}');
  dom.window.close();
});

test('register and forgot password are separate views, both return to single sign-in',()=>{
  const dom=portal();const {window}=dom;
  const click=id=>byId(window,id).click();
  click('showOwnerSignup');
  assert.equal(visible(byId(window,'loginForm')),false);
  assert.equal(visible(byId(window,'ownerSignupForm')),true);
  assert.equal(visible(byId(window,'forgotPasswordForm')),false);
  assert.equal(visible(byId(window,'localSchoolNotice')),false);
  assert.equal(byId(window,'authHeading').textContent,'Create your account');
  click('returnToLoginFromSignup');
  assert.equal(visible(byId(window,'loginForm')),true);
  assert.equal(visible(byId(window,'ownerSignupForm')),false);
  click('forgotPasswordLink');
  assert.equal(visible(byId(window,'loginForm')),false);
  assert.equal(visible(byId(window,'forgotPasswordForm')),true);
  assert.equal(visible(byId(window,'ownerSignupForm')),false);
  click('returnToLoginFromForgot');
  assert.equal(visible(byId(window,'loginForm')),true);
  assert.equal(visible(byId(window,'forgotPasswordForm')),false);
  dom.window.close();
});

test('production and published docs share the same login markup and script',()=>{
  assert.equal(read('teacher-access.html'),read('docs/teacher-access.html'));
  assert.equal(read('teacher-access.js'),read('docs/teacher-access.js'));
  assert.ok(read('teacher-access.html').indexOf('id="localSchoolNotice"')>read('teacher-access.html').indexOf('id="createFirstSchoolPanel"'));
  assert.doesNotMatch(read('teacher-access.js'),/display\('ownerSignupForm',true\);\s*}\s*\/\/ Only Supabase-issued/);
});
