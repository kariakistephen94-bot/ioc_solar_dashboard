"use client";
import { CheckCircle, EmptyTray, WarningCircle, X } from "./icons";

export const Badge = ({ tone = "", plain = false, children }) => <span className={`badge ${tone} ${plain ? "plain" : ""}`}>{children}</span>;
export const STATUS_TONE = { new: "", contacted: "blue", replied: "violet", interested: "amber", booked: "green", won: "green", lost: "red", opted_out: "red", call_only: "", needs_human: "amber" };
export const STATUS_LABEL = { new: "Ready", contacted: "Contacted", replied: "Replied", interested: "Interested", booked: "Survey booked", won: "Won", lost: "Lost", opted_out: "Opted out", call_only: "Call only", needs_human: "Needs you" };
export const StatusBadge = ({ s }) => <Badge tone={STATUS_TONE[s]}>{STATUS_LABEL[s] || s}</Badge>;
export const Msg = ({ error, ok }) => (
  error ? <div className="err" role="alert"><WarningCircle size={15} /><span>{error}</span></div>
    : ok ? <div className="okmsg" role="status"><CheckCircle size={15} /><span>{ok}</span></div> : null
);

export const Page = ({ title, sub, actions, children }) => (
  <>
    <div className="head"><div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>{actions && <div className="row">{actions}</div>}</div>
    {children}
  </>
);

export const Card = ({ title, sub, actions, children, body = true, style, className = "" }) => (
  <section className={`card ${className}`} style={style}>
    {(title || actions) && (
      <div className="card-head"><div>{title && <h3>{title}</h3>}{sub && <p>{sub}</p>}</div>{actions && <div className="row">{actions}</div>}</div>
    )}
    {body ? <div className="card-body">{children}</div> : children}
  </section>
);

/** A band of headline numbers. Put <Stat> cells inside. */
export const Stats = ({ children, cols = 4 }) => <div className={`stats ${cols === 3 ? "n3" : ""} mb`}>{children}</div>;
export const Stat = ({ label, value, hint, icon: Icon }) => (
  <div className="stat">
    <div className="stat-top">{Icon && <Icon size={15} weight="regular" />}<span>{label}</span></div>
    <div className="stat-val">{value}</div>
    {hint && <div className="stat-hint">{hint}</div>}
  </div>
);

export function Avatar({ name = "?", size = 32 }) {
  const initials = String(name).replace(/[^A-Za-z0-9 ]/g, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  return <span className="avatar" aria-hidden="true" style={{ width: size, height: size, fontSize: size < 30 ? 10.5 : undefined }}>{initials}</span>;
}

export const Score = ({ v }) => <span className="score">{v}<i style={{ "--w": `${Math.max(0, Math.min(100, v))}%` }} /></span>;
export const Empty = ({ title, children, icon: Icon = EmptyTray }) => <div className="empty"><Icon size={26} weight="regular" /><b>{title}</b>{children}</div>;

/** Tiny bar chart: [{ label, a, b }] where a = primary bar, b = secondary bar. */
export function Bars({ data, height = 64 }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.a, d.b || 0)));
  return (
    <div className="bars" style={{ height }} role="img" aria-label={data.map((d) => `${d.label}: ${d.a} sent, ${d.b || 0} replies`).join("; ")}>
      {data.map((d) => (
        <div key={d.label} className="bars-col" title={`${d.label}: ${d.a} sent · ${d.b || 0} replies`}>
          <i style={{ height: d.a ? `max(2px, ${(d.a / max) * 100}%)` : 0 }} />
          {d.b != null && <i className="b" style={{ height: d.b ? `max(2px, ${(d.b / max) * 100}%)` : 0 }} />}
        </div>
      ))}
    </div>
  );
}

export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}>
      <div className="card modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="card-head"><h3>{title}</h3><button className="btn icon sm ghost" onClick={onClose} aria-label="Close"><X size={15} /></button></div>
        <div className="card-body">{children}</div>
      </div>
    </div>
  );
}

export const mapsUrl = (l) => (l.lat != null && l.lon != null ? `https://www.google.com/maps?q=${l.lat},${l.lon}` : `https://www.google.com/maps/search/${encodeURIComponent([l.name, l.address, l.city, l.state, "Nigeria"].filter(Boolean).join(", "))}`);
