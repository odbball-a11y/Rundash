// Data access with a small in-memory cache shared across screens.
import { useEffect, useState } from "react";

const cache = new Map();
const listeners = new Map();

async function load(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

export function fetchCached(url, { force = false } = {}) {
  if (!force && cache.has(url)) return cache.get(url);
  const p = load(url).catch((e) => { cache.delete(url); throw e; });
  cache.set(url, p);
  p.then((d) => (listeners.get(url) || []).forEach((fn) => fn(d))).catch(() => {});
  return p;
}

// Drop cached responses whose URL starts with `prefix`; mounted screens using them refetch.
export function invalidate(prefix) {
  for (const url of [...cache.keys()]) {
    if (!url.startsWith(prefix)) continue;
    cache.delete(url);
    if ((listeners.get(url) || []).length) fetchCached(url).catch(() => {});
  }
}

export function useApi(url) {
  const [state, setState] = useState({ data: null, error: null, loading: !!url });
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const set = (data) => alive && setState({ data, error: null, loading: false });
    const ls = listeners.get(url) || []; ls.push(set); listeners.set(url, ls);
    fetchCached(url).then(set).catch((error) => alive && setState({ data: null, error, loading: false }));
    return () => { alive = false; listeners.set(url, (listeners.get(url) || []).filter((f) => f !== set)); };
  }, [url]);
  return state;
}

// Refresh: pull from intervals.icu, then reload metrics + data everywhere.
// Never throws: returns { ok, changed, error } so the button can say what happened.
export async function refreshAll() {
  let sync;
  try {
    const r = await fetch("/api/sync", { cache: "no-store" });
    sync = await r.json().catch(() => ({ error: `Sync returned HTTP ${r.status}` }));
    if (!r.ok && !sync.error) sync.error = `Sync returned HTTP ${r.status}`;
  } catch (e) {
    sync = { error: `Couldn't reach the server (${e.message})` };
  }
  const results = await Promise.allSettled([
    fetchCached("/api/data", { force: true }),
    fetchCached("/api/metrics", { force: true }),
  ]);
  const failed = results.find((x) => x.status === "rejected");
  const error = sync?.error || (failed ? `Metrics are still being recalculated - try again in a minute (${failed.reason?.message || "error"})` : null);
  return { ok: !error, changed: !!sync?.changed, error };
}

// Merged view used by most screens.
export function useAll() {
  const data = useApi("/api/data");
  const metrics = useApi("/api/metrics");
  return {
    loading: data.loading || metrics.loading,
    error: data.error || metrics.error,
    data: data.data,
    m: metrics.data,
  };
}
