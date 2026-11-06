// One-off admin actions (all need ?key=ADMIN_KEY):
//   /api/strava-admin?key=...&action=subscribe   register the instant-update webhook with Strava
//   /api/strava-admin?key=...&action=status      show connection + webhook status
//   /api/strava-admin?key=...&action=backfill    import past activities (run repeatedly until done)
import { config as stravaConfig, json, loadActivities, requireAdmin, saveActivities, slim, store, stravaGet } from "../lib/strava.mjs";

const PUSH_URL = "https://www.strava.com/api/v3/push_subscriptions";

export default async (req) => {
  if (!requireAdmin(req)) return json({ error: "Forbidden: add ?key=YOUR_ADMIN_KEY" }, 403);
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "status";
  const { clientId, clientSecret, verifyToken } = stravaConfig();

  if (action === "status") {
    const tokens = await store().get("tokens", { type: "json" });
    const subs = await fetch(`${PUSH_URL}?client_id=${clientId}&client_secret=${clientSecret}`).then((r) => r.json()).catch((e) => String(e));
    const meta = await store().get("meta", { type: "json" });
    const backfill = await store().get("backfill", { type: "json" });
    return json({ connected: Boolean(tokens), athlete_id: tokens?.athlete_id, webhook: subs, data: meta, backfill });
  }

  if (action === "subscribe") {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      callback_url: `${url.origin}/api/strava-webhook`,
      verify_token: verifyToken,
    });
    const resp = await fetch(PUSH_URL, { method: "POST", body });
    return json({ status: resp.status, result: await resp.json().catch(() => null) }, resp.ok ? 200 : 502);
  }

  if (action === "backfill") {
    // Pages of 200 activities; a few pages per call to stay within time + rate limits.
    const state = (await store().get("backfill", { type: "json" })) || { page: 1, done: false };
    if (url.searchParams.get("restart") === "1") Object.assign(state, { page: 1, done: false });
    if (state.done) return json({ message: "Backfill already complete. Add &restart=1 to redo.", ...state });

    let list = await loadActivities();
    let fetched = 0;
    for (let i = 0; i < 3 && !state.done; i++) {
      const page = await stravaGet(`/athlete/activities?per_page=200&page=${state.page}`);
      if (!page || page.length === 0) { state.done = true; break; }
      list = list.concat(page.map(slim));
      fetched += page.length;
      state.page += 1;
    }
    const saved = await saveActivities(list);
    await store().setJSON("backfill", state);
    return json({ fetched, total: saved.length, ...state, next: state.done ? "Done!" : "Reload this page to import more." });
  }

  return json({ error: `Unknown action ${action}` }, 400);
};

export const config = { path: "/api/strava-admin" };
