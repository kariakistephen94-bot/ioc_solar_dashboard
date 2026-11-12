"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Check, Reset as RotateCcw, Send, X } from "../icons";
import { api } from "../../lib/api";
import Imole, { type ImoleMood } from "./Imole";

type Role = "user" | "assistant";
interface ChatMessage { role: Role; content: string; error?: boolean }
interface Action { tool: string; ok: boolean; args?: Record<string, unknown>; error?: string }
interface AssistantReply { reply: string; actions: Action[] }
interface Entry { msg?: ChatMessage; actions?: Action[] }

const SUGGESTIONS = [
  "How is today going?",
  "Who needs my attention?",
  "Surveys this week",
  "Which WhatsApp number performs best?",
  "Show interested leads in Lagos",
];
const ACTION_LABEL: Record<string, string> = {
  update_lead: "Lead updated",
  book_survey: "Survey booked",
  set_sending: "Sending changed",
};
const STORE = "oic-imole-chat";
const IDLE_SLEEP_MS = 120_000;

function load(): Entry[] {
  try { return JSON.parse(sessionStorage.getItem(STORE) || "[]") as Entry[]; } catch { return []; }
}

export default function AssistantDock({ onChange }: { onChange?: () => void }) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [mood, setMood] = useState<ImoleMood>("idle");
  const [hello, setHello] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const moodTimer = useRef<number | undefined>(undefined);
  const sleepTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setEntries(load());
    // Greet once per browser session, not on every page load.
    let greeted = false;
    try { greeted = sessionStorage.getItem("oic-imole-hello") === "1"; sessionStorage.setItem("oic-imole-hello", "1"); } catch { /* private mode */ }
    if (greeted) return;
    const t = window.setTimeout(() => setHello(true), 1200);
    const h = window.setTimeout(() => setHello(false), 9000);
    return () => { clearTimeout(t); clearTimeout(h); };
  }, []);
  useEffect(() => { try { sessionStorage.setItem(STORE, JSON.stringify(entries.slice(-40))); } catch { /* private mode */ } }, [entries]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [entries, busy, open]);

  // Imole naps when nobody has talked to it for a while, and wakes when you come back.
  useEffect(() => {
    const wake = () => {
      setMood((m) => (m === "sleep" ? "idle" : m));
      clearTimeout(sleepTimer.current);
      sleepTimer.current = window.setTimeout(() => setMood((m) => (m === "idle" ? "sleep" : m)), IDLE_SLEEP_MS);
    };
    wake();
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
    return () => { window.removeEventListener("pointerdown", wake); window.removeEventListener("keydown", wake); clearTimeout(sleepTimer.current); };
  }, []);

  const settle = (next: ImoleMood, ms: number) => {
    clearTimeout(moodTimer.current);
    setMood(next);
    moodTimer.current = window.setTimeout(() => setMood("idle"), ms);
  };

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    const history: ChatMessage[] = [...entries.flatMap((e) => (e.msg && !e.msg.error ? [e.msg] : [])), { role: "user", content: q }];
    setEntries((es) => [...es, { msg: { role: "user", content: q } }]);
    setText(""); setBusy(true); clearTimeout(moodTimer.current); setMood("thinking");
    try {
      const r = (await api("assistant", { method: "POST", body: { messages: history } })) as AssistantReply;
      setEntries((es) => [...es, ...(r.actions.length ? [{ actions: r.actions }] : []), { msg: { role: "assistant", content: r.reply || "Done." } }]);
      const changed = r.actions.some((a) => a.ok);
      if (changed) onChange?.();
      const failed = r.actions.some((a) => !a.ok);
      settle(failed ? "alert" : changed ? "happy" : "talking", changed ? 2600 : 2200);
    } catch (e) {
      setEntries((es) => [...es, { msg: { role: "assistant", content: (e as Error).message, error: true } }]);
      settle("alert", 3000);
    } finally { setBusy(false); }
  };

  const submit = (e: FormEvent) => { e.preventDefault(); ask(text); };
  const panelMood: ImoleMood = busy ? "thinking" : mood === "sleep" ? "idle" : mood;

  return (
    <div className="dock">
      {open && (
        <section className="card dock-panel" aria-label="Imole assistant">
          <header className="dock-head">
            <Imole mood={panelMood} size={44} />
            <div style={{ flex: 1 }}>
              <b>Imole</b>
              <span>{busy ? "Checking the pipeline…" : "Your OIC Solar assistant"}</span>
            </div>
            {entries.length > 0 && <button className="btn icon sm ghost" onClick={() => setEntries([])} aria-label="Clear chat" title="Clear chat"><RotateCcw size={15} /></button>}
            <button className="btn icon sm ghost" onClick={() => setOpen(false)} aria-label="Close assistant"><X size={17} /></button>
          </header>
          <div className="dock-msgs" aria-live="polite">
            {!entries.length && (
              <div className="dmsg bot">
                Hi, I&apos;m Imole. Ask me how the pipeline is doing, who needs a reply, or tell me to book a survey or move a lead. I check the live data before answering.
              </div>
            )}
            {entries.map((e, i) => e.msg ? (
              <div key={i} className={`dmsg ${e.msg.role === "user" ? "user" : "bot"} ${e.msg.error ? "err" : ""}`}>{e.msg.content}</div>
            ) : (
              (e.actions || []).map((a, j) => (
                <span key={`${i}-${j}`} className={`dact ${a.ok ? "" : "fail"}`}>{a.ok ? <Check size={11} /> : <X size={11} />} {ACTION_LABEL[a.tool] || a.tool}{a.ok ? "" : `: ${a.error}`}</span>
              ))
            ))}
            {busy && <div className="dmsg bot typing" aria-label="Imole is thinking"><i /><i /><i /></div>}
            <div ref={end} />
          </div>
          {!entries.length && (
            <div className="dock-sugg">{SUGGESTIONS.map((s) => <button key={s} onClick={() => ask(s)}>{s}</button>)}</div>
          )}
          <form className="dock-input" onSubmit={submit}>
            <input value={text} onChange={(e) => setText(e.target.value)} onFocus={() => !busy && setMood("listening")} onBlur={() => !busy && setMood((m) => (m === "listening" ? "idle" : m))}
              placeholder="Ask Imole anything…" aria-label="Message Imole" autoFocus />
            <button className="btn brand icon" type="submit" disabled={busy || !text.trim()} aria-label="Send"><Send size={15} /></button>
          </form>
        </section>
      )}
      {!open && hello && (
        <div className="dock-hello" role="status"><b>Hi, I&apos;m Imole.</b> Ask me about your leads, surveys or WhatsApp numbers.</div>
      )}
      {!open && (
        <button className="dock-fab" onClick={() => { setOpen(true); setHello(false); }} aria-label="Open Imole assistant" title="Ask Imole">
          <Imole mood={mood} size={74} />
        </button>
      )}
    </div>
  );
}
