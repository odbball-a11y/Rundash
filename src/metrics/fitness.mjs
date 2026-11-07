// Running Fitness abilities, race predictor, VO2max fallback, Training Effect,
// Training Focus, Effort Accuracy. All est. unless stated.
import { clamp, round } from "./util.mjs";

// Daniels & Gilbert: oxygen cost of running at v (m/min) and %VO2max sustainable for t minutes.
export const vo2Cost = (v) => -4.60 + 0.182258 * v + 0.000104 * v * v;
export const pctMax = (t) => 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);

// VDOT-equivalent of holding `mps` for `minutes`.
export const vdotFor = (mps, minutes) => (mps > 0 ? vo2Cost(mps * 60) / pctMax(minutes) : null);

// Race time (seconds) for distance (m) at a given VDOT (bisection).
export function raceTime(vdot, meters) {
  if (!vdot) return null;
  let lo = 60, hi = 60 * 60 * 10;
  for (let i = 0; i < 60; i++) {
    const t = (lo + hi) / 2, v = meters / (t / 60);
    if (vo2Cost(v) / pctMax(t / 60) > vdot) lo = t; else hi = t;
  }
  return Math.round((lo + hi) / 2);
}

// COROS Running Fitness <-> marathon time (Training Hub reference table; male / female anchors).
// Verified against two COROS screenshots: 2:33:34 predicted marathon -> 96.4 (table: 96.3) and
// 2:47:31 -> 94.4 (table: 94.4). Interpolated linearly in time between anchors, extrapolated
// below 60 with the last slope, clamped to 40-100.
export const RF_TABLE = {
  male: [[120, 100], [165, 95], [210, 85], [240, 75], [360, 60]],
  female: [[134, 100], [185, 95], [230, 85], [260, 75], [380, 60]],
};
export function rfFromMarathonMinutes(mins, sex = "male") {
  if (!mins) return null;
  const A = RF_TABLE[sex] || RF_TABLE.male;
  if (mins <= A[0][0]) return 100;
  for (let i = 1; i < A.length; i++) if (mins <= A[i][0]) {
    const [t1, s1] = A[i - 1], [t2, s2] = A[i];
    return round(s1 + ((mins - t1) / (t2 - t1)) * (s2 - s1), 1);
  }
  const [t1, s1] = A[A.length - 2], [t2, s2] = A[A.length - 1];
  return round(clamp(s2 + ((mins - t2) / (t2 - t1)) * (s2 - s1), 40, 100), 1);
}

// Ability score: the ability's VDOT-equivalent expressed as an equivalent marathon, then the
// COROS table (matches COROS's published elite profile within ~2 points; v1.5 used a straight
// VDOT->40-100 line that put this athlete ~20 points below the COROS scale).
export const abilityScore = (vdot, sex = "male") => (vdot ? rfFromMarathonMinutes(raceTime(vdot, 42195) / 60, sex) : null);

// Inputs (COROS criteria): base = slowest Aerobic Power pace (m/s), endurance = threshold
// pace (m/s), speed = VO2max, sprint = best 30-60 s speed (m/s).
// perfVdot: VDOT from actual recent best efforts. COROS's own VO2max comes from your runs'
// pace/HR, so it tracks real performance; a watch VO2max can sit well above it (e.g. Garmin 43
// vs a 28:00 parkrun = VDOT 33.5). Speed therefore uses performance when available.
export function runningFitness({ tpMps, vo2max, sprintMps, perfVdot }) {
  const baseMps = tpMps ? tpMps / 1.14 : null;            // slowest edge of Aerobic Power zone
  const v = {
    base: vdotFor(baseMps, 180),
    endurance: vdotFor(tpMps, 60),
    speed: perfVdot || vo2max || null,
    sprint: vdotFor(sprintMps, 1.5),
  };
  const scoresFor = (sex) => Object.fromEntries(Object.entries(v).map(([k, x]) => [k, abilityScore(x, sex)]));
  // Overall score is set from the predicted marathon (COROS: "Running Fitness represents your
  // marathon performance"); computeAll fills it in after the race predictor runs.
  return { score: null, abilities: scoresFor("male"), abilitiesBySex: { male: scoresFor("male"), female: scoresFor("female") }, vdot: v, speedSource: perfVdot ? "best efforts" : vo2max ? "VO2max" : null };
}

// Independent per-distance predictions (COROS: "operate independently").
export function racePredictor({ vdot, longestRunKm6w }) {
  if (!vdot) return null;
  const mix = (a, b, wa) => (a && b ? a * wa + b * (1 - wa) : a || b);
  const v5 = mix(vdot.speed, vdot.endurance, 0.6);
  const v10 = mix(vdot.speed, vdot.endurance, 0.3);
  const vHm = vdot.endurance || v10;
  const vM = mix(vdot.endurance, vdot.base, 0.6);
  let m = raceTime(vM, 42195);
  if (m && longestRunKm6w != null && longestRunKm6w < 25) m = Math.round(m * (1 + 0.08 * Math.min(1, (25 - longestRunKm6w) / 15)));
  const out = { "5k": raceTime(v5, 5000), "10k": raceTime(v10, 10000), half: raceTime(vHm, 21097.5), marathon: m };
  const dist = { "5k": 5, "10k": 10, half: 21.0975, marathon: 42.195 };
  return Object.fromEntries(Object.entries(out).map(([k, t]) => [k, t ? { seconds: t, paceSecPerKm: Math.round(t / dist[k]) } : null]));
}

// VO2max fallback from one run (used only when Garmin VO2max is missing).
export function vo2FromRun(mps, avgHr, maxHr) {
  if (!mps || !avgHr || !maxHr) return null;
  const pct = (avgHr / maxHr - 0.37) / 0.64;
  if (pct < 0.55 || pct > 1) return null;
  const e = vo2Cost(mps * 60) / pct;
  return e >= 25 && e <= 85 ? round(e, 1) : null;
}

// Training Effect (labels + 0-5 scale exact; model est.).
export const TE_LABELS = ["Inefficient", "Recovering", "Maintaining", "Improving", "Optimized", "Overreaching"];
export const teLabel = (x) => (x == null ? null : TE_LABELS[clamp(Math.floor(x), 0, 5)]);
export function trainingEffect(load, aboveLt, baseFitness) {
  if (!load) return null;
  const bf = Math.max(baseFitness || 0, 15);
  const aerobic = round(clamp(2.0 * Math.log(1 + (1.4 * (load - aboveLt)) / bf), 0, 5.9), 1);
  const anaerobic = round(clamp(2.4 * Math.log(1 + (3 * aboveLt) / bf), 0, 5.9), 1);
  return { aerobic, aerobicLabel: teLabel(aerobic), anaerobic, anaerobicLabel: teLabel(anaerobic) };
}

// Training Focus from load per threshold pace zone (zone 1..6 -> label).
export const FOCUS = ["Easy", "Base", "Tempo", "Threshold", "VO2 Max", "Anaerobic"];
export function trainingFocus(loadByPaceZone) {
  if (!loadByPaceZone || !loadByPaceZone.some((x) => x > 0)) return null;
  // Harder zones (4-6) win once they carry a third of the load (est.); else the largest zone.
  const total = loadByPaceZone.reduce((s, x) => s + x, 0);
  for (let z = 5; z >= 3; z--) if (loadByPaceZone[z] / total >= 0.33) return FOCUS[z];
  let best = 0;
  loadByPaceZone.forEach((x, i) => { if (x > loadByPaceZone[best]) best = i; });
  return FOCUS[best];
}

// Effort Accuracy (exact for COROS's documented case): mean of quality and quantity.
export const effortAccuracy = (quality, quantity) =>
  quality == null || quantity == null ? null : Math.round((clamp(quality, 0, 100) + clamp(quantity, 0, 100)) / 2);

// Best VDOT from best-effort times: { "3k": sec, "5k": sec, ... } -> VDOT (or null).
export function vdotFromEfforts(efforts) {
  const m = { "3k": 3000, "5k": 5000, "10k": 10000, half: 21097.5, marathon: 42195 };
  let best = null;
  for (const [k, d] of Object.entries(m)) {
    const t = efforts && efforts[k];
    if (!t) continue;
    const v = vdotFor(d / t, t / 60);
    if (v && (!best || v > best)) best = v;
  }
  return best;
}
