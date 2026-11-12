"use client";
import { useEffect, useState } from "react";
import { Link as Link2, LogOut, Pause, Play, WhatsAppIcon } from "./icons";
import { api } from "../lib/api";
import { useLoad } from "./hooks";
import { Badge, Bars, Card, Msg, Page } from "./ui";

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const stateOf = (a) => (a.connected ? ["green", "Connected"] : a.state === "qr" ? ["amber", "Waiting for scan"] : ["", a.state === "logged_out" ? "Logged out" : a.state ? a.state[0].toUpperCase() + a.state.slice(1) : "Offline"]);

const lagosTime = (d, withDay) => d.toLocaleString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", ...(withDay ? { weekday: "short" } : {}) });

/** "in 3m 05s", "in 14h 20m", or "Mon 08:00" for far-off times. */
function countdown(at, now) {
  const ms = new Date(at).getTime() - now;
  if (ms <= 0) return "now";
  const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h >= 24) return lagosTime(new Date(at), true);
  if (h) return `in ${h}h ${String(m).padStart(2, "0")}m`;
  return `in ${m}m ${String(sec).padStart(2, "0")}s`;
}

/** Live "Next send in …" with the reason it is waiting. */
function NextSend({ next, compact = false }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  if (!next) return null;
  const when = next.at ? countdown(next.at, now) : null;
  const text = !next.at ? "Not scheduled" : when === "now" ? "Sending now…" : `Next send ${when}`;
  if (compact) return <span className="muted" title={next.reason} style={{ whiteSpace: "nowrap" }}>{next.at ? (when === "now" ? "now" : when.replace(/^in /, "")) : "—"}</span>;
  return (
    <div className="next-send" title={next.at ? `At ${lagosTime(new Date(next.at), true)} Lagos time` : undefined}>
      <span className={`dot ${next.at ? "on" : "warn"}`} />
      <b>{text}</b>
      <span className="muted">{next.reason}</span>
    </div>
  );
}

function Performance({ s }) {
  const funnel = [["Contacted", s.contacted], ["Replied", s.engaged], ["Interested", s.leads.interested + s.leads.booked + s.leads.won], ["Survey booked", s.leads.booked + s.leads.won], ["Won", s.leads.won]];
  const top = Math.max(1, s.contacted);
  return (
    <div className="stack">
      <div className="prog">
        <div className="row between"><span className="label-sm">Today</span><span className="muted"><b style={{ color: "var(--ink)" }}>{s.sentToday}</b> / {s.cap} messages{s.warmupDay ? ` · warm-up day ${s.warmupDay}` : ""}</span></div>
        <div className="bar"><i style={{ width: `${pct(s.sentToday, s.cap)}%` }} /></div>
        <NextSend next={s.next} />
      </div>
      <div className="kpis">
        <div className="kpi"><b>{s.sent30}</b><span>Sent (30d)</span></div>
        <div className="kpi"><b>{pct(s.delivered30, s.sent30)}%</b><span>Delivered</span></div>
        <div className="kpi"><b>{pct(s.read30, s.sent30)}%</b><span>Read</span></div>
        <div className="kpi"><b>{s.replyRate}%</b><span>Reply rate</span></div>
      </div>
      <div>
        <div className="row between" style={{ marginBottom: 8 }}><span className="label-sm">Last 14 days</span><div className="legend"><span>Sent</span><span className="b">Replies</span></div></div>
        <Bars data={s.days.map((d) => ({ label: d.date, a: d.sent, b: d.replies }))} />
      </div>
      <div className="steps-funnel">
        {funnel.map(([l, v]) => <div key={l}><span className="muted">{l}</span><div className="bar"><i style={{ width: `${pct(v, top)}%` }} /></div><b>{v}</b></div>)}
      </div>
      {s.failed30 > 0 && <p className="hint" style={{ color: "var(--red)" }}>{s.failed30} messages failed in the last 30 days. If this keeps rising, pause this number for a day.</p>}
    </div>
  );
}

function Account({ a, stats, reload }) {
  const [qr, setQr] = useState(null);
  const [err, setErr] = useState("");
  const [label, setLabel] = useState(a.label || "");
  const [cap, setCap] = useState(a.daily_cap || 60);
  const [tab, setTab] = useState(a.connected ? "progress" : "setup");
  useEffect(() => {
    if (a.state !== "qr") { setQr(null); return; }
    let on = true;
    const poll = async () => { try { const r = await api(`accounts/${a.id}/qr`); if (on) setQr(r.qr); } catch { /* retry */ } };
    poll();
    const t = setInterval(poll, 2000);
    return () => { on = false; clearInterval(t); };
  }, [a.state, a.id]);
  const act = async (fn) => { setErr(""); try { await fn(); reload(); } catch (e) { setErr(e.message); } };
  const st = stateOf(a);
  return (
    <section className="card">
      <div className="card-head">
        <div className="biz"><span className="ico wa"><WhatsAppIcon size={20} weight="fill" /></span><div><b>{a.label || `WhatsApp ${a.id}`}</b><span>{a.connected ? `+${a.phone}` : `Number ${a.id}`}</span></div></div>
        <div className="row">{a.paused && <Badge tone="amber">Paused</Badge>}<Badge tone={st[0]}>{st[1]}</Badge></div>
      </div>
      <div className="card-body stack">
        <div className="tabs" style={{ justifySelf: "start" }}>
          <button className={tab === "progress" ? "on" : ""} onClick={() => setTab("progress")}>Progress</button>
          <button className={tab === "setup" ? "on" : ""} onClick={() => setTab("setup")}>Connect & settings</button>
        </div>
        <Msg error={err} />
        {tab === "progress" && (stats ? <Performance s={stats} /> : <p className="hint">Loading progress…</p>)}
        {tab === "setup" && (<>
          {a.state === "qr" && (
            <div className="qr-box">
              {qr ? <img className="qr" src={qr} alt={`QR code to link number ${a.id}`} /> : <div className="muted" style={{ height: 210, display: "grid", placeItems: "center" }}>Preparing QR…</div>}
              <ol className="steps"><li>Open WhatsApp on the phone</li><li>Settings → Linked devices → Link a device</li><li>Point the camera at this code</li></ol>
            </div>
          )}
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <label style={{ flex: 1 }}>Label<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`WhatsApp ${a.id}`} /></label>
            <label style={{ width: 110, flex: "0 0 110px" }}>Daily cap<input type="number" min="5" max="200" value={cap} onChange={(e) => setCap(Number(e.target.value))} /></label>
          </div>
          <div className="row between">
            <div className="row">
              <button className="btn sm" onClick={() => act(() => api(`accounts/${a.id}`, { method: "PATCH", body: { label, daily_cap: cap } }))}>Save</button>
              <button className="btn sm ghost" onClick={() => act(() => api(`accounts/${a.id}`, { method: "PATCH", body: { paused: !a.paused } }))}>{a.paused ? <><Play size={13} /> Resume</> : <><Pause size={13} /> Pause</>}</button>
              {a.connected && <button className="btn sm ghost danger" onClick={() => act(() => api(`accounts/${a.id}/logout`, { method: "POST", body: {} }))}><LogOut size={13} /> Log out</button>}
            </div>
            <button className="btn sm primary" onClick={() => act(() => api(`accounts/${a.id}/link`, { method: "POST", body: {} }))}><Link2 size={13} /> {a.connected ? "Re-link" : "New QR"}</button>
          </div>
        </>)}
      </div>
    </section>
  );
}

/** The one switch for all sending. Starting asks for confirmation first; pausing is instant. */
function SendingControl({ ov, onToggle }) {
  if (!ov) return null;
  const linked = ov.accounts.filter((a) => a.connected).length;
  return (
    <section className={`card send-panel ${ov.paused ? "" : "live"}`}>
      <span className={`dot ${ov.paused ? "warn" : "on"}`} />
      <div>
        <b>{ov.paused ? "Sending is paused" : "Sending is live"}</b>
        <p className="hint">
          {ov.paused
            ? linked ? `Nothing goes out until you resume. ${linked} of ${ov.accounts.length} numbers connected.` : "Link at least one number below, then resume."
            : `Messages are going out from ${linked} connected ${linked === 1 ? "number" : "numbers"} inside your sending hours.`}
        </p>
      </div>
      <button className={`btn ${ov.paused ? "primary" : ""}`} onClick={onToggle}>
        {ov.paused ? <><Play size={13} weight="fill" /> Resume sending</> : <><Pause size={13} weight="fill" /> Pause sending</>}
      </button>
    </section>
  );
}

export default function WhatsApp({ ov, onToggleSending }) {
  const { data, error, reload } = useLoad("accounts", 4000);
  const { data: stats, error: sErr } = useLoad("accounts/stats", 20000);
  const byId = Object.fromEntries((stats || []).map((s) => [s.id, s]));
  return (
    <Page title="WhatsApp numbers" sub="Track each number's progress, link new numbers, and set daily caps. Each number works on its own, so one restricted number never stops the others.">
      <Msg error={error || sErr} />
      <SendingControl ov={ov} onToggle={onToggleSending} />
      <Card title="Compare numbers" sub="Today's sending against each number's warm-up cap, and how its leads are converting." body={false} className="mb">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Number</th><th>Status</th><th>Today</th><th>Next send</th><th>Sent (30d)</th><th>Read</th><th>Reply rate</th><th>Interested</th><th>Surveys</th><th>Won</th><th>Opt-outs</th></tr></thead>
            <tbody>
              {(stats || []).map((s) => { const st = stateOf(s); return (
                <tr key={s.id}>
                  <td><div className="biz"><span className="ico wa" style={{ width: 32, height: 32 }}><WhatsAppIcon size={17} weight="fill" /></span><div><b>{s.label || `WhatsApp ${s.id}`}</b><span>{s.phone ? `+${s.phone}` : "Not linked"}</span></div></div></td>
                  <td><Badge tone={st[0]}>{s.paused ? "Paused" : st[1]}</Badge></td>
                  <td style={{ minWidth: 130 }}><div className="row" style={{ gap: 8, flexWrap: "nowrap" }}><div className="bar" style={{ flex: 1, height: 6 }}><i style={{ width: `${pct(s.sentToday, s.cap)}%` }} /></div><span className="muted" style={{ whiteSpace: "nowrap" }}>{s.sentToday}/{s.cap}</span></div></td>
                  <td><NextSend next={s.next} compact /></td>
                  <td className="num">{s.sent30}</td>
                  <td>{pct(s.read30, s.sent30)}%</td>
                  <td><b>{s.replyRate}%</b></td>
                  <td>{s.leads.interested}</td>
                  <td>{s.leads.booked}</td>
                  <td>{s.leads.won}</td>
                  <td className="muted">{s.leads.opted_out}</td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="grid g2 top">{(data || []).map((a) => <Account key={a.id + a.state + a.connected} a={a} stats={byId[a.id]} reload={reload} />)}</div>
    </Page>
  );
}
