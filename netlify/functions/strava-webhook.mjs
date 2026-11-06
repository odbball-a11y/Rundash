// Strava calls this the moment a new activity is uploaded (Garmin -> Strava -> here).
// GET  = Strava's one-time subscription check. POST = activity events.
import { config as stravaConfig, json, removeActivity, store, stravaGet, upsertActivity } from "../lib/strava.mjs";

async function handleEvent(event) {
  if (event.object_type !== "activity") return;
  const tokens = await store().get("tokens", { type: "json" });
  if (tokens?.athlete_id && String(event.owner_id) !== String(tokens.athlete_id)) return;

  if (event.aspect_type === "delete") {
    await removeActivity(event.object_id);
    return;
  }
  const activity = await stravaGet(`/activities/${event.object_id}`);
  if (activity) await upsertActivity(activity);
}

export default async (req, context) => {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const { verifyToken } = stravaConfig();
    if (url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === verifyToken) {
      return json({ "hub.challenge": url.searchParams.get("hub.challenge") });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method === "POST") {
    const event = await req.json().catch(() => null);
    if (!event) return new Response("Bad request", { status: 400 });
    // Strava wants a reply within 2 seconds; finish the work after replying.
    const work = handleEvent(event).catch((e) => console.error("webhook event failed:", e));
    if (context?.waitUntil) context.waitUntil(work);
    else await work;
    return new Response("ok");
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config = { path: "/api/strava-webhook" };
