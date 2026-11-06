// Public read endpoint the dashboard polls: /api/activities
import { json, loadActivities, requireAdmin, store } from "../lib/strava.mjs";

// Route maps start/end at home, so they are left out unless ?key=ADMIN_KEY.
export default async (req) => {
  const [all, meta] = await Promise.all([loadActivities(), store().get("meta", { type: "json" })]);
  const activities = requireAdmin(req) ? all : all.map(({ polyline, ...rest }) => rest);
  return json({ last_updated: meta?.last_updated || null, count: activities.length, activities });
};

export const config = { path: "/api/activities" };
