// Runs automatically every 15 minutes on Netlify (compute costs credits; Refresh pulls on demand):
// 1) summaries + wellness, 2) streams/laps for activities still missing them,
// 3) metric engine (per-activity analysis + daily series + snapshot).
import { sync } from "../lib/intervals.mjs";
import { syncDetails } from "../lib/details.mjs";
import { updateActivityMetrics, computeAndStore } from "../lib/metricsJob.mjs";

export default async () => {
  try {
    const result = await sync();
    console.log("intervals sync:", JSON.stringify(result));
  } catch (e) {
    console.error("intervals sync failed:", e.message);
  }
  try {
    const d = await syncDetails();
    console.log("detail sync:", JSON.stringify(d));
  } catch (e) {
    console.error("detail sync failed:", e.message);
  }
  try {
    const m = await updateActivityMetrics({ budgetMs: 6000 });
    const r = await computeAndStore();
    console.log("metrics:", JSON.stringify({ analysed: m.analysed, pending: m.pending, status: r.current.status }));
  } catch (e) {
    console.error("metrics failed:", e.message);
  }
};

export const config = { schedule: "*/15 * * * *" };
