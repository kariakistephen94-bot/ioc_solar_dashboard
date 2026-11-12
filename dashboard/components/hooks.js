"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";

export function useLoad(path, intervalMs = 0) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const alive = useRef(true);
  const load = useCallback(async () => {
    try { const d = await api(path); if (alive.current) { setData(d); setError(""); } }
    catch (e) { if (alive.current) setError(e.message); }
  }, [path]);
  useEffect(() => {
    alive.current = true; load();
    const t = intervalMs ? setInterval(load, intervalMs) : null;
    return () => { alive.current = false; if (t) clearInterval(t); };
  }, [load, intervalMs]);
  return { data, error, reload: load, setData };
}
