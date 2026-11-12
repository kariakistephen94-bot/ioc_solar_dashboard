"use client";
import { useState } from "react";
import { MapPin } from "./icons";
import { api, fmtDate } from "../lib/api";
import { useLoad } from "./hooks";
import BookingModal from "./BookingModal";
import { Avatar, Msg, Page, STATUS_LABEL, Score, mapsUrl } from "./ui";

const STAGES = ["new", "contacted", "replied", "needs_human", "interested", "booked", "won", "lost"];
const COLOR = { new: "var(--faint)", contacted: "var(--blue)", replied: "var(--violet)", needs_human: "var(--brand)", interested: "var(--brand-2)", booked: "var(--green)", won: "var(--green-ink)", lost: "var(--red)" };

export default function Pipeline() {
  const [account, setAccount] = useState("");
  const { data, error, reload, setData } = useLoad(`pipeline${account ? `?account=${account}` : ""}`, 15000);
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  const [err, setErr] = useState("");
  const [booking, setBooking] = useState(null);
  const [extra, setExtra] = useState({}); // stage -> cards loaded with "Show more"
  const [loading, setLoading] = useState("");

  const pickAccount = (a) => { setAccount(a); setExtra({}); };
  const showMore = async (st, shown) => {
    setLoading(st);
    try {
      setErr("");
      const r = await api(`pipeline?stage=${st}&offset=${shown}${account ? `&account=${account}` : ""}`);
      setExtra((x) => ({ ...x, [st]: [...(x[st] || []), ...r.rows] }));
    } catch (e) { setErr(e.message); }
    setLoading("");
  };

  const move = async (lead, to) => {
    if (!lead || lead.status === to) return;
    if (to === "booked") { setBooking(lead); return; }
    setExtra((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, v.filter((r) => r.id !== lead.id)])));
    // Optimistic move so the board feels instant.
    setData((d) => d && { columns: d.columns.map((c) => c.status === lead.status ? { ...c, total: c.total - 1, rows: c.rows.filter((r) => r.id !== lead.id) } : c.status === to ? { ...c, total: c.total + 1, rows: [{ ...lead, status: to }, ...c.rows] } : c) });
    try { setErr(""); await api(`leads/${lead.id}`, { method: "PATCH", body: { status: to } }); } catch (e) { setErr(e.message); }
    reload();
  };
  const cols = data?.columns || [];
  const total = cols.reduce((a, c) => a + c.total, 0);
  return (
    <Page title="Pipeline" sub="Every lead by stage. Drag a card to another column, or use its menu, to update it."
      actions={<select style={{ width: 190 }} value={account} onChange={(e) => pickAccount(e.target.value)} aria-label="Filter by WhatsApp number"><option value="">All WhatsApp numbers</option>{["A", "B", "C", "D"].map((a) => <option key={a} value={a}>WhatsApp {a} only</option>)}</select>}>
      <Msg error={error || err} />
      <p className="hint" style={{ marginBottom: 14 }}><b style={{ color: "var(--ink)" }}>{total.toLocaleString()}</b> leads across these stages. Columns load 40 at a time.</p>
      <div className="board">
        {STAGES.map((st) => {
          const base = cols.find((c) => c.status === st) || { rows: [], total: 0 };
          const seen = new Set(base.rows.map((r) => r.id));
          const col = { ...base, rows: [...base.rows, ...(extra[st] || []).filter((r) => !seen.has(r.id) && r.status === st)] };
          const left = col.total - col.rows.length;
          return (
            <section key={st} className={`col ${over === st ? "over" : ""}`} aria-label={STATUS_LABEL[st]}
              onDragOver={(e) => { e.preventDefault(); setOver(st); }} onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); move(drag, st); setDrag(null); }}>
              <div className="col-head"><span className="row" style={{ gap: 8 }}><span className="dot" style={{ background: COLOR[st] }} />{STATUS_LABEL[st]}</span><span className="n">{col.total}</span></div>
              <div className="col-list">
                {col.rows.map((l) => (
                  <article key={l.id} className={`kcard ${drag?.id === l.id ? "dragging" : ""}`} draggable onDragStart={() => setDrag(l)} onDragEnd={() => setDrag(null)}>
                    <div className="biz"><Avatar name={l.name} size={30} /><div><b>{l.name}</b><span>{l.sector}</span></div></div>
                    <div className="meta">
                      <a href={mapsUrl(l)} target="_blank" rel="noreferrer" className="row" style={{ gap: 4, color: "inherit" }} title="Open in Google Maps"><MapPin size={12} />{l.city || "Map"}</a>
                      <Score v={l.score} />
                    </div>
                    {l.booking_at && <div className="badge green plain">Survey {fmtDate(l.booking_at)}</div>}
                    <div className="meta">
                      <span title={l.last_contacted_at ? `Last contact ${fmtDate(l.last_contacted_at)}` : ""}>{l.account_id ? `WhatsApp ${l.account_id}` : "Not contacted"}</span>
                      <select value={l.status} onChange={(e) => move(l, e.target.value)} aria-label={`Move ${l.name} to stage`}>
                        {STAGES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                      </select>
                    </div>
                  </article>
                ))}
                {!col.rows.length && <div className="col-more">Drop leads here</div>}
                {left > 0 && (
                  <button className="col-more btn" onClick={() => showMore(st, col.rows.length)} disabled={loading === st} aria-label={`Show more ${STATUS_LABEL[st]} leads`}>
                    {loading === st ? "Loading…" : `Show ${Math.min(40, left)} more · ${left.toLocaleString()} left`}
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {booking && <BookingModal lead={booking} onClose={() => setBooking(null)} onSaved={reload} />}
    </Page>
  );
}
