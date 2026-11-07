// Run with: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { lthrZones, paceZones, zoneOfHr, zoneOfPace } from "../src/metrics/zones.mjs";
import { loadFromStream } from "../src/metrics/load.mjs";
import { intensityTrendPct, statusFromTrend, ewma } from "../src/metrics/status.mjs";
import { recoveryAt, recoveryState } from "../src/metrics/recovery.mjs";
import { efficiencyLevel } from "../src/metrics/efficiency.mjs";
import { raceTime, effortAccuracy, teLabel, trainingFocus } from "../src/metrics/fitness.mjs";
import { bestTimeForDistance, bestSpeedForDuration, analyzeActivity } from "../src/metrics/activity.mjs";
import { computeAll, resolveSettings } from "../src/metrics/index.mjs";

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

test("Intensity Trend matches both COROS screenshots", () => {
  assert.equal(intensityTrendPct(140, 123), 113);
  assert.equal(intensityTrendPct(26, 72), 36);
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

test("Recovery drops after load, recovers over time, timer capped at 96 h", () => {
  const t0 = Date.parse("2026-11-01T10:00:00Z");
  const r0 = recoveryAt([{ t: t0, load: 200, bf: 60 }], t0);
  assert.ok(r0.pct < 70, `after hard run ${r0.pct}`);
  const r1 = recoveryAt([{ t: t0, load: 200, bf: 60 }], t0 + 24 * 3600e3);
  assert.ok(r1.pct > r0.pct);
  const r2 = recoveryAt([{ t: t0, load: 2000, bf: 60 }], t0);
  assert.ok(r2.hoursToFull <= 96);
  assert.equal(recoveryState(10), "Exhausted");
  assert.equal(recoveryState(95), "Fresh");
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
  assert.equal(out.algorithmVersion, "1.0.0");
  assert.ok(out.current.baseFitness > 0);
  assert.ok(out.current.status);
  assert.equal(out.current.vo2Source, "Garmin");
  assert.ok(out.current.racePredictor["5k"].seconds > 0);
  assert.ok(out.current.runningFitness.score >= 40 && out.current.runningFitness.score <= 100);
  assert.ok(out.personalRecords["5k"].seconds > 0);
  assert.equal(out.activities.length, 30);
  assert.ok(out.activities[0].focus);
});
