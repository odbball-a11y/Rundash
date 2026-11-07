// Runs automatically every 5 minutes on Netlify.
import { sync } from "../lib/intervals.mjs";

export default async () => {
  try {
    const result = await sync();
    console.log("intervals sync:", JSON.stringify(result));
  } catch (e) {
    console.error("intervals sync failed:", e.message);
  }
};

export const config = { schedule: "*/5 * * * *" };
