"use client";
import { CalendarCheck, Clock as Clock3, Repeat } from "./icons";
import { fmtDate } from "../lib/api";
import { useLoad } from "./hooks";
import { Avatar, Badge, Empty, Msg, Page, Stat, Stats } from "./ui";

export default function FollowUps() {
  const { data, error } = useLoad("followups", 15000);
  const { data: s } = useLoad("settings");
  const days = s?.engine?.followupDays || [3, 7];
  const rows = data?.due || [];
  const now = Date.now();
  const due = rows.filter((r) => new Date(r.next_followup_at) <= now).length;
  return (
    <Page title="Follow-ups" sub={`Leads who don't reply get a follow-up on day ${days.join(" and day ")} from the same number. A reply stops the sequence and the AI agent takes over.`}>
      <Msg error={error} />
      <Stats cols={3}>
        <Stat label="Due now" value={due} hint="Sent at the next free slot" icon={Clock3} />
        <Stat label="In the sequence" value={rows.length} hint="Contacted, no reply yet" icon={Repeat} />
        <Stat label="Followed up once" value={rows.filter((r) => r.followups_sent > 0).length} hint="One more before we stop" icon={CalendarCheck} />
      </Stats>
      <section className="card">
        <div className="card-head"><div><h3>Scheduled follow-ups</h3><p>Quiet leads who replied earlier also get one AI nudge after 24 hours. STOP removes anyone instantly.</p></div></div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Business</th><th>From number</th><th>First message</th><th>Progress</th><th>Next follow-up</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><div className="biz"><Avatar name={r.name} /><div><b>{r.name}</b><span>{r.sector}</span></div></div></td>
                  <td>WhatsApp {r.account_id}</td>
                  <td className="muted">{fmtDate(r.first_contacted_at)}</td>
                  <td><div className="row" style={{ gap: 4 }}>{days.map((d, i) => <span key={d} title={`Day ${d}`} style={{ width: 20, height: 4, borderRadius: 2, background: i < r.followups_sent ? "var(--brand)" : "var(--line-2)" }} />)}<span className="muted" style={{ marginLeft: 6 }}>{r.followups_sent}/{days.length}</span></div></td>
                  <td>{new Date(r.next_followup_at) <= now ? <Badge tone="amber">Due now</Badge> : <span className="muted">{fmtDate(r.next_followup_at)}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <Empty title="Nothing scheduled">Follow-ups appear as soon as first messages go out.</Empty>}
        </div>
      </section>
    </Page>
  );
}
