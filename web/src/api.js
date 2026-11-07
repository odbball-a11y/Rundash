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
export async function refreshAll() {
  const r = await fetch("/api/sync", { cache: "no-store" }).then((x) => x.json()).catch(() => ({}));
  await Promise.all([fetchCached("/api/data", { force: true }), fetchCached("/api/metrics", { force: true })]);
  return r;
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
