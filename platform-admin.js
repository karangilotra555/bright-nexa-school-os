/* Bright Nexa Platform Operator Console. No service keys or hardcoded credentials. */
(function (root) {
  'use strict';
  const SUPABASE = 'https://mrfvbwmyxndrakskqyas.supabase.co';
  const PUBLISHABLE = 'sb_publishable_qnOuxnbwCKcPbxpVMz3QTQ_9jAjLGGT';
  const SESSION_KEY = 'bn_platform_operator_session_v1';
  const $ = id => document.getElementById(id);

  function setStatus(msg, isError) {
    const el = $('opStatus');
    if (!el) return;
    if (!msg) { el.hidden = true; el.textContent = ''; el.className = 'notice'; return; }
    el.hidden = false;
    el.textContent = msg;
    el.className = isError ? 'notice error' : 'notice';
  }

  function ist(iso) {
    if (!iso) return '—';
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return '—';
    return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(ts));
  }

  function readSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  }
  function saveSession(s) { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); return s; }
  function clearSession() { sessionStorage.removeItem(SESSION_KEY); }

  async function ensureToken() {
    let s = readSession();
    if (!s?.access_token) throw Error('Sign in as a Bright Nexa platform operator.');
    const exp = Number(s.expires_at);
    if (!Number.isFinite(exp) || exp <= Date.now() / 1000 + 60) {
      if (!s.refresh_token) throw Error('Operator session expired. Sign in again.');
      const res = await fetch(SUPABASE + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        cache: 'no-store',
        headers: { apikey: PUBLISHABLE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: s.refresh_token })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.access_token) { clearSession(); throw Error('Operator session expired. Sign in again.'); }
      s = saveSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token || s.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + (Number(data.expires_in) || 3600)
      });
    }
    return s;
  }

  async function opApi(path, body) {
    const s = await ensureToken();
    const res = await fetch(SUPABASE + '/functions/v1/school-platform-admin' + path, {
      method: body !== undefined ? 'POST' : 'GET',
      cache: 'no-store',
      headers: { apikey: PUBLISHABLE, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Error(data.error || 'Operator request failed (' + res.status + ')');
    return data;
  }

  function cell(text) { const td = document.createElement('td'); td.textContent = text == null ? '—' : String(text); return td; }

  function renderCodes(rows) {
    const tbody = $('opCodesBody');
    tbody.replaceChildren();
    if (!rows.length) {
      const tr = document.createElement('tr'); const td = cell('No activation codes issued yet.'); td.colSpan = 7; tr.append(td); tbody.append(tr); return;
    }
    for (const row of rows) {
      const tr = document.createElement('tr');
      const statusTd = document.createElement('td');
      const pill = document.createElement('span'); pill.className = 'pill ' + row.status; pill.textContent = row.status; statusTd.append(pill);
      const actTd = document.createElement('td');
      if (row.status === 'active') {
        const btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'danger'; btn.textContent = 'Revoke';
        btn.addEventListener('click', async () => {
          if (!confirm('Revoke activation code ' + row.code_digest_prefix + ' for ' + row.owner_email + '?')) return;
          btn.disabled = true;
          try {
            await opApi('/activations/revoke', { codePrefix: row.code_digest_prefix, ownerEmail: row.owner_email });
            setStatus('Activation code revoked for ' + row.owner_email + '.');
            await refreshData();
          } catch (e) { setStatus(e.message, true); btn.disabled = false; }
        });
        actTd.append(btn);
      } else { actTd.textContent = '—'; }
      tr.append(cell(row.owner_email), cell(row.code_digest_prefix), statusTd, cell(ist(row.issued_at)), cell(ist(row.expires_at)), cell(row.school_name || 'Pending signup'), actTd);
      tbody.append(tr);
    }
  }

  function renderSchools(rows) {
    const tbody = $('opSchoolsBody');
    tbody.replaceChildren();
    if (!rows.length) {
      const tr = document.createElement('tr'); const td = cell('No schools registered yet.'); td.colSpan = 6; tr.append(td); tbody.append(tr); return;
    }
    for (const row of rows) {
      const tr = document.createElement('tr');
      const statusTd = document.createElement('td');
      const pill = document.createElement('span'); pill.className = 'pill ' + row.effective_status; pill.textContent = row.effective_status; statusTd.append(pill);
      const milestones = Array.isArray(row.milestones_sent) && row.milestones_sent.length ? row.milestones_sent.join('d, ') + 'd' : 'None';
      const manageTd = document.createElement('td');
      const controls = document.createElement('div'); controls.className = 'row';
      const daysInput = document.createElement('input');
      daysInput.type = 'number'; daysInput.min = '1'; daysInput.max = '366'; daysInput.value = '30';
      daysInput.style.minWidth = '72px'; daysInput.style.width = '72px';
      daysInput.setAttribute('aria-label', 'Days for ' + (row.name || row.institution_id));
      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      if (row.effective_status === 'unassigned') {
        const planSelect = document.createElement('select'); planSelect.style.minWidth = '96px';
        for (const optVal of ['active', 'trial']) {
          const opt = document.createElement('option'); opt.value = optVal; opt.textContent = optVal; planSelect.append(opt);
        }
        actionBtn.textContent = 'Assign Plan';
        actionBtn.addEventListener('click', async () => {
          actionBtn.disabled = true;
          try {
            await opApi('/entitlements/assign', { institutionId: row.institution_id, plan: planSelect.value, days: Number(daysInput.value) });
            setStatus('Assigned ' + planSelect.value + ' plan for ' + daysInput.value + ' days to ' + row.name + '.');
            await refreshData();
          } catch (e) { setStatus(e.message, true); actionBtn.disabled = false; }
        });
        controls.append(planSelect, daysInput, actionBtn);
      } else {
        actionBtn.textContent = 'Renew / Extend';
        actionBtn.addEventListener('click', async () => {
          actionBtn.disabled = true;
          try {
            await opApi('/entitlements/renew', { institutionId: row.institution_id, days: Number(daysInput.value) });
            setStatus('Renewed ' + row.name + ' by ' + daysInput.value + ' days. Editing restored without data loss.');
            await refreshData();
          } catch (e) { setStatus(e.message, true); actionBtn.disabled = false; }
        });
        controls.append(daysInput, actionBtn);
      }
      manageTd.append(controls);
      tr.append(cell(row.name || row.institution_id), statusTd, cell(ist(row.ends_at)), cell(row.days_remaining ?? '—'), cell(milestones), manageTd);
      tbody.append(tr);
    }
  }

  function renderAudit(rows) {
    const tbody = $('opAuditBody');
    tbody.replaceChildren();
    if (!rows.length) {
      const tr = document.createElement('tr'); const td = cell('No audit events yet.'); td.colSpan = 5; tr.append(td); tbody.append(tr); return;
    }
    for (const row of rows) {
      const tr = document.createElement('tr');
      tr.append(cell(ist(row.created_at)), cell(row.event_type), cell(row.owner_email || '—'), cell(row.institution_id || '—'), cell(row.code_digest_prefix || '—'));
      tbody.append(tr);
    }
  }

  async function refreshData() {
    const [codes, schools, audit] = await Promise.all([
      opApi('/activations'), opApi('/entitlements'), opApi('/audit')
    ]);
    renderCodes(codes.rows || []);
    renderSchools(schools.rows || []);
    renderAudit(audit.rows || []);
  }

  async function openConsole() {
    const verify = await opApi('/session');
    $('opIdentity').textContent = 'Signed in as verified Bright Nexa operator: ' + verify.operator;
    $('opLoginSection').hidden = true;
    $('opWorkspace').hidden = false;
    $('opLogout').hidden = false;
    await refreshData();
  }

  $('opLoginForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    setStatus('Verifying operator credentials…');
    $('opLoginSubmit').disabled = true;
    try {
      const res = await fetch(SUPABASE + '/auth/v1/token?grant_type=password', {
        method: 'POST', cache: 'no-store',
        headers: { apikey: PUBLISHABLE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: $('opEmail').value.trim(), password: $('opPassword').value })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.access_token) throw Error(data.error_description || data.msg || 'Sign-in failed');
      saveSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Math.floor(Date.now() / 1000) + (Number(data.expires_in) || 3600)
      });
      $('opPassword').value = '';
      await openConsole();
      setStatus('Platform Super Admin verified.');
    } catch (err) {
      clearSession();
      setStatus(err.message, true);
    } finally {
      $('opLoginSubmit').disabled = false;
    }
  });

  $('issueCodeForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const ownerEmail = $('issueOwnerEmail').value.trim().toLowerCase();
    $('issueCodeButton').disabled = true;
    try {
      const out = await opApi('/activations', { ownerEmail });
      $('issuedCodeOwner').textContent = out.ownerEmail || ownerEmail;
      $('issuedCodeValue').value = out.code || '';
      $('issuedCodeBox').hidden = false;
      $('issueOwnerEmail').value = '';
      setStatus('One-time activation code issued.');
      await refreshData();
    } catch (err) {
      setStatus(err.message, true);
    } finally {
      $('issueCodeButton').disabled = false;
    }
  });

  $('copyIssuedCode')?.addEventListener('click', async () => {
    const input = $('issuedCodeValue');
    if (!input?.value) return;
    try {
      await navigator.clipboard.writeText(input.value);
      setStatus('Activation code copied to clipboard.');
    } catch {
      input.select();
      setStatus('Clipboard unavailable; select and copy the highlighted code manually.');
    }
  });

  $('opRefreshAll')?.addEventListener('click', () => {
    refreshData().then(() => setStatus('Refreshed.')).catch(err => setStatus(err.message, true));
  });

  $('opLogout')?.addEventListener('click', () => {
    clearSession();
    $('issuedCodeValue').value = '';
    $('issuedCodeBox').hidden = true;
    $('opWorkspace').hidden = true;
    $('opLogout').hidden = true;
    $('opLoginSection').hidden = false;
    setStatus('Signed out.');
  });

  if (readSession()?.access_token) {
    openConsole().catch(() => { clearSession(); });
  }
  root.BNPlatformAdmin = { opApi };
})(typeof window !== 'undefined' ? window : globalThis);
