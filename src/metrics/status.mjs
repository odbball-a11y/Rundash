// Training Status: Base Fitness (42-day), Load Impact (7-day), Intensity Trend.
// COROS: "weighted 42-day rolling average" (Base Fitness article) -> est. EWMA.
// Intensity Trend = Load Impact / Base Fitness (exact; verified on two COROS screens).
// Bands (exact, EvoLab article): >=150 Excessive, 100-149 Optimized, 80-99 Maintaining,
// 50-79 Resuming/Performance, 0-49 Decreasing.
export const BF_DAYS = 42;
export const LI_DAYS = 7;

export function intensityTrendPct(loadImpact, baseFitness) {
  if (!baseFitness || baseFitness <= 0) return null;
  return Math.floor((loadImpact / baseFitness) * 100);
}

// ctx (for the 50-79% band, where COROS shows Resuming or Performance; the split is est.):
//   comingBack: Base Fitness has dropped over the previous 3 weeks (>= 8%)
//   loadRising: Load Impact is higher than a week ago
// Resuming  = coming back after a drop and building load again.
// Performance = otherwise: a taper/ease-off from stable or high fitness.
// (A plain boolean second argument is still accepted as "loadRising" for older callers.)
export function statusFromTrend(pct, ctx = {}) {
  if (pct == null) return null;
  if (pct >= 150) return "Excessive";
  if (pct >= 100) return "Optimized";
  if (pct >= 80) return "Maintaining";
  if (pct >= 50) {
    const c = typeof ctx === "boolean" ? { loadRising: ctx, comingBack: ctx } : ctx;
    return c.comingBack && c.loadRising ? "Resuming" : "Performance";
  }
  return "Decreasing";
}

export const COMING_BACK_DROP = 0.08;

export const STATUS_TEXT = {
  Excessive: "Recent training may be overreaching or excessive.",
  Optimized: "Productive training is increasing Base Fitness.",
  Maintaining: "Moderate recent Training Load; maintaining Base Fitness.",
  Resuming: "Increased Training Load is improving your fitness.",
  Performance: "Tapered Training Load; you are ready to take on significant physical effort.",
  Decreasing: "Low recent Training Load; Base Fitness is declining.",
};

// EWMA over a daily load array. Initialised with the mean of the first `n` days
// to avoid starting from zero.
export function ewma(daily, n) {
  if (!daily.length) return [];
  const init = daily.slice(0, n).reduce((s, x) => s + x, 0) / Math.min(n, daily.length);
  const out = [];
  let v = init;
  for (const x of daily) { v += (x - v) / n; out.push(v); }
  return out;
}
