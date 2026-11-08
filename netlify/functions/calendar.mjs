// Calendar: planned workouts / races / notes live in your intervals.icu calendar
// (which syncs planned workouts to Garmin); weekly training phases live in Kemp Fit.
// GET    /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD -> { events, phases }
// POST   /api/calendar  { action: "workout", date, workout }     [key]  -> intervals.icu WORKOUT event
// POST   /api/calendar  { action: "event", date, name, category } [key]  -> RACE_A/B/C or NOTE
// POST   /api/calendar  { action: "phase", week, phase }          [key]
// DELETE /api/calendar?eventId=...                              [key]
import { getStore } from "@netlify/blobs";
import { json, apiGet, apiSend, athleteId, store } from "../lib/intervals.mjs";
import { checkWrite } from "../lib/auth.mjs";
import { toIntervalsText, estimateWorkout, validateWorkout } from "../../src/metrics/workouts.mjs";
import { K } from "../lib/metricsJob.mjs";

const user = () => getStore({ name: "user", consistency: "strong" });
const PHASES = ["Preparation", "Base", "Progress", "Peak", "Race", "Transition"];
const CATS = ["RACE_A", "RACE_B", "RACE_C", "NOTE"];
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "");

async function handler(req) {
  const url = new URL(req.url);
  if (req.method === "GET") {
    const from = url.searchParams.get("from"), to = url.searchParams.get("to");
    if (!isDay(from) || !isDay(to)) return json({ error: "from/to required (YYYY-MM-DD)" }, 400);
    let events = [], error = null;
    try {
      const rows = await apiGet(`/athlete/${encodeURIComponent(athleteId())}/events`, { oldest: from, newest: to });
      events = (rows || []).filter((e) => e.category === "WORKOUT" || CATS.includes(e.category)).map((e) => ({
        id: e.id, date: String(e.start_date_local).slice(0, 10), category: e.category, name: e.name, type: e.type,
        description: e.description || "", load: e.icu_training_load ?? null, seconds: e.moving_time ?? null,
        km: e.distance ? Math.round(e.distance / 10) / 100 : null, kf: e.external_id && String(e.external_id).startsWith("kf:") ? e.external_id : null,
      }));
    } catch (e) { error = e.message; }
    const [phases, est] = await Promise.all([user().get("phases", { type: "json" }), user().get("planned_est", { type: "json" })]);
    for (const e of events) if (est && est[e.id]) e.estimate = est[e.id];
    return json({ events, phases: phases || {}, error });
  }

  const auth = checkWrite(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  if (req.method === "DELETE") {
    const id = url.searchParams.get("eventId");
    if (!id) return json({ error: "eventId required" }, 400);
    await apiSend("DELETE", `/athlete/${encodeURIComponent(athleteId())}/events/${encodeURIComponent(id)}`);
    return json({ ok: true });
  }

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const b = await req.json().catch(() => ({}));
  if (b.action === "phase") {
    if (!isDay(b.week) || (b.phase && !PHASES.includes(b.phase))) return json({ error: "bad phase" }, 400);
    const p = (await user().get("phases", { type: "json" })) || {};
    if (b.phase) p[b.week] = b.phase; else delete p[b.week];
    await user().setJSON("phases", p);
    return json(p);
  }
  if (!isDay(b.date)) return json({ error: "date required" }, 400);
  if (b.action === "event") {
    if (!CATS.includes(b.category) || !String(b.name || "").trim()) return json({ error: "name and category required" }, 400);
    const ev = await apiSend("POST", `/athlete/${encodeURIComponent(athleteId())}/events`, {
      category: b.category, start_date_local: `${b.date}T00:00:00`, name: String(b.name).slice(0, 80), description: String(b.description || "").slice(0, 1000),
    });
    return json(ev);
  }
  if (b.action === "workout") {
    const errs = validateWorkout(b.workout);
    if (errs.length) return json({ error: errs.join("; ") }, 400);
    const m = await store().get(K.latest, { type: "json" });
    const zones = m?.zones, settings = m?.settings;
    if (!zones?.pace || !settings?.lthr) return json({ error: "Zones not ready yet - open the app once so metrics are calculated." }, 409);
    const text = toIntervalsText(b.workout, zones, settings);
    const est = estimateWorkout(b.workout, zones, settings);
    const desc = [b.workout.description, text].filter(Boolean).join("\n\n");
    const ev = await apiSend("POST", `/athlete/${encodeURIComponent(athleteId())}/events`, {
      category: "WORKOUT", type: "Run", start_date_local: `${b.date}T00:00:00`, name: String(b.workout.name).slice(0, 80),
      description: desc, moving_time: est.seconds, external_id: `kf:${b.workout.id || "adhoc"}:${Date.now()}`,
    });
    if (ev && ev.id != null) {
      const all = (await user().get("planned_est", { type: "json" })) || {};
      all[ev.id] = { seconds: est.seconds, km: est.km, load: est.load, blocks: est.blocks, workoutId: b.workout.id || null };
      await user().setJSON("planned_est", all);
    }
    return json({ event: ev, text, estimate: est });
  }
  return json({ error: "unknown action" }, 400);
}

export default async (req) => {
  try { return await handler(req); }
  catch (e) { return json({ error: e.message }, 502); }
};

export const config = { path: "/api/calendar" };
