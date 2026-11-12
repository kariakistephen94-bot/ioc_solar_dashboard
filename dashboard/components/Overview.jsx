"use client";
import { fmtDate } from "../lib/api";
import { useLoad } from "./hooks";
import { Database, Outbox, PauseCircle, Replies, TrendUp, WhatsAppIcon } from "./icons";
import { Card, Empty, Page, Stat, Stats } from "./ui";

const STAGES = [["new", "Ready"], ["contacted", "Contacted"], ["replied", "Replied"], ["interested", "Interested"], ["booked", "Survey booked"], ["won", "Won"]];
const tone = (k) => (/opt_out|lost|error|failed/.test(k) ? "red" : /booked|won|interested/.test(k) ? "green" : /auto_reply/.test(k) ? "" : /agent|human|discovery/.test(k) ? "amber" : "");
const label = (k) => { const s = String(k).replace(/^agent_/, "AI: ").replace(/_/g, " "); return s[0].toUpperCase() + s.slice(1); };

export default function Overview({ ov, goto }) {
  const { data: act } = useLoad("activity", 15000);
  if (!ov) return <Page title="Overview" sub="Connecting to the engine…" />;

  const s = ov.byStatus;
  const contacted = s.contacted + s.replied + s.interested + s.booked + s.won + s.lost;
  const engaged = s.replied + s.interested + s.booked + s.won;
  const rate = contacted ? Math.round((engaged / contacted) * 100) : 0;
  const max = Math.max(1, ...STAGES.map(([k]) => s[k]));
  const rows = act?.rows || [];

  return (
    <Page title="Overview" sub="How OIC Solar's WhatsApp outreach is doing right now.">
      {ov.paused && (
        <div className="banner">
          <PauseCircle size={20} weight="fill" />
          <p><b>Sending is paused.</b> Link your WhatsApp numbers and test the AI agent first. When you are ready, resume sending on the WhatsApp page.</p>
          <button className="btn sm primary" onClick={() => goto("WhatsApp")}>Go to WhatsApp</button>
        </div>
      )}
      <Stats>
        <Stat label="Leads in database" value={ov.total.toLocaleString()} hint={`${s.call_only} landline only`} icon={Database} />
        <Stat label="Ready to message" value={s.new.toLocaleString()} hint="Checked and queued by score" icon={Outbox} />
        <Stat label="Sent, last 24 hours" value={ov.sent24h} hint={`${ov.replies24h} ${ov.replies24h === 1 ? "reply" : "replies"} received`} icon={Replies} />
        <Stat label="Reply rate" value={`${rate}%`} hint={`${engaged} of ${contacted} contacted replied`} icon={TrendUp} />
      </Stats>

      <div className="grid g-main">
        <Card title="Pipeline" sub="Where every lead currently sits" actions={<button className="btn sm" onClick={() => goto("Pipeline")}>Open board</button>}>
          <div className="funnel">
            {STAGES.map(([k, l]) => (
              <div key={k} className="funnel-row"><span>{l}</span><div className="bar"><i style={{ width: `${(s[k] / max) * 100}%` }} /></div><b>{s[k].toLocaleString()}</b></div>
            ))}
          </div>
          <div className="mini-stats">
            <div><b>{s.needs_human}</b>Need you</div>
            <div><b>{s.booked}</b>Surveys booked</div>
            <div><b>{s.opted_out}</b>Opted out</div>
            <div><b>{s.lost}</b>Lost</div>
          </div>
        </Card>
        <Card title="WhatsApp numbers" sub="Each warms up and sends on its own" body={false} actions={<button className="btn sm" onClick={() => goto("WhatsApp")}>Manage</button>}>
          {ov.accounts.map((a) => (
            <div key={a.id} className="list-row">
              <span className="ico wa"><WhatsAppIcon size={19} weight="fill" /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{a.label || `WhatsApp ${a.id}`}</b>
                <div className="muted num" style={{ fontSize: 12.5 }}>{a.phone ? `+${a.phone}` : "Not linked yet"}</div>
              </div>
              <span className="state"><span className={`dot ${a.connected ? "on" : a.state === "qr" ? "warn" : ""}`} />{a.connected ? "Connected" : a.state === "qr" ? "Waiting for scan" : a.state === "logged_out" ? "Logged out" : a.state ? a.state[0].toUpperCase() + a.state.slice(1) : "Offline"}</span>
            </div>
          ))}
        </Card>
      </div>

      <Card title="Recent activity" sub="Replies, bookings, opt-outs and system events" body={false} className="mt">
        {!rows.length ? <Empty title="Nothing yet">Activity appears as soon as messages go out.</Empty> : (
          <div className="timeline">
            {rows.slice(0, 10).map((r) => (
              <div key={r.id} className="tl"><span className={`node ${tone(r.kind)}`} /><div><b>{label(r.kind)}</b> <span className="muted">· {r.detail}</span></div><time>{fmtDate(r.at)}</time></div>
            ))}
          </div>
        )}
      </Card>
    </Page>
  );
}
