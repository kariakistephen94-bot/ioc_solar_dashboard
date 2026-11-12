"use client";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useLoad } from "./hooks";
import { Card, Msg, Page } from "./ui";

function Tester({ agent }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [last, setLast] = useState(null);
  const send = async () => {
    const next = [...msgs, { from: "customer", text }]; setMsgs(next); setText(""); setBusy(true); setErr("");
    try { const r = await api("agent/test", { method: "POST", body: { messages: next, agent } }); setLast(r); setMsgs([...next, { from: "agent", text: r.reply }]); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Card title="Test chat" sub="Talk to the agent as a customer. Nothing is sent to WhatsApp; uses your OpenAI key." body={false}>
      <div style={{ padding: "0 18px" }}><Msg error={err} /></div>
      <div className="msgs" style={{ maxHeight: 300, minHeight: 160 }}>
        {!msgs.length && <div className="muted" style={{ margin: "auto", textAlign: "center" }}>Try: “how much is a 5kva inverter?” or “who is this?”</div>}
        {msgs.map((m, i) => <div key={i} className={`m ${m.from === "customer" ? "in" : "out"}`}>{m.text}</div>)}
      </div>
      {last && <div className="note">Intent: <b>{last.intent}</b>{last.booking_at ? ` · booking ${last.booking_at}` : ""} · {last.summary}</div>}
      <form className="composer" onSubmit={(e) => { e.preventDefault(); if (text.trim() && !busy) send(); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type as a customer: 'how much is a 5kva inverter?'" />
        <button className="btn brand" disabled={busy}>{busy ? "Thinking…" : "Send"}</button>
        <button type="button" className="btn ghost" onClick={() => { setMsgs([]); setLast(null); }}>Reset</button>
      </form>
    </Card>
  );
}

function Products() {
  const { data, error, reload } = useLoad("products");
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const rows = (data?.rows || []).filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) || p.category?.toLowerCase().includes(q.toLowerCase()));
  const seed = async () => { try { await api("products/seed", { method: "POST", body: {} }); reload(); } catch (e) { setErr(e.message); } };
  const patch = async (id, body) => { try { await api(`products/${id}`, { method: "PATCH", body }); reload(); } catch (e) { setErr(e.message); } };
  return (
    <Card title={data ? `Price list · ${data.rows.length} products` : "Price list"} sub="The agent quotes only these prices and always says the final system price needs a site survey." body={false}
      actions={<><input style={{ width: 170 }} placeholder="Filter products" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter products" /><button className="btn sm" onClick={seed}>Re-import</button></>}>
      <div style={{ padding: "0 20px" }}><Msg error={error || err} /></div>
      <div className="table-wrap" style={{ maxHeight: 360, overflow: "auto" }}>
        <table className="tbl"><thead><tr><th>Product</th><th>Category</th><th>Price (₦)</th><th>Stock</th></tr></thead>
          <tbody>{rows.map((p) => (
            <tr key={p.id}><td>{p.name}</td><td>{p.category}</td>
              <td style={{ whiteSpace: "nowrap" }}><input style={{ width: 120, height: 30 }} type="number" defaultValue={p.price_ngn} onBlur={(e) => Number(e.target.value) !== Number(p.price_ngn) && patch(p.id, { price_ngn: Number(e.target.value) })} /></td>
              <td><input type="checkbox" aria-label={`${p.name} in stock`} checked={p.in_stock} onChange={(e) => patch(p.id, { in_stock: e.target.checked })} /></td></tr>))}</tbody></table>
      </div>
    </Card>
  );
}

export default function Agent() {
  const { data, error, reload } = useLoad("settings");
  const [agent, setAgent] = useState(null);
  const [msg, setMsg] = useState({});
  useEffect(() => { if (data && !agent) setAgent({ prompt: data.agent.prompt, knowledge: data.agent.knowledge, model: data.agent.model }); }, [data, agent]);
  if (!agent) return <Page title="AI agent"><Msg error={error} /></Page>;
  const save = async () => { try { await api("settings/agent", { method: "PUT", body: agent }); setMsg({ ok: "Saved. The agent uses this on the very next reply." }); reload(); } catch (e) { setMsg({ error: e.message }); } };
  return (
    <Page title="AI agent" sub="The WhatsApp sales agent. It answers replies, qualifies the lead, quotes shop prices and books site surveys. Uses your OpenAI key." actions={<button className="btn brand" onClick={save}>Save changes</button>}>
      <Msg {...msg} />
      <div className="grid g2">
        <div className="stack">
          <Card title="Instructions" sub="Who the agent is, what OIC Solar sells, and the rules it must follow."><label><textarea aria-label="Agent instructions" style={{ minHeight: 380, fontSize: 13 }} value={agent.prompt} onChange={(e) => setAgent({ ...agent, prompt: e.target.value })} /></label></Card>
          <Card title="Extra knowledge" sub="Offers, install timelines, service areas, FAQs."><div className="stack"><label>Notes for the agent<textarea value={agent.knowledge} onChange={(e) => setAgent({ ...agent, knowledge: e.target.value })} placeholder="e.g. We offer free site surveys in Ibadan and Lagos. Installation usually takes 2 to 5 days." /></label>
            <label>OpenAI model (blank = engine default, gpt-4.1-mini)<input value={agent.model} onChange={(e) => setAgent({ ...agent, model: e.target.value })} placeholder="gpt-4.1-mini" /></label></div></Card>
        </div>
        <div className="stack"><Tester agent={agent} /><Products /></div>
      </div>
    </Page>
  );
}
