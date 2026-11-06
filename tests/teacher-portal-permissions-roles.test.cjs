'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('Staff portal has staff name editing, clear per-staff permissions, and left-side navigation', () => {
  for (const file of ['teacher-access.html', 'docs/teacher-access.html']) {
    const html = read(file);
    // 1. Staff Name in invite form
    assert.match(html, /id="inviteName"/, `${file} must include inviteName field`);

    // 2. Clear permissions column in staff table
    assert.match(html, /<th>(?:Permissions|Access|Assigned)/i, `${file} must include a Permissions/Access column in staff table`);

    // 3. Left-side navigation structure
    assert.match(html, /portal-nav|sidebar-nav|left-nav/i, `${file} must provide left-side navigation for portal functions`);

    // 4. Role-based module visibility section
    assert.match(html, /id="rolePermissions"|id="moduleVisibility"|class="role-matrix"/, `${file} must include role module visibility configuration`);
  }

  for (const file of ['teacher-access.js', 'docs/teacher-access.js']) {
    const js = read(file);
    // 1. Handles invite with name
    assert.match(js, /inviteName/, `${file} must read and store inviteName`);

    // 2. Renders per-staff permissions and assigned classes in staff table
    assert.match(js, /renderStaffPermissions|getStaffPermissionsSummary/, `${file} must summarize staff permissions in the table`);

    // 3. Allows inline staff name editing/updating
    assert.match(js, /updateStaffName|editStaffName|saveStaffName/, `${file} must support editing staff name`);

    // 4. Module visibility configuration & enforcement ("kisko kya dikhana hai")
    assert.match(js, /isTabVisibleForRole|rolePermissions/, `${file} must support configurable module visibility`);

    assert.doesNotThrow(() => new Function(js), `${file} must have valid JavaScript syntax`);
  }
});
