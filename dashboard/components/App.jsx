"use client";
import { useEffect, useState } from "react";
import { api, auth } from "../lib/api";
import {
  ChevronRight, LogOut, Menu, NavAgent, NavCalendar, NavConversations, NavFollowUps, NavLeads, NavOverview, NavPipeline, NavSettings, NavTeam,
  Play, Sun, WhatsAppIcon,
} from "./icons";
import Login from "./Login";
import Pending from "./Pending";
import Team from "./Team";
import { useLoad } from "./hooks";
import Overview from "./Overview";
import Leads from "./Leads";
import Conversations from "./Conversations";
import WhatsApp from "./WhatsApp";
import FollowUps from "./FollowUps";
import Agent from "./Agent";
import SettingsPage from "./SettingsPage";
import Pipeline from "./Pipeline";
import Calendar from "./Calendar";
import AssistantDock from "./imole/AssistantDock";
import { Avatar, Modal, Msg } from "./ui";

const NAV = [
  { group: "Workspace", items: [["Overview", NavOverview, Overview], ["Pipeline", NavPipeline, Pipeline], ["Leads", NavLeads, Leads], ["Conversations", NavConversations, Conversations], ["Calendar", NavCalendar, Calendar], ["Follow-ups", NavFollowUps, FollowUps]] },
  { group: "Automation", items: [["WhatsApp", WhatsAppIcon, WhatsApp], ["AI agent", NavAgent, Agent], ["Settings", NavSettings, SettingsPage], ["Team", NavTeam, Team]] },
];
const ALL = NAV.flatMap((g) => g.items);

// Page name <-> address: "Follow-ups" <-> /follow-ups, "AI agent" <-> /ai-agent, "Overview" <-> /.
const slugOf = (name) => (name === "Overview" ? "" : name.toLowerCase().replace(/\s+/g, "-"));
const hrefOf = (name) => `/${slugOf(name)}`;
const pageFromPath = (path) => {
  const slug = String(path || "").replace(/^\/+|\/+$/g, "").split("/")[0].toLowerCase();
  return ALL.find((n) => slugOf(n[0]) === slug)?.[0] || "Overview";
};

function lagosToday() {
  return new Date().toLocaleDateString("en-GB", { timeZone: "Africa/Lagos", weekday: "short", day: "numeric", month: "short" });
}

function Workspace({ user, onSignOut, initialPath }) {
  const [tab, setTabState] = useState(() => pageFromPath(initialPath));
  const [open, setOpen] = useState(false);

  // Opening a page updates the address bar; Back and Forward move between pages.
  const setTab = (name) => {
    setTabState(name);
    if (typeof window !== "undefined" && window.location.pathname !== hrefOf(name)) window.history.pushState({ page: name }, "", hrefOf(name));
  };
  useEffect(() => {
    // An unknown address (e.g. /typo) shows Overview, so tidy the address bar to match.
    if (window.location.pathname !== hrefOf(tab)) window.history.replaceState({ page: tab }, "", hrefOf(tab));
    const onPop = () => setTabState(pageFromPath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { document.title = `${tab} · OIC Solar`; }, [tab]);
  const [today, setToday] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [confirmStart, setConfirmStart] = useState(false);
  const [ctlErr, setCtlErr] = useState("");
  const { data: ov, error, reload } = useLoad("overview", 8000);
  const { data: staff } = useLoad("staff", 30000);
  const waiting = (staff?.rows || []).filter((r) => r.role === "user").length;

  useEffect(() => { setToday(lagosToday()); }, []);
  const Page = ALL.find((n) => n[0] === tab)[2];
  const group = NAV.find((g) => g.items.some((n) => n[0] === tab))?.group;

  const accounts = ov?.accounts || [];
  const connected = accounts.filter((a) => a.connected).length;
  const attention = (ov?.byStatus?.replied || 0) + (ov?.byStatus?.needs_human || 0);
  const status = !ov ? ["", "Engine offline"] : ov.paused ? ["warn", "Sending paused"] : ["on", "Sending live"];

  // One switch for all sending. Starting asks first, because real WhatsApp messages go out; pausing is instant.
  const setPaused = async (paused) => {
    setConfirmStart(false); setCtlErr("");
    try { await api("control", { method: "POST", body: { paused } }); reload(); } catch (e) { setCtlErr(e.message); }
  };
  const toggleSending = () => (ov?.paused ? setConfirmStart(true) : setPaused(true));

  return (
    <div className="shell">
      <div className={`scrim ${open ? "open" : ""}`} onClick={() => setOpen(false)} />
      <aside className={`side ${open ? "open" : ""}`}>
        <div className="brand"><span className="brand-mark"><Sun size={18} weight="fill" /></span><div><b>OIC Solar</b><small>Lead engine</small></div></div>
        <nav aria-label="Pages">
          {NAV.map(({ group: g, items }) => (
            <div key={g} className="nav-group">
              <div className="nav-label">{g}</div>
              {items.map(([name, Icon]) => (
                <a key={name} href={hrefOf(name)} className={`nav ${tab === name ? "on" : ""}`} aria-current={tab === name ? "page" : undefined}
                  onClick={(e) => {
                    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // let "open in new tab" work
                    e.preventDefault(); setTab(name); setOpen(false);
                  }}>
                  <Icon size={18} weight={tab === name ? "fill" : "regular"} />{name}
                  {name === "Conversations" && attention > 0 && <span className="count" title={`${attention} waiting for a reply`}>{attention}</span>}
                  {name === "Team" && waiting > 0 && <span className="count" title={`${waiting} waiting for approval`}>{waiting}</span>}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <div className="engine">
            <b><span className={`dot ${status[0]}`} />{status[1]}</b>
            <div className="pips" aria-hidden="true">{(accounts.length ? accounts : [{}, {}, {}, {}]).map((a, i) => <i key={a.id || i} className={a.connected ? "on" : ""} />)}</div>
            <span>{connected} of {accounts.length || 4} WhatsApp numbers connected</span>
          </div>
          <div className="user-row">
            <button className="user" onClick={() => { setTab("Team"); setOpen(false); }} title={`${user.email} · open your session`}>
              <Avatar name={user.name || user.email} size={30} />
              <span><b>{user.name || user.email}</b><small>Admin</small></span>
            </button>
            <button className="btn icon sm ghost" onClick={() => onSignOut(false)} title="Sign out" aria-label="Sign out"><LogOut size={16} /></button>
          </div>
        </div>
      </aside>
      <div className="content">
        <header className="topbar">
          <button className="btn icon sm menu" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={16} /></button>
          <div className="crumbs"><span className="hide-sm">{group}</span><ChevronRight size={12} className="hide-sm" /><b>{tab}</b></div>
          <div className="spacer" />
          <span className="top-date hide-sm">{today}{today && " · Lagos time"}</span>
          <button className="send-state" onClick={() => setTab("WhatsApp")} title="Start or pause sending on the WhatsApp page">
            <span className={`dot ${status[0]}`} />{status[1]}
          </button>
        </header>
        <main className="main">
          <Msg error={error || ctlErr} />
          <Page key={`${tab}-${refresh}`} ov={ov} reloadOverview={reload} goto={setTab} user={user} onSignOut={onSignOut} onToggleSending={toggleSending} />
        </main>
      </div>
      {confirmStart && (
        <Modal title="Start sending?" onClose={() => setConfirmStart(false)}>
          <div className="stack">
            <p className="hint" style={{ color: "var(--ink-2)" }}>
              Real WhatsApp messages will start going out to your leads from {connected === 1 ? "your connected number" : `your ${connected} connected numbers`}, inside your sending hours.
              You can pause again at any time.
            </p>
            {connected === 0 && <Msg error="No WhatsApp number is connected yet, so nothing will send until you link one." />}
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn ghost" onClick={() => setConfirmStart(false)}>Cancel</button>
              <button className="btn primary" onClick={() => setPaused(false)} autoFocus><Play size={12} weight="fill" /> Start sending</button>
            </div>
          </div>
        </Modal>
      )}
      <AssistantDock onChange={() => { reload(); setRefresh((n) => n + 1); }} />
    </div>
  );
}

export default function App({ initialPath = "" }) {
  const [state, setState] = useState({ phase: "loading", user: null, notice: "" });
  const fromUser = (user, notice = "") => setState({ phase: user.role === "admin" ? "in" : "pending", user, notice });

  const check = async () => {
    try { const r = await auth("me"); fromUser(r.user); return r.user.role; }
    catch (e) {
      setState({ phase: e.status === 500 ? "misconfigured" : "out", user: null, notice: e.status === 403 ? e.message : "", error: e.message });
      return null;
    }
  };

  useEffect(() => {
    check();
    const out = () => setState({ phase: "out", user: null, notice: "Your session ended. Please sign in again." });
    const changed = (e) => { if (e.detail?.blocked) setState({ phase: "out", user: null, notice: e.detail.error }); else check(); };
    window.addEventListener("oic:signed-out", out);
    window.addEventListener("oic:access-changed", changed);
    return () => { window.removeEventListener("oic:signed-out", out); window.removeEventListener("oic:access-changed", changed); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A waiting user is let in automatically as soon as an admin approves them.
  useEffect(() => {
    if (state.phase !== "pending") return;
    const t = setInterval(check, 30_000);
    return () => clearInterval(t);
  }, [state.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const signOut = async (everywhere = false) => {
    try { await auth("logout", { everywhere }); } catch { /* cookies are cleared server-side anyway */ }
    try { sessionStorage.removeItem("oic-imole-chat"); } catch { /* private mode */ }
    setState({ phase: "out", user: null, notice: everywhere ? "You are signed out on all devices." : "You are signed out." });
  };

  if (state.phase === "loading") return <div className="login-wrap"><span className="muted">Loading…</span></div>;
  if (state.phase === "misconfigured") return <div className="login-wrap"><div className="card login"><h1>Sign-in not configured</h1><p className="hint">{state.error}</p></div></div>;
  if (state.phase === "out") return <Login key={state.notice} notice={state.notice} onSignedIn={(user) => fromUser(user)} />;
  if (state.phase === "pending") return <Pending user={state.user} onCheck={check} onSignOut={() => signOut(false)} />;
  return <Workspace user={state.user} onSignOut={signOut} initialPath={initialPath} />;
}
