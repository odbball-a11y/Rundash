// GET /api/activity?id=i123 -> summary + streams + laps/intervals for one activity.
import { json, store } from "../lib/intervals.mjs";
import { getDetail } from "../lib/details.mjs";

export default async (req) => {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return json({ error: "id required" }, 400);
  const activities = (await store().get("activities", { type: "json" })) || [];
  const summary = activities.find((a) => String(a.id) === id);
  if (!summary) return json({ error: "not found" }, 404);
  const detail = await getDetail(id);
  // GPS starts/ends at home: only include it with the private ADMIN_KEY until
  // the app has proper login (needed later for maps).
  const admin = (typeof Netlify !== "undefined" ? Netlify.env.get("ADMIN_KEY") : process.env.ADMIN_KEY) || "";
  const allowGps = admin && new URL(req.url).searchParams.get("key") === admin;
  if (detail && !allowGps) detail.streams = (detail.streams || []).filter((x) => x.type !== "latlng");
  return json({ summary, detail: detail || null, pending: !detail, gps_included: Boolean(allowGps) });
};

export const config = { path: "/api/activity" };
