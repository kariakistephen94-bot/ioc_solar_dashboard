/**
 * Calls the engine through the dashboard's server-side proxy. The session cookie goes along automatically.
 * When the session has ended, an "oic:signed-out" event tells the app to show the sign-in screen.
 * @param {string} path
 * @param {{ method?: string, body?: unknown }} [options]
 * @returns {Promise<any>}
 */
export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api/engine/${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && data.auth) window.dispatchEvent(new Event("oic:signed-out"));
  if (res.status === 403 && (data.pending || data.blocked)) window.dispatchEvent(new CustomEvent("oic:access-changed", { detail: data }));
  if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status})`); e.status = res.status; throw e; }
  return data;
}

/** @param {"login" | "logout" | "me" | "signup"} action @param {unknown} [body] @returns {Promise<any>} */
export async function auth(action, body) {
  const res = await fetch(`/api/auth/${action}`, {
    method: action === "me" ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || `Request failed (${res.status})`); e.status = res.status; e.mode = data.mode; throw e; }
  return data;
}

export const fmtDate = (v) => (v ? new Date(v).toLocaleString("en-GB", { timeZone: "Africa/Lagos", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
export const naira = (n) => `₦${Number(n || 0).toLocaleString("en-NG")}`;
