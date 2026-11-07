// Kemp Fit metric engine. Pure functions; inputs in, outputs + provenance out.
// Each output names its method: "exact" = public COROS definition reproduced,
// "est." = our model of undocumented behaviour, "source" = value taken from Garmin/intervals.icu.
import { round, dayKey, addDays, daysBetween, weekStart, median } from "./util.mjs";
import { ewma, intensityTrendPct, statusFromTrend, STATUS_TEXT, BF_DAYS, LI_DAYS, COMING_BACK_DROP } from "./status.mjs";
import { recoveryAt, recoveryHours, pctFromRemaining, recoveryState, recoveryAdvice } from "./recovery.mjs";
import { lthrZones, paceZones } from "./zones.mjs";
import { efficiencyScore, efficiencyLevel } from "./efficiency.mjs";
import { runningFitness, racePredictor, trainingEffect, vo2FromRun, vdotFromEfforts, rfFromMarathonMinutes } from "./fitness.mjs";
import { loadLevel } from "./load.mjs";
import { trainingEffectFromEpoc, activityClass, baseRemaining, hoursForTe, sleepModifier, rhrModifier, feelModifier, readiness, teExtended, hoursForTeExtended, calibrateScale, pearson } from "./epoc.mjs";

export const ALGORITHM_VERSION = "1.6.0";

export const METHODS = {
  trainingLoad: "est. (TRIMP, calibrated to COROS examples 99/199/295)",
  baseFitness: "est. (42-day EWMA of daily load)",
  loadImpact: "est. (7-day EWMA of daily load)",
  intensityTrend: "exact (Load Impact / Base Fitness)",
  trainingStatus: "exact bands; Resuming vs Performance split est. (Resuming = Base Fitness fell >= 8% over the previous 3 weeks and load is rising again; otherwise Performance)",
  weeklyLoad: "exact (Mon-Sun sum)",
  recommendedWeekly: "est.",
  recovery: "COROS method (est.): recovery hours proportional to Training Load / Base Fitness, max 96 h, same inputs COROS describes (no sleep/HRV); % calibrated to COROS's 64% at 33 h example; exact COROS bands",
  hrZones: "exact COROS default % of LTHR",
  paceZones: "exact COROS default % of threshold pace",
  thresholds: "source (intervals.icu athlete settings); threshold pace est. from your pace-HR relationship when not set",
  vo2max: "source (Garmin, via intervals.icu wellness); est. fallback",
  runningFitness: "COROS scale: overall from the predicted marathon, abilities from each criterion's equivalent marathon, via COROS's Running Fitness / marathon table (male and female); criteria per COROS (Base = slowest Aerobic Power pace, Endurance = threshold pace, Speed = VO2max / best efforts, Sprint = best 30-60 s); est.",
  racePredictor: "est. (independent per distance; anchored to your best 3k-half efforts in the last 6 weeks, else 90 days)",
  efficiency: "est. model; exact eligibility and bands",
  trainingEffect: "aerobic: peak EPOC vs activity class (Firstbeat TE white paper method; EPOC est. from HR, intensity anchored on lactate threshold HR); anaerobic: est.; exact scale and labels",
  recoveryTime: "Kemp Fit method (est.): hours from each session's EPOC-based Training Effect (Firstbeat-style, not capped at TE 5), scaled to your own next-morning resting-HR responses, cumulative, max 96 h, adjusted by sleep, resting HR and your rating vs your own baseline; % on the same scale as the COROS method. Not a medical measurement.",
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
  const vo2Rows = (wellness || []).filter((w) => w.vo2max > 0).sort((a, b) => String(b.id).localeCompare(String(a.id)));
  s.vo2max = vo2Rows.length ? vo2Rows[0].vo2max : 45;
  s.sources.vo2max = vo2Rows.length ? "Garmin" : "default";
  if (!s.tpSecPerKm && estimates.tp) { s.tpSecPerKm = estimates.tp.tpSecPerKm; s.sources.tpSecPerKm = estimates.tp.source; }
  for (const [k, v] of Object.entries(overrides || {})) if (v) { s[k] = v; s.sources[k] = "user"; }
  return s;
}

// activities: slim summaries; actMetrics: { id -> analyzeActivity() output }; wellness: raw rows.
export function computeAll({ activities, actMetrics = {}, wellness = [], settings, feels = {}, today = dayKey(new Date()), now = Date.now() }) {
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
      status: statusFromTrend(it, {
        loadRising: i >= 7 ? li[i] > li[i - 7] : false,
        comingBack: i >= 21 ? bf[i - 21] > 0 && Math.min(...bf.slice(i - 7, i + 1)) < bf[i - 21] * (1 - COMING_BACK_DROP) : false,
      }) };
  });
  const bfOn = Object.fromEntries(series.map((r) => [r.date, r.baseFitness]));

  // Recovery (real time)
  const events = acts.filter((a) => perAct[a.id].load).map((a) => ({
    t: Date.parse(a.date) + (a.duration || 0) * 1000, load: perAct[a.id].load, bf: bfOn[String(a.date).slice(0, 10)] || 30 }));
  const recovery = recoveryAt(events, now);
  recovery.method = "coros";
  recovery.history = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(today, i - 13); const [y, mo, dd] = d.split("-").map(Number);
    const r = recoveryAt(events, new Date(y, mo - 1, dd, 7).getTime());
    return { date: d, pct: r.pct, hours: r.hoursToFull };
  });

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
  const mMin = predictor?.marathon?.seconds ? predictor.marathon.seconds / 60 : null;
  const rfScore = { male: rfFromMarathonMinutes(mMin, "male"), female: rfFromMarathonMinutes(mMin, "female") };
  rf.score = rfScore.male;

  // Per-activity derived metrics
  const runLoads90 = runs.filter((a) => Date.parse(a.date) >= Date.parse(addDays(today, -90))).map((a) => perAct[a.id].load);
  // Activity class at the time of each activity: average weekly hours over the previous 4 weeks.
  const classAt = (dateStr) => {
    const t = Date.parse(dateStr), from = t - 28 * 86400000;
    const sec = acts.filter((x) => { const u = Date.parse(x.date); return u < t && u >= from; }).reduce((s2, x) => s2 + (x.duration || 0), 0);
    return activityClass(sec / 3600 / 4);
  };
  // ---- Personal calibration of Kemp Fit hours (Version 2) ----
  const rhrBy = Object.fromEntries((wellness || []).filter((w) => w.restingHR > 0).map((w) => [String(w.id), w.restingHR]));
  const rawKemp = {};
  for (const a of acts) {
    const m = perAct[a.id];
    if (m.peakEpoc == null) continue;
    rawKemp[a.id] = hoursForTeExtended(teExtended(m.peakEpoc, classAt(a.date)));
  }
  const nextMorning = (a) => {
    const d = String(a.date).slice(0, 10), nd = addDays(d, 1);
    const end = Date.parse(a.date) + (a.duration || 0) * 1000;
    const [y, mo, dd] = nd.split("-").map(Number);
    const base = median(Array.from({ length: 14 }, (_, k) => rhrBy[addDays(d, -k)]).filter(Boolean));
    return { hoursToMorning: (new Date(y, mo - 1, dd, 7).getTime() - end) / 3600000, rhrRise: rhrBy[nd] && base ? rhrBy[nd] - base : null };
  };
  const samples = acts.filter((a) => rawKemp[a.id] != null).map((a) => ({ id: a.id, rawHours: rawKemp[a.id], ...nextMorning(a) }));
  const calibration = calibrateScale(samples);

  const activityMetrics = acts.map((a) => {
    const m = perAct[a.id];
    const eff = efficiencyScore(a, runs, settings.max);
    const te = trainingEffect(m.load, m.aboveLt || 0, bfOn[String(a.date).slice(0, 10)]);
    const ac = classAt(a.date);
    if (te && m.peakEpoc != null) {
      te.aerobic = trainingEffectFromEpoc(m.peakEpoc, ac);
      te.aerobicLabel = ["Inefficient", "Recovering", "Maintaining", "Improving", "Optimized", "Overreaching"][Math.min(5, Math.floor(te.aerobic))];
    }
    return {
      id: a.id, date: a.date, load: m.load, loadSource: m.source || null, loadLevel: loadLevel(m.load, runLoads90),
      peakEpoc: m.peakEpoc ?? null, activityClass: ac, feel: feels[a.id] ?? null,
      recoveryHours: rawKemp[a.id] != null ? Math.round(Math.min(96, rawKemp[a.id] * calibration.scale)) : te ? Math.round(hoursForTe(te.aerobic) * calibration.scale) : null,
      corosRecoveryHours: m.load ? Math.round(recoveryHours(m.load, bfOn[String(a.date).slice(0, 10)] || 30)) : null,
      trainingEffect: te,
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

  // ---- Recovery Time (est., personalised) ----
  const amById = Object.fromEntries(activityMetrics.map((x) => [x.id, x]));
  const sessions = acts.filter((a) => amById[a.id]?.recoveryHours != null)
    .map((a) => ({ t: Date.parse(a.date) + (a.duration || 0) * 1000, te: amById[a.id].trainingEffect?.aerobic ?? null, hours: amById[a.id].recoveryHours, id: a.id }));
  const base = baseRemaining(sessions, now);
  const wl = [...wellness].sort((a, b) => String(b.id).localeCompare(String(a.id)));
  // Latest day (today or yesterday) that actually has sleep or resting-HR data - today's row often
  // exists before last night's sleep has synced.
  const recent = wl.find((w) => daysBetween(String(w.id), today) <= 1 && (w.sleepSecs || w.restingHR)) || null;
  const startIdx = recent ? wl.indexOf(recent) + 1 : 0;
  const prior = (n) => wl.slice(startIdx, startIdx + n);
  const mods = [];
  if (recent) {
    mods.push(...sleepModifier(recent.sleepSecs ? recent.sleepSecs / 60 : null, median(prior(14).map((w) => (w.sleepSecs ? w.sleepSecs / 60 : null))),
      recent.sleepScore ?? null, median(prior(14).map((w) => w.sleepScore))));
    const r = rhrModifier(recent.restingHR, median(prior(30).map((w) => w.restingHR)));
    if (r) mods.push(r);
  }
  const lastSession = sessions[sessions.length - 1];
  if (lastSession && now - lastSession.t < 48 * 3600e3) { const f = feelModifier(feels[lastSession.id]); if (f) mods.push(f); }
  const applied = mods.filter((x) => base > 0 || x.hours > 0);
  const hours = Math.max(0, Math.min(96, base + applied.reduce((s2, x) => s2 + x.hours, 0)));
  const history = Array.from({ length: 14 }, (_, i) => {
    const d = addDays(today, i - 13); const [y, mo, dd] = d.split("-").map(Number);
    const h = Math.round(baseRemaining(sessions, new Date(y, mo - 1, dd, 7).getTime()));
    return { date: d, hours: h, pct: pctFromRemaining(h) };
  });
  const kPct = pctFromRemaining(hours);
  const recoveryTime = {
    method: "kempfit",
    hours: Math.round(hours), baseHours: Math.round(base), modifiers: applied, ignoredModifiers: mods.filter((x) => !applied.includes(x)),
    pct: kPct, hoursToFull: Math.round(hours), state: recoveryState(kPct), advice: recoveryAdvice(kPct),
    readiness: readiness(Math.round(hours)), activityClass: classAt(new Date(now).toISOString()),
    lastSession: lastSession ? { id: lastSession.id, te: lastSession.te, hours: lastSession.hours, peakEpoc: amById[lastSession.id]?.peakEpoc ?? null } : null,
    calibration,
    signals: recent ? { date: recent.id, sleepMin: recent.sleepSecs ? Math.round(recent.sleepSecs / 60) : null, sleepScore: recent.sleepScore ?? null, restingHR: recent.restingHR ?? null } : null,
    history,
  };

  // ---- How well each method fits this athlete (next-morning resting HR) ----
  const fitRows = samples.filter((x) => x.rhrRise != null).map((x) => ({ ...x, co: amById[x.id]?.corosRecoveryHours, kf: amById[x.id]?.recoveryHours }))
    .filter((x) => x.co != null && x.kf != null);
  const resid = (h, x) => Math.max(0, h - x.hoursToMorning);
  const thirds = (key) => {
    const srt = [...fitRows].sort((a, b) => a[key] - b[key]); const n = Math.floor(srt.length / 3);
    if (n < 3) return null;
    const mean = (arr) => round(arr.reduce((p, q) => p + q.rhrRise, 0) / arr.length, 2);
    return { lightest: mean(srt.slice(0, n)), heaviest: mean(srt.slice(-n)) };
  };
  const heavy = [...acts].filter((a) => amById[a.id]?.load).sort((a, b) => amById[b.id].load - amById[a.id].load).slice(0, 12);
  const spread = (key) => { const v = heavy.map((a) => amById[a.id][key]).filter((x) => x != null); return v.length ? { min: Math.min(...v), max: Math.max(...v) } : null; };
  const recoveryFit = fitRows.length < 10 ? null : {
    n: fitRows.length,
    medianHours: { coros: median(fitRows.map((x) => x.co)), kempfit: median(fitRows.map((x) => x.kf)) },
    corrWithRhr: {
      coros: round(pearson(fitRows.map((x) => resid(x.co, x)), fitRows.map((x) => x.rhrRise)), 2),
      kempfit: round(pearson(fitRows.map((x) => resid(x.kf, x)), fitRows.map((x) => x.rhrRise)), 2),
    },
    rhrAfter: { coros: thirds("co"), kempfit: thirds("kf") },
    heavySpread: { coros: spread("corosRecoveryHours"), kempfit: spread("recoveryHours") },
    heaviest: heavy.slice(0, 8).map((a) => ({ id: a.id, date: a.date, km: a.distance, minutes: Math.round((a.duration || 0) / 60), load: amById[a.id].load, coros: amById[a.id].corosRecoveryHours, kempfit: amById[a.id].recoveryHours, rhrRise: (samples.find((x) => x.id === a.id) || {}).rhrRise ?? null })),
    calibration,
  };

  return {
    algorithmVersion: ALGORITHM_VERSION,
    generatedAt: new Date(now).toISOString(),
    methods: METHODS,
    settings,
    zones: { hr: lthrZones(settings.lthr), pace: paceZones(settings.tpSecPerKm) },
    current: {
      date: cur.date, baseFitness: cur.baseFitness, loadImpact: cur.loadImpact, intensityTrend: cur.intensityTrend,
      status: cur.status, statusText: STATUS_TEXT[cur.status] || null, recovery, recoveryTime, recoveryFit,
      weekLoad: weeks.length ? weeks[weeks.length - 1].load : 0, recommendedWeekLoad: recommended,
      vo2max: vo2max ? round(vo2max, 1) : null, vo2Source: garminVo2 ? "Garmin" : fallbackVo2 ? "est." : null,
      runningFitness: { score: rf.score, abilities: rf.abilities, scoreBySex: rfScore, abilitiesBySex: rf.abilitiesBySex, speedSource: rf.speedSource },
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
