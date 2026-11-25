const RENDER_ORIGIN = 'https://bright-nexa-school-os.onrender.com';
const GITHUB_ORIGIN = 'https://karangilotra555.github.io';
const ALLOWED_ORIGINS = new Set([RENDER_ORIGIN, GITHUB_ORIGIN]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const norm = v => String(v ?? '').trim();

export function createService({ url, serviceKey, anonKey, operatorEmails = '', fetcher = fetch } = {}) {
  const allowedOperators = new Set(
    String(operatorEmails || '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(s => s && s.length <= 254 && EMAIL_RE.test(s))
  );
  const serviceHeaders = {
    apikey: serviceKey,
    Authorization: 'Bearer ' + serviceKey,
    'Content-Type': 'application/json'
  };

  async function rpc(name, body) {
    const res = await fetcher(url + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: serviceHeaders,
      body: JSON.stringify(body || {})
    });
    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    if (!res.ok) {
      const msg = (data && typeof data === 'object' && (data.message || data.error)) || 'Platform operator database operation failed';
      throw Error(String(msg));
    }
    return data;
  }

  return async function handler(req) {
    const origin = req.headers.get('origin') || req.headers.get('Origin');
    const cors = {
      'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.has(origin) ? origin : RENDER_ORIGIN,
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Vary': 'Origin'
    };
    const reply = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
      });

    if (origin && !ALLOWED_ORIGINS.has(origin)) return reply({ error: 'Origin not allowed' }, 403);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (!url || !serviceKey || !anonKey || allowedOperators.size === 0) {
      return reply({ error: 'Platform Super Admin is not configured.' }, 503);
    }

    const auth = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    const match = /^Bearer (\S+)$/.exec(auth);
    if (!match) return reply({ error: 'Platform Super Admin sign-in required' }, 401);

    try {
      const authRes = await fetcher(url + '/auth/v1/user', {
        headers: { apikey: anonKey, Authorization: 'Bearer ' + match[1] }
      });
      if (!authRes.ok) return reply({ error: 'Invalid or expired platform operator session' }, 401);
      const identity = await authRes.json().catch(() => null);
      const email = norm(identity?.email).toLowerCase();
      const bannedUntil = identity?.banned_until ? Date.parse(identity.banned_until) : NaN;
      if (
        !norm(identity?.id) ||
        identity.is_anonymous ||
        !identity.email_confirmed_at ||
        identity.deleted_at ||
        (Number.isFinite(bannedUntil) && bannedUntil > Date.now()) ||
        identity.app_metadata?.bn_student_id ||
        identity.app_metadata?.bn_teacher_mobile_pending === true ||
        !allowedOperators.has(email)
      ) {
        return reply({ error: 'Bright Nexa platform operator access required' }, 403);
      }

      const route = new URL(req.url).pathname.split('/school-platform-admin')[1] || '/';
      let body = {};
      if (req.method === 'POST') {
        const raw = await req.text();
        if (raw.length > 32768) return reply({ error: 'Request too large' }, 413);
        body = raw ? JSON.parse(raw) : {};
      } else if (req.method !== 'GET') {
        return reply({ error: 'Method not allowed' }, 405);
      }

      if (route === '/session' && req.method === 'GET') {
        return reply({ verified: true, operator: email });
      }
      if (route === '/activations' && req.method === 'GET') {
        const rows = await rpc('bn_list_school_activations', { p_limit: 200 });
        return reply({ rows: Array.isArray(rows) ? rows : [] });
      }
      if (route === '/activations' && req.method === 'POST') {
        const ownerEmail = norm(body.ownerEmail).toLowerCase();
        if (!ownerEmail || ownerEmail.length > 254 || !EMAIL_RE.test(ownerEmail)) {
          return reply({ error: 'Enter a valid school owner email address.' }, 400);
        }
        const code = await rpc('bn_issue_school_activation', { p_owner_email: ownerEmail, p_actor_uid: identity.id });
        return reply({ code, ownerEmail, notice: 'One-time code generated. Share privately; only its cryptographic hash is stored.' });
      }
      if (route === '/activations/revoke' && req.method === 'POST') {
        const rawCode = norm(body.code).toLowerCase();
        if (/^[0-9a-f]{64}$/.test(rawCode)) {
          const revoked = Boolean(await rpc('bn_revoke_school_activation', { p_code: rawCode, p_actor_uid: identity.id }));
          return reply({ revoked });
        }
        const codePrefix = norm(body.codePrefix).toLowerCase();
        const ownerEmail = norm(body.ownerEmail).toLowerCase();
        if (!/^[0-9a-f]{12}$/.test(codePrefix) || !EMAIL_RE.test(ownerEmail)) {
          return reply({ error: 'Valid activation digest prefix and owner email are required.' }, 400);
        }
        const revoked = Boolean(await rpc('bn_revoke_school_activation_by_prefix', { p_code_prefix: codePrefix, p_owner_email: ownerEmail, p_actor_uid: identity.id }));
        return reply({ revoked });
      }
      if (route === '/entitlements' && req.method === 'GET') {
        const rows = await rpc('bn_list_school_entitlements', { p_limit: 200 });
        return reply({ rows: Array.isArray(rows) ? rows : [] });
      }
      if (route === '/entitlements/assign' && req.method === 'POST') {
        const institutionId = norm(body.institutionId);
        const plan = norm(body.plan) || 'active';
        const days = Number(body.days);
        if (!UUID_RE.test(institutionId) || !['trial', 'active'].includes(plan) || !Number.isInteger(days) || days < 1 || days > 366) {
          return reply({ error: 'Valid school ID, plan (trial/active), and duration (1-366 days) required.' }, 400);
        }
        await rpc('bn_assign_school_entitlement', { p_institution_id: institutionId, p_plan: plan, p_days: days, p_actor_uid: identity.id });
        return reply({ assigned: true });
      }
      if (route === '/entitlements/renew' && req.method === 'POST') {
        const institutionId = norm(body.institutionId);
        const days = Number(body.days);
        if (!UUID_RE.test(institutionId) || !Number.isInteger(days) || days < 1 || days > 366) {
          return reply({ error: 'Valid school ID and renewal duration (1-366 days) required.' }, 400);
        }
        await rpc('bn_renew_school_entitlement', { p_institution_id: institutionId, p_days: days, p_actor_uid: identity.id });
        return reply({ renewed: true });
      }
      if (route === '/audit' && req.method === 'GET') {
        const rows = await rpc('bn_list_platform_audit', { p_limit: 100 });
        return reply({ rows: Array.isArray(rows) ? rows : [] });
      }
      return reply({ error: 'Not found' }, 404);
    } catch (err) {
      const message = norm(err?.message);
      const safe = /^(Valid |Enter |Entitlement already|No entitlement|School not found|Invalid )/.test(message);
      return reply({ error: safe ? message : 'Platform operator request could not be completed.' }, 400);
    }
  };
}
