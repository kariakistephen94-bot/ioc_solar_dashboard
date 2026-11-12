"use client";
import { useEffect, useRef, useState } from "react";
import { Bot, Hand, Replies, Send, UserCheck } from "./icons";
import { api, fmtDate } from "../lib/api";
import { useLoad } from "./hooks";
import { Avatar, Badge, Empty, Msg, Page, StatusBadge } from "./ui";

export default function Conversations() {
  const { data, error } = useLoad("conversations", 6000);
  const [sel, setSel] = useState(null);
  const [thread, setThread] = useState(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const end = useRef(null);
  const loadThread = async (id) => { try { setThread(await api(`conversations/${id}`)); } catch (e) { setErr(e.message); } };
  useEffect(() => { if (!sel) return; loadThread(sel); const t = setInterval(() => loadThread(sel), 5000); return () => clearInterval(t); }, [sel]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [thread?.messages?.length]);
  const send = async () => { setErr(""); try { await api(`conversations/${sel}/send`, { method: "POST", body: { text } }); setText(""); loadThread(sel); } catch (e) { setErr(e.message); } };
  const set = async (body) => { try { await api(`leads/${sel}`, { method: "PATCH", body }); loadThread(sel); } catch (e) { setErr(e.message); } };
  const mark = async (as) => { setErr(""); try { await api(`conversations/${sel}/${as}`, { method: "POST" }); loadThread(sel); } catch (e) { setErr(e.message); } };
  const lead = thread?.lead;
  const msgs = thread?.messages || [];
  // Only automatic replies so far: the lead has not really answered, and its follow-up is still scheduled.
  const autoOnly = !!lead && ["new", "contacted"].includes(lead.status) && msgs.some((m) => m.kind === "auto");
  const canFlagBot = lead?.status === "replied" && msgs.some((m) => m.direction === "in" && m.kind !== "auto");
  const rows = data?.rows || [];
  return (
    <Page title="Conversations" sub="Everyone who replied. The AI agent answers real people on its own and ignores automatic replies; replying yourself pauses it for that lead.">
      <Msg error={error || err} />
      <section className="card chat">
        <div className="chat-list">
          {rows.map((r) => (
            <button key={r.id} className={`item ${sel === r.id ? "on" : ""}`} onClick={() => setSel(r.id)}>
              <Avatar name={r.name} />
              <div className="meta">
                <div className="row between" style={{ flexWrap: "nowrap" }}><b>{r.name}</b><span className="muted" style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>{fmtDate(r.last_inbound_at)}</span></div>
                <div className="row between" style={{ marginTop: 4, flexWrap: "nowrap" }}><span className="muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sector}</span>{r.auto_reply ? <Badge>Auto-reply</Badge> : <StatusBadge s={r.status} />}</div>
              </div>
            </button>
          ))}
          {!rows.length && <Empty title="No replies yet" icon={Replies}>Replies show up here the moment they arrive.</Empty>}
        </div>
        <div className="thread">
          {!lead ? <Empty title="Select a conversation" icon={Replies}>Pick a lead on the left to read the chat.</Empty> : (
            <>
              <div className="thread-head">
                <div className="biz"><Avatar name={lead.name} size={38} /><div><b>{lead.name} {autoOnly ? <Badge>Auto-reply</Badge> : <StatusBadge s={lead.status} />}</b><span>+{lead.phone}{lead.contact_name ? ` · ${lead.contact_name}` : ""}{lead.booking_at ? ` · survey ${fmtDate(lead.booking_at)}` : ""}</span></div></div>
                <div className="row">
                  {autoOnly && <button className="btn sm brand" onClick={() => mark("human")} title="Count this as a real reply and let the AI agent answer"><UserCheck size={13} /> Real person</button>}
                  {canFlagBot && <button className="btn sm" onClick={() => mark("auto")} title="These replies came from a bot: stop counting them and keep following up"><Bot size={13} /> Mark as auto-reply</button>}
                  {lead.status === "needs_human" && <button className="btn sm" onClick={() => set({ status: "interested", agent_paused: false })}>Mark resolved</button>}
                  <button className={`btn sm ${lead.agent_paused ? "brand" : ""}`} onClick={() => set({ agent_paused: !lead.agent_paused })}>{lead.agent_paused ? <><Bot size={13} /> Hand back to AI</> : <><Hand size={13} /> Take over</>}</button>
                </div>
              </div>
              <div className="msgs">
                {msgs.map((m) => (<div key={m.id} className={`m ${m.direction} ${m.kind === "auto" ? "auto" : ""}`}>{m.body}<small>{m.direction === "out" ? `${m.kind} · ${m.status}` : m.kind === "auto" ? "automatic reply · not counted" : "customer"} · {fmtDate(m.created_at)}</small></div>))}
                <div ref={end} />
              </div>
              {autoOnly && <div className="note">Only automatic replies so far, so this is not counted as a response. {lead.next_followup_at ? `Next follow-up: ${fmtDate(lead.next_followup_at)}.` : "No more follow-ups are scheduled."} If a real person wrote this, press Real person.</div>}
              {lead.notes && <div className="note">Note: {lead.notes}</div>}
              <form className="composer" onSubmit={(e) => { e.preventDefault(); if (text.trim()) send(); }}>
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply (this pauses the AI for this lead)" aria-label="Reply" />
                <button className="btn brand icon" type="submit" aria-label="Send"><Send size={15} /></button>
              </form>
            </>
          )}
        </div>
      </section>
    </Page>
  );
}
