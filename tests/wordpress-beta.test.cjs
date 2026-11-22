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
