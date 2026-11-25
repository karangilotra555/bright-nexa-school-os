'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('TDD RED: Super Admin edge service enforces operator identity and exposes code/entitlement actions', async () => {
  const { createService } = await import('../supabase/functions/school-platform-admin/service.mjs');
  const calls = [];
  const makeHandler = ({ operatorEmails = 'operator@brightnexa.in', user = { id: 'op-1', email: 'operator@brightnexa.in', email_confirmed_at: '2026-11-25T00:00:00Z' }, authOk = true } = {}) =>
    createService({
      url: 'https://fixture.supabase.co',
      serviceKey: 'service-role-secret',
      anonKey: 'anon-key',
      operatorEmails,
      fetcher: async (url, opts = {}) => {
        const pathname = new URL(url).pathname;
        const body = opts.body ? JSON.parse(opts.body) : null;
        calls.push({ pathname, body, headers: opts.headers });
        if (pathname.endsWith('/auth/v1/user')) {
          return authOk ? Response.json(user) : new Response(JSON.stringify({ message: 'bad jwt' }), { status: 401 });
        }
        if (pathname.endsWith('/rest/v1/rpc/bn_list_school_activations')) {
          return Response.json([{ code_digest_prefix: 'abcdef123456', owner_email: 'owner@school.test', status: 'active' }]);
        }
        if (pathname.endsWith('/rest/v1/rpc/bn_issue_school_activation')) {
          assert.equal(body.p_owner_email, 'owner@school.test');
          return Response.json('a'.repeat(64));
        }
        if (pathname.endsWith('/rest/v1/rpc/bn_revoke_school_activation_by_prefix')) {
          return Response.json(true);
        }
        if (pathname.endsWith('/rest/v1/rpc/bn_list_school_entitlements')) {
          return Response.json([{ institution_id: '11111111-1111-4111-8111-111111111111', name: 'Demo', effective_status: 'expired', days_remaining: 0, milestones_sent: [7, 3, 1] }]);
        }
        if (pathname.endsWith('/rest/v1/rpc/bn_assign_school_entitlement')) return Response.json(null);
        if (pathname.endsWith('/rest/v1/rpc/bn_renew_school_entitlement')) return Response.json(null);
        if (pathname.endsWith('/rest/v1/rpc/bn_list_platform_audit')) return Response.json([{ event_type: 'activation_issued', owner_email: 'owner@school.test', code_digest_prefix: 'abcdef123456' }]);
        throw Error('Unexpected endpoint: ' + pathname);
      }
    });

  // Unauthenticated -> 401
  const h = makeHandler();
  assert.equal((await h(new Request('https://fixture.supabase.co/functions/v1/school-platform-admin/session'))).status, 401);

  // Disallowed origin -> 403
  assert.equal((await h(new Request('https://fixture.supabase.co/functions/v1/school-platform-admin/session', {
    headers: { Origin: 'https://evil.example', Authorization: 'Bearer jwt' }
  }))).status, 403);

  // Unconfigured operator allowlist -> 503 fail-closed
  const unconfigured = makeHandler({ operatorEmails: '' });
  assert.equal((await unconfigured(new Request('https://fixture.supabase.co/functions/v1/school-platform-admin/session', {
    headers: { Authorization: 'Bearer jwt' }
  }))).status, 503);

  // Regular school owner -> 403 denied
  const nonOperator = makeHandler({ user: { id: 'owner-1', email: 'schoolowner@gmail.com', email_confirmed_at: '2026-11-25T00:00:00Z' } });
  assert.equal((await nonOperator(new Request('https://fixture.supabase.co/functions/v1/school-platform-admin/session', {
    headers: { Authorization: 'Bearer jwt' }
  }))).status, 403);

  // Unconfirmed operator mailbox -> 403 denied
  const unconfirmed = makeHandler({ user: { id: 'op-1', email: 'operator@brightnexa.in', email_confirmed_at: null } });
  assert.equal((await unconfirmed(new Request('https://fixture.supabase.co/functions/v1/school-platform-admin/session', {
    headers: { Authorization: 'Bearer jwt' }
  }))).status, 403);

  // Verified operator succeeds across full lifecycle
  const authed = { Authorization: 'Bearer op-jwt' };
  const sess = await h(new Request('https://fixture.supabase.co/functions/v1/school-platform-admin/session', { headers: authed }));
  assert.equal(sess.status, 200);
  assert.equal((await sess.json()).operator, 'operator@brightnexa.in');

  const issued = await h(new Request('https://fixture.supabase.co/functions/v1/school-platform-admin/activations', {
    method: 'POST', headers: authed, body: JSON.stringify({ ownerEmail: 'owner@school.test' })
  }));
  assert.equal(issued.status, 200);
  assert.equal((await issued.json()).code, 'a'.repeat(64));

  const revoked = await h(new Request('https://fixture.supabase.co/functions/v1/school-platform-admin/activations/revoke', {
    method: 'POST', headers: authed, body: JSON.stringify({ codePrefix: 'abcdef123456', ownerEmail: 'owner@school.test' })
  }));
  assert.equal(revoked.status, 200);
  assert.equal((await revoked.json()).revoked, true);

  const renewed = await h(new Request('https://fixture.supabase.co/functions/v1/school-platform-admin/entitlements/renew', {
    method: 'POST', headers: authed, body: JSON.stringify({ institutionId: '11111111-1111-4111-8111-111111111111', days: 30 })
  }));
  assert.equal(renewed.status, 200);
  assert.equal((await renewed.json()).renewed, true);
});

test('TDD RED: Super Admin UI is mirrored, online-only, secret-free, and manages codes and renewals', async () => {
  for (const file of ['platform-admin.html', 'platform-admin.js']) {
    const base = read(file);
    assert.equal(base, read('docs/' + file), 'docs mirror mismatch for ' + file);
    assert.equal(base, read('app-extracted/dist/' + file), 'dist mirror mismatch for ' + file);
  }
  const html = read('platform-admin.html');
  const js = read('platform-admin.js');
  assert.match(html, /Content-Security-Policy/i);
  assert.doesNotMatch(js, /SUPABASE_SERVICE_ROLE_KEY|sb_secret_|localStorage|@brightnexa\.in/);
  assert.match(js, /sessionStorage/);
  for (const swPath of ['sw.js', 'docs/sw.js', 'app-extracted/dist/sw.js']) {
    assert.match(read(swPath), /platform-admin\\\.html/);
  }

  const dom = new JSDOM(html, { url: 'https://bright-nexa-school-os.onrender.com/platform-admin.html', runScripts: 'outside-only' });
  const { window } = dom;
  try {
    const requests = [];
    window.fetch = async (url, opts = {}) => {
      const p = new URL(url).pathname;
      const body = opts.body ? JSON.parse(opts.body) : null;
      requests.push({ p, method: opts.method || 'GET', body });
      if (p.endsWith('/auth/v1/token')) return new Response(JSON.stringify({ access_token: 'op-jwt', refresh_token: 'rt', expires_in: 3600 }), { status: 200 });
      if (p.endsWith('/school-platform-admin/session')) return new Response(JSON.stringify({ verified: true, operator: 'operator@brightnexa.in' }), { status: 200 });
      if (p.endsWith('/school-platform-admin/activations') && (!opts.method || opts.method === 'GET')) {
        return new Response(JSON.stringify({ rows: [{ code_digest_prefix: 'abcdef123456', owner_email: 'owner@school.test', status: 'active', issued_at: '2026-11-26T00:00:00Z', expires_at: '2026-12-03T00:00:00Z', school_name: null }] }), { status: 200 });
      }
      if (p.endsWith('/school-platform-admin/activations') && opts.method === 'POST') {
        return new Response(JSON.stringify({ code: 'f'.repeat(64), ownerEmail: body.ownerEmail }), { status: 200 });
      }
      if (p.endsWith('/school-platform-admin/activations/revoke')) return new Response(JSON.stringify({ revoked: true }), { status: 200 });
      if (p.endsWith('/school-platform-admin/entitlements')) {
        return new Response(JSON.stringify({ rows: [{ institution_id: '11111111-1111-4111-8111-111111111111', name: 'Haridwar School', effective_status: 'expired', plan: 'trial', ends_at: '2026-11-25T00:00:00Z', days_remaining: 0, milestones_sent: [7, 3, 1] }] }), { status: 200 });
      }
      if (p.endsWith('/school-platform-admin/entitlements/renew')) return new Response(JSON.stringify({ renewed: true }), { status: 200 });
      if (p.endsWith('/school-platform-admin/audit')) return new Response(JSON.stringify({ rows: [{ event_type: 'activation_issued', owner_email: 'owner@school.test', code_digest_prefix: 'abcdef123456', created_at: '2026-11-26T00:00:00Z' }] }), { status: 200 });
      return new Response(JSON.stringify({ error: 'unexpected ' + p }), { status: 404 });
    };
    window.confirm = () => true;
    window.eval(js);
    const doc = window.document;
    doc.getElementById('opEmail').value = 'operator@brightnexa.in';
    doc.getElementById('opPassword').value = 'strong-operator-pass';
    doc.getElementById('opLoginForm').dispatchEvent(new window.Event('submit', { cancelable: true }));
    await new Promise(r => setTimeout(r, 80));
    assert.equal(doc.getElementById('opWorkspace').hidden, false);
    assert.match(doc.getElementById('opSchoolsBody').textContent, /Haridwar School/);
    doc.getElementById('issueOwnerEmail').value = 'newowner@school.test';
    doc.getElementById('issueCodeForm').dispatchEvent(new window.Event('submit', { cancelable: true }));
    await new Promise(r => setTimeout(r, 80));
    assert.equal(doc.getElementById('issuedCodeValue').value, 'f'.repeat(64));
  } finally {
    window.close();
  }
});
