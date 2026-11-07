// Recovery % and timer (est.). COROS: based on Base Fitness, Training Load and remaining
// energy since the last exercise; not sleep/HRV; rises quickly when low and slows near 100%;
// timer capped at 96 h. Bands (exact): 0-19 Exhausted, 20-69 Fatigued, 70-89 Normal,
// 90-100 Fresh. Timer advice bands (exact): 0-29 rest, 30-89 easy, 90-100 hard.
//
// Model (v1.2.1): each activity adds recovery hours proportional to its load relative to
// fitness, h = HOURS_PER_RATIO * TL / BF (capped at 96 h in total). Remaining hours R count
// down in real time. Recovery % = 100 - 100 * (R / 96)^P with P > 1, so the percentage climbs
// fastest when you are tired and slows as you approach 100%.
//   e.g. BF 37: 20-min run TL 62  -> ~17 h, ~86% straight after
//               55-min hard TL 200 -> ~54 h, ~48%
//               long run TL 300    -> ~81 h, ~18%
import { clamp } from "./util.mjs";

export const HOURS_PER_RATIO = 10;
export const MAX_TIMER_H = 96;
export const P = 1.15;

export const recoveryHours = (load, bf) => clamp((HOURS_PER_RATIO * (load || 0)) / Math.max(bf || 0, 15), 0, MAX_TIMER_H);
export const pctFromRemaining = (R) => Math.round(100 - 100 * Math.pow(clamp(R, 0, MAX_TIMER_H) / MAX_TIMER_H, P));

// events: [{ t: ms epoch (end of activity), load, bf }]. Returns state at `now`.
export function recoveryAt(events, now) {
  let R = 0, last = null;
  for (const e of [...events].sort((a, b) => a.t - b.t)) {
    if (e.t > now) break;
    if (last != null) R = Math.max(0, R - (e.t - last) / 3600000);
    R = Math.min(MAX_TIMER_H, R + recoveryHours(e.load, e.bf));
    last = e.t;
  }
  if (last != null) R = Math.max(0, R - (now - last) / 3600000);
  const pct = pctFromRemaining(R);
  return { pct, hoursToFull: Math.ceil(R), state: recoveryState(pct), advice: recoveryAdvice(pct) };
}

export const recoveryState = (p) => (p < 20 ? "Exhausted" : p < 70 ? "Fatigued" : p < 90 ? "Normal" : "Fresh");
export const recoveryAdvice = (p) => (p < 30 ? "Please rest" : p < 90 ? "Ready for easy training" : "Ready for hard training");
