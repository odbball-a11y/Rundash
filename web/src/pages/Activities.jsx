import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAll } from "../api.js";
import { PageHeader, Loading, ErrorState, Icon, Card } from "../components/UI.jsx";
import { fmtDur, fmtPace, fmtKm, fmtDate } from "../format.js";
import { useRefresh } from "./Progress.jsx";

const RANGE = [["all", "All time"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["365", "Last 12 months"]];

export function useFilteredActivities(data) {
  const [type, setType] = useState("all");
  const [range, setRange] = useState("all");
  const [q, setQ] = useState("");
  const acts = data?.activities || [];
  const types = useMemo(() => [...new Set(acts.map((a) => a.sport).filter(Boolean))], [acts]);
  const list = useMemo(() => {
    const cut = range === "all" ? 0 : Date.now() - Number(range) * 86400000;
    const needle = q.trim().toLowerCase();
    return acts.filter((a) => (type === "all" || a.sport === type) && Date.parse(a.date) >= cut && (!needle || String(a.title || "").toLowerCase().includes(needle)));
  }, [acts, type, range, q]);
  const controls = (
    <div className="filters">
      <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Activity type">
        <option value="all">All activities</option>
        {types.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <select value={range} onChange={(e) => setRange(e.target.value)} aria-label="Date range">
        {RANGE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <input type="search" placeholder="Search titles" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search activities" />
    </div>
  );
  return { list, controls };
}

export function Stats({ list, m }) {
  const loads = Object.fromEntries((m?.activities || []).map((a) => [a.id, a.load]));
  const km = list.reduce((s, a) => s + (a.distance || 0), 0);
  const sec = list.reduce((s, a) => s + (a.duration || 0), 0);
  const load = list.reduce((s, a) => s + (loads[a.id] || 0), 0);
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div className="trio num" style={{ marginTop: 0, gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div><div className="v">{list.length}</div><div className="lbl">Activities</div></div>
        <div><div className="v">{fmtKm(km, 0)}</div><div className="lbl">km</div></div>
        <div><div className="v">{fmtDur(sec)}</div><div className="lbl">Time</div></div>
        <div><div className="v">{load}</div><div className="lbl">Training Load</div></div>
      </div>
    </div>
  );
}

export default function Activities() {
  const { data, m, loading, error } = useAll();
  const { list, controls } = useFilteredActivities(data);
  const { button, toast } = useRefresh();
  const loads = Object.fromEntries((m?.activities || []).map((a) => [a.id, a]));
  const groups = [];
  for (const a of list) {
    const k = new Date(a.date).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    if (!groups.length || groups[groups.length - 1][0] !== k) groups.push([k, []]);
    groups[groups.length - 1][1].push(a);
  }
  return (
    <>
      <PageHeader title="Activities" right={button} />
      {loading && !data ? <Loading /> : error && !data ? <ErrorState error={error} /> : <>
        {controls}
        <Stats list={list} m={m} />
        {!list.length && <Card><div className="empty">No activities match.</div></Card>}
        {groups.map(([month, items]) => (
          <div key={month}>
            <div className="month">{month}</div>
            <div className="list">
              {items.map((a) => (
                <Link key={a.id} to={`/activities/${a.id}`} className="item">
                  <div className="ic"><Icon name="run" /></div>
                  <div style={{ minWidth: 0 }}>
                    <div className="t">{a.title}</div>
                    <div className="s num">{fmtDate(a.date, { weekday: "short", day: "2-digit", month: "short" })} · {fmtDur(a.duration)} · {fmtPace(a.pace)} /km{a.heartRateAvg ? ` · ${a.heartRateAvg} bpm` : ""}</div>
                  </div>
                  <div className="r num">
                    <div style={{ fontWeight: 700 }}>{fmtKm(a.distance)} <span className="unit">km</span></div>
                    <div className="s">Load {loads[a.id]?.load ?? "—"}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </>}
      {toast}
    </>
  );
}
