"use client";
import { useState } from "react";
import { Eye, EyeOff, LogIn, Sun, UserPlus } from "./icons";
import { auth } from "../lib/api";
import Imole from "./imole/Imole";

export default function Login({ onSignedIn, notice }) {
  const [mode, setMode] = useState("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(notice || "");
  const [mood, setMood] = useState("idle");
  const signup = mode === "signup";

  const fail = (m) => { setErr(m); setMood("alert"); setBusy(false); setTimeout(() => setMood("idle"), 2200); };
  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setOk("");
    if (signup && password !== confirm) return fail("The two passwords don't match.");
    setBusy(true); setMood("thinking");
    try {
      if (signup) {
        const r = await auth("signup", { name, email, password });
        if (r.confirm) { setBusy(false); setMood("happy"); setMode("signin"); setPassword(""); setConfirm(""); setOk("Account created. Check your email to confirm it, then sign in."); return; }
        setMood("happy"); setTimeout(() => onSignedIn(r.user), 500);
      } else {
        const { user } = await auth("login", { email, password });
        setMood("happy"); setTimeout(() => onSignedIn(user), 500);
      }
    } catch (x) { fail(x.message); }
  };
  const pwFocus = () => !busy && setMood(show ? "listening" : "sleep");
  const switchTo = (m) => { setMode(m); setErr(""); setOk(""); };

  return (
    <div className="login-wrap">
      <div style={{ width: "100%", maxWidth: 384 }}>
      <div className="login-brand"><span className="brand-mark"><Sun size={15} weight="fill" /></span>OIC Solar</div>
      <form className="card login" onSubmit={submit} aria-labelledby="login-title">
        <div style={{ display: "grid", placeItems: "center", gap: 6, marginBottom: 2 }}>
          {/* Imole covers its eyes (sleep mood) while you type a password. */}
          <Imole mood={mood} size={88} label="Imole, the OIC Solar mascot" />
          <h1 id="login-title">{signup ? "Create your account" : "Sign in to OIC Solar"}</h1>
          <p className="hint">Lead engine · staff only</p>
        </div>
        <div className="tabs" role="tablist" style={{ justifySelf: "center" }}>
          <button type="button" role="tab" aria-selected={!signup} className={!signup ? "on" : ""} onClick={() => switchTo("signin")}>Sign in</button>
          <button type="button" role="tab" aria-selected={signup} className={signup ? "on" : ""} onClick={() => switchTo("signup")}>Create account</button>
        </div>
        {ok && <div className="okmsg" role="status">{ok}</div>}
        {err && <div className="err" role="alert">{err}</div>}
        {signup && (
          <label>Full name<input autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} onFocus={() => !busy && setMood("listening")} onBlur={() => !busy && setMood("idle")} /></label>
        )}
        <label>Email
          <input type="email" autoComplete={signup ? "email" : "username"} required value={email} onChange={(e) => setEmail(e.target.value)}
            onFocus={() => !busy && setMood("listening")} onBlur={() => !busy && setMood("idle")} autoFocus />
        </label>
        <label>Password
          <span style={{ position: "relative", display: "block" }}>
            <input type={show ? "text" : "password"} autoComplete={signup ? "new-password" : "current-password"} required minLength={signup ? 8 : undefined}
              value={password} onChange={(e) => setPassword(e.target.value)} onFocus={pwFocus} onBlur={() => !busy && setMood("idle")} style={{ paddingRight: 40 }} />
            <button type="button" className="btn icon sm ghost" onClick={() => { setShow((s) => !s); if (mood === "sleep") setMood("listening"); }} aria-label={show ? "Hide password" : "Show password"}
              style={{ position: "absolute", right: 3, top: 3 }}>{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>
          </span>
        </label>
        {signup && (
          <label>Confirm password<input type={show ? "text" : "password"} autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} onFocus={pwFocus} onBlur={() => !busy && setMood("idle")} /></label>
        )}
        <button className="btn brand" type="submit" disabled={busy}>
          {signup ? <><UserPlus size={15} /> {busy ? "Creating account…" : "Create account"}</> : <><LogIn size={15} /> {busy ? "Signing in…" : "Sign in"}</>}
        </button>
        <p className="hint" style={{ textAlign: "center" }}>
          {signup ? "New accounts can't open the dashboard until an admin approves them." : "New here? Create an account, then ask an admin to approve it."}
        </p>
      </form>
      </div>
    </div>
  );
}
