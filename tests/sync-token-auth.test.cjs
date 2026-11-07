'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

test('privileged sync token issuance requires verified administrator credentials', async () => {
  // Run against an isolated temporary copy; never touch an existing school DB.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bn-token-auth-'));
  const files = [
    'server.js', 'parent-portal.cjs',
    'scripts/crypto-authority.cjs', 'src/smart-tools/teacher-ai.cjs'
  ];
  let child;
  try {
    for (const rel of files) {
      const dest = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(__dirname, '..', rel), dest);
    }
    const listener = net.createServer();
    await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve));
    const port = listener.address().port;
    await new Promise(resolve => listener.close(resolve));
    const key = 'ci-test-admin-key-not-a-real-secret';
    child = spawn(process.execPath, ['server.js'], {
      cwd: tmp, env: {
        ...process.env, PORT: String(port), ADMIN_API_KEY: key,
        SESSION_SECRET: 'ci-test-session-secret-not-a-real-secret'
      }, stdio: ['ignore', 'pipe', 'pipe']
    });
    let logs = '';
    child.stderr.on('data', chunk => { logs += String(chunk).slice(0, 500); });
    const url = 'http://127.0.0.1:' + port;
    let ready = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      if (child.exitCode !== null) break;
      try {
        const res = await fetch(url + '/api/health', { signal: AbortSignal.timeout(500) });
        if (res.ok) { ready = true; break; }
      } catch (_) {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(ready, 'Test API could not start: ' + logs.slice(-600));
    const post = (body, headers = {}) => fetch(url + '/api/sync/token', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body)
    });
    const denied = await post({ role: 'OWNER' });
    assert.equal(denied.status, 401, 'Unauthenticated callers must not mint admin tokens');
    assert.equal((await denied.json()).token, undefined);
    const invalid = await post({ role: 'OWNER' }, { 'X-Admin-Key': 'incorrect' });
    assert.equal(invalid.status, 401);
    const authorized = await post({ role: 'OWNER' }, { 'X-Admin-Key': key });
    assert.equal(authorized.status, 200);
    const token = (await authorized.json()).token;
    assert.ok(typeof token === 'string' && token.split('.').length === 3);
    const renewed = await post({ role: 'ADMIN' }, { Authorization: 'Bearer ' + token });
    assert.equal(renewed.status, 200, 'Existing verified admin session may renew');
    assert.equal((await post({ role: 'STUDENT' }, { 'X-Admin-Key': key })).status, 403);
  } finally {
    if (child && child.exitCode === null) child.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
