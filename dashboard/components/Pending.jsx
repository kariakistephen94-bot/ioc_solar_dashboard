"use client";
import { useState } from "react";
import { LogOut, Refresh as RefreshCw } from "./icons";
import Imole from "./imole/Imole";

/** Shown to signed-in people whose role is still "user". They see nothing else until an admin approves them. */
export default function Pending({ user, onCheck, onSignOut }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const check = async () => {
    setBusy(true); setNote("");
    const role = await onCheck();
    setBusy(false);
    if (role !== "admin") setNote("Not approved yet. We check again automatically every 30 seconds.");
  };
  return (
    <div className="login-wrap">
      <section className="card login" style={{ textAlign: "center", justifyItems: "center" }} aria-labelledby="pending-title">
        <Imole mood="sleep" size={96} label="Imole, waiting" />
        <h1 id="pending-title">Waiting for approval</h1>
        <p className="hint" style={{ maxWidth: 300 }}>
          Your account <b style={{ color: "var(--ink)" }}>{user.email}</b> is set up as a <b style={{ color: "var(--ink)" }}>user</b>.
          An admin needs to give you <b style={{ color: "var(--ink)" }}>admin</b> access before you can open the dashboard.
        </p>
        {note && <div className="okmsg" role="status" style={{ width: "100%" }}>{note}</div>}
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn brand" onClick={check} disabled={busy}><RefreshCw size={14} /> {busy ? "Checking…" : "Check again"}</button>
          <button className="btn ghost" onClick={onSignOut}><LogOut size={14} /> Sign out</button>
        </div>
      </section>
    </div>
  );
}
