// Shared helpers for the Strava integration (single user: you).
import { getStore } from "@netlify/blobs";

const STRAVA = "https://www.strava.com";
const env = (k) => (typeof Netlify !== "undefined" ? Netlify.env.get(k) : process.env[k]);

export const store = () => getStore({ name: "strava", consistency: "strong" });

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...extra },
  });
}

export function requireAdmin(req) {
  const key = new URL(req.url).searchParams.get("key");
  const admin = env("ADMIN_KEY");
  return Boolean(admin && key && key === admin);
}

export function config() {
  return {
    clientId: env("STRAVA_CLIENT_ID"),
    clientSecret: env("STRAVA_CLIENT_SECRET"),
    verifyToken: env("STRAVA_VERIFY_TOKEN"),
  };
}

// --- OAuth tokens --------------------------------------------------------
export async function exchangeCode(code) {
  const { clientId, clientSecret } = config();
  const resp = await fetch(`${STRAVA}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, grant_type: "authorization_code" }),
  });
  if (!resp.ok) throw new Error(`Strava token exchange failed: ${resp.status} ${await resp.text()}`);
  const t = await resp.json();
  const tokens = { access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at, athlete_id: t.athlete?.id };
  await store().setJSON("tokens", tokens);
  return tokens;
}

export async function accessToken() {
  const s = store();
  const tokens = await s.get("tokens", { type: "json" });
  if (!tokens) throw new Error("Strava not connected yet - visit /api/strava-auth?key=ADMIN_KEY");
  if (tokens.expires_at - 120 > Date.now() / 1000) return tokens.access_token;

  const { clientId, clientSecret } = config();
  const resp = await fetch(`${STRAVA}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, refresh_token: tokens.refresh_token, grant_type: "refresh_token" }),
  });
  if (!resp.ok) throw new Error(`Strava token refresh failed: ${resp.status}`);
  const t = await resp.json();
  const updated = { ...tokens, access_token: t.access_token, refresh_token: t.refresh_token, expires_at: t.expires_at };
  await s.setJSON("tokens", updated);
  return updated.access_token;
}

export async function stravaGet(path) {
  const token = await accessToken();
  const resp = await fetch(`${STRAVA}/api/v3${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`Strava GET ${path} failed: ${resp.status}`);
  return resp.json();
}

// --- Activity storage ----------------------------------------------------
// Slim each activity down to what the dashboard needs.
export function slim(a) {
  const distKm = (a.distance || 0) / 1000;
  const moving = a.moving_time || a.elapsed_time || 0;
  return {
    id: a.id,
    date: a.start_date_local || a.start_date,
    sport: a.sport_type || a.type,
    title: a.name,
    distance: Math.round(distKm * 1000) / 1000,
    duration: moving,
    elapsed: a.elapsed_time,
    pace: distKm > 0 ? Math.round(moving / distKm) : null, // seconds per km
    heartRateAvg: a.average_heartrate ? Math.round(a.average_heartrate) : null,
    heartRateMax: a.max_heartrate ? Math.round(a.max_heartrate) : null,
    elevation: a.total_elevation_gain,
    cadence: a.average_cadence ? Math.round(a.average_cadence * 2) : null,
    sufferScore: a.suffer_score ?? null,
    polyline: a.map?.summary_polyline || null,
    source: "strava",
  };
}

export async function loadActivities() {
  return (await store().get("activities", { type: "json" })) || [];
}

export async function saveActivities(list) {
  const byId = new Map();
  for (const a of list) byId.set(String(a.id), a);
  const sorted = [...byId.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const s = store();
  await s.setJSON("activities", sorted);
  await s.setJSON("meta", { last_updated: new Date().toISOString(), count: sorted.length });
  return sorted;
}

export async function upsertActivity(activity) {
  const list = await loadActivities();
  const others = list.filter((a) => String(a.id) !== String(activity.id));
  return saveActivities([slim(activity), ...others]);
}

export async function removeActivity(id) {
  const list = await loadActivities();
  return saveActivities(list.filter((a) => String(a.id) !== String(id)));
}
