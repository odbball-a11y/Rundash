// GET /api/metrics            -> latest cached COROS-style metrics (fast)
// GET /api/metrics?fresh=1    -> recompute now (also analyses a batch of activities)
// GET /api/metrics?snapshots=1 -> append-only daily history of headline metrics
import { json, store } from "../lib/intervals.mjs";
import { computeAndStore, updateActivityMetrics, K } from "../lib/metricsJob.mjs";

// Scheduled functions only run on the production deploy, so branch/preview deploys
// recompute on request when their cached result is older than this.
const MAX_AGE_MS = 15 * 60 * 1000;

export default async (req) => {
  const q = new URL(req.url).searchParams;
  if (q.get("snapshots") === "1") return json((await store().get(K.snapshots, { type: "json" })) || {});
  let m = q.get("fresh") === "1" ? null : await store().get(K.latest, { type: "json" });
  // Also stale when a sync has brought in new data since these metrics were computed.
  const meta = m ? await store().get("meta", { type: "json" }) : null;
  const stale = m && (Date.now() - Date.parse(m.generatedAt) > MAX_AGE_MS
    || (meta?.last_updated && Date.parse(meta.last_updated) > Date.parse(m.generatedAt)));
  if (!m || stale) {
    // Keep well inside the ~10 s request limit: analyse what fits, then compute; if that
    // fails, fall back to the previous cached result rather than erroring.
    try {
      await updateActivityMetrics({ budgetMs: 5000 });
      m = await computeAndStore();
    } catch (e) {
      if (!m) throw e;
      m.warning = `Showing cached metrics: ${e.message}`;
    }
  }
  // Keep the public response light: drop per-day rows older than a year unless asked.
  if (q.get("full") !== "1" && m.series) m.series = m.series.slice(-400);
  return json(m);
};

export const config = { path: "/api/metrics" };
