'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../app-extracted/src/BrightNexaApp.jsx'),'utf8');
const start=source.indexOf('async function bnInviteTeacherAppAccount(');
const end=source.indexOf('function _Component10(', start);
assert.ok(start>=0 && end>start, 'Faculty account invitation function must exist');
const isolated=source.slice(start,end);
const goodSession={
  'bn_school_staff_session_v1':JSON.stringify({access_token:'owner-token',expires_at:Math.floor(Date.now()/1000)+900}),
  'bright-nexa-school-os:session:v2':JSON.stringify({cloudVerified:true,institutionId:'school-id'}),
  'bn_school_staff_selected_school_v1':'school-id'
};
function harness({storage=goodSession,response={ok:true,role:'teacher',email:'mkbmony@gmail.com'},status=201}={}){
  const calls=[];
  const context={
    sessionStorage:{getItem:(key)=>storage[key]??null},
    fetch:async(...args)=>{calls.push(args);return {ok:status>=200&&status<300,json:async()=>response}},
    Date,Error,JSON,String,Number
  };
  vm.runInNewContext(isolated+'\nthis.invite=bnInviteTeacherAppAccount;',context);
  return {invite:context.invite,calls};
}
test('faculty profile shows explicit invitation button; no automatic sending',()=>{
 assert.ok(source.includes('Create Teacher App Access / Send Invitation'));
 assert.ok(source.includes('onClick={inviteTeacher}'));
 assert.ok(!source.includes('await bnInviteTeacherAppAccount(e);\n    }'), 'invitation must be triggered from click handler with feedback');
});
test('invitation only uses authenticated school admin and teacher role',async()=>{
 const h=harness();const r=await h.invite({email:'MKBMONY@GMAIL.COM'});
 assert.equal(r.email,'mkbmony@gmail.com');
 assert.equal(r.status,'invited');
 assert.equal(h.calls.length,1);
 const [url,request]=h.calls[0];
 assert.ok(url.endsWith('/functions/v1/school-invite-staff'));
 assert.equal(request.method,'POST');
 assert.equal(request.headers.Authorization,'Bearer owner-token');
 assert.deepEqual(JSON.parse(request.body),{email:'mkbmony@gmail.com',role:'teacher'});
});
test('does not invite when not in cloud-verified school or missing email',async()=>{
 const h=harness({storage:{}});
 await assert.rejects(h.invite({email:'mkbmony@gmail.com'}),/verified School Admin/);
 assert.equal(h.calls.length,0);
 await assert.rejects(h.invite({email:''}),/valid teacher email/);
 assert.equal(h.calls.length,0);
});
test('does not report success on edge function or membership failure',async()=>{
 const h=harness({status:422,response:{error:'Invitation not sent. Verify email settings.'}});
 await assert.rejects(h.invite({email:'mkbmony@gmail.com'}),/Invitation not sent/);
});
test('does not confuse request acceptance with email delivery',()=>{
 assert.ok(source.includes('Delivery and activation are not yet confirmed.'));
});
