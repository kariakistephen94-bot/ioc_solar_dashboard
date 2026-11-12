"use client";
import { useState } from "react";
import { api } from "../lib/api";
import { Modal, Msg } from "./ui";

// Lagos is UTC+1 all year, so a local "YYYY-MM-DDTHH:mm" becomes an exact instant with +01:00.
const toLagosInput = (iso) => {
  const d = new Date(iso ? new Date(iso).getTime() : Date.now() + 864e5);
  const p = new Date(d.getTime() + 3600e3).toISOString().slice(0, 16);
  return p;
};

export default function BookingModal({ lead, defaultDate, onClose, onSaved }) {
  const [when, setWhen] = useState(lead?.booking_at ? toLagosInput(lead.booking_at) : defaultDate || toLagosInput(null).slice(0, 11) + "10:00");
  const [note, setNote] = useState(lead?.booking_note || "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr("");
    try {
      await api(`leads/${lead.id}`, { method: "PATCH", body: { status: "booked", booking_at: new Date(`${when}:00+01:00`).toISOString(), booking_note: note } });
      onSaved?.(); onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Book site survey · ${lead.name}`} onClose={onClose}>
      <div className="stack">
        <Msg error={err} />
        <label>Date and time (Lagos)<input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></label>
        <label>Notes for the team<textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Address, what they want powered, who to ask for…" style={{ minHeight: 80 }} /></label>
        <p className="hint">The lead moves to “Survey booked” and its automatic follow-ups stop.</p>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn brand" disabled={busy || !when} onClick={save}>{busy ? "Saving…" : "Save booking"}</button>
        </div>
      </div>
    </Modal>
  );
}
