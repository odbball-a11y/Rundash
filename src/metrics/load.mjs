// Training Load (est.). COROS documents: TRIMP method, volume x intensity, HR-based
// for road runs slower than threshold pace. Exact constants are unpublished.
//
// Our model: per-second Banister-form TRIMP
//   load += k * (dt/60) * HRr * exp(b * HRr),  HRr = (HR - rest) / (max - rest)
// with b and k calibrated to COROS's worked examples (Training Load article):
//   50-60 min mostly zones 1-2  -> 99
//   50-60 min mostly zones 3-4  -> 199
//   >2 h mostly zone 2          -> 295
// Calibration athlete (assumption, see tests): rest 50, max 190, LTHR 168;
// zone 1-2 run ~ 85% LTHR (143 bpm), zone 3-4 run ~ 97% LTHR (163 bpm), 55 min each.
import { clamp } from "./util.mjs";

export const LOAD_B = 3.52;
export const LOAD_K = 0.262;

export function hrReserveFrac(hr, rest, max) {
  if (!hr || !rest || !max || max <= rest) return 0;
  return clamp((hr - rest) / (max - rest), 0, 1);
}

export function loadPerMinute(hr, rest, max, b = LOAD_B, k = LOAD_K) {
  const r = hrReserveFrac(hr, rest, max);
  return k * r * Math.exp(b * r);
}

// From second-by-second streams. time: seconds, hr: bpm.
// Gaps > 30 s (pauses) are not counted. Returns total and the part above LTHR.
export function loadFromStream(time, hr, rest, max, lthr) {
  let total = 0, aboveLt = 0;
  for (let i = 1; i < time.length; i++) {
    const dt = time[i] - time[i - 1];
    if (!(dt > 0) || dt > 30 || !hr[i]) continue;
    const l = loadPerMinute((hr[i] + (hr[i - 1] || hr[i])) / 2, rest, max) * (dt / 60);
    total += l;
    if (lthr && hr[i] > lthr) aboveLt += l;
  }
  return { load: total, aboveLt };
}

// Fallback when no stream: average HR over moving time (underestimates intervals).
export function loadFromAverage(avgHr, movingSec, rest, max) {
  if (!avgHr || !movingSec) return null;
  return loadPerMinute(avgHr, rest, max) * (movingSec / 60);
}

// Personalised Low / Medium / High classification (COROS shows these per activity).
// est.: relative to the athlete's own 90-day distribution of run loads.
export function loadLevel(load, recentLoads) {
  const s = recentLoads.filter((x) => x > 0).sort((a, b) => a - b);
  if (s.length < 5 || !load) return null;
  const p33 = s[Math.floor(s.length / 3)], p66 = s[Math.floor((2 * s.length) / 3)];
  return load < p33 ? "Low" : load < p66 ? "Medium" : "High";
}
