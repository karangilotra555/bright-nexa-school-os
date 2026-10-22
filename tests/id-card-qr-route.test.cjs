'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const service='https://bright-nexa-school-os-api.onrender.com/student-portal.html';

for(const name of ['id-card-a4.html','docs/id-card-a4.html']){
  test(name+' QR goes to the API-hosted portal from any origin',()=>{
    const html=read(name);
    const start=html.indexOf('const SCHOOL_VERIFICATION_PORTAL =');
    const end=html.indexOf('// Standard ISO/IEC 18004 QRCode Canvas renderer',start);
    assert.ok(start!==-1&&end>start,'Verification URL function should be present');
    const snippet=html.slice(start,end);
    const sandbox={};
    vm.runInNewContext(snippet+'; var url = getVerificationUrl({admissionNumber:"DEMO 01/&"});',sandbox);
    const parsed=new URL(sandbox.url);
    assert.equal(parsed.origin,'https://bright-nexa-school-os-api.onrender.com');
    assert.equal(parsed.pathname,'/student-portal.html');
    assert.equal(parsed.searchParams.get('action'),'verify');
    assert.equal(parsed.searchParams.get('adm'),'DEMO 01/&');
    assert.equal(parsed.searchParams.has('sig'),false,'Never pretend to have server-issued signature');
    assert.ok(html.includes('href="'+service+'"'));
  });
  test(name+' must not claim client-side QR was cryptographically signed',()=>{
    const html=read(name);
    assert.doesNotMatch(html,/DEFAULT_INSTITUTION_KEY|computeStudentHMAC|HMAC SIG:|DIGITALLY VERIFIED STUDENT PASS/);
    assert.match(html,/SERVER SIGNATURE PENDING/);
    assert.match(html,/UNVERIFIED PREVIEW/);
    assert.match(html,/SERVER VERIFICATION REQUIRED/);
  });
}

test('QR destination has an API verification route and server-owned ECDSA verification',()=>{
  const server=read('server.js');
  const portal=read('student-portal.html');
  const client=read('portal.js');
  assert.match(server,/pathname === '\/api\/verify'/);
  assert.match(server,/ca\.verifyStudentSignature\(/);
  assert.match(portal,/src="portal\.js/);
  assert.match(client,/api\('\/api\/verify\?/);
  assert.match(client,/data\.verified === true/);
});
