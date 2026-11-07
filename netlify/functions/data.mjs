// GET /api/data -> runs + health data for the dashboard.
import { dashboardData, json } from "../lib/intervals.mjs";

export default async () => json(await dashboardData());

export const config = { path: "/api/data" };
