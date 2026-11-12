'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const createDashboardIntegrity = require('../school-dashboard-integrity.js');

function harness(options = {}) {
  let active = options.active || 'Settings';
  let clicked = 0;
  let cloudStatus = options.cloudStatus || { status: 'synced', problem: '' };
  const attrs = new Map();
  const badge = {
    dataset: {},
    title: 'School cloud status. Click to connect, refresh, or recover a conflict.',
    style: {
      borderColor: '', color: '', background: '',
      removeProperty(name) { this[name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = ''; }
    },
    getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
    setAttribute(name, value) { attrs.set(name, String(value)); },
    removeAttribute(name) { attrs.delete(name); }
  };
  const dashboard = { textContent: 'Dashboard', click() { clicked += 1; active = 'Dashboard'; } };
  const settings = { textContent: 'Settings', click() { active = 'Settings'; } };
  const doc = {
    defaultView: {},
    body: {},
    querySelector(selector) {
      if (selector === '.navigation .nav-item.active') return { textContent: active };
      if (selector === '.bn-sync-status-badge') return badge;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.navigation button.nav-item') return [dashboard, settings];
      return [];
    },
    getElementById() { return null; }
  };
  const initial = options.initialTab || 'Dashboard';
  const root = {
    document: doc,
    location: { href: 'https://school.example/index.html?openSchool=true&tab=' + encodeURIComponent(initial) },
    history: {
      state: null,
      replaceState(_state, _unused, value) {
        root.location.href = new URL(value, root.location.href).href;
      }
    },
    sessionStorage: { getItem() { return null; } },
    BNWorkspaceOnlineGuard: { getStatus() { return cloudStatus; } },
    setTimeout() { /* Tests drive scans explicitly without browser timers. */ }
  };
  return {
    root, badge, dashboard,
    api: createDashboardIntegrity(root),
    setActive(value) { active = value; },
    setCloudStatus(value) { cloudStatus = value; },
    get clicks() { return clicked; },
    get active() { return active; },
    get tab() { return new URL(root.location.href).searchParams.get('tab'); }
  };
}

test('direct Dashboard link wins over a saved Settings tab', () => {
  const app = harness({ active: 'Settings', initialTab: 'Dashboard' });
  app.api.scan();
  assert.equal(app.clicks, 1);
  assert.equal(app.active, 'Dashboard');
  app.api.scan();
  assert.equal(app.tab, 'Dashboard');
});

test('user can navigate to Settings after Dashboard has opened', () => {
  const app = harness({ active: 'Settings', initialTab: 'Dashboard' });
  app.api.scan();
  app.api.scan();
  app.setActive('Settings');
  app.api.scan();
  assert.equal(app.tab, 'Settings');
  assert.equal(app.clicks, 1);
});

test('visible cloud conflict suppresses the falsely successful status label', () => {
  const app = harness({ active: 'Dashboard', cloudStatus: { status: 'conflict', problem: 'Cloud revision differs' } });
  app.api.scan();
  assert.equal(app.badge.getAttribute('aria-invalid'), 'true');
  assert.equal(app.badge.getAttribute('aria-label'), 'Sync conflict — not published');
  assert.equal(app.badge.dataset.bnCloudWarning, 'Sync conflict — not published');
});

test('status label returns to normal after a verified sync', () => {
  const app = harness({ active: 'Dashboard', cloudStatus: { status: 'pending', problem: 'Network unavailable' } });
  app.api.scan();
  assert.equal(app.badge.dataset.bnCloudWarning, 'Cloud save failed — not published');
  app.setCloudStatus({ status: 'synced', problem: '' });
  app.api.scan();
  assert.equal(app.badge.getAttribute('aria-invalid'), null);
  assert.equal(app.badge.dataset.bnCloudWarning, undefined);
});
