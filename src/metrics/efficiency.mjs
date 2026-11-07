// Running Efficiency (formerly Running Performance), 80-120%.
// Exact (COROS docs): eligibility rules and bands. est.: the comparison model.
// Model: efficiency factor EF = speed (GAP if available) / HR, compared with the median
// EF of eligible runs in the previous 42 days.
import { clamp, median } from "./util.mjs";

export function eligible(a, maxHr) {
  if (!a || !/run/i.test(a.sport || "")) return false;
  if (!(a.duration >= 7 * 60) || !a.heartRateAvg || !a.speed) return false;
  const f = a.heartRateAvg / (maxHr || 190);
  return f >= 0.65 && f <= 0.95;
}

export const efficiencyFactor = (a) => (a.gapSpeed || a.speed) / a.heartRateAvg;

export function efficiencyScore(a, history, maxHr) {
  if (!eligible(a, maxHr)) return null;
  const t = Date.parse(a.date);
  const base = median(history
    .filter((h) => h.id !== a.id && eligible(h, maxHr))
    .filter((h) => { const d = (t - Date.parse(h.date)) / 86400000; return d > 0 && d <= 42; })
    .map(efficiencyFactor));
  if (!base) return null;
  return clamp(Math.round((efficiencyFactor(a) / base) * 100), 80, 120);
}

export const efficiencyLevel = (p) =>
  p == null ? null : p >= 105 ? "Excellent" : p >= 102 ? "Great" : p >= 99 ? "Good" : p >= 96 ? "Fair" : "Low";
