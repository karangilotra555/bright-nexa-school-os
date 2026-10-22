// Redirect legacy teacher portal address to real HTML hosting.
// Supabase Edge Functions rewrite HTML responses as text/plain on shared domains.
// Render serves the existing Bright Nexa School OS static site over HTTPS.
const PORTAL = "https://bright-nexa-school-os.onrender.com/teacher-access.html";
Deno.serve((req: Request) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { "Allow": "GET, HEAD" } });
  }
  return new Response(null, {
    status: 302,
    headers: {
      "Location": PORTAL,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff"
    }
  });
});
