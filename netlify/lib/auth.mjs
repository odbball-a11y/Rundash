// Write access: the site is public, so anything that changes your plan needs ADMIN_KEY
// (a Netlify environment variable). The app sends it in the x-kf-key header.
const env = (k) => (typeof Netlify !== "undefined" ? Netlify.env.get(k) : process.env[k]);

export function checkWrite(req) {
  const admin = (env("ADMIN_KEY") || "").trim();
  if (!admin) return { ok: false, status: 503, error: `Editing is not set up: ADMIN_KEY is not available to ${env("CONTEXT") || "this deploy"}. Add it in Netlify (same value for all deploy contexts), then redeploy.` };
  const k = req.headers.get("x-kf-key") || new URL(req.url).searchParams.get("key");
  if (k !== admin) return { ok: false, status: 401, error: "Wrong or missing key." };
  return { ok: true };
}
