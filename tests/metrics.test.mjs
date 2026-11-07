// Run with: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { lthrZones, paceZones, zoneOfHr, zoneOfPace } from "../src/metrics/zones.mjs";
import { loadFromStream } from "../src/metrics/load.mjs";
import { intensityTrendPct, statusFromTrend, ewma } from "../src/metrics/status.mjs";
import { recoveryAt, recoveryState, pctFromRemaining } from "../src/metrics/recovery.mjs";
import { efficiencyLevel } from "../src/metrics/efficiency.mjs";
import { raceTime, effortAccuracy, teLabel, trainingFocus, vdotFromEfforts, racePredictor, runningFitness } from "../src/metrics/fitness.mjs";
import { bestTimeForDistance, bestSpeedForDuration, analyzeActivity } from "../src/metrics/activity.mjs";
import { computeAll, resolveSettings, estimateThresholdPace } from "../src/metrics/index.mjs";
import { hrSpeedBins } from "../src/metrics/activity.mjs";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} not within ${tol} of ${b}`);

test("HR zones reproduce COROS Training Hub example (LTHR 161)", () => {
  const z = lthrZones(161).map((x) => [x.lo, x.hi]);
  assert.deepEqual(z, [[null, 128], [129, 145], [146, 153], [154, 164], [165, 171], [172, null]]);
  assert.equal(zoneOfHr(lthrZones(161), 150), 3);
  assert.equal(zoneOfHr(lthrZones(161), 180), 6);
});

test("Pace zones reproduce COROS example (threshold 5:38 /mi = 338 s)", () => {
  const z = paceZones(338).map((x) => [x.name, x.fastSec, x.slowSec]);
  assert.deepEqual(z, [
    ["Recovery", 461, null],            // > 7:40
    ["Aerobic Endurance", 386, 460],    // 6:26 - 7:40
    ["Aerobic Power", 359, 385],        // 5:59 - 6:25
    ["Threshold", 332, 358],            // 5:32 - 5:58
    ["Anaerobic Endurance", 306, 331],  // 5:06 - 5:31
    ["Anaerobic Power", null, 305],     // < 5:06
  ]);
  assert.equal(zoneOfPace(paceZones(338), 340), 4);
});

test("Training Load calibration hits COROS worked examples", () => {
  const run = (hr, minutes) => {
    const t = Array.from({ length: minutes * 60 + 1 }, (_, i) => i);
    return loadFromStream(t, t.map(() => hr), 50, 190, 168).load;
  };
  near(run(143, 55), 99, 6, "55 min zones 1-2");
  near(run(163, 55), 199, 12, "55 min zones 3-4");
  near(run(143, 165), 295, 15, "165 min zone 2");
});

test("Intensity Trend matches all three COROS screenshots", () => {
  assert.equal(intensityTrendPct(140, 123), 113);
  assert.equal(intensityTrendPct(26, 72), 36);
  assert.equal(intensityTrendPct(53, 42), 126);
});

test("Training Status bands (EvoLab article)", () => {
  assert.equal(statusFromTrend(150), "Excessive");
  assert.equal(statusFromTrend(113), "Optimized");
  assert.equal(statusFromTrend(100), "Optimized");
  assert.equal(statusFromTrend(99), "Maintaining");
  assert.equal(statusFromTrend(80), "Maintaining");
  assert.equal(statusFromTrend(79, true), "Resuming");
  assert.equal(statusFromTrend(50, false), "Performance");
  assert.equal(statusFromTrend(36), "Decreasing");
});

test("EWMA converges to a constant load", () => {
  const s = ewma(Array(300).fill(60), 42);
  near(s[s.length - 1], 60, 0.01, "steady state");
});

test("Effort Accuracy reproduces COROS example (80, 90 -> 85)", () => {
  assert.equal(effortAccuracy(80, 90), 85);
});

test("Efficiency and Training Effect labels", () => {
  assert.equal(efficiencyLevel(106), "Excellent");
  assert.equal(efficiencyLevel(103), "Great");
  assert.equal(efficiencyLevel(100), "Good");
  assert.equal(efficiencyLevel(97), "Fair");
  assert.equal(efficiencyLevel(90), "Low");
  assert.equal(teLabel(0.5), "Inefficient");
  assert.equal(teLabel(3.1), "Improving");
  assert.equal(teLabel(5.2), "Overreaching");
});

test("Recovery: short easy run recovers within a day, hard runs take days, capped at 96 h", () => {
  const t0 = Date.parse("2026-11-06T17:30:00Z");
  const easy = recoveryAt([{ t: t0, load: 62, bf: 37 }], t0);              // 2-mile run
  assert.ok(easy.pct >= 80 && easy.hoursToFull <= 20, `easy ${easy.pct}% ${easy.hoursToFull} h`);
  const next = recoveryAt([{ t: t0, load: 62, bf: 37 }], t0 + 27 * 3600e3);
  assert.equal(next.pct, 100); assert.equal(next.hoursToFull, 0);
  const hard = recoveryAt([{ t: t0, load: 200, bf: 37 }], t0);
  assert.ok(hard.pct < 60 && hard.hoursToFull > 40, `hard ${hard.pct}% ${hard.hoursToFull} h`);
  const later = recoveryAt([{ t: t0, load: 200, bf: 37 }], t0 + 24 * 3600e3);
  assert.ok(later.pct > hard.pct);
  const huge = recoveryAt([{ t: t0, load: 2000, bf: 37 }], t0);
  assert.equal(huge.hoursToFull, 96); assert.equal(huge.state, "Exhausted");
  assert.equal(recoveryState(10), "Exhausted");
  assert.equal(recoveryState(95), "Fresh");
  // COROS screenshot: 64% with 33 h till full recovery
  near(pctFromRemaining(33), 64, 3, "COROS 64% at 33 h");
});

test("Race time from VDOT matches Daniels tables (VDOT 50: 5k ~19:57, marathon ~3:10:49)", () => {
  near(raceTime(50, 5000), 1197, 15, "5k");
  near(raceTime(50, 42195), 11449, 120, "marathon");
});

test("Best efforts from streams", () => {
  const time = Array.from({ length: 1201 }, (_, i) => i);                 // 20 min
  const dist = time.map((t) => (t < 600 ? t * 3 : 1800 + (t - 600) * 4)); // 3 m/s then 4 m/s
  assert.equal(bestTimeForDistance(time, dist, 1000), 250);
  near(bestSpeedForDuration(time, dist, 60), 4, 0.001, "best 60 s");
});

test("Training Focus picks hard zones once they carry a real share", () => {
  assert.equal(trainingFocus([10, 80, 5, 5, 0, 0]), "Base");
  assert.equal(trainingFocus([10, 40, 10, 40, 0, 0]), "Threshold");
});

test("resolveSettings rejects a `pace` field that is just each run's own speed", () => {
  const raw = Array.from({ length: 10 }, (_, i) => ({ start_date_local: `2026-10-${10 + i}T08:00:00`, pace: 3 + i * 0.01, average_speed: 3 + i * 0.01, lthr: 165, athlete_max_hr: 188 }));
  assert.equal(resolveSettings(raw, []).tpSecPerKm, null);
  const raw2 = raw.map((a) => ({ ...a, pace: 3.6 }));
  assert.equal(resolveSettings(raw2, []).tpSecPerKm, 277.8);
});

test("computeAll end-to-end on synthetic history", () => {
  const acts = [], actMetrics = {};
  for (let i = 0; i < 60; i += 2) {
    const d = new Date(2026, 8, 1 + i, 8);
    const id = "a" + i;
    acts.push({ id, date: d.toISOString().slice(0, 19), sport: "Run", distance: 8, duration: 2700, heartRateAvg: 150, speed: 2.96 });
    const time = Array.from({ length: 2701 }, (_, k) => k);
    actMetrics[id] = analyzeActivity(acts[acts.length - 1], { streams: [
      { type: "time", data: time }, { type: "heartrate", data: time.map(() => 150) },
      { type: "distance", data: time.map((k) => k * 2.96) }, { type: "velocity_smooth", data: time.map(() => 2.96) },
    ] }, { rest: 50, max: 190, lthr: 168, tpSecPerKm: 270 });
  }
  const out = computeAll({ activities: acts, actMetrics, wellness: [{ id: "2026-10-30", vo2max: 47, restingHR: 50 }],
    settings: { rest: 50, max: 190, lthr: 168, tpSecPerKm: 270 }, today: "2026-10-31", now: Date.parse("2026-10-31T12:00:00") });
  assert.equal(out.algorithmVersion, "1.4.0");
  assert.equal(out.current.recovery.history.length, 14);
  assert.ok(out.current.recoveryTime.pct >= 0 && out.current.recoveryTime.pct <= 100 && out.current.recoveryTime.state);
  assert.ok(out.activities[0].corosRecoveryHours > 0);
  assert.ok(out.current.recoveryTime && Array.isArray(out.current.recoveryTime.history));
  assert.ok(out.activities[0].peakEpoc > 0);
  assert.ok(out.current.baseFitness > 0);
  assert.ok(out.current.status);
  assert.equal(out.current.vo2Source, "Garmin");
  assert.ok(out.current.racePredictor["5k"].seconds > 0);
  assert.ok(out.current.runningFitness.score >= 40 && out.current.runningFitness.score <= 100);
  assert.ok(out.personalRecords["5k"].seconds > 0);
  assert.equal(out.activities.length, 30);
  assert.ok(out.activities[0].focus);
});

test("Threshold pace from pace-HR relationship", () => {
  // Synthetic athlete: speed = 0.025 * HR - 0.5  -> at LTHR 163: 3.575 m/s = 279.7 s/km
  const acts = [], actMetrics = {};
  for (let r = 0; r < 6; r++) {
    const time = Array.from({ length: 2400 }, (_, i) => i);
    const hr = time.map((i) => 130 + ((i + r * 300) % 1200) / 1200 * 30);  // 130-160 bpm
    const v = hr.map((h) => 0.025 * h - 0.5);
    const id = "r" + r;
    acts.push({ id, sport: "Run", date: "2026-11-0" + (r + 1) + "T08:00:00" });
    actMetrics[id] = { hrSpeedBins: hrSpeedBins({ time, heartrate: hr, velocity_smooth: v }) };
  }
  const tp = estimateThresholdPace({ activities: acts, actMetrics, lthr: 163, vo2max: 43, today: "2026-11-07" });
  near(tp.tpSecPerKm, 279.7, 4, "threshold pace");
  assert.match(tp.source, /pace-HR fit/);
  const fb = estimateThresholdPace({ activities: [], actMetrics: {}, lthr: 163, vo2max: 43, today: "2026-11-07" });
  assert.match(fb.source, /VO2max/);
  assert.ok(fb.tpSecPerKm > 240 && fb.tpSecPerKm < 340, `fallback ${fb.tpSecPerKm}`);
  const st = resolveSettings([], [], {}, { tp });
  assert.equal(st.tpSecPerKm, tp.tpSecPerKm);
});

test("Race predictor anchors to real efforts, not an optimistic watch VO2max", () => {
  const perf = vdotFromEfforts({ "5k": 28 * 60 });   // 28:00 parkrun
  near(perf, 33.5, 0.3, "VDOT of 28:00 5k");
  const rf = runningFitness({ tpMps: 1000 / 350, vo2max: 43, sprintMps: 4.5, perfVdot: perf });
  assert.equal(rf.speedSource, "best efforts");
  const p = racePredictor({ vdot: rf.vdot, longestRunKm6w: 6 });
  near(p["5k"].seconds, 28 * 60, 60, "5k prediction near the actual parkrun");
});

import { toIntervalsText, estimateWorkout, projectSeries, validateWorkout } from "../src/metrics/workouts.mjs";

test("Workout -> intervals.icu text uses absolute pace and %LTHR", () => {
  const zones = { pace: paceZones(341.5), hr: lthrZones(163) };
  const w = { name: "Threshold", steps: [
    { kind: "warmup", dur: { type: "time", value: 600 }, target: { type: "paceZone", zone: 2 } },
    { kind: "repeat", times: 5, steps: [
      { kind: "training", dur: { type: "distance", value: 1000 }, target: { type: "paceZone", zone: 4 } },
      { kind: "rest", dur: { type: "time", value: 90 }, target: { type: "none" } },
    ] },
    { kind: "cooldown", dur: { type: "time", value: 600 }, target: { type: "hrZone", zone: 1 } },
  ] };
  const txt = toIntervalsText(w, zones, { lthr: 163 });
  assert.equal(txt, [
    "- Warm Up 10m 6:30/km-7:44/km Pace",
    "",
    "Main Set 5x",
    "- Training 1km 5:36/km-6:02/km Pace",
    "- Rest 1m30s",
    "",
    "- Cool Down 10m 71-79% LTHR",
  ].join("\n"));
  const e = estimateWorkout(w, zones, { rest: 44, max: 180, lthr: 163 });
  assert.equal(e.blocks.length, 12);
  assert.ok(e.seconds > 1800 && e.seconds < 3600, `seconds ${e.seconds}`);
  assert.ok(e.load > 40, `load ${e.load}`);
  assert.deepEqual(validateWorkout(w), []);
  assert.ok(validateWorkout({ name: "", steps: [] }).length === 2);
});

test("Projection decays without load and rises with it", () => {
  const rest = projectSeries(40, 40, Array(14).fill(0));
  assert.ok(rest[13].baseFitness < 40 && rest[13].loadImpact < rest[13].baseFitness);
  const build = projectSeries(40, 40, Array(14).fill(80));
  assert.ok(build[13].baseFitness > 40 && build[13].intensityTrend > 100);
});

import { epocConstant, epocFromStream, trainingEffectFromEpoc, activityClass, baseRemaining, hoursForTe, sleepModifier, rhrModifier, feelModifier, pctVo2max } from "../src/metrics/epoc.mjs";

test("EPOC model reproduces Firstbeat Fig. 5 curves and Table 4 typical values", () => {
  near(epocConstant(0.7, 30), 85, 10, "70% 30 min");
  near(epocConstant(0.7, 60), 135, 12, "70% 60 min");
  near(epocConstant(0.6, 60), 62, 8, "60% 60 min");
  const easyHour = epocConstant(0.6, 60);
  assert.ok(easyHour >= 40 && easyHour <= 90, `60 min easy run ${easyHour} (Table 4: 40-90)`);
  const race10k = epocConstant(0.85, 45);
  assert.ok(race10k >= 120 && race10k <= 280, `10k race ${race10k} (Table 4: 120-260)`);
  const walk = epocConstant(0.45, 60);
  assert.ok(walk >= 10 && walk <= 25, `brisk 1 h walk ${walk} (Table 4: 10-25)`);
  // Intervals peak lower than continuous at the same high intensity (EPOC falls during rests)
  const t = Array.from({ length: 1801 }, (_, i) => i);
  const cont = epocFromStream(t, t.map(() => 170), { rest: 50, max: 185, vo2max: 50 });
  const intv = epocFromStream(t, t.map((i) => (Math.floor(i / 180) % 2 ? 120 : 170)), { rest: 50, max: 185, vo2max: 50 });
  assert.ok(intv < cont, `intervals ${intv} < continuous ${cont}`);
  near(pctVo2max(185, 50, 185, 50), 1, 0.001, "max HR = 100% VO2max");
  // Real case: 20 min at ~148 bpm, rest 44, LTHR 163 should be an ordinary run, not race-like (Table 4: 10k race 120-260)
  const t20 = Array.from({ length: 1216 }, (_, i) => i);
  const easy = epocFromStream(t20, t20.map((i) => 135 + Math.min(25, i / 50)), { rest: 44, max: 180, lthr: 163, vo2max: 43 });
  assert.ok(easy > 30 && easy < 120, `20-min run EPOC ${easy}`);
  // Noise must not inflate EPOC: same mean HR with +-12 bpm jitter stays close to the smooth trace
  const noisy = epocFromStream(t20, t20.map((i) => 135 + Math.min(25, i / 50) + (i % 2 ? 12 : -12)), { rest: 44, max: 180, lthr: 163, vo2max: 43 });
  assert.ok(Math.abs(noisy - easy) / easy < 0.08, `noisy ${noisy} vs smooth ${easy}`);
});

test("Training Effect from peak EPOC and activity class (Firstbeat Fig. 2)", () => {
  assert.equal(activityClass(1.5), 6);
  assert.equal(activityClass(6), 7.5);
  const te = trainingEffectFromEpoc(110, 6);
  assert.ok(te >= 3 && te < 4.2, `TE ${te}`);
  assert.ok(trainingEffectFromEpoc(110, 9) < te, "fitter athlete gets lower TE for same EPOC");
  assert.equal(trainingEffectFromEpoc(1000, 6), 5);
});

test("Recovery time accumulates, counts down, caps at 96 h; modifiers move it", () => {
  assert.equal(hoursForTe(3), 14);
  near(hoursForTe(3.7), 23.8, 0.1, "20-min run at ~78% VO2max (TE 3.7)");
  const t0 = Date.parse("2026-11-06T18:00:00Z");
  assert.equal(Math.round(baseRemaining([{ t: t0, te: 3 }], t0)), 14);
  assert.equal(baseRemaining([{ t: t0, te: 3 }], t0 + 30 * 3600e3), 0);
  assert.equal(baseRemaining([{ t: t0, te: 5 }, { t: t0 + 3600e3, te: 5 }, { t: t0 + 7200e3, te: 5 }], t0 + 7200e3), 96);
  assert.ok(sleepModifier(360, 450)[0].hours > 0, "short sleep adds hours");
  assert.ok(sleepModifier(540, 450)[0].hours < 0, "long sleep removes hours");
  assert.equal(rhrModifier(52, 47).hours, 10);
  assert.equal(rhrModifier(48, 47), null);
  assert.equal(feelModifier(1).hours, 12);
  assert.equal(feelModifier(5).hours, -6);
});
