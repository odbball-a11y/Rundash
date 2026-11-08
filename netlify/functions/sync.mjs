// GET /api/sync -> pull from intervals.icu now (the Refresh button).
// Limited to once a minute so it can't be used to hammer the API.
import { json, store, sync } from "../lib/intervals.mjs";
import { syncDetails } from "../lib/details.mjs";

export default async (req) => {
  const full = new URL(req.url).searchParams.get("full") === "1";
  const meta = await store().get("meta", { type: "json" });
  const hasData = meta?.counts?.activities > 0;
  const cooldown = full ? 15_000 : 60_000;
  if (hasData && meta?.last_checked && Date.now() - Date.parse(meta.last_checked) < cooldown) {
    return json({ skipped: "checked less than a minute ago", ...meta });
  }
  try {
    const result = await sync({ full });
    // Fetch new runs' heart-rate/pace streams now rather than waiting for the scheduled job,
    // so it is analysed properly on this refresh. Small budget to stay inside the request limit.
    // (Also retries a recent run whose streams weren't ready yet.) Marks the data updated so
    // /api/metrics recomputes with the new detail.
    try {
      result.details = await syncDetails({ budgetMs: 4000, max: 2 });
      if (result.details.fetched) {
        const m = (await store().get("meta", { type: "json" })) || {};
        await store().setJSON("meta", { ...m, last_updated: new Date().toISOString() });
        result.changed = true;
      }
    } catch (e) { result.detailsError = e.message; }
    return json(result);
  } catch (e) {
    return json({ error: e.message }, 502);
  }
};

export const config = { path: "/api/sync" };
