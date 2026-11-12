"use client";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useLoad } from "./hooks";
import { Card, Msg, Page } from "./ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SettingsPage() {
  const { data, error, reload } = useLoad("settings");
  const [e, setE] = useState(null);
  const [msg, setMsg] = useState({});
  useEffect(() => { if (data && !e) setE(data.engine); }, [data, e]);
  if (!e) return <Page title="Settings"><Msg error={error} /></Page>;
  const n = (k) => (ev) => setE({ ...e, [k]: Number(ev.target.value) });
  const s = (k) => (ev) => setE({ ...e, [k]: ev.target.value });
  const save = async () => { try { await api("settings/engine", { method: "PUT", body: e }); setMsg({ ok: "Settings saved." }); reload(); } catch (x) { setMsg({ error: x.message }); } };
  return (
    <Page title="Settings" sub="Sending limits, working hours and follow-up timing." actions={<button className="btn brand" onClick={save}>Save settings</button>}>
      <Msg {...msg} />
      <div className="grid g2">
        <div className="stack">
        <Card title="Sending window" sub="Lagos time. Messages only go out inside these hours."><div className="stack">
          <div className="row" style={{ flexWrap: "nowrap" }}><label>From hour<input type="number" min="0" max="23" value={e.sendStart} onChange={n("sendStart")} /></label><label>Until hour<input type="number" min="1" max="24" value={e.sendEnd} onChange={n("sendEnd")} /></label></div>
          <div className="row">{DAYS.map((d, i) => (<label key={d} className={`chip ${e.sendDays.includes(i) ? "on" : ""}`}><input type="checkbox" style={{ display: "none" }} checked={e.sendDays.includes(i)} onChange={(ev) => setE({ ...e, sendDays: ev.target.checked ? [...e.sendDays, i] : e.sendDays.filter((x) => x !== i) })} />{d}</label>))}</div>
        </div></Card>
        <Card title="Pacing" sub="Per WhatsApp number. Slow and steady keeps numbers safe."><div className="stack">
          <div className="row"><label>Warm-up: day 1 messages<input type="number" value={e.warmupStart} onChange={n("warmupStart")} /></label><label>Add per day<input type="number" value={e.warmupStep} onChange={n("warmupStep")} /></label><label>Max per day<input type="number" value={e.dailyCapMax} onChange={n("dailyCapMax")} /></label></div>
          <div className="row"><label>Min gap (seconds)<input type="number" value={e.minGapSec} onChange={n("minGapSec")} /></label><label>Max gap (seconds)<input type="number" value={e.maxGapSec} onChange={n("maxGapSec")} /></label></div>
        </div></Card>
        </div>
        <div className="stack">
        <Card title="Targeting & follow-ups"><div className="stack">
          <label>Minimum lead score (0-100)<input type="number" value={e.minScore} onChange={n("minScore")} /></label>
          <label>Days after first message (comma separated)<input value={e.followupDays.join(",")} onChange={(ev) => setE({ ...e, followupDays: ev.target.value.split(",").map((x) => Number(x.trim())).filter((x) => x > 0) })} /></label>
        </div></Card>
        <Card title="AI agent"><div className="stack">
          <label className="check"><input type="checkbox" checked={e.agentEnabled} onChange={(ev) => setE({ ...e, agentEnabled: ev.target.checked })} /> Agent replies automatically</label>
          <label className="check"><input type="checkbox" checked={e.screenAutoReplies !== false} onChange={(ev) => setE({ ...e, screenAutoReplies: ev.target.checked })} /> Ignore automatic replies (away messages, greeting templates, chatbots)</label>
          <label>Max agent replies per lead per day<input type="number" value={e.agentMaxRepliesPerDay} onChange={n("agentMaxRepliesPerDay")} /></label>
          <label>Alert me on WhatsApp for hot leads (your number, e.g. 2348012345678)<input value={e.notifyNumber} onChange={s("notifyNumber")} /></label>
        </div></Card>
        <Card title="Sender identity" sub="Used in first messages and follow-ups."><div className="stack">
          <div className="row"><label>Company<input value={e.company} onChange={s("company")} /></label><label>Sender first name<input value={e.senderName} onChange={s("senderName")} /></label></div>
        </div></Card>
        </div>
      </div>
    </Page>
  );
}
