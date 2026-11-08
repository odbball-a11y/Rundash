// Workout library (stored in Kemp Fit).
// GET    /api/workouts            -> list
// POST   /api/workouts            -> create/update (body = workout)   [key]
// DELETE /api/workouts?id=...     -> delete                           [key]
import { getStore } from "@netlify/blobs";
import { json } from "../lib/intervals.mjs";
import { checkWrite } from "../lib/auth.mjs";
import { validateWorkout } from "../../src/metrics/workouts.mjs";

const user = () => getStore({ name: "user", consistency: "strong" });

async function handler(req) {
  const s = user();
  const list = (await s.get("workouts", { type: "json" })) || [];
  if (req.method === "GET") return json(list);
  const auth = checkWrite(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (req.method === "POST") {
    const w = await req.json().catch(() => null);
    const errs = validateWorkout(w);
    if (errs.length) return json({ error: errs.join("; ") }, 400);
    const clean = { id: w.id || crypto.randomUUID(), name: String(w.name).slice(0, 80), description: String(w.description || "").slice(0, 2000), sport: "Run", steps: w.steps, updatedAt: new Date().toISOString() };
    const next = [clean, ...list.filter((x) => x.id !== clean.id)];
    await s.setJSON("workouts", next);
    return json(clean);
  }
  if (req.method === "DELETE") {
    const id = new URL(req.url).searchParams.get("id");
    await s.setJSON("workouts", list.filter((x) => x.id !== id));
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
}

export default async (req) => {
  try { return await handler(req); }
  catch (e) { return json({ error: e.message }, 502); }
};

export const config = { path: "/api/workouts" };
