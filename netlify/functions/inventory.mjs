// GET /api/inventory -> which data fields actually arrive for this athlete.
// Field NAMES and counts only - never values - so it is safe to share.
import { json, store } from "../lib/intervals.mjs";

function fieldStats(rows) {
  const counts = {};
  for (const r of rows || []) {
    for (const [k, v] of Object.entries(r || {})) {
      if (v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length)) continue;
      counts[k] = (counts[k] || 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1]));
}

export default async () => {
  const s = store();
  const [rawActs, rawWell, index, meta] = await Promise.all([
    s.get("raw_activities", { type: "json" }),
    s.get("raw_wellness", { type: "json" }),
    s.get("detail_index", { type: "json" }),
    s.get("meta", { type: "json" }),
  ]);
  const entries = Object.values(index || {});
  const streamCounts = {};
  let intervalFields = {};
  for (const e of entries) for (const t of e.streams || []) streamCounts[t] = (streamCounts[t] || 0) + 1;

  // Interval/lap field names from up to 5 stored details.
  const ids = Object.keys(index || {}).filter((id) => index[id].intervals).slice(0, 5);
  const samples = await Promise.all(ids.map((id) => s.get(`detail/${id}`, { type: "json" })));
  intervalFields = fieldStats(samples.flatMap((d) => d?.intervals?.icu_intervals || []));

  const types = {};
  for (const a of rawActs || []) types[a.type || "?"] = (types[a.type || "?"] || 0) + 1;

  return json({
    generated_at: new Date().toISOString(),
    sync: meta || null,
    activities: { count: (rawActs || []).length, by_type: types, fields: fieldStats(rawActs) },
    wellness: { days: (rawWell || []).length, fields: fieldStats(rawWell) },
    details: {
      fetched: entries.length,
      ok: entries.filter((e) => e.status === "ok").length,
      partial: entries.filter((e) => e.status !== "ok").length,
      stream_types: streamCounts,
      interval_fields: intervalFields,
      example_errors: [...new Set(entries.flatMap((e) => Object.values(e.errors || {})))].slice(0, 5),
    },
  });
};

export const config = { path: "/api/inventory" };
