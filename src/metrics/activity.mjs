// Per-activity analysis from second-by-second streams.
import { loadFromStream, loadFromAverage } from "./load.mjs";
import { lthrZones, paceZones, zoneOfHr, zoneOfPace } from "./zones.mjs";
import { trainingFocus } from "./fitness.mjs";

export const BEST_DISTANCES = { "1k": 1000, "1mi": 1609.344, "3k": 3000, "5k": 5000, "10k": 10000, half: 21097.5, marathon: 42195 };

export function streamsByType(streams) {
  const m = {};
  for (const s of streams || []) m[s.type] = s.data;
  return m;
}

// Fastest elapsed time to cover `meters` anywhere in the activity (pauses included, as COROS PRs).
export function bestTimeForDistance(time, dist, meters) {
  if (!time || !dist || dist[dist.length - 1] < meters) return null;
  let best = Infinity, i = 0;
  for (let j = 0; j < dist.length; j++) {
    while (i + 1 < j && dist[j] - dist[i + 1] >= meters) i++;
    if (dist[j] - dist[i] >= meters) best = Math.min(best, time[j] - time[i]);
  }
  return isFinite(best) ? Math.round(best) : null;
}

// Highest average speed (m/s) sustained for at least `seconds`.
export function bestSpeedForDuration(time, dist, seconds) {
  if (!time || !dist || time[time.length - 1] - time[0] < seconds) return null;
  let best = 0, i = 0;
  for (let j = 0; j < time.length; j++) {
    while (i + 1 < j && time[j] - time[i + 1] >= seconds) i++;
    const dt = time[j] - time[i];
    if (dt >= seconds && dt <= seconds * 1.5) best = Math.max(best, (dist[j] - dist[i]) / dt);
  }
  return best || null;
}

// settings: { rest, max, lthr, tpSecPerKm }
export function analyzeActivity(summary, detail, settings) {
  const out = { id: summary.id, date: summary.date, sport: summary.sport, source: "summary" };
  const { rest, max, lthr, tpSecPerKm } = settings;
  const s = streamsByType(detail && detail.streams);
  const hrZ = lthrZones(lthr), pZ = paceZones(tpSecPerKm);

  if (s.time && s.heartrate && s.heartrate.some((x) => x > 0)) {
    const { load, aboveLt } = loadFromStream(s.time, s.heartrate, rest, max, lthr);
    out.load = Math.round(load); out.aboveLt = Math.round(aboveLt); out.source = "stream";
    const hrTimes = [0, 0, 0, 0, 0, 0], paceTimes = [0, 0, 0, 0, 0, 0], loadByPace = [0, 0, 0, 0, 0, 0];
    for (let i = 1; i < s.time.length; i++) {
      const dt = s.time[i] - s.time[i - 1];
      if (!(dt > 0) || dt > 30) continue;
      const hz = zoneOfHr(hrZ, s.heartrate[i]);
      if (hz) hrTimes[hz - 1] += dt;
      const v = s.velocity_smooth && s.velocity_smooth[i];
      const pz = v > 0.5 ? zoneOfPace(pZ, 1000 / v) : null;
      if (pz) {
        paceTimes[pz - 1] += dt;
        const r = rest && max ? Math.max(0, Math.min(1, (s.heartrate[i] - rest) / (max - rest))) : 0;
        loadByPace[pz - 1] += r * Math.exp(3.52 * r) * dt;
      }
    }
    out.hrZoneSeconds = hrTimes; out.paceZoneSeconds = paceTimes;
    out.hrSpeedBins = hrSpeedBins(s);
    out.focus = trainingFocus(loadByPace);
  } else {
    const l = loadFromAverage(summary.heartRateAvg, summary.duration, rest, max);
    out.load = l == null ? null : Math.round(l); out.aboveLt = 0; out.source = l == null ? "none" : "average";
  }

  if (s.time && s.distance) {
    out.bestEfforts = Object.fromEntries(Object.entries(BEST_DISTANCES).map(([k, m]) => [k, bestTimeForDistance(s.time, s.distance, m)]));
    out.best30sMps = bestSpeedForDuration(s.time, s.distance, 30);
    out.best60sMps = bestSpeedForDuration(s.time, s.distance, 60);
  }
  return out;
}

// Heart-rate vs (grade-adjusted) speed, binned by 2 bpm, for threshold-pace detection.
// Skips the first 5 minutes (HR lag), pauses and walking. Grade adjustment (est.):
// ~3.3% more effort per 1% uphill, clamped to +-10% grade.
export function hrSpeedBins(s) {
  const bins = {};
  if (!s.time || !s.heartrate || !s.velocity_smooth) return bins;
  const t0 = s.time[0];
  for (let i = 1; i < s.time.length; i++) {
    const dt = s.time[i] - s.time[i - 1];
    if (!(dt > 0) || dt > 5 || s.time[i] - t0 < 300) continue;
    const hr = s.heartrate[i], v = s.velocity_smooth[i];
    if (!(hr > 80) || !(v > 1.8)) continue;
    const g = s.grade_smooth ? Math.max(-10, Math.min(10, s.grade_smooth[i] || 0)) : 0;
    const vAdj = v * (1 + 0.033 * g);
    const b = Math.floor(hr / 2) * 2;
    const e = (bins[b] ||= [0, 0]);
    e[0] += dt; e[1] += vAdj * dt;
  }
  for (const k in bins) bins[k] = [Math.round(bins[k][0]), Math.round(bins[k][1])];
  return bins; // { hrBin: [seconds, speed*seconds] }
}
