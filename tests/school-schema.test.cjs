const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = n => fs.readFileSync(path.join(__dirname,'../migrations/postgres',n),'utf8');

test('school foundation schema is tenant scoped and RLS is fail-closed', () => {
  const sql = read('001_school_foundation.sql');
  for (const table of ['institutions','school_users','school_classes','school_students','school_audit_events']) {
    assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS '+table+'\\b'));
    assert.match(sql,new RegExp('ALTER TABLE '+table+' ENABLE ROW LEVEL SECURITY'));
    assert.match(sql,new RegExp('ALTER TABLE '+table+' FORCE ROW LEVEL SECURITY'));
  }
  assert.match(sql,/UNIQUE \(institution_id, admission_number\)/);
  assert.match(sql,/FOREIGN KEY \(class_id,institution_id\)/);
});

test('school membership policies require auth identity and tenant membership', () => {
  const sql = read('002_tenant_access_policies.sql');
  assert.match(sql,/u\.auth_user_id = \(SELECT auth\.uid\(\)\)/);
  assert.match(sql,/u\.institution_id = target_institution/);
  assert.match(sql,/u\.status = 'active'/);
  assert.match(sql,/SECURITY DEFINER/);
  assert.match(sql,/SET search_path = ''/);
  for (const table of ['institutions','school_users','school_classes','school_students']) {
    assert.match(sql,new RegExp('ON '+table+' FOR SELECT TO authenticated'));
  }
  assert.doesNotMatch(sql,/CREATE POLICY[^;]*ON school_audit_events/i);
  assert.doesNotMatch(sql,/TO anon\b/);
  assert.match(sql,/DROP COLUMN IF EXISTS password_hash/);
});

test('browser clients cannot directly write membership, institution or audit tables', () => {
  const sql = read('002_tenant_access_policies.sql');
  assert.doesNotMatch(sql,/GRANT (?:INSERT|UPDATE|DELETE)[^;]* ON (?:institutions|school_users|school_audit_events)/i);
});
