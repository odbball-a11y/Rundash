export const fmtDur = (s) => {
  if (s == null) return "—";
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};
export const fmtPace = (secPerKm) => (secPerKm ? `${Math.floor(secPerKm / 60)}'${String(Math.round(secPerKm % 60)).padStart(2, "0")}"` : "—");
export const fmtKm = (km, d = 2) => (km == null ? "—" : Number(km).toFixed(d));
export const fmtHours = (min) => (min == null ? "—" : `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, "0")}m`);
export const fmtDate = (d, opts = { day: "2-digit", month: "short" }) => (d ? new Date(d).toLocaleDateString("en-GB", opts) : "—");
export const fmtDateTime = (d) => (d ? new Date(d).toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
export const fmtNum = (v, d = 0) => (v == null || !isFinite(v) ? "—" : Number(v).toFixed(d));
export const todayLong = () => new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" });

export const STATUS_COLOR = {
  Excessive: "var(--red)", Optimized: "var(--green)", Maintaining: "var(--cyan)",
  Resuming: "var(--yellow)", Performance: "var(--yellow)", Decreasing: "var(--orange)",
};
export const RECOVERY_COLOR = { Exhausted: "var(--red)", Fatigued: "var(--orange)", Normal: "var(--yellow)", Fresh: "var(--green)" };
export const ZONE_COLORS = ["#38bdf8", "#22c55e", "#eab308", "#f97316", "#ef4444", "#d946ef"];

// Trailing rolling mean over the previous `n` days of [{date, value}] (oldest first); needs >= half the window.
export function rollingMean(rows, n = 7) {
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const t = Date.parse(rows[i].date), from = t - (n - 1) * 86400000;
    const w = []; for (let j = i; j >= 0 && Date.parse(rows[j].date) >= from; j--) if (rows[j].value != null) w.push(rows[j].value);
    out.push(w.length >= Math.ceil(n / 2) ? Math.round((w.reduce((a, b) => a + b, 0) / w.length) * 10) / 10 : null);
  }
  return out;
}
