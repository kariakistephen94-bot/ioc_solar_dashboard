"use client";
import { useState } from "react";
import { Hourglass, LogOut, Prohibit, ShieldCheck } from "./icons";
import { api, fmtDate } from "../lib/api";
import { useLoad } from "./hooks";
import { Avatar, Badge, Card, Empty, Msg, Page, Stat, Stats } from "./ui";

const ROLE = { admin: ["green", "Admin"], user: ["amber", "Waiting"], blocked: ["red", "Blocked"] };

export default function Team({ user, onSignOut }) {
  const { data, error, reload } = useLoad("staff", 15000);
  const [msg, setMsg] = useState({});
  const [busyId, setBusyId] = useState("");
  const rows = data?.rows || [];
  const change = async (r, role) => {
    if (role === r.role) return;
    if (role === "blocked" && !window.confirm(`Block ${r.email}? They will be signed out and cannot use the dashboard.`)) return;
    setBusyId(r.user_id); setMsg({});
    try { await api(`staff/${r.user_id}`, { method: "PATCH", body: { role } }); setMsg({ ok: `${r.name || r.email} is now ${ROLE[role][1].toLowerCase() === "waiting" ? "a user (no access)" : ROLE[role][1].toLowerCase()}.` }); reload(); }
    catch (e) { setMsg({ error: e.message }); } finally { setBusyId(""); }
  };
  const pending = rows.filter((r) => r.role === "user");
  return (
    <Page title="Team" sub="Everyone who created an account. Only admins can open the dashboard; new sign-ups wait as users until an admin approves them.">
      <Msg error={error} />
      <Msg {...msg} />
      <Stats cols={3}>
        <Stat label="Admins" value={rows.filter((r) => r.role === "admin").length} hint="Full dashboard access" icon={ShieldCheck} />
        <Stat label="Waiting for approval" value={pending.length} hint="Signed up, no access yet" icon={Hourglass} />
        <Stat label="Blocked" value={rows.filter((r) => r.role === "blocked").length} hint="Refused at sign-in" icon={Prohibit} />
      </Stats>
      <div className="grid g-wide top">
        <section className="card">
          <div className="card-head"><div><h3>Members</h3><p>Change access with the menu. Changes apply within 30 seconds, even for people already signed in.</p></div></div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Person</th><th>Access</th><th>Joined</th><th>Last changed</th><th>Change access</th></tr></thead>
              <tbody>
                {[...pending, ...rows.filter((r) => r.role !== "user")].map((r) => {
                  const me = r.user_id === user.id; const [tone, label] = ROLE[r.role] || ["", r.role];
                  return (
                    <tr key={r.user_id}>
                      <td><div className="biz"><Avatar name={r.name || r.email} /><div><b>{r.name || r.email.split("@")[0]} {me && <Badge tone="blue" plain>You</Badge>}</b><span>{r.email}</span></div></div></td>
                      <td><Badge tone={tone}>{label}</Badge></td>
                      <td className="muted">{fmtDate(r.created_at)}</td>
                      <td className="muted">{r.updated_by ? [r.updated_at && r.updated_at !== r.created_at ? fmtDate(r.updated_at) : null, r.updated_by === "ADMIN_EMAILS" ? "owner" : r.updated_by].filter(Boolean).join(" · ") : "—"}</td>
                      <td>
                        {me ? <span className="muted">Ask another admin</span> : (
                          <select style={{ width: 160 }} value={r.role} disabled={busyId === r.user_id} onChange={(e) => change(r, e.target.value)} aria-label={`Access for ${r.email}`}>
                            <option value="admin">Admin</option>
                            <option value="user">User (no access)</option>
                            <option value="blocked">Blocked</option>
                          </select>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!rows.length && <Empty title="No accounts yet">People appear here as soon as they create an account.</Empty>}
          </div>
        </section>
        <Card title="Your session" sub="Signed in with a secure, HttpOnly cookie that renews itself for up to 30 days.">
          <div className="stack">
            <div className="biz"><Avatar name={user.name || user.email} size={42} /><div><b>{user.name || user.email}</b><span>{user.email}</span></div></div>
            <div className="row"><Badge tone="green">Admin</Badge>{user.since && <span className="muted">Member since {fmtDate(user.since)}</span>}</div>
            <p className="hint">Only admins can open the dashboard and change access. You can't change your own access, so a team always keeps at least one admin.</p>
            <div className="row">
              <button className="btn" onClick={() => onSignOut(false)}><LogOut size={14} /> Sign out</button>
              <button className="btn ghost danger" onClick={() => onSignOut(true)}>Sign out on all devices</button>
            </div>
          </div>
        </Card>
      </div>
    </Page>
  );
}
