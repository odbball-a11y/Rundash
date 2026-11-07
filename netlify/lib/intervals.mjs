// intervals.icu -> Netlify Blobs. Garmin syncs into intervals.icu; we pull from there.
import { getStore } from "@netlify/blobs";

const API = "https://intervals.icu/api/v1";
const env = (k) => (typeof Netlify !== "undefined" ? Netlify.env.get(k) : process.env[k]);

export const store = () => getStore({ name: "intervals", consistency: "strong" });

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

const day = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => day(new Date(Date.now() - n * 86400000));

async function get(path, params) {
  const athlete = (env("INTERVALS_ATHLETE_ID") || "").trim();
  const key = (env("INTERVALS_API_KEY") || "").trim();
  if (!athlete || !key) throw new Error("Set INTERVALS_ATHLETE_ID and INTERVALS_API_KEY in Netlify environment variables.");
  const url = new URL(`${API}/athlete/${encodeURIComponent(athlete)}${path}`);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  const resp = await fetch(url, {
    headers: { authorization: "Basic " + btoa(`API_KEY:${key}`), accept: "application/json" },
  });
  if (!resp.ok) throw new Error(`intervals.icu ${path} -> ${resp.status} ${(await resp.text()).slice(0, 200)}`);
  return resp.json();
}

// Shape activities for the dashboard (distance in km, durations in seconds).
export function slimActivity(a) {
  const km = (a.distance || a.icu_distance || 0) / 1000;
  const moving = a.moving_time || a.elapsed_time || 0;
  return {
    id: a.id,
    date: a.start_date_local || a.start_date,
    sport: a.type,
    title: a.name,
    distance: Math.round(km * 1000) / 1000,
    duration: moving,
    pace: km > 0 ? Math.round(moving / km) : null,
    heartRateAvg: a.average_heartrate ? Math.round(a.average_heartrate) : null,
    heartRateMax: a.max_heartrate ? Math.round(a.max_heartrate) : null,
    elevation: a.total_elevation_gain ?? null,
    trimp: a.icu_training_load ?? a.trimp ?? null,
    vo2max: a.icu_vo2max ?? a.vo2max ?? null,
    decoupling: a.decoupling ?? null,
    source: "intervals.icu",
  };
}

function mergeById(oldList, newList, idKey = "id") {
  const map = new Map();
  for (const x of [...(oldList || []), ...(newList || [])]) map.set(String(x[idKey]), x);
  return [...map.values()];
}

const newestFirst = (key) => (a, b) => String(b[key]).localeCompare(String(a[key]));

// Pull recent data (or full history on first run) and save it.
export async function sync({ full = false } = {}) {
  const s = store();
  const [oldActs, oldWell] = await Promise.all([
    s.get("activities", { type: "json" }),
    s.get("wellness", { type: "json" }),
  ]);
  // Full history until we actually have some, so a sync that ran before
  // Garmin finished importing doesn't leave history permanently missing.
  // Also re-read the whole history once an hour, because Garmin back-fills
  // older days into intervals.icu long after they happened.
  const prevMeta = (await s.get("meta", { type: "json" })) || {};
  const fullDue = !prevMeta.last_full || Date.now() - Date.parse(prevMeta.last_full) > 60 * 60 * 1000;
  const firstRun = full || fullDue || !oldActs?.length || !oldWell?.length;
  const oldest = firstRun ? "2000-01-01" : daysAgo(14);
  const newest = day(new Date(Date.now() + 86400000));

  const [acts, well] = await Promise.all([
    get("/activities", { oldest, newest }),
    get("/wellness", { oldest, newest }),
  ]);

  // Activities: replace the recent window entirely so deletions show up.
  let activities = (acts || []).map(slimActivity);
  if (!firstRun) {
    const keep = (oldActs || []).filter((a) => String(a.date).slice(0, 10) < oldest);
    activities = mergeById(keep, activities);
  }
  activities.sort(newestFirst("date"));

  const wellness = (firstRun ? well || [] : mergeById(oldWell, well)).sort(newestFirst("id"));

  const changed = JSON.stringify([oldActs, oldWell]) !== JSON.stringify([activities, wellness]);
  const now = new Date().toISOString();
  const meta = prevMeta;
  meta.last_checked = now;
  if (firstRun) meta.last_full = now;
  if (changed || !meta.last_updated) meta.last_updated = now;
  meta.counts = { activities: activities.length, wellness: wellness.length };

  if (changed) {
    await s.setJSON("activities", activities);
    await s.setJSON("wellness", wellness);
  }
  await s.setJSON("meta", meta);
  return { changed, firstRun, ...meta };
}

// Everything the dashboard needs, in the shapes it already renders.
export async function dashboardData() {
  const s = store();
  const [activities, wellness, meta] = await Promise.all([
    s.get("activities", { type: "json" }),
    s.get("wellness", { type: "json" }),
    s.get("meta", { type: "json" }),
  ]);
  const w = wellness || [];
  const pick = (field, f = (v) => v) =>
    w.filter((d) => d[field] != null).map((d) => ({ date: d.id, value: f(d[field]) }));
  const latest = w.find((d) => d.ctl != null) || null;
  const vo2 = w.find((d) => d.vo2max != null);
  return {
    last_updated: meta?.last_updated || null,
    last_checked: meta?.last_checked || null,
    activities: activities || [],
    hrv: pick("hrv"),
    restHR: pick("restingHR"),
    sleep: pick("sleepSecs", (v) => Math.round(v / 60)), // minutes
    vo2max: vo2 ? vo2.vo2max : null,
    fitness: latest
      ? { date: latest.id, ctl: latest.ctl, atl: latest.atl, tsb: latest.ctl - latest.atl }
      : null,
  };
}
