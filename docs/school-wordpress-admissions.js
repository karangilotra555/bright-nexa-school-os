/* School Admin interface for the write-only WordPress admissions connection. */
(function (root) {
  'use strict';

  function formatSubmittedAt(raw) {
    if (!raw) return '—';
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-IN');
  }

  function mount({ panel, open, close, rotate, revoke, refresh, inbox, key, status, rows, getScope, confirm }) {
    if (!open || !panel) return { reset() {} };
    let generation = 0;
    function reset() {
      generation++;
      panel.hidden = true;
      key.value = '';
      key.hidden = true;
      status.textContent = '';
      rows.replaceChildren();
      panel.removeAttribute('aria-busy');
      inbox.value = 'new';
      inbox.disabled = false;
    }

    async function run(task) {
      const scope = getScope();
      if (!scope || panel.getAttribute('aria-busy') === 'true') return;
      const current = generation;
      const active = () => current === generation && scope.current();
      panel.setAttribute('aria-busy', 'true');
      inbox.disabled = true;
      status.textContent = '';
      try {
        await task(scope.rpc, active);
      } catch (_) {
        if (active()) status.textContent = 'Could not confirm the request. Refresh and try again.';
      } finally {
        if (current === generation) {
          panel.removeAttribute('aria-busy');
          inbox.disabled = false;
        }
      }
    }

    async function load(rpc, active) {
      rows.replaceChildren();
      const reviewed = inbox.value === 'reviewed';
      const data = await rpc('list_enquiries', { p_reviewed: reviewed });
      if (!Array.isArray(data)) throw Error('Invalid inbox response');
      if (!active()) return;
      status.textContent = data.length ? '' : reviewed ? 'No reviewed enquiries.' : 'No new admission enquiries.';
      for (const enquiry of data) {
        const row = rows.insertRow();
        for (const value of [
          enquiry.name,
          enquiry.email,
          enquiry.phone,
          enquiry.year_group,
          formatSubmittedAt(enquiry.submitted_at)
        ]) {
          row.insertCell().textContent = value || '—';
        }
        const actions = row.insertCell();
        if (reviewed) continue;
        const button = panel.ownerDocument.createElement('button');
        button.type = 'button';
        button.className = 'ghost';
        button.textContent = 'Mark reviewed';
        button.addEventListener('click', () => run(async (send, isCurrent) => {
          await send('mark_reviewed', { p_enquiry: enquiry.id });
          if (isCurrent()) await load(send, isCurrent);
        }));
        actions.append(button);
      }
    }

    open.addEventListener('click', () => {
      if (!getScope()) return;
      panel.hidden = false;
      panel.scrollIntoView?.({ block: 'start' });
      void run(load);
    });
    close.addEventListener('click', reset);
    refresh.addEventListener('click', () => run(load));
    inbox.addEventListener('change', () => run(load));
    rotate.addEventListener('click', () => {
      if (!confirm('Generate a new key? If a site is already connected, replace its old key in WordPress.')) return;
      void run(async (rpc, active) => {
        const result = await rpc('rotate_key');
        if (typeof result !== 'string' || !/^[a-f0-9]{64}$/.test(result)) throw Error('Invalid connection response');
        if (!active()) return;
        key.value = result;
        key.hidden = false;
        key.focus();
        key.select();
        status.textContent = 'Copy this key into the WordPress plugin settings.';
      });
    });
    revoke.addEventListener('click', () => {
      if (!confirm('Disconnect the WordPress admission form for this school?')) return;
      void run(async (rpc, active) => {
        await rpc('revoke_key');
        if (!active()) return;
        key.value = '';
        key.hidden = true;
        status.textContent = 'WordPress disconnected.';
      });
    });
    return { reset };
  }

  const api = { mount };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BNWordPressAdmissions = api;
})(typeof window !== 'undefined' ? window : globalThis);
