// Step 1: /api/strava-auth?key=ADMIN_KEY  -> redirects to Strava to approve access.
// Step 2: Strava redirects back to /api/strava-auth?code=... -> tokens saved.
import { config as stravaConfig, exchangeCode, requireAdmin, store } from "../lib/strava.mjs";

export default async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (code) {
    const expected = await store().get("oauth_state");
    if (!expected || state !== expected) return new Response("Invalid or expired login link. Start again.", { status: 400 });
    await store().delete("oauth_state");
    await exchangeCode(code);
    return Response.redirect(`${url.origin}/?strava=connected`, 302);
  }

  if (!requireAdmin(req)) return new Response("Forbidden: add ?key=YOUR_ADMIN_KEY", { status: 403 });

  const nonce = crypto.randomUUID();
  await store().set("oauth_state", nonce);
  const auth = new URL("https://www.strava.com/oauth/authorize");
  auth.searchParams.set("client_id", stravaConfig().clientId);
  auth.searchParams.set("redirect_uri", `${url.origin}/api/strava-auth`);
  auth.searchParams.set("response_type", "code");
  auth.searchParams.set("approval_prompt", "auto");
  auth.searchParams.set("scope", "read,activity:read_all");
  auth.searchParams.set("state", nonce);
  return Response.redirect(auth.toString(), 302);
};

export const config = { path: "/api/strava-auth" };
