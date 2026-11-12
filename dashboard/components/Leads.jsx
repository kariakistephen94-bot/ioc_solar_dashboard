"use client";
import { useCallback, useEffect, useState } from "react";
import { Database, Download, MapPin, Search, Upload } from "./icons";
import { api, fmtDate } from "../lib/api";
import { useLoad } from "./hooks";
import { Avatar, Card, Empty, Msg, Page, STATUS_LABEL, Score, StatusBadge } from "./ui";

const STATUSES = ["new", "contacted", "replied", "interested", "booked", "won", "lost", "opted_out", "call_only", "needs_human"];

function Discover({ meta, onDone }) {
  const [ids, setIds] = useState([]);
  const [state, setState] = useState("");
  const [source, setSource] = useState("osm");
  const [maxReq, setMaxReq] = useState(300);
  const [target, setTarget] = useState(2000);
  const [err, setErr] = useState("");
  const { data: st, reload } = useLoad("discovery", 3000);
  useEffect(() => { if (st && !st.running && st.finishedAt) onDone(); }, [st?.running, st?.finishedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const states = [...new Set((meta?.areas || []).map((a) => a.state))];
  const shown = (meta?.areas || []).filter((a) => !state || a.state === state);
  const start = async () => { setErr(""); try { await api("discovery", { method: "POST", body: { areaIds: ids, source, maxRequests: maxReq, targetNew: target } }); reload(); } catch (e) { setErr(e.message); } };
  return (
    <Card title="Find new leads" sub="Pick neighbourhoods. Only businesses that run on generators (hotels, clinics, cold rooms, schools…) with a phone number are kept."
      actions={<div className="tabs"><button className={source === "osm" ? "on" : ""} onClick={() => setSource("osm")}>OpenStreetMap · free</button><button className={source === "google" ? "on" : ""} disabled={!meta?.googleConfigured} title={meta?.googleConfigured ? "" : "Add GOOGLE_MAPS_API_KEY to engine/.env and restart"} onClick={() => setSource("google")}>Google Places{meta?.googleConfigured ? "" : " · add key"}</button></div>}
      className="mb">
      <div className="stack">
        <Msg error={err} />
        <div className="row">
          <select style={{ width: 180 }} value={state} onChange={(e) => setState(e.target.value)} aria-label="Filter areas by state"><option value="">All states</option>{states.map((s) => <option key={s}>{s}</option>)}</select>
          <button className="btn sm ghost" onClick={() => setIds(shown.map((a) => a.id))}>Select all shown</button>
          <button className="btn sm ghost" onClick={() => setIds([])}>Clear</button>
          <span className="muted">{ids.length ? `${ids.length} selected` : "None selected = every area"}</span>
        </div>
        <div className="chips">
          {shown.map((a) => { const on = ids.includes(a.id); return (
            <button key={a.id} type="button" className={`chip ${on ? "on" : ""}`} aria-pressed={on} onClick={() => setIds(on ? ids.filter((x) => x !== a.id) : [...ids, a.id])}><MapPin size={12} />{a.name}</button>
          ); })}
        </div>
        {source === "google" && (
          <div className="row">
            <label style={{ width: 170 }}>Max API requests<input type="number" min="1" max="2000" value={maxReq} onChange={(e) => setMaxReq(Number(e.target.value))} /></label>
            <label style={{ width: 170 }}>Stop after new leads<input type="number" min="0" value={target} onChange={(e) => setTarget(Number(e.target.value))} /></label>
            <p className="hint" style={{ flex: 1, minWidth: 220, alignSelf: "end" }}>Each request returns up to 20 businesses, so ~300 requests can yield 1,000–3,000 leads. The search stops at whichever limit comes first.</p>
          </div>
        )}
        {source === "osm" && <p className="hint">Free but thin in Nigeria: roughly 5–15 leads per area. Use Google Places or CSV import for volume.</p>}
        <div className="row between">
          <div style={{ flex: 1, minWidth: 220 }}>
            {st && (st.running || st.finishedAt) && (<>
              <div className="bar"><i style={{ width: `${st.total ? (st.done / st.total) * 100 : 0}%` }} /></div>
              <div className="hint" style={{ marginTop: 6 }}>{st.running ? `Searching ${st.current}… ` : "Finished. "}{st.done}/{st.total} areas · <b>{st.added}</b> new leads{st.errors.length ? ` · ${st.errors.length} areas failed` : ""}</div>
            </>)}
          </div>
          <button className="btn brand" disabled={st?.running} onClick={start}><Search size={14} /> {st?.running ? "Searching…" : ids.length ? `Search ${ids.length} areas` : "Search every area"}</button>
        </div>
      </div>
    </Card>
  );
}

function Importer({ onDone }) {
  const [csv, setCsv] = useState("");
  const [msg, setMsg] = useState({});
  const run = async () => { try { const r = await api("leads/import", { method: "POST", body: { csv } }); setMsg({ ok: `Read ${r.parsed} rows, added ${r.added} new leads. Duplicates were skipped.` }); setCsv(""); onDone(); } catch (e) { setMsg({ error: e.message }); } };
  return (
    <Card title="Import a list" sub="CSV columns: name, phone, sector, city, state, email, website. Phones like 0803… or +234… are fine." className="mb">
      <div className="stack">
        <Msg {...msg} />
        <input type="file" accept=".csv,text/csv" aria-label="CSV file" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setCsv(await f.text()); }} />
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="…or paste CSV here" aria-label="CSV text" />
        <div><button className="btn primary" disabled={!csv.trim()} onClick={run}><Upload size={14} /> Import leads</button></div>
      </div>
    </Card>
  );
}

export default function Leads() {
  const [f, setF] = useState({ q: "", status: "", state: "", sector: "" });
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ rows: [], total: 0 });
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [panel, setPanel] = useState("");
  const { data: meta } = useLoad("meta");
  const load = useCallback(async () => {
    const qs = new URLSearchParams({ limit: "50", offset: String(page * 50), ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) });
    try { setData(await api(`leads?${qs}`)); setErr(""); } catch (e) { setErr(e.message); }
  }, [f, page]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const states = [...new Set((meta?.areas || []).map((a) => a.state))];
  const setFilter = (k) => (e) => { setPage(0); setF({ ...f, [k]: e.target.value }); };
  const patch = async (id, body) => { try { await api(`leads/${id}`, { method: "PATCH", body }); load(); } catch (e) { setErr(e.message); } };
  const seed = async () => { try { const r = await api("leads/seed", { method: "POST", body: {} }); setErr(""); setNote(`Loaded ${r.added} new leads from the prefilled list (${r.parsed - r.added} were already here).`); load(); } catch (e) { setErr(e.message); } };
  const exportCsv = () => {
    const cols = ["name", "phone", "sector", "city", "state", "score", "status", "power_signal"];
    const esc = (v) => { const s = String(v ?? ""); return `"${(/^[=+\-@]/.test(s) ? "'" + s : s).replace(/"/g, '""')}"`; };
    const blob = new Blob([[cols.join(","), ...data.rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "oic-leads.csv"; a.click();
  };
  const pages = Math.max(1, Math.ceil(data.total / 50));
  return (
    <Page title="Leads" sub="Businesses across Nigeria that lose money to power cuts, scored by how badly they need backup power."
      actions={<>
        <button className="btn" onClick={seed}><Database size={14} /> Load prefilled</button>
        <button className="btn" onClick={() => setPanel(panel === "csv" ? "" : "csv")}><Upload size={14} /> Import</button>
        <button className="btn brand" onClick={() => setPanel(panel === "find" ? "" : "find")}><Search size={14} /> Find leads</button>
      </>}>
      <Msg error={err} ok={note} />
      {panel === "find" && <Discover meta={meta} onDone={load} />}
      {panel === "csv" && <Importer onDone={load} />}
      <section className="card">
        <div className="toolbar">
          <div className="search" style={{ flex: "1 1 240px" }}><Search size={15} /><input placeholder="Search name, phone or city" value={f.q} onChange={setFilter("q")} aria-label="Search leads" /></div>
          <select style={{ width: 150 }} value={f.status} onChange={setFilter("status")} aria-label="Status"><option value="">All statuses</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
          <select style={{ width: 140 }} value={f.state} onChange={setFilter("state")} aria-label="State"><option value="">All states</option>{states.map((s) => <option key={s}>{s}</option>)}</select>
          <select style={{ width: 210 }} value={f.sector} onChange={setFilter("sector")} aria-label="Sector"><option value="">All sectors</option>{(meta?.sectors || []).map((s) => <option key={s}>{s}</option>)}</select>
          <button className="btn icon" onClick={exportCsv} title="Export this page as CSV" aria-label="Export this page as CSV"><Download size={15} /></button>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Business</th><th>Why they need solar</th><th>Phone</th><th>Score</th><th>Status</th><th>Last contact</th><th /></tr></thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ maxWidth: 260 }}><div className="biz"><Avatar name={r.name} /><div><b>{r.name}</b><span>{[r.city, r.state].filter(Boolean).join(", ")}</span></div></div></td>
                  <td style={{ maxWidth: 280 }}><div style={{ fontWeight: 500 }}>{r.sector}</div><div className="sub">{r.power_signal}</div></td>
                  <td className="num" style={{ whiteSpace: "nowrap" }}>+{r.phone}<div className="sub">{r.phone_type}{r.wa_status === "yes" ? " · on WhatsApp" : ""}</div></td>
                  <td><Score v={r.score} /></td>
                  <td><StatusBadge s={r.status} /></td>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{fmtDate(r.last_contacted_at)}</td>
                  <td><div className="row" style={{ flexWrap: "nowrap", justifyContent: "flex-end" }}>
                    {["lost", "call_only"].includes(r.status) && r.phone_type === "mobile" && <button className="btn sm" onClick={() => patch(r.id, { status: "new" })}>Re-queue</button>}
                    {r.status === "new" && <button className="btn sm ghost" onClick={() => patch(r.id, { status: "lost" })}>Skip</button>}
                    {["interested", "booked"].includes(r.status) && <button className="btn sm" onClick={() => patch(r.id, { status: "won" })}>Mark won</button>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.rows.length && <Empty title="No leads match">Load the prefilled list, search for new areas, or import a CSV.</Empty>}
        </div>
        <div className="pager">
          <span className="muted">{data.total.toLocaleString()} leads · page {page + 1} of {pages}</span>
          <span className="row"><button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button><button className="btn sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button></span>
        </div>
      </section>
    </Page>
  );
}
