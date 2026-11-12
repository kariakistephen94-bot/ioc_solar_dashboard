import Imole from "../../components/imole/Imole";
import { IMOLE_MOODS, type ImoleMood } from "../../components/imole/moods";

export const metadata = { title: "Imole · OIC Solar mascot" };

export default function ImolePlayground() {
  const moods = Object.keys(IMOLE_MOODS) as ImoleMood[];
  return (
    <main className="main" style={{ margin: "0 auto" }}>
      <div className="head"><div><h1>Imole</h1><p>OIC Solar&apos;s dashboard mascot, in every mood. Move your pointer: the eyes follow it.</p></div></div>
      <div className="grid g4">
        {moods.map((m) => (
          <div key={m} className="card" style={{ display: "grid", placeItems: "center", gap: 10, padding: "28px 16px" }}>
            <Imole mood={m} size={150} />
            <b style={{ textTransform: "capitalize" }}>{m}</b>
            <span className="muted">{IMOLE_MOODS[m].label}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
