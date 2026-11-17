// Supabase Cron calls this function. FCM sends data only, so the installed
// app can reject stale deliveries after a teacher signs out or switches school.
type ServiceAccount = { project_id: string; client_email: string; private_key: string };
type Alert = {
  installation: string;
  token: string;
  binding: string;
  event_id: string;
  title: string;
  body: string;
  expires: string;
};

const url = Deno.env.get("SUPABASE_URL") ?? "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const schedulerSecret = Deno.env.get("TEACHER_PERIOD_SCHEDULER_SECRET") ?? "";
const serviceAccount = Deno.env.get("TEACHER_PERIOD_FCM_SERVICE_ACCOUNT") ?? "";
const json = (data: unknown, status = 200) => Response.json(data, { status });
const encoder = new TextEncoder();
const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
const encodeJson = (value: unknown) => base64Url(encoder.encode(JSON.stringify(value)));
const digest = (value: string) => crypto.subtle.digest("SHA-256", encoder.encode(value));

async function authorized(header: string) {
  if (!schedulerSecret || header.length > 256) return false;
  const [received, expected] = await Promise.all([digest(header), digest(schedulerSecret)]);
  const a = new Uint8Array(received);
  const b = new Uint8Array(expected);
  return a.reduce((mismatch, value, index) => mismatch | (value ^ b[index]), 0) === 0;
}

let cachedToken: { token: string; expires: number } | undefined;
async function googleToken(account: ServiceAccount) {
  if (cachedToken && cachedToken.expires > Date.now() + 60000) return cachedToken.token;
  const now = Math.floor(Date.now() / 1000);
  const tokenUrl = "https://oauth2.googleapis.com/token";
  const jwt = encodeJson({ typ: "JWT", alg: "RS256" }) + "." + encodeJson({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: tokenUrl,
    iat: now,
    exp: now + 3600,
  });
  const pem = account.private_key.replace(/-----[^-]+-----|\s/g, "");
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(pem), (v) => v.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(jwt));
  const response = await fetch(tokenUrl, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt + "." + base64Url(new Uint8Array(signature)),
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("FCM OAuth unavailable: " + response.status);
  const value = await response.json();
  if (!value.access_token) throw new Error("FCM OAuth omitted the access token");
  cachedToken = { token: value.access_token, expires: Date.now() + 1000 * Number(value.expires_in) };
  return cachedToken.token;
}

async function rpc(name: string, args: Record<string, unknown>) {
  const response = await fetch(url + "/rest/v1/rpc/" + name, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(name + " failed: " + response.status);
  return response.json().catch(() => null);
}

async function deliver(alert: Alert, project: string, token: string) {
  const expires = Date.parse(alert.expires);
  const ttl = Math.ceil((expires - Date.now()) / 1000);
  if (ttl <= 0) return false;
  const response = await fetch("https://fcm.googleapis.com/v1/projects/" + encodeURIComponent(project) + "/messages:send", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token: alert.token,
        android: { priority: "high", ttl: ttl + "s" },
        data: {
          binding: alert.binding, event: alert.event_id, title: alert.title, body: alert.body,
          expires: String(expires),
        },
      },
    }),
    signal: AbortSignal.timeout(8000),
  });
  const result = await response.json().catch(() => ({}));
  const invalid = result?.error?.details?.some((detail: { errorCode?: string }) => detail.errorCode === "UNREGISTERED") === true;
  if (response.ok || invalid) {
    await rpc("bn_finish_teacher_period_alert", {
      p_installation: alert.installation, p_binding: alert.binding, p_token: alert.token, p_event: alert.event_id, p_invalid: invalid,
    });
  }
  return response.ok;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!await authorized(request.headers.get("x-scheduler-secret") ?? "")) return json({ error: "Unauthorized" }, 401);
  if (!url || !serviceKey || !serviceAccount) return json({ error: "Period notifications are not configured" }, 503);
  try {
    const account: ServiceAccount = JSON.parse(serviceAccount);
    const token = await googleToken(account);
    const alerts: Alert[] = await rpc("bn_claim_teacher_period_alerts", { p_at: new Date().toISOString() });
    let index = 0;
    let sent = 0;
    await Promise.all(Array.from({ length: Math.min(alerts.length, 12) }, async () => {
      while (index < alerts.length) {
        const alert = alerts[index++];
        try {
          if (await deliver(alert, account.project_id, token)) sent++;
        } catch (_) {
          // Leave the claim retryable. Never write device tokens to logs.
        }
      }
    }));
    return json({ claimed: alerts.length, sent });
  } catch (error) {
    console.error("Teacher alert dispatch failed", error instanceof Error ? error.message : String(error));
    return json({ error: "Teacher alert dispatch failed" }, 503);
  }
});
