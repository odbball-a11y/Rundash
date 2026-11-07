// Recovery % and timer (est.). COROS: based on Base Fitness, Training Load and remaining
// energy since last exercise; not sleep/HRV; rises fast when low, slows near 100%;
// timer capped at 96 h. Bands (exact): 0-19 Exhausted, 20-69 Fatigued, 70-89 Normal,
// 90-100 Fresh. Timer advice bands (exact): 0-29 rest, 30-89 easy, 90-100 hard.
//
// Model: fatigue deficit D (0-100) decays exponentially (time constant TAU_H scaled by
// fitness); each activity raises it: D = 100 - (100 - D) * exp(-TL / (C * BF)).
import { clamp } from "./util.mjs";

export const TAU_H = 12;      // hours at Base Fitness 60
export const C = 1.8;
export const MAX_TIMER_H = 96;

const tau = (bf) => TAU_H * clamp(Math.sqrt(60 / Math.max(bf || 0, 10)), 0.6, 1.8);

// events: [{ t: ms epoch (end of activity), load, bf }]. Returns state at `now`.
export function recoveryAt(events, now) {
  let D = 0, last = null, bfLast = 60;
  for (const e of [...events].sort((a, b) => a.t - b.t)) {
    if (e.t > now) break;
    if (last != null) D *= Math.exp(-(e.t - last) / 3600000 / tau(bfLast));
    D = 100 - (100 - D) * Math.exp(-(e.load || 0) / (C * Math.max(e.bf || 0, 10)));
    last = e.t; bfLast = e.bf || bfLast;
  }
  if (last != null) D *= Math.exp(-(now - last) / 3600000 / tau(bfLast));
  const pct = Math.round(100 - D);
  // hours until >= 99%
  const hoursToFull = D <= 1 ? 0 : Math.min(MAX_TIMER_H, Math.ceil(tau(bfLast) * Math.log(D / 1)));
  return { pct, hoursToFull, state: recoveryState(pct), advice: recoveryAdvice(pct) };
}

export const recoveryState = (p) => (p < 20 ? "Exhausted" : p < 70 ? "Fatigued" : p < 90 ? "Normal" : "Fresh");
export const recoveryAdvice = (p) => (p < 30 ? "Please rest" : p < 90 ? "Ready for easy training" : "Ready for hard training");
