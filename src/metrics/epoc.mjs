// EPOC, Training Effect and the personalised Recovery Time estimate.
//
// EPOC (est.): Firstbeat publishes the form of its model, EPOC(t) = f(EPOC(t-1), %VO2max(t), dt),
// and accumulation curves (white paper "Indirect EPOC Prediction Method Based on Heart Rate
// Measurement", Fig. 5), not the equations. We fit those curves with
//   EPOC rises toward EPOC_inf(%VO2max) at UP_RATE per minute, and falls toward it at DOWN_RATE.
// With UP_RATE = 0.022/min the Fig. 5 points collapse onto one E_inf per intensity:
//   70%: 50@15, 85@30, 135@60 -> 178, 176, 184     60%: 25, 40, 62 -> 89, 83, 85
//   50%: 10, 18, 25 -> 36, 37, 34                  80%: 85, 155 -> 302, 321
import { clamp, round } from "./util.mjs";

export const UP_RATE = 0.022;   // per minute
export const DOWN_RATE = 0.08;  // per minute (Fig. 4B: EPOC left falls to ~10% within ~40 min)
// [%VO2max, EPOC_inf ml/kg]
export const EPOC_INF = [[0.3, 2], [0.4, 7], [0.5, 36], [0.6, 85], [0.7, 180], [0.8, 310], [0.9, 534], [1.0, 850], [1.1, 1200]];

export function epocInf(f) {
  if (f <= EPOC_INF[0][0]) return 0;
  for (let i = 1; i < EPOC_INF.length; i++) {
    const [x1, y1] = EPOC_INF[i - 1], [x2, y2] = EPOC_INF[i];
    if (f <= x2) return y1 + ((f - x1) / (x2 - x1)) * (y2 - y1);
  }
  return EPOC_INF[EPOC_INF.length - 1][1];
}

// %VO2max from heart rate via %HRR ~ %VO2R (Swain): VO2 = %HRR * (VO2max - 3.5) + 3.5.
export function pctVo2max(hr, rest, max, vo2max = 45) {
  if (!hr || !rest || !max || max <= rest) return 0;
  const hrr = clamp((hr - rest) / (max - rest), 0, 1.05);
  return (hrr * (vo2max - 3.5) + 3.5) / vo2max;
}

// Per-second EPOC trace -> peak (ml/kg). time in s, hr in bpm. Gaps > 30 s are treated as rest.
export function epocFromStream(time, hr, { rest, max, vo2max }) {
  let e = 0, peak = 0;
  for (let i = 1; i < time.length; i++) {
    const dt = (time[i] - time[i - 1]) / 60;
    if (!(dt > 0)) continue;
    const target = dt > 0.5 ? 0 : epocInf(pctVo2max(hr[i], rest, max, vo2max));
    const k = target > e ? UP_RATE : DOWN_RATE;
    e = target + (e - target) * Math.exp(-k * dt);
    if (e > peak) peak = e;
  }
  return round(peak, 1);
}

// Constant-intensity helper (tests / planned workouts).
export const epocConstant = (f, minutes) => epocInf(f) * (1 - Math.exp(-UP_RATE * minutes));

// Activity class 0-10 from average weekly hours of hard exercise (Firstbeat TE white paper, Table 2).
export function activityClass(weeklyHours) {
  const h = weeklyHours || 0;
  if (h < 10 / 60) return 2; if (h < 0.5) return 4; if (h < 1) return 5; if (h < 3) return 6; if (h < 5) return 7;
  if (h < 7) return 7.5; if (h < 9) return 8; if (h < 11) return 8.5; if (h < 13) return 9; if (h < 15) return 9.5;
  return 10;
}

// TE thresholds (peak EPOC, ml/kg) for TE 1..5 at activity class c, read from Fig. 2 of the
// TE white paper (linear in c): c=0: 1, 5, 10, 18, 25   c=10: 12, 40, 95, 190, 300.
export const teThresholds = (c) => [1 + 1.1 * c, 5 + 3.5 * c, 10 + 8.5 * c, 18 + 17.2 * c, 25 + 27.5 * c];

export function trainingEffectFromEpoc(peak, c) {
  if (peak == null) return null;
  const t = teThresholds(c);
  if (peak < t[0]) return round(peak / t[0], 1);
  for (let k = 0; k < 4; k++) if (peak < t[k + 1]) return round(k + 1 + (peak - t[k]) / (t[k + 1] - t[k]), 1);
  return 5.0;
}

// ---------------- Recovery Time (est.) ----------------
// No recovery-time formula is published by Firstbeat, Garmin or COROS. Ours:
//  1) each session adds base hours from its aerobic TE (interpolated):
//       TE 1 -> 2 h, 2 -> 6 h, 3 -> 14 h, 4 -> 28 h, 5 -> 54 h
//     (v1.3.0 used 6/14/26/44/72 h; a 20-min run at ~78% VO2max = TE 3.7 came out at 41 h, which the
//      athlete reported as too long. Version 2 will fit these hours to the athlete's own responses.)
//  2) hours accumulate across sessions and count down in real time, capped at 96 h;
//  3) modifiers adjust the remaining time using today's signals vs the athlete's own baseline.
const TE_HOURS = [[0, 0], [1, 2], [2, 6], [3, 14], [4, 28], [5, 54]];
export function hoursForTe(te) {
  if (te == null) return 0;
  for (let i = 1; i < TE_HOURS.length; i++) if (te <= TE_HOURS[i][0]) {
    const [x1, y1] = TE_HOURS[i - 1], [x2, y2] = TE_HOURS[i];
    return y1 + ((te - x1) / (x2 - x1)) * (y2 - y1);
  }
  return 54;
}

// sessions: [{ t: end time ms, te }]
export function baseRemaining(sessions, now, cap = 96) {
  let R = 0, last = null;
  for (const s of [...sessions].sort((a, b) => a.t - b.t)) {
    if (s.t > now) break;
    if (last != null) R = Math.max(0, R - (s.t - last) / 3600000);
    R = Math.min(cap, R + hoursForTe(s.te));
    last = s.t;
  }
  if (last != null) R = Math.max(0, R - (now - last) / 3600000);
  return R;
}

// Modifiers. Each returns { key, label, hours, detail } or null. Sizes are est. and stated in the UI.
export function sleepModifier(lastSleepMin, baselineMin, score, baselineScore) {
  const out = [];
  if (lastSleepMin && baselineMin) {
    const diffH = (lastSleepMin - baselineMin) / 60;
    if (diffH <= -0.5) out.push({ key: "sleep", label: "Shorter sleep than usual", hours: round(Math.min(8, -diffH * 3), 1), detail: `${round(-diffH, 1)} h below your normal` });
    else if (diffH >= 0.75) out.push({ key: "sleep", label: "Longer sleep than usual", hours: -round(Math.min(4, diffH * 1.5), 1), detail: `${round(diffH, 1)} h above your normal` });
  }
  if (score != null && baselineScore != null) {
    const d = score - baselineScore;
    if (d <= -10) out.push({ key: "sleepScore", label: "Poor sleep score", hours: 3, detail: `${score} vs your usual ${Math.round(baselineScore)}` });
    else if (d >= 10) out.push({ key: "sleepScore", label: "Good sleep score", hours: -2, detail: `${score} vs your usual ${Math.round(baselineScore)}` });
  }
  return out;
}

export function rhrModifier(today, baseline) {
  if (!today || !baseline) return null;
  const d = today - baseline;
  if (d >= 2) return { key: "rhr", label: "Resting heart rate above normal", hours: round(Math.min(12, (d - 1) * 2.5), 1), detail: `${round(d, 1)} bpm above your 30-day normal` };
  if (d <= -3) return { key: "rhr", label: "Resting heart rate below normal", hours: -2, detail: `${round(-d, 1)} bpm below your 30-day normal` };
  return null;
}

export const FEEL_LABELS = { 1: "Very tired", 2: "Tired", 3: "Normal", 4: "Good", 5: "Great" };
const FEEL_HOURS = { 1: 12, 2: 6, 3: 0, 4: -3, 5: -6 };
export function feelModifier(feel) {
  if (!feel || !FEEL_HOURS[feel]) return null;
  return { key: "feel", label: `You felt "${FEEL_LABELS[feel]}" after your last run`, hours: FEEL_HOURS[feel], detail: "your rating" };
}

export function readiness(hours) {
  if (hours <= 0) return { state: "Recovered", advice: "Ready for another hard session" };
  if (hours <= 24) return { state: "Recovering", advice: "Easy or moderate training is fine" };
  if (hours <= 48) return { state: "Fatigued", advice: "Keep it easy today" };
  return { state: "Very fatigued", advice: "Rest or very easy recovery only" };
}
