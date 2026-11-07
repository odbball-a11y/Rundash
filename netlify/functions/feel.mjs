// Post-run "how do you feel?" (1-5), used by the Recovery Time estimate.
// GET /api/feel -> { activityId: 1..5 }    POST { activityId, feel } [key]
import { getStore } from "@netlify/blobs";
import { json } from "../lib/intervals.mjs";
import { checkWrite } from "../lib/auth.mjs";
import { K } from "../lib/metricsJob.mjs";
import { store } from "../lib/intervals.mjs";

const user = () => getStore({ name: "user", consistency: "strong" });

export default async (req) => {
  const map = (await user().get("feel", { type: "json" })) || {};
  if (req.method === "GET") return json(map);
  const auth = checkWrite(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const b = await req.json().catch(() => ({}));
  if (!b.activityId || !(b.feel === null || [1, 2, 3, 4, 5].includes(b.feel))) return json({ error: "activityId and feel 1-5 required" }, 400);
  if (b.feel === null) delete map[b.activityId]; else map[b.activityId] = b.feel;
  await user().setJSON("feel", map);
  // Make the next /api/metrics request recompute so the rating shows straight away.
  await store().delete(K.latest);
  return json(map);
};

export const config = { path: "/api/feel" };
