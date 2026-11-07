// Runs the metric engine over stored data and caches the results.
import { store } from "./intervals.mjs";
import { analyzeActivity, computeAll, resolveSettings, estimateThresholdPace, ALGORITHM_VERSION } from "../../src/metrics/index.mjs";
import { dayKey } from "../../src/metrics/util.mjs";

const settingsKey = (s) => JSON.stringify([s.rest, s.max, s.lthr, s.tpSecPerKm]);

// Per-activity analysis (streams -> load, zones, best efforts, focus), cached by
// algorithm version + thresholds so it is only redone when something changes.
export async function updateActivityMetrics({ budgetMs = 15000 } = {}) {
  const s = store();
  const started = Date.now();
  const [activities, rawActs, rawWell, overrides, cache, index, estimates] = await Promise.all([
    s.get("activities", { type: "json" }), s.get("raw_activities", { type: "json" }),
    s.get("raw_wellness", { type: "json" }), s.get("settings_overrides", { type: "json" }),
    s.get("activity_metrics", { type: "json" }), s.get("detail_index", { type: "json" }),
    s.get("estimates", { type: "json" }),
  ]);
  const settings = resolveSettings(rawActs || [], rawWell || [], overrides || {}, estimates || {});
  const sk = settingsKey(settings);
  const out = cache || {};
  let analysed = 0, pending = 0;
  for (const a of activities || []) {
    const c = out[a.id];
    const hasDetail = index && index[a.id] && index[a.id].status === "ok";
    const fresh = c && c.v === ALGORITHM_VERSION && c.sk === sk && (c.source === "stream" || !hasDetail);
    if (fresh) continue;
    if (Date.now() - started > budgetMs) { pending++; continue; }
    const detail = hasDetail ? await s.get(`detail/${a.id}`, { type: "json" }) : null;
    out[a.id] = { ...analyzeActivity(a, detail, settings), v: ALGORITHM_VERSION, sk };
    analysed++;
  }
  await s.setJSON("activity_metrics", out);

  // Threshold-pace estimate from the cached pace-HR bins (used when intervals.icu has none).
  // Changing it changes the settings key, so activities are re-analysed with pace zones next run.
  const vo2Rows = (rawWell || []).filter((w) => w.vo2max > 0).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const tp = estimateThresholdPace({ activities, actMetrics: out, lthr: settings.lthr, vo2max: vo2Rows.length ? vo2Rows[vo2Rows.length - 1].vo2max : null });
  const prevTp = estimates && estimates.tp && estimates.tp.tpSecPerKm;
  // Only store a changed estimate when it moved by >= 2 s/km, to avoid re-analysing everything every run.
  if (tp && (!prevTp || Math.abs(tp.tpSecPerKm - prevTp) >= 2)) await s.setJSON("estimates", { ...(estimates || {}), tp, at: new Date().toISOString() });
  return { analysed, pending, settings, tp };
}

// Full computation + cache + append-only daily snapshot (past days never rewritten).
export async function computeAndStore() {
  const s = store();
  const [activities, rawActs, rawWell, overrides, actMetrics, snapshots, estimates] = await Promise.all([
    s.get("activities", { type: "json" }), s.get("raw_activities", { type: "json" }),
    s.get("raw_wellness", { type: "json" }), s.get("settings_overrides", { type: "json" }),
    s.get("activity_metrics", { type: "json" }), s.get("snapshots", { type: "json" }),
    s.get("estimates", { type: "json" }),
  ]);
  const settings = resolveSettings(rawActs || [], rawWell || [], overrides || {}, estimates || {});
  const result = computeAll({ activities: activities || [], actMetrics: actMetrics || {}, wellness: rawWell || [], settings });
  const sources = Object.values(actMetrics || {}).reduce((m, x) => ((m[x.source] = (m[x.source] || 0) + 1), m), {});
  result.coverage = { activities: (activities || []).length, analysed: Object.keys(actMetrics || {}).length, loadSource: sources };
  await s.setJSON("metrics_latest", result);

  const snaps = snapshots || {};
  const today = dayKey(new Date());
  snaps[today] = { ...result.current, algorithmVersion: result.algorithmVersion, at: result.generatedAt };
  await s.setJSON("snapshots", snaps);
  return result;
}
