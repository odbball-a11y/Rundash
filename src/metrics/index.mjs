// Kemp Fit metric engine. Pure functions; inputs in, outputs + provenance out.
// Each output names its method: "exact" = public COROS definition reproduced,
// "est." = our model of undocumented behaviour, "source" = value taken from Garmin/intervals.icu.
import { round, dayKey, addDays, daysBetween, weekStart, median } from "./util.mjs";
import { ewma, intensityTrendPct, statusFromTrend, STATUS_TEXT, BF_DAYS, LI_DAYS } from "./status.mjs";
import { recoveryAt } from "./recovery.mjs";
import { lthrZones, paceZones } from "./zones.mjs";
import { efficiencyScore, efficiencyLevel } from "./efficiency.mjs";
import { runningFitness, racePredictor, trainingEffect, vo2FromRun, vdotFromEfforts } from "./fitness.mjs";
import { loadLevel } from "./load.mjs";

export const ALGORITHM_VERSION = "1.2.0";

export const METHODS = {
  trainingLoad: "est. (TRIMP, calibrated to COROS examples 99/199/295)",
  baseFitness: "est. (42-day EWMA of daily load)",
  loadImpact: "est. (7-day EWMA of daily load)",
  intensityTrend: "exact (Load Impact / Base Fitness)",
  trainingStatus: "exact bands; Resuming vs Performance split est.",
  weeklyLoad: "exact (Mon-Sun sum)",
  recommendedWeekly: "est.",
  recovery: "est. model; exact bands",
  hrZones: "exact COROS default % of LTHR",
  paceZones: "exact COROS default % of threshold pace",
  thresholds: "source (intervals.icu athlete settings); threshold pace est. from your pace-HR relationship when not set",
  vo2max: "source (Garmin, via intervals.icu wellness); est. fallback",
  runningFitness: "est. (VDOT-equivalent per COROS criterion, 40-100)",
  racePredictor: "est. (independent per distance; anchored to your best 3k-half efforts in the last 6 weeks, else 90 days)",
  efficiency: "est. model; exact eligibility and bands",
  trainingEffect: "est. model; exact scale and labels",
  trainingFocus: "est.",
  personalRecords: "exact (fastest continuous segment incl. pauses)",
};

// Resolve athlete thresholds from intervals.icu rows (+ optional user overrides).
// Threshold pace (est.) from the pace-HR relationship of steady running in the last 90 days:
// weighted linear fit of grade-adjusted speed against HR, evaluated at LTHR (COROS describes
// Running Fitness / zones as based on "the relationship between the heart rate and pace").
// Fallback: ~88% of VO2max (Daniels threshold) when the fit is not usable.
export function estimateThresholdPace({ activities, actMetrics, lthr, vo2max, today = dayKey(new Date()) }) {
  const cutoff = Date.parse(addDays(today, -90));
  const agg = {};
  for (const a of activities || []) {
    if (!/run/i.test(a.sport || "") || Date.parse(a.date) < cutoff) continue;
    for (const [hr, [sec, vs]] of Object.entries((actMetrics[a.id] || {}).hrSpeedBins || {})) {
      const e = (agg[hr] ||= [0, 0]); e[0] += sec; e[1] += vs;
    }
  }
  const pts = Object.entries(agg).filter(([, [sec]]) => sec >= 60).map(([hr, [sec, vs]]) => ({ x: +hr + 1, y: vs / sec, w: sec }));
  const W = pts.reduce((s, p) => s + p.w, 0);
  if (lthr && pts.length >= 5 && W >= 1800) {
    const mx = pts.reduce((s, p) => s + p.w * p.x, 0) / W, my = pts.reduce((s, p) => s + p.w * p.y, 0) / W;
    const sxx = pts.reduce((s, p) => s + p.w * (p.x - mx) ** 2, 0), sxy = pts.reduce((s, p) => s + p.w * (p.x - mx) * (p.y - my), 0);
    const xs = pts.map((p) => p.x), spread = Math.max(...xs) - Math.min(...xs);
    if (sxx > 0 && sxy > 0 && spread >= 12) {
      const v = my + (sxy / sxx) * (lthr - mx);
      if (v > 2 && v < 6.5) return { tpSecPerKm: round(1000 / v, 1), source: `est. (pace-HR fit, ${pts.length} HR bins, ${Math.round(W / 60)} min of running, 90 days)` };
    }
  }
  if (vo2max) {
    const target = 0.88 * vo2max; // ml/kg/min at threshold
    const vMpm = (-0.182258 + Math.sqrt(0.182258 ** 2 + 4 * 0.000104 * (target + 4.6))) / (2 * 0.000104);
    return { tpSecPerKm: round(1000 / (vMpm / 60), 1), source: "est. (88% of VO2max)" };
  }
  return null;
}

export function resolveSettings(rawActivities, wellness, overrides = {}, estimates = {}) {
  const latest = [...(rawActivities || [])].sort((a, b) => String(b.start_date_local).localeCompare(String(a.start_date_local)));
  const pick = (f, ok = (x) => x > 0) => { for (const a of latest) if (ok(a[f])) return a[f]; return null; };
  const recentRest = median((wellness || []).slice().sort((a, b) => String(b.id).localeCompare(String(a.id))).slice(0, 14).map((w) => w.restingHR).filter((x) => x > 0));
  // intervals.icu `pace` on an activity is the athlete's threshold pace (m/s) at the time.
  // Guard: accept it only if it is not simply each run's own average speed.
  let tpMps = pick("pace", (x) => x > 1.5 && x < 8);
  const sameAsOwn = latest.slice(0, 20).filter((a) => a.pace && a.average_speed && Math.abs(a.pace - a.average_speed) < 0.01).length;
  if (sameAsOwn >= 5) tpMps = null;
  const s = {
    lthr: pick("lthr", (x) => x > 100 && x < 220),
    max: pick("athlete_max_hr", (x) => x > 120 && x < 230),
    rest: recentRest || pick("icu_resting_hr", (x) => x > 25 && x < 110),
    tpSecPerKm: tpMps ? round(1000 / tpMps, 1) : null,
    sources: {},
  };
  for (const k of ["lthr", "max", "rest", "tpSecPerKm"]) s.sources[k] = s[k] ? (k === "rest" && recentRest ? "Garmin resting HR (14-day median)" : "intervals.icu") : null;
  if (!s.max) { s.max = 190; s.sources.max = "default"; }
  if (!s.rest) { s.rest = 55; s.sources.rest = "default"; }
  if (!s.lthr) { s.lthr = Math.round(s.max * 0.89); s.sources.lthr = "est. (89% of max HR)"; }
  if (!s.tpSecPerKm && estimates.tp) { s.tpSecPerKm = estimates.tp.tpSecPerKm; s.sources.tpSecPerKm = estimates.tp.source; }
  for (const [k, v] of Object.entries(overrides || {})) if (v) { s[k] = v; s.sources[k] = "user"; }
  return s;
}

// activities: slim summaries; actMetrics: { id -> analyzeActivity() output }; wellness: raw rows.
export function computeAll({ activities, actMetrics = {}, wellness = [], settings, today = dayKey(new Date()), now = Date.now() }) {
  const acts = [...activities].filter((a) => a.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const runs = acts.filter((a) => /run/i.test(a.sport || ""));
  const firstDay = acts.length ? String(acts[0].date).slice(0, 10) : today;

  // Daily load
  const loadByDay = {};
  const perAct = {};
  for (const a of acts) {
    const m = actMetrics[a.id] || {};
    const load = m.load ?? null;
    perAct[a.id] = { ...m, load };
    const d = String(a.date).slice(0, 10);
    loadByDay[d] = (loadByDay[d] || 0) + (load || 0);
  }
  const n = Math.max(1, daysBetween(firstDay, today) + 1);
  const days = Array.from({ length: n }, (_, i) => addDays(firstDay, i));
  const daily = days.map((d) => loadByDay[d] || 0);
  const bf = ewma(daily, BF_DAYS), li = ewma(daily, LI_DAYS);
  const series = days.map((d, i) => {
    const it = intensityTrendPct(li[i], bf[i]);
    return { date: d, load: Math.round(daily[i]), baseFitness: round(bf[i], 1), loadImpact: round(li[i], 1), intensityTrend: it,
      status: statusFromTrend(it, i >= 7 ? li[i] > li[i - 7] : false) };
  });
  const bfOn = Object.fromEntries(series.map((r) => [r.date, r.baseFitness]));

  // Recovery (real time)
  const events = acts.filter((a) => perAct[a.id].load).map((a) => ({
    t: Date.parse(a.date) + (a.duration || 0) * 1000, load: perAct[a.id].load, bf: bfOn[String(a.date).slice(0, 10)] || 30 }));
  const recovery = recoveryAt(events, now);

  // Weekly load (Mon-Sun) and recommendation (est.: BF*7 band, lower after 3 rising weeks)
  const weekly = {};
  for (const r of series) { const w = weekStart(r.date); weekly[w] = (weekly[w] || 0) + r.load; }
  const weeks = Object.entries(weekly).map(([week, load]) => ({ week, load })).sort((a, b) => a.week.localeCompare(b.week));
  const cur = series[series.length - 1] || {};
  const prev = weeks.slice(-4, -1).map((w) => w.load);
  const rising3 = prev.length === 3 && prev[1] > prev[0] && prev[2] > prev[1];
  const baseWeek = (cur.baseFitness || 0) * 7;
  const recommended = baseWeek ? (rising3
    ? { min: Math.round(baseWeek * 0.7), max: Math.round(baseWeek * 0.9), note: "recovery week (3:1)" }
    : { min: Math.round(baseWeek * 1.0), max: Math.round(baseWeek * 1.15), note: "build" }) : null;

  // Garmin VO2max (wellness) or fallback
  const vo2Rows = wellness.filter((w) => w.vo2max > 0).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const garminVo2 = vo2Rows.length ? vo2Rows[vo2Rows.length - 1].vo2max : null;
  const fallbackVo2 = median(runs.slice(-10).map((a) => vo2FromRun(a.speed, a.heartRateAvg, settings.max)));
  const vo2max = garminVo2 || fallbackVo2;

  // Six-week window inputs
  const cutoff = Date.parse(addDays(today, -42));
  const recentRuns = runs.filter((a) => Date.parse(a.date) >= cutoff);
  const sprintMps = Math.max(0, ...recentRuns.map((a) => perAct[a.id].best60sMps || 0)) || null;
  const longestRunKm6w = recentRuns.length ? Math.max(...recentRuns.map((a) => a.distance || 0)) : null;
  const tpMps = settings.tpSecPerKm ? 1000 / settings.tpSecPerKm : null;
  // Performance anchor: best VDOT from 3k-half best efforts, last 6 weeks, else last 90 days.
  const perfIn = (days) => {
    const c = Date.parse(addDays(today, -days));
    const vs = runs.filter((a) => Date.parse(a.date) >= c).map((a) => vdotFromEfforts(perAct[a.id].bestEfforts)).filter(Boolean);
    return vs.length ? Math.max(...vs) : null;
  };
  const perfVdot = perfIn(42) || perfIn(90);
  const rf = runningFitness({ tpMps, vo2max, sprintMps, perfVdot });
  const predictor = racePredictor({ vdot: rf.vdot, longestRunKm6w });

  // Per-activity derived metrics
  const runLoads90 = runs.filter((a) => Date.parse(a.date) >= Date.parse(addDays(today, -90))).map((a) => perAct[a.id].load);
  const activityMetrics = acts.map((a) => {
    const m = perAct[a.id];
    const eff = efficiencyScore(a, runs, settings.max);
    return {
      id: a.id, date: a.date, load: m.load, loadSource: m.source || null, loadLevel: loadLevel(m.load, runLoads90),
      trainingEffect: trainingEffect(m.load, m.aboveLt || 0, bfOn[String(a.date).slice(0, 10)]),
      focus: m.focus || null, efficiency: eff, efficiencyLevel: efficiencyLevel(eff),
      hrZoneSeconds: m.hrZoneSeconds || null, paceZoneSeconds: m.paceZoneSeconds || null, bestEfforts: m.bestEfforts || null,
    };
  });

  // Personal records (all-time, runs)
  const prs = {};
  for (const a of runs) {
    for (const [k, t] of Object.entries(perAct[a.id].bestEfforts || {})) {
      if (t && (!prs[k] || t < prs[k].seconds)) prs[k] = { seconds: t, activityId: a.id, date: a.date };
    }
  }
  const longest = runs.reduce((b, a) => ((a.distance || 0) > (b?.distance || 0) ? a : b), null);
  const climb = runs.reduce((b, a) => ((a.elevation || 0) > (b?.elevation || 0) ? a : b), null);

  return {
    algorithmVersion: ALGORITHM_VERSION,
    generatedAt: new Date(now).toISOString(),
    methods: METHODS,
    settings,
    zones: { hr: lthrZones(settings.lthr), pace: paceZones(settings.tpSecPerKm) },
    current: {
      date: cur.date, baseFitness: cur.baseFitness, loadImpact: cur.loadImpact, intensityTrend: cur.intensityTrend,
      status: cur.status, statusText: STATUS_TEXT[cur.status] || null, recovery,
      weekLoad: weeks.length ? weeks[weeks.length - 1].load : 0, recommendedWeekLoad: recommended,
      vo2max: vo2max ? round(vo2max, 1) : null, vo2Source: garminVo2 ? "Garmin" : fallbackVo2 ? "est." : null,
      runningFitness: { score: rf.score, abilities: rf.abilities, speedSource: rf.speedSource },
      performanceVdot: perfVdot ? round(perfVdot, 1) : null, racePredictor: predictor,
    },
    series,
    weeks,
    activities: activityMetrics,
    personalRecords: {
      ...prs,
      longestRun: longest ? { km: longest.distance, activityId: longest.id, date: longest.date } : null,
      mostElevation: climb && climb.elevation ? { m: climb.elevation, activityId: climb.id, date: climb.date } : null,
    },
  };
}

export { analyzeActivity } from "./activity.mjs";
