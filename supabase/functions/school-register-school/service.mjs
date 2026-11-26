const RENDER_ORIGIN = 'https://bright-nexa-school-os.onrender.com';
const GITHUB_ORIGIN = 'https://karangilotra555.github.io';
const ALLOWED_ORIGINS = new Set([RENDER_ORIGIN, GITHUB_ORIGIN]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const norm = v => String(v ?? '').trim();

async function sha256Hex(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
}

export function createService({ url, serviceKey, anonKey, fetcher = fetch } = {}) {
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
      const msg = (data && typeof data === 'object' && (data.message || data.error)) || 'Registration database operation failed';
      throw Object.assign(Error(String(msg)), { status: res.status });
    }
    return data;
  }

  return async function handler(req) {
    const origin = req.headers.get('origin') || req.headers.get('Origin');
    const cors = {
      'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.has(origin) ? origin : RENDER_ORIGIN,
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin'
    };
    const reply = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
      });

    if (origin && !ALLOWED_ORIGINS.has(origin)) return reply({ error: 'Origin not allowed' }, 403);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
    if (!url || !serviceKey || !anonKey) return reply({ error: 'Registration service unavailable.' }, 503);

    const auth = req.headers.get('authorization') || req.headers.get('Authorization') || '';
    const match = /^Bearer (\S+)$/.exec(auth);
    if (!match) return reply({ error: 'Verified owner sign-in required.' }, 401);

    try {
      const authRes = await fetcher(url + '/auth/v1/user', {
        headers: { apikey: anonKey, Authorization: 'Bearer ' + match[1] }
      });
      if (!authRes.ok) return reply({ error: 'Session invalid or expired. Sign in again.' }, 401);
      const identity = await authRes.json().catch(() => null);
      const bannedUntil = identity?.banned_until ? Date.parse(identity.banned_until) : NaN;
      if (
        !UUID_RE.test(norm(identity?.id)) ||
        identity.is_anonymous ||
        !identity.email_confirmed_at ||
        identity.deleted_at ||
        (Number.isFinite(bannedUntil) && bannedUntil > Date.now()) ||
        identity.app_metadata?.bn_student_id ||
        identity.app_metadata?.bn_teacher_mobile_pending === true
      ) {
        return reply({ error: 'Verified school owner email required.' }, 403);
      }

      const raw = await req.text();
      if (raw.length > 4096) return reply({ error: 'Request too large.' }, 413);
      let body;
      try { body = raw ? JSON.parse(raw) : {}; } catch { return reply({ error: 'Invalid JSON request.' }, 400); }

      // Commit independent attempt counters BEFORE code validation/redemption so
      // rolled-back registration transactions can never clear rate-limit tracking.
      const ip = (req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim() || 'unknown';
      let ipOk, userOk;
      try {
        [ipOk, userOk] = await Promise.all([
          rpc('bn_activation_attempt', { p_bucket: await sha256Hex('reg:ip:' + ip), p_limit: 20 }),
          rpc('bn_activation_attempt', { p_bucket: await sha256Hex('reg:user:' + identity.id), p_limit: 10 })
        ]);
      } catch {
        return reply({ error: 'Registration throttling service unavailable.' }, 503);
      }
      if (ipOk !== true || userOk !== true) {
        return reply({ error: 'Too many activation attempts. Try again after 15 minutes or contact Bright Nexa.' }, 429);
      }

      const schoolName = norm(body.schoolName);
      if (schoolName.length < 3 || schoolName.length > 120) {
        return reply({ error: 'Enter a school name between 3 and 120 characters.' }, 400);
      }
      const activationCode = norm(body.activationCode).toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(activationCode)) {
        return reply({ error: 'Invalid or unavailable activation code' }, 403);
      }

      const schoolId = await rpc('bn_register_school_for_user', {
        p_owner_uid: identity.id,
        p_school_name: schoolName,
        p_activation_code: activationCode
      });
      if (!UUID_RE.test(norm(schoolId))) {
        return reply({ error: 'School creation returned no valid school ID.' }, 500);
      }
      return reply({ schoolId });
    } catch (err) {
      const msg = norm(err?.message);
      if (/Already registered/i.test(msg)) return reply({ error: 'This account is already linked to a school.' }, 409);
      if (/activation|Verified owner|Registration not confirmed|permission denied/i.test(msg)) {
        return reply({ error: msg }, 403);
      }
      return reply({ error: 'School registration could not be completed; verify details and retry.' }, 400);
    }
  };
}
