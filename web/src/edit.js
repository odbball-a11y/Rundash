// Editing access: the private ADMIN_KEY is kept only in this browser.
import { invalidate } from "./api.js";
const KEY = "kf_admin_key";
export const getKey = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };
export const setKey = (k) => { try { k ? localStorage.setItem(KEY, k) : localStorage.removeItem(KEY); } catch {} };

export async function write(method, url, body) {
  let key = getKey();
  if (!key) {
    key = window.prompt("Enter your Kemp Fit editing key (the ADMIN_KEY you set in Netlify). It is saved only in this browser.") || "";
    if (!key) throw new Error("Editing key needed");
    setKey(key.trim());
  }
  const r = await fetch(url, { method, headers: { "content-type": "application/json", "x-kf-key": getKey() }, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) setKey("");
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  // Anything that changed the plan or library refreshes those screens everywhere.
  invalidate(url.split("?")[0]);
  return d;
}
