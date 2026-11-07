// GET /api/sync -> pull from intervals.icu now (the Refresh button).
// Limited to once a minute so it can't be used to hammer the API.
import { json, store, sync } from "../lib/intervals.mjs";

export default async (req) => {
  const full = new URL(req.url).searchParams.get("full") === "1";
  const meta = await store().get("meta", { type: "json" });
  const hasData = meta?.counts?.activities > 0;
  const cooldown = full ? 15_000 : 60_000;
  if (hasData && meta?.last_checked && Date.now() - Date.parse(meta.last_checked) < cooldown) {
    return json({ skipped: "checked less than a minute ago", ...meta });
  }
  try {
    return json(await sync({ full }));
  } catch (e) {
    return json({ error: e.message }, 502);
  }
};

export const config = { path: "/api/sync" };
