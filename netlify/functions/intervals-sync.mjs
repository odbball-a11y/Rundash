// Runs automatically every 5 minutes on Netlify:
// 1) summaries + wellness, 2) streams/laps for activities still missing them.
import { sync } from "../lib/intervals.mjs";
import { syncDetails } from "../lib/details.mjs";

export default async () => {
  try {
    const result = await sync();
    console.log("intervals sync:", JSON.stringify(result));
  } catch (e) {
    console.error("intervals sync failed:", e.message);
  }
  try {
    const d = await syncDetails();
    console.log("detail sync:", JSON.stringify(d));
  } catch (e) {
    console.error("detail sync failed:", e.message);
  }
};

export const config = { schedule: "*/5 * * * *" };
