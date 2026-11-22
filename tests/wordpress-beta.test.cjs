'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { PGlite } = require('@electric-sql/pglite');

const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

test('WordPress enquiry keys are write-only, tenant-scoped, revocable and deduplicate retries', async () => {
  const db = new PGlite();
  const [school, other, owner, teacher] = [1, 2, 3, 4].map(id);
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema school_private;
      create table public.institutions(id uuid primary key, status text not null);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function school_private.has_role(s uuid, roles text[]) returns boolean language sql stable as
        $$ select s = '${school}' and auth.uid() = '${owner}' and 'school_admin' = any(roles) $$;
      insert into public.institutions values ('${school}', 'trial'), ('${other}', 'active');
    `);
    const file = fs.readdirSync(path.join(__dirname, '../supabase/migrations'))
      .find(name => name.endsWith('_wordpress_admission_enquiries.sql'));
    assert.ok(file, 'migration must exist');
    await db.exec(read('supabase/migrations/' + file));
    const as = async (role, user = '') => {
      await db.exec('reset role; set role ' + role);
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
    };
    const rpc = async (name, ...params) => {
      const call = 'public.bn_wordpress_' + name + '(' + params.map((_, i) => '$' + (i + 1)).join(',') + ')';
      if (name === 'list_enquiries') return (await db.query('select * from ' + call, params)).rows;
      return (await db.query('select ' + call + ' result', params)).rows[0].result;
    };
    const enquiry = ['Sample Parent', 'parent@example.com', '+44 20 1234 5678', 'Year 7'];

    await as('authenticated', teacher);
    await assert.rejects(rpc('rotate_key', school), /school admin/i);
    await as('authenticated', owner);
    await assert.rejects(rpc('list_enquiries', other), /school admin/i);
    const key = await rpc('rotate_key', school);
    assert.match(key, /^[a-f0-9]{64}$/);

    await as('anon');
    await assert.rejects(rpc('list_enquiries', school), /permission denied/i);
    await assert.rejects(rpc('submit_enquiry', '0'.repeat(64), ...enquiry), /invalid connection/i);
    await assert.rejects(rpc('submit_enquiry', key, 'Sample', 'bad email', '', ''), /valid enquiry/i);
    const ref = await rpc('submit_enquiry', key, ...enquiry);
    assert.equal(await rpc('submit_enquiry', key, ...enquiry), ref);

    await as('authenticated', owner);
    assert.deepEqual((await rpc('list_enquiries', school)).map(row => row.name), ['Sample Parent']);
    await assert.rejects(rpc('mark_reviewed', school, other), /Enquiry unavailable/);
    await rpc('mark_reviewed', school, ref);
    assert.deepEqual(await rpc('list_enquiries', school), []);
    assert.deepEqual((await rpc('list_enquiries', school, true)).map(row => row.id), [ref]);
    await rpc('revoke_key', school);
    await as('anon');
    await assert.rejects(rpc('submit_enquiry', key, ...enquiry), /invalid connection/i);
  } finally {
    await db.close();
  }
});

test('WordPress admissions UI handles empty states, guarded dates and action lifecycle', async () => {
  const { JSDOM } = require('jsdom');
  const admissions = require('../school-wordpress-admissions.js');
  const dom = new JSDOM(`
    <!doctype html>
    <div id="panel" hidden>
      <button id="open"></button>
      <button id="close"></button>
      <button id="rotate"></button>
      <button id="revoke"></button>
      <button id="refresh"></button>
      <select id="inbox">
        <option value="new">New</option>
        <option value="reviewed">Reviewed</option>
      </select>
      <input id="key" hidden />
      <span id="status"></span>
      <table><tbody id="rows"></tbody></table>
    </div>
  `);
  const doc = dom.window.document;
  const elements = {
    panel: doc.getElementById('panel'),
    open: doc.getElementById('open'),
    close: doc.getElementById('close'),
    rotate: doc.getElementById('rotate'),
    revoke: doc.getElementById('revoke'),
    refresh: doc.getElementById('refresh'),
    inbox: doc.getElementById('inbox'),
    key: doc.getElementById('key'),
    status: doc.getElementById('status'),
    rows: doc.getElementById('rows'),
    getScope: () => ({
      rpc: async (fn, args) => {
        if (fn === 'list_enquiries') {
          if (args.p_reviewed) return [];
          return [
            {
              id: 'enq-1',
              name: 'Aarav Sharma',
              email: 'aarav@example.com',
              phone: '+91 9876543210',
              year_group: 'Class 6',
              submitted_at: '2026-11-20T10:00:00.000Z'
            },
            {
              id: 'enq-2',
              name: 'Priya Patel',
              email: 'priya@example.com',
              phone: '',
              year_group: '',
              submitted_at: null
            },
            {
              id: 'enq-3',
              name: 'Rohan Gupta',
              email: 'rohan@example.com',
              phone: '',
              year_group: '',
              submitted_at: 'invalid-date'
            }
          ];
        }
        if (fn === 'mark_reviewed') return true;
        if (fn === 'rotate_key') return 'a'.repeat(64);
        if (fn === 'revoke_key') return true;
        throw new Error('Unknown RPC: ' + fn);
      },
      current: () => true
    }),
    confirm: () => true
  };

  const ui = admissions.mount(elements);
  assert.ok(ui && typeof ui.reset === 'function');

  // Open panel and load enquiries
  elements.open.click();
  await new Promise(r => setTimeout(r, 60));

  assert.equal(elements.panel.hidden, false);
  assert.equal(elements.rows.rows.length, 3);

  // Check valid date row
  const row1 = elements.rows.rows[0];
  assert.equal(row1.cells[0].textContent, 'Aarav Sharma');
  assert.notEqual(row1.cells[4].textContent, '—');
  assert.notEqual(row1.cells[4].textContent, 'Invalid Date');

  // Check null date row
  const row2 = elements.rows.rows[1];
  assert.equal(row2.cells[0].textContent, 'Priya Patel');
  assert.equal(row2.cells[4].textContent, '—');

  // Check invalid date row
  const row3 = elements.rows.rows[2];
  assert.equal(row3.cells[0].textContent, 'Rohan Gupta');
  assert.equal(row3.cells[4].textContent, '—');

  // Check mark reviewed action
  const markReviewedBtn = row1.cells[5].querySelector('button');
  assert.ok(markReviewedBtn);
  markReviewedBtn.click();
  await new Promise(r => setTimeout(r, 60));

  // Check rotate key
  elements.rotate.click();
  await new Promise(r => setTimeout(r, 60));
  assert.equal(elements.key.value, 'a'.repeat(64));
  assert.equal(elements.key.hidden, false);
  assert.match(elements.status.textContent, /Copy this key/);

  // Check switch inbox to reviewed (returns empty array)
  elements.inbox.value = 'reviewed';
  elements.inbox.dispatchEvent(new dom.window.Event('change'));
  await new Promise(r => setTimeout(r, 60));
  assert.equal(elements.status.textContent, 'No reviewed enquiries.');

  // Check revoke key
  elements.revoke.click();
  await new Promise(r => setTimeout(r, 60));
  assert.equal(elements.key.value, '');
  assert.equal(elements.key.hidden, true);
  assert.equal(elements.status.textContent, 'WordPress disconnected.');

  // Check close reset
  elements.close.click();
  assert.equal(elements.panel.hidden, true);
  assert.equal(elements.rows.rows.length, 0);
});

