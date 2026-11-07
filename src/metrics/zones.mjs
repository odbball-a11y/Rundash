// Heart-rate and pace zones.
//
// Default COROS threshold zones, derived from COROS's own Training Hub example
// (LTHR 161 -> <129, 129-145, 146-153, 154-164, 165-171, >171;
//  threshold pace 5:38/mi -> >7:40, 6:26-7:40, 5:59-6:25, 5:32-5:58, 5:06-5:31, <5:06).
// Boundary convention reproduced from that example: b_k = round(base * p_k);
// zone 1 is "< b1", zone 2 is "b1..b2", zones 3-5 are "b(k-1)+1..b(k)", zone 6 is "> b5".
import { round } from "./util.mjs";

export const ZONE_NAMES = ["Recovery", "Aerobic Endurance", "Aerobic Power", "Threshold", "Anaerobic Endurance", "Anaerobic Power"];

export const LTHR_PCT = [0.80, 0.90, 0.95, 1.02, 1.06];           // of LTHR (bpm)
export const PACE_PCT = [1.36, 1.14, 1.06, 0.98, 0.905];          // of threshold pace (seconds per distance; bigger = slower)
export const MAXHR_PCT = [0.50, 0.60, 0.70, 0.80, 0.90];          // older 5-zone default (% max HR)

function bands(bounds) {
  // bounds ascending, 5 values -> 6 zones [lo, hi] inclusive integers (null = open)
  const z = [[null, bounds[0] - 1], [bounds[0], bounds[1]]];
  for (let k = 2; k < 5; k++) z.push([bounds[k - 1] + 1, bounds[k]]);
  z.push([bounds[4] + 1, null]);
  return z;
}

export function lthrZones(lthr, pct = LTHR_PCT) {
  if (!lthr) return null;
  const b = pct.map((p) => Math.round(lthr * p));
  return bands(b).map(([lo, hi], i) => ({ zone: i + 1, name: ZONE_NAMES[i], lo, hi }));
}

// HR reserve (Karvonen) zones: rest + p * (max - rest)
export function hrrZones(rest, max, pct = [0.59, 0.74, 0.84, 0.88, 0.95]) {
  if (!rest || !max) return null;
  const b = pct.map((p) => Math.round(rest + p * (max - rest)));
  return bands(b).map(([lo, hi], i) => ({ zone: i + 1, name: ZONE_NAMES[i], lo, hi }));
}

export function maxHrZones(max, pct = [0.65, 0.78, 0.85, 0.89, 0.94]) {
  if (!max) return null;
  const b = pct.map((p) => Math.round(max * p));
  return bands(b).map(([lo, hi], i) => ({ zone: i + 1, name: ZONE_NAMES[i], lo, hi }));
}

// Pace zones in seconds per km (or per mile if unit = 1609.344). tpSecPerUnit = threshold pace.
// Returned with fast/slow ends; zone 1 (Recovery) is slowest.
export function paceZones(tpSecPerUnit, pct = PACE_PCT) {
  if (!tpSecPerUnit) return null;
  const b = pct.map((p) => Math.round(tpSecPerUnit * p)).reverse(); // ascending seconds: fastest boundary first
  // ascending seconds => zone order from fastest (Anaerobic Power) to slowest (Recovery)
  const z = bands(b); // index 0 = fastest
  return z.map(([lo, hi], i) => ({ zone: 6 - i, name: ZONE_NAMES[5 - i], fastSec: lo, slowSec: hi })).reverse();
}

// Which zone (1-6) a value falls in. For HR zones: bpm. For pace zones: sec/unit.
export function zoneOfHr(zones, bpm) {
  if (!zones || !bpm) return null;
  for (const z of zones) if ((z.lo == null || bpm >= z.lo) && (z.hi == null || bpm <= z.hi + 0.999)) return z.zone;
  return bpm < zones[0].hi ? 1 : 6;
}
export function zoneOfPace(zones, secPerUnit) {
  if (!zones || !secPerUnit) return null;
  for (const z of zones) if ((z.fastSec == null || secPerUnit >= z.fastSec) && (z.slowSec == null || secPerUnit <= z.slowSec + 0.999)) return z.zone;
  return secPerUnit > (zones[0].fastSec ?? 0) ? 1 : 6;
}

export const paceSecPerKm = (mps) => (mps > 0 ? 1000 / mps : null);
export const tpFromMps = (mps, unit = 1000) => (mps > 0 ? round(unit / mps, 1) : null);
