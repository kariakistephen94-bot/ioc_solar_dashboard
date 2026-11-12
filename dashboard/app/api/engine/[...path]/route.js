// Server-side proxy to the engine. Only signed-in ADMINS get through; the engine token never reaches the browser.
import { engineFetch, forgetUser, requireAdmin, sameOrigin } from "../../../../lib/auth";

async function proxy(request, context) {
  if (!sameOrigin(request)) return Response.json({ error: "Cross-site request blocked." }, { status: 403 });
  let actor;
  try { actor = await requireAdmin(); } catch (e) { return Response.json({ error: e.message, auth: e.status === 401, ...(e.extra || {}) }, { status: e.status || 401 }); }
  const { path } = await context.params;
  const joined = path.map(encodeURIComponent).join("/");
  const hasBody = !["GET", "HEAD"].includes(request.method);
  try {
    const res = await engineFetch(joined, { method: request.method, body: hasBody ? await request.text() : undefined, actor, search: new URL(request.url).search });
    const text = await res.text();
    if (res.ok && request.method === "PATCH" && path[0] === "staff" && path[1]) forgetUser(path[1]);
    return new Response(text, { status: res.status, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 502 });
  }
}
export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH };
