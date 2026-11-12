// Shared by server and client code (kept out of the "use client" component file).
export type ImoleMood = "idle" | "listening" | "thinking" | "talking" | "happy" | "sleep" | "alert";

type Charge = 0 | 1 | 2 | 3 | 4;

export const IMOLE_MOODS: Readonly<Record<ImoleMood, { label: string; charge: Charge }>> = {
  idle: { label: "ready to help", charge: 3 },
  listening: { label: "listening", charge: 3 },
  thinking: { label: "thinking", charge: 2 },
  talking: { label: "talking", charge: 3 },
  happy: { label: "happy", charge: 4 },
  sleep: { label: "resting", charge: 1 },
  alert: { label: "something needs attention", charge: 1 },
};
