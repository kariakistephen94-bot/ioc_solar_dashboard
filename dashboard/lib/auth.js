// Server-only: staff accounts with Supabase Auth, roles stored by the engine.
// Anyone can sign up; new accounts are "user" and cannot use the dashboard until an admin makes them "admin".
// Sessions live in HttpOnly cookies the browser's JavaScript can't read.
import "server-only";
import { cookies, headers } from "next/headers";

const ACCESS = "oic_at";
const REFRESH = "oic_rt";
const CACHE_MS = 30_000; // a role change reaches every open session within 30 seconds
const cache = new Map(); // access token -> { user, until }

const env = () => ({
  url: (process.env.SUPABASE_URL || "").replace(/\/$/, ""),
  anon: process.env.SUPABASE_ANON_KEY || "",
  engine: process.env.ENGINE_URL || "http://127.0.0.1:3310",
  engineToken: process.env.ENGINE_API_TOKEN || "",
});

/** "off" only when explicitly disabled for local demos; otherwise Supabase Auth must be configured. */
export function authMode() {
  if (process.env.DASHBOARD_AUTH === "off") return "off";
  const { url, anon } = env();
  return url && anon ? "supabase" : "missing";
}

export class AuthError extends Error {
  constructor(message, status = 401, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

async function gotrue(path, { method = "POST", body, token } = {}) {
  const { url, anon } = env();
  const res = await fetch(`${url}/auth/v1/${path}`, {
    method,
    headers: { apikey: anon, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/** Calls the engine with its secret token. `actor` identifies the signed-in admin for audit and permission checks. */
export async function engineFetch(path, { method = "GET", body, actor, search = "" } = {}) {
  const { engine, engineToken } = env();
  if (!engineToken) throw new AuthError("Set ENGINE_API_TOKEN for the dashboard.", 500);
  let res;
  try {
    res = await fetch(`${engine}/${path}${search}`, {
      method,
      headers: { Authorization: `Bearer ${engineToken}`, "Content-Type": "application/json", ...(actor ? { "X-Actor-Id": actor.id, "X-Actor-Email": actor.email || "" } : {}) },
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new AuthError("The engine is not reachable. Check ENGINE_URL and that the engine is running.", 502);
  }
  return res;
}

const profile = (u) => ({ id: u.id, email: u.email, name: u.user_metadata?.full_name || u.user_metadata?.name || null });

async function withRole(authUser) {
  const p = profile(authUser);
  const res = await engineFetch("staff/ensure", { method: "POST", body: { user_id: p.id, email: p.email, name: p.name } });
  const row = await res.json().catch(() => ({}));
  if (!res.ok) throw new AuthError(row.error || "Could not load your access level.", res.status === 401 ? 500 : res.status);
  return { ...p, name: row.name || p.name, role: row.role, since: row.created_at };
}

async function secureFlag() {
  const h = await headers();
  return (h.get("x-forwarded-proto") || "").split(",")[0] === "https" || process.env.FORCE_SECURE_COOKIES === "true";
}

async function saveSession(session) {
  const jar = await cookies();
  const base = { httpOnly: true, secure: await secureFlag(), sameSite: "lax", path: "/" };
  jar.set(ACCESS, session.access_token, { ...base, maxAge: Math.max(60, Number(session.expires_in) || 3600) });
  jar.set(REFRESH, session.refresh_token, { ...base, maxAge: 60 * 60 * 24 * 30 });
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(ACCESS);
  jar.delete(REFRESH);
}

/** Drop cached sessions for a user so a role change applies on their very next request (on this server). */
export function forgetUser(userId) {
  for (const [token, hit] of cache) if (hit.user.id === userId) cache.delete(token);
}

function checkPassword(password) {
  if (String(password || "").length < 8) throw new AuthError("Use a password of at least 8 characters.", 400);
}

export async function signUp({ name, email, password }) {
  if (authMode() !== "supabase") throw new AuthError("Sign-up is not configured on this server.", 500);
  const mail = String(email || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) throw new AuthError("Enter a valid email address.", 400);
  checkPassword(password);
  const r = await gotrue("signup", { body: { email: mail, password: String(password), data: { full_name: String(name || "").trim().slice(0, 80) || undefined } } });
  if (!r.ok) {
    const msg = String(r.data?.msg || r.data?.error_description || r.data?.message || "");
    throw new AuthError(r.status === 429 ? "Too many attempts. Wait a minute and try again." : /already|registered|exists/i.test(msg) ? "An account with this email already exists. Sign in instead." : /signups? not allowed|disabled/i.test(msg) ? "New sign-ups are turned off in Supabase (Authentication → Sign In / Providers)." : msg || "Could not create the account.", r.status === 429 ? 429 : 400);
  }
  if (!r.data.access_token) {
    // Supabase sends a confirmation email first. Record the new person now so they show in Supabase (staff table) and on
    // the Team page straight away. An email that is already registered comes back as a decoy with no identities: skip it,
    // so nobody can tamper with an existing person's access by signing up with their address.
    const pending = r.data.user || r.data;
    if (pending?.id && Array.isArray(pending.identities) && pending.identities.length) await withRole(pending).catch(() => {});
    return { confirm: true };
  }
  await saveSession(r.data);
  return { user: await withRole(r.data.user) };
}

export async function signIn(email, password) {
  if (authMode() !== "supabase") throw new AuthError("Sign-in is not configured on this server.", 500);
  if (!email || !password) throw new AuthError("Enter your email and password.", 400);
  const r = await gotrue("token?grant_type=password", { body: { email: String(email).trim(), password: String(password) } });
  if (!r.ok) {
    const msg = String(r.data?.msg || r.data?.error_description || "");
    throw new AuthError(r.status === 429 ? "Too many attempts. Wait a minute and try again." : /confirm/i.test(msg) ? "Confirm your email first (check your inbox), then sign in." : "Wrong email or password.", r.status === 429 ? 429 : 401);
  }
  const user = await withRole(r.data.user);
  if (user.role === "blocked") { await gotrue("logout", { token: r.data.access_token }).catch(() => {}); throw new AuthError("Your access to this dashboard has been blocked by an admin.", 403); }
  await saveSession(r.data);
  return user;
}

export async function signOut({ everywhere = false } = {}) {
  const jar = await cookies();
  const token = jar.get(ACCESS)?.value;
  if (token) { cache.delete(token); await gotrue(`logout${everywhere ? "?scope=global" : ""}`, { token }).catch(() => {}); }
  await clearSession();
}

async function blockedCheck(user) {
  if (user.role === "blocked") { await clearSession(); throw new AuthError("Your access to this dashboard has been blocked by an admin.", 403, { blocked: true }); }
  return user;
}

/** Returns the signed-in person with their role, refreshing an expired session. Throws AuthError when signed out or blocked. */
export async function requireUser() {
  const mode = authMode();
  if (mode === "off") return { id: "00000000-0000-4000-8000-000000000000", email: "local demo (auth off)", name: "Local demo", role: "admin" };
  if (mode === "missing") throw new AuthError("Sign-in is not configured: set SUPABASE_URL and SUPABASE_ANON_KEY for the dashboard.", 500);
  const jar = await cookies();
  const token = jar.get(ACCESS)?.value;
  if (token) {
    const hit = cache.get(token);
    if (hit && hit.until > Date.now()) return blockedCheck(hit.user);
    const r = await gotrue("user", { method: "GET", token });
    if (r.ok) {
      const user = await withRole(r.data);
      if (cache.size > 500) cache.clear();
      cache.set(token, { user, until: Date.now() + CACHE_MS });
      return blockedCheck(user);
    }
    cache.delete(token);
  }
  const refresh = jar.get(REFRESH)?.value;
  if (refresh) {
    const r = await gotrue("token?grant_type=refresh_token", { body: { refresh_token: refresh } });
    if (r.ok) {
      await saveSession(r.data);
      const user = await withRole(r.data.user);
      cache.set(r.data.access_token, { user, until: Date.now() + CACHE_MS });
      return blockedCheck(user);
    }
  }
  await clearSession();
  throw new AuthError("Please sign in.");
}

/** Only admins may use the dashboard's data. */
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") throw new AuthError("Your account is waiting for an admin to approve it.", 403, { pending: true });
  return user;
}

/** Blocks cross-site form posts: state-changing requests must come from this same site. */
export function sameOrigin(request) {
  if (["GET", "HEAD"].includes(request.method)) return true;
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  try { return new URL(origin).host === host; } catch { return false; }
}
