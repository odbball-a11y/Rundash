// Phase 0: per-activity detail (second-by-second streams + laps/intervals),
// fetched in the background and stored one blob per activity.
import { apiGet, store } from "./intervals.mjs";

// Stream types we ask for. intervals.icu returns only those the activity has.
export const STREAM_TYPES = [
  "time", "distance", "heartrate", "velocity_smooth", "cadence", "altitude",
  "latlng", "grade_smooth", "watts", "temp", "fixed_altitude", "respiration",
];

const key = (id) => `detail/${id}`;

export async function getDetail(id) {
  return store().get(key(id), { type: "json" });
}

// Fetch streams + intervals for one activity. Errors are recorded, not thrown,
// so one bad activity never blocks the rest.
export async function fetchDetail(id) {
  const detail = { id, fetched_at: new Date().toISOString(), streams: null, intervals: null, errors: {} };
  try {
    const streams = await apiGet(`/activity/${encodeURIComponent(id)}/streams.json`, { types: STREAM_TYPES.join(",") });
    detail.streams = Array.isArray(streams) ? streams : streams?.streams || [];
  } catch (e) {
    detail.errors.streams = e.message;
  }
  try {
    detail.intervals = await apiGet(`/activity/${encodeURIComponent(id)}/intervals`);
  } catch (e) {
    detail.errors.intervals = e.message;
  }
  return detail;
}

// Fill in details for activities that don't have them yet, newest first,
// within a time budget (scheduled functions have ~30 s).
export async function syncDetails({ budgetMs = 18000, max = 8 } = {}) {
  const s = store();
  const started = Date.now();
  const activities = (await s.get("activities", { type: "json" })) || [];
  const index = (await s.get("detail_index", { type: "json" })) || {};
  const todo = activities.filter((a) => {
    const e = index[a.id];
    if (!e) return true;
    // Retry failures at most once a day.
    return e.status !== "ok" && Date.now() - Date.parse(e.at) > 86400000;
  });
  let done = 0;
  for (const a of todo) {
    if (done >= max || Date.now() - started > budgetMs) break;
    const detail = await fetchDetail(a.id);
    const ok = !detail.errors.streams && !detail.errors.intervals;
    await s.setJSON(key(a.id), detail);
    index[a.id] = {
      status: ok ? "ok" : "partial",
      at: detail.fetched_at,
      streams: (detail.streams || []).map((x) => x.type),
      points: (detail.streams || []).find((x) => x.type === "time")?.data?.length || 0,
      intervals: Array.isArray(detail.intervals?.icu_intervals) ? detail.intervals.icu_intervals.length : null,
      errors: Object.keys(detail.errors).length ? detail.errors : undefined,
    };
    done++;
  }
  await s.setJSON("detail_index", index);
  return { fetched: done, remaining: Math.max(0, todo.length - done), total: activities.length };
}
