"use client";
import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, MapPin, NavCalendar, Phone } from "./icons";
import { api } from "../lib/api";
import { useLoad } from "./hooks";
import BookingModal from "./BookingModal";
import { Avatar, Badge, Card, Empty, Modal, Msg, Page, mapsUrl } from "./ui";

// Lagos is UTC+1 all year: shift by one hour and read the UTC date to get the Lagos calendar day.
const dayKey = (d) => new Date(new Date(d).getTime() + 3600e3).toISOString().slice(0, 10);
const timeOf = (d) => new Date(d).toLocaleTimeString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit" });
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthGrid(year, month) {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() + 6) % 7; // Monday first
  return [...Array(42)].map((_, i) => new Date(Date.UTC(year, month, 1 - offset + i)).toISOString().slice(0, 10));
}

function LeadPicker({ day, onClose, onPicked }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({ limit: "8", ...(q ? { q } : { status: "interested" }) });
        setRows((await api(`leads?${qs}`)).rows);
      } catch { setRows([]); }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <Modal title={`Book a survey on ${new Date(day + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}`} onClose={onClose}>
      <div className="stack">
        <input autoFocus placeholder="Search any lead by name, phone or city" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search leads" />
        {!q && <p className="hint">Showing interested leads. Type to search everyone.</p>}
        <div>
          {rows.map((l) => (
            <button key={l.id} className="item" style={{ borderRadius: 10 }} onClick={() => onPicked(l)}>
              <Avatar name={l.name} size={30} /><div className="meta"><b>{l.name}</b><span className="muted" style={{ fontSize: 12 }}>{l.sector} · {l.city}</span></div>
            </button>
          ))}
          {!rows.length && <Empty title="No leads found" />}
        </div>
      </div>
    </Modal>
  );
}

export default function Calendar() {
  const now = new Date(Date.now() + 3600e3);
  const [ym, setYm] = useState([now.getUTCFullYear(), now.getUTCMonth()]);
  const [sel, setSel] = useState(dayKey(Date.now()));
  const [picking, setPicking] = useState(false);
  const [booking, setBooking] = useState(null);
  const days = useMemo(() => monthGrid(ym[0], ym[1]), [ym]);
  const from = `${days[0]}T00:00:00+01:00`, to = new Date(new Date(`${days[41]}T00:00:00+01:00`).getTime() + 864e5).toISOString();
  const { data, error, reload } = useLoad(`calendar?from=${encodeURIComponent(new Date(from).toISOString())}&to=${encodeURIComponent(to)}`, 30000);

  const byDay = useMemo(() => {
    const m = {};
    for (const e of data?.events || []) (m[dayKey(e.at)] ||= []).push(e);
    for (const k in m) m[k].sort((a, b) => (a.type === b.type ? new Date(a.at) - new Date(b.at) : a.type === "survey" ? -1 : 1));
    return m;
  }, [data]);
  const monthKey = `${ym[0]}-${String(ym[1] + 1).padStart(2, "0")}`;
  const inMonth = (data?.events || []).filter((e) => dayKey(e.at).startsWith(monthKey));
  const today = dayKey(Date.now());
  const shift = (n) => setYm(([y, m]) => { const d = new Date(Date.UTC(y, m + n, 1)); return [d.getUTCFullYear(), d.getUTCMonth()]; });
  const label = new Date(Date.UTC(ym[0], ym[1], 15)).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const agenda = byDay[sel] || [];

  return (
    <Page title="Calendar" sub="Site surveys the AI or your team booked, and the follow-ups the engine will send."
      actions={<button className="btn brand" onClick={() => setPicking(true)}><CalendarPlus size={14} /> Book a survey</button>}>
      <Msg error={error} />
      <div className="grid g-main" style={{ gridTemplateColumns: "minmax(0, 2.2fr) minmax(0, 1fr)" }}>
        <section className="card">
          <div className="card-head">
            <div className="row" style={{ gap: 6 }}>
              <button className="btn icon sm" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft size={14} /></button>
              <button className="btn icon sm" onClick={() => shift(1)} aria-label="Next month"><ChevronRight size={14} /></button>
              <h3 style={{ marginLeft: 6 }}>{label}</h3>
              <button className="btn sm ghost" onClick={() => { setYm([now.getUTCFullYear(), now.getUTCMonth()]); setSel(today); }}>Today</button>
            </div>
            <div className="legend"><span className="s">{plural(inMonth.filter((e) => e.type === "survey").length, "survey")}</span><span>{plural(inMonth.filter((e) => e.type === "followup").length, "follow-up")}</span></div>
          </div>
          <div className="cal">
            {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
            {days.map((d) => {
              const ev = byDay[d] || [];
              return (
                <button key={d} className={`cal-day ${d.startsWith(monthKey) ? "" : "out"} ${d === today ? "today" : ""} ${d === sel ? "sel" : ""}`} onClick={() => setSel(d)} aria-label={`${d}: ${ev.length} events`}>
                  <span className="cal-num">{Number(d.slice(8))}</span>
                  {ev.slice(0, 3).map((e, i) => <span key={i} className={`ev ${e.type}`}>{e.type === "survey" ? `${timeOf(e.at)} ${e.lead.name}` : e.lead.name}</span>)}
                  {ev.length > 3 && <span className="ev-more">+{ev.length - 3} more</span>}
                  {ev.length > 0 && <span className="dots">{ev.slice(0, 6).map((e, i) => <i key={i} className={e.type === "survey" ? "s" : ""} />)}</span>}
                </button>
              );
            })}
          </div>
        </section>
        <Card title={new Date(sel + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} sub={`${plural(agenda.filter((e) => e.type === "survey").length, "survey")} · ${plural(agenda.filter((e) => e.type === "followup").length, "follow-up")}`}
          actions={<button className="btn sm" onClick={() => setPicking(true)}>Add</button>}>
          {!agenda.length && <Empty title="Nothing scheduled" icon={NavCalendar}>Pick another day, or book a survey.</Empty>}
          {agenda.map((e, i) => (
            <div key={i} className="agenda-item">
              <div className="agenda-time">{e.type === "survey" ? timeOf(e.at) : "Auto"}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="row between" style={{ flexWrap: "nowrap" }}><b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.lead.name}</b>{e.type === "survey" ? <Badge tone="green">Survey</Badge> : <Badge tone="amber">Follow-up {e.n}</Badge>}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>{e.lead.sector}{e.lead.contact_name ? ` · ${e.lead.contact_name}` : ""}</div>
                {e.note && <div style={{ fontSize: 12.5, marginTop: 4 }}>{e.note}</div>}
                <div className="row" style={{ marginTop: 6, gap: 12, fontSize: 12.5 }}>
                  <a href={`tel:+${e.lead.phone}`} className="row muted" style={{ gap: 4 }}><Phone size={12} />+{e.lead.phone}</a>
                  <a href={mapsUrl(e.lead)} target="_blank" rel="noreferrer" className="row muted" style={{ gap: 4 }}><MapPin size={12} />{e.lead.city || "Map"}</a>
                  {e.type === "survey" && <button className="btn sm ghost" onClick={() => setBooking({ ...e.lead, booking_at: e.at, booking_note: e.note })}>Reschedule</button>}
                  {e.lead.account_id && <span className="muted">WhatsApp {e.lead.account_id}</span>}
                </div>
              </div>
            </div>
          ))}
        </Card>
      </div>
      {picking && <LeadPicker day={sel} onClose={() => setPicking(false)} onPicked={(l) => { setPicking(false); setBooking({ ...l, _day: sel }); }} />}
      {booking && <BookingModal lead={booking} defaultDate={booking._day ? `${booking._day}T10:00` : undefined} onClose={() => setBooking(null)} onSaved={reload} />}
    </Page>
  );
}
