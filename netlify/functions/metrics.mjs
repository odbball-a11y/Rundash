// GET /api/metrics            -> latest cached COROS-style metrics (fast)
// GET /api/metrics?fresh=1    -> recompute now (also analyses a batch of activities)
// GET /api/metrics?snapshots=1 -> append-only daily history of headline metrics
import { json, store } from "../lib/intervals.mjs";
import { computeAndStore, updateActivityMetrics } from "../lib/metricsJob.mjs";

export default async (req) => {
  const q = new URL(req.url).searchParams;
  if (q.get("snapshots") === "1") return json((await store().get("snapshots", { type: "json" })) || {});
  let m = q.get("fresh") === "1" ? null : await store().get("metrics_latest", { type: "json" });
  if (!m) {
    await updateActivityMetrics({ budgetMs: 8000 });
    m = await computeAndStore();
  }
  // Keep the public response light: drop per-day rows older than a year unless asked.
  if (q.get("full") !== "1" && m.series) m.series = m.series.slice(-400);
  return json(m);
};

export const config = { path: "/api/metrics" };
