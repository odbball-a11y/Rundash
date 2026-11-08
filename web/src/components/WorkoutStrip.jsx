// Modular workout strip: width = share of time, height = intensity zone (COROS-style).
import { ZONE_COLORS } from "../format.js";
export default function WorkoutStrip({ blocks, height = 44 }) {
  const total = (blocks || []).reduce((s, b) => s + (b.sec || 0), 0);
  if (!total) return <div className="na">No steps yet</div>;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height, background: "var(--bg-2)", borderRadius: 6, padding: 2 }} aria-label="Workout structure">
      {blocks.map((b, i) => (
        <div key={i} title={`Zone ${b.zone}`} style={{ flex: `${b.sec} 0 0`, minWidth: 2, height: `${20 + (b.zone / 6) * 80}%`, background: ZONE_COLORS[(b.zone || 1) - 1], opacity: b.kind === "rest" ? 0.45 : 0.9, borderRadius: 2 }} />
      ))}
    </div>
  );
}
