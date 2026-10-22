import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const url = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const ORIGIN = "https://karangilotra555.github.io";
const RENDER_ORIGIN = "https://bright-nexa-school-os.onrender.com";
const roles = new Set(["teacher", "principal", "accountant", "receptionist", "transport_staff"]);

function respond(data: unknown, status = 200, allowedOrigin = ORIGIN) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": allowedOrigin,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "authorization, apikey, content-type",
      "vary": "Origin",
    }
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const reply = (data: unknown, status = 200) => respond(data, status, origin || ORIGIN);
  if (origin && origin !== ORIGIN && origin !== RENDER_ORIGIN) return reply({ error: "Origin not allowed" }, 403);
  if (req.method === "OPTIONS") return reply({ ok: true });
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  if (!url || !serviceKey || !anonKey) return reply({ error: "Server not configured" }, 503);
  const authorization = req.headers.get("authorization") || "";
  const match = /^Bearer (\S+)$/.exec(authorization);
  if (!match) return reply({ error: "Login required" }, 401);
  try {
    const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: identity, error: userErr } = await authClient.auth.getUser(match[1]);
    if (userErr || !identity.user) return reply({ error: "Invalid session" }, 401);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: member, error: membershipErr } = await admin.from("school_users")
      .select("id,institution_id,role,status")
      .eq("auth_user_id", identity.user.id).eq("role", "school_admin").eq("status", "active").maybeSingle();
    if (membershipErr || !member) return reply({ error: "School administrator access required" }, 403);

    const body = await req.json().catch(() => null);
    const email = String(body?.email || "").trim().toLowerCase();
    const role = String(body?.role || "").trim();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !roles.has(role)) {
      return reply({ error: "Valid staff email and role required" }, 400);
    }
    const { data: existing, error: existsErr } = await admin.from("school_users")
      .select("id").eq("institution_id", member.institution_id).eq("email", email).maybeSingle();
    if (existsErr) return reply({ error: "Cannot check staff enrollment" }, 500);
    if (existing) return reply({ error: "This staff email is already enrolled at the school" }, 409);

    const { data: invite, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: RENDER_ORIGIN + "/teacher-access.html" });
    if (inviteErr || !invite.user) {
      return reply({ error: "Invitation not sent. Verify email settings and whether this user already exists." }, 422);
    }
    const { data: record, error: insertErr } = await admin.from("school_users")
      .insert({
        institution_id: member.institution_id,
        email, role, status: "active", auth_user_id: invite.user.id
      }).select("id").single();
    if (insertErr || !record) {
      return reply({ error: "Invitation created but staff membership could not be completed. Ask an administrator to reconcile before retrying." }, 500);
    }
    await admin.from("school_audit_events").insert({
      institution_id: member.institution_id, actor_id: member.id,
      action: "staff.invited", entity: "school_users", entity_id: record.id
    });
    return reply({ ok:true, email, role, status:"invited" }, 201);
  } catch (_err) {
    return reply({ error: "Unable to invite staff" }, 500);
  }
});
