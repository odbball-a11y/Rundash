// GET /api/sync -> pull from intervals.icu now (the Refresh button).
// Limited to once a minute so it can't be used to hammer the API.
import { json, store, sync } from "../lib/intervals.mjs";

export default async () => {
  const meta = await store().get("meta", { type: "json" });
  if (meta?.last_checked && Date.now() - Date.parse(meta.last_checked) < 60_000 && meta.counts) {
    return json({ skipped: "checked less than a minute ago", ...meta });
  }
  try {
    return json(await sync());
  } catch (e) {
    return json({ error: e.message }, 502);
  }
};

export const config = { path: "/api/sync" };
