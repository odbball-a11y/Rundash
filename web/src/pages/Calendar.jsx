import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAll, useApi, fetchCached } from "../api.js";
import { write } from "../edit.js";
import { PageHeader, Card, Loading, ErrorState, Icon, Info, Est } from "../components/UI.jsx";
import { LineChart, BarChart } from "../components/Charts.jsx";
import WorkoutStrip from "../components/WorkoutStrip.jsx";
import { projectSeries } from "../../../src/metrics/workouts.mjs";
import { fmtDur, fmtKm, fmtDate } from "../format.js";

const PHASES = ["Preparation", "Base", "Progress", "Peak", "Race", "Transition"];
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monday = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const CAT = { WORKOUT: ["var(--cyan)", "Workout"], RACE_A: ["var(--red)", "Race A"], RACE_B: ["var(--orange)", "Race B"], RACE_C: ["var(--yellow)", "Race C"], NOTE: ["var(--purple)", "Note"] };
export const plannedLoad = (e) => (e.category !== "WORKOUT" ? 0 : e.estimate?.load ?? e.load ?? (e.seconds ? Math.round((e.seconds / 60) * 2.2) : 0));

function Sheet({ title, onClose, children }) {
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>{children}
        <button className="iconbtn" style={{ marginTop: 12 }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function AddSheet({ date, onClose, onDone, library }) {
  const [mode, setMode] = useState("workout");
  const [wid, setWid] = useState(library?.[0]?.id || "");
  const [name, setName] = useState("");
  const [cat, setCat] = useState("RACE_A");
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setMsg("");
    try {
      if (mode === "workout") {
        const w = library.find((x) => x.id === wid);
        if (!w) throw new Error("Choose a workout (create one in the Workout Library first)");
        await write("POST", "/api/calendar", { action: "workout", date, workout: w });
      } else await write("POST", "/api/calendar", { action: "event", date, name, category: mode === "label" ? "NOTE" : cat });
      onDone(); onClose();
    } catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  return (
    <Sheet title={`Add to ${fmtDate(date, { weekday: "short", day: "numeric", month: "short" })}`} onClose={onClose}>
      <div className="filters">
        {[["workout", "Workout"], ["event", "Event / race"], ["label", "Label / note"]].map(([v, l]) => <button key={v} className="iconbtn" aria-pressed={mode === v} style={{ borderColor: mode === v ? "var(--cyan)" : undefined }} onClick={() => setMode(v)}>{l}</button>)}
      </div>
      {mode === "workout" ? (
        library?.length ? (
          <select value={wid} onChange={(e) => setWid(e.target.value)} aria-label="Workout" style={{ width: "100%" }}>
            {library.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        ) : <p className="muted">Your library is empty. <Link to="/profile/workouts/new" style={{ color: "var(--cyan)" }}>Create a workout</Link> first.</p>
      ) : (
        <div className="stack">
          <input type="text" placeholder={mode === "label" ? "e.g. Rest day, Fitness test, Travel" : "e.g. Northampton 10k"} value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" style={{ width: "100%" }} />
          {mode === "event" && <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Priority"><option value="RACE_A">A race (main goal)</option><option value="RACE_B">B race</option><option value="RACE_C">C race / event</option></select>}
        </div>
      )}
      <div className="row" style={{ marginTop: 12, gap: 8 }}>
        <button className="iconbtn" onClick={go} disabled={busy}>{busy ? "Saving…" : "Add"}</button>
        {msg && <span className="lbl" role="status">{msg}</span>}
      </div>
    </Sheet>
  );
}

export default function Calendar() {
  const { data, m, loading, error } = useAll();
  const lib = useApi("/api/workouts");
  const [offset, setOffset] = useState(0);
  const [adding, setAdding] = useState(null);
  const [open, setOpen] = useState(null);
  const [msg, setMsg] = useState("");
  const { weeks, title, month, from, to } = useMemo(() => {
    const first = new Date(); first.setDate(1); first.setMonth(first.getMonth() + offset); first.setHours(0, 0, 0, 0);
    const start = monday(first);
    const weeks = [];
    for (let w = 0; w < 6; w++) {
      const days = Array.from({ length: 7 }, (_, d) => { const x = new Date(start); x.setDate(start.getDate() + w * 7 + d); return x; });
      if (w > 3 && days[0].getMonth() !== first.getMonth()) break;
      weeks.push(days);
    }
    return { weeks, title: first.toLocaleDateString("en-GB", { month: "long", year: "numeric" }), month: first.getMonth(), from: key(weeks[0][0]), to: key(weeks[weeks.length - 1][6]) };
  }, [offset]);
  // Planned items for the visible month and the next 6 weeks (for the forecast).
  const horizon = key(new Date(Date.now() + 42 * 86400000));
  const calUrl = `/api/calendar?from=${from < key(new Date()) ? from : key(new Date())}&to=${to > horizon ? to : horizon}`;
  const cal = useApi(calUrl);
  const reload = () => fetchCached(calUrl, { force: true });

  const loads = Object.fromEntries((m?.activities || []).map((a) => [a.id, a]));
  const acts = {}; for (const a of data?.activities || []) (acts[String(a.date).slice(0, 10)] ||= []).push(a);
  const evs = {}; for (const e of cal.data?.events || []) (evs[e.date] ||= []).push(e);
  const phases = cal.data?.phases || {};
  const today = key(new Date());

  const setPhase = async (wk, phase) => {
    try { await write("POST", "/api/calendar", { action: "phase", week: wk, phase }); reload(); } catch (e) { setMsg(e.message); }
  };
  const del = async (e) => {
    if (!window.confirm(`Delete "${e.name}" from your calendar?`)) return;
    try { await write("DELETE", `/api/calendar?eventId=${encodeURIComponent(e.id)}`); setOpen(null); reload(); } catch (x) { setMsg(x.message); }
  };

  // Forecast: last 8 weeks actual + next 6 weeks projected from planned workouts.
  const forecast = useMemo(() => {
    const s = (m?.series || []).slice(-56);
    if (!s.length) return null;
    const last = s[s.length - 1];
    const days = Array.from({ length: 42 }, (_, i) => key(new Date(Date.now() + (i + 1) * 86400000)));
    const fl = days.map((d) => (evs[d] || []).reduce((x, e) => x + plannedLoad(e), 0));
    const proj = projectSeries(last.baseFitness, last.loadImpact, fl);
    const labels = [...s.map((r) => fmtDate(r.date)), ...days.map((d) => fmtDate(d))];
    const pad = (n) => Array(n).fill(null);
    return {
      labels, planned: fl.some((x) => x > 0),
      series: [
        { label: "Base Fitness", data: [...s.map((r) => r.baseFitness), ...pad(42)], color: "#22c55e", fill: true },
        { label: "Base Fitness (forecast)", data: [...pad(s.length - 1), last.baseFitness, ...proj.map((p) => p.baseFitness)], color: "#22c55e", dashed: true },
        { label: "Load Impact", data: [...s.map((r) => r.loadImpact), ...pad(42)], color: "#22d3ee" },
        { label: "Load Impact (forecast)", data: [...pad(s.length - 1), last.loadImpact, ...proj.map((p) => p.loadImpact)], color: "#22d3ee", dashed: true },
      ],
      end: proj[proj.length - 1],
    };
  }, [m, cal.data]);

  return (
    <>
      <PageHeader title="Calendar" sub={title} right={<>
        <button className="iconbtn" onClick={() => setOffset(offset - 1)} aria-label="Previous month"><Icon name="back" size={16} /></button>
        <button className="iconbtn" onClick={() => setOffset(0)}>Today</button>
        <button className="iconbtn" onClick={() => setOffset(offset + 1)} aria-label="Next month"><Icon name="chevron" size={16} /></button>
      </>} />
      {msg && <div className="card lbl" role="status" style={{ marginBottom: 8, color: "var(--orange)" }}>{msg}</div>}
      {cal.data?.error && <div className="card lbl" style={{ marginBottom: 8 }}>Couldn't read your intervals.icu calendar: {cal.data.error}</div>}
      {loading && !data ? <Loading /> : error && !data ? <ErrorState error={error} /> : <>
        <div className="card scrollx" style={{ padding: 8 }}>
          <table className="tbl" style={{ tableLayout: "fixed", minWidth: 860 }}>
            <thead><tr>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <th key={d}>{d}</th>)}<th style={{ width: 130 }}>Week</th></tr></thead>
            <tbody>{weeks.map((days) => {
              const wk = key(days[0]);
              const done = days.flatMap((d) => acts[key(d)] || []);
              const plan = days.flatMap((d) => evs[key(d)] || []);
              const dl = done.reduce((x, a) => x + (loads[a.id]?.load || 0), 0);
              const pl = plan.reduce((x, e) => x + plannedLoad(e), 0);
              return (
                <tr key={wk}>
                  {days.map((d) => {
                    const k = key(d);
                    return (
                      <td key={k} style={{ verticalAlign: "top", height: 104, opacity: d.getMonth() === month ? 1 : 0.45 }}>
                        <div className="row between">
                          <span className="lbl" style={{ color: k === today ? "var(--cyan)" : undefined, fontWeight: k === today ? 700 : 400 }}>{d.getDate()}</span>
                          <button className="info" style={{ borderRadius: 6 }} aria-label={`Add to ${k}`} onClick={() => setAdding(k)}>+</button>
                        </div>
                        {(evs[k] || []).map((e) => (
                          <button key={e.id} onClick={() => setOpen(e)} style={{ display: "block", width: "100%", textAlign: "left", marginTop: 4, padding: "3px 6px", borderRadius: 6, background: "transparent", border: `1px dashed ${CAT[e.category]?.[0]}`, fontSize: 12, cursor: "pointer" }}>
                            <div style={{ color: CAT[e.category]?.[0], fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.category === "WORKOUT" ? "" : "⚑ "}{e.name}</div>
                            {e.category === "WORKOUT" && <div className="lbl num">{e.estimate ? `${fmtDur(e.estimate.seconds)} · TL ${e.estimate.load}` : e.seconds ? fmtDur(e.seconds) : "planned"}</div>}
                          </button>
                        ))}
                        {(acts[k] || []).map((a) => (
                          <Link key={a.id} to={`/activities/${a.id}`} style={{ display: "block", marginTop: 4, padding: "3px 6px", borderRadius: 6, background: "var(--card-2)", fontSize: 12 }}>
                            <div style={{ fontWeight: 600 }} className="num">{fmtKm(a.distance, 1)} km</div>
                            <div className="lbl num">{fmtDur(a.duration)} · TL {loads[a.id]?.load ?? "—"}</div>
                          </Link>
                        ))}
                      </td>
                    );
                  })}
                  <td style={{ verticalAlign: "top" }}>
                    <select value={phases[wk] || ""} onChange={(e) => setPhase(wk, e.target.value)} aria-label={`Training phase for week of ${wk}`} style={{ width: "100%", height: 30, fontSize: 12 }}>
                      <option value="">Set phase…</option>
                      {PHASES.map((p) => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <div className="lbl num" style={{ marginTop: 6 }}>Done: {fmtKm(done.reduce((x, a) => x + (a.distance || 0), 0), 1)} km · TL {dl}</div>
                    {pl > 0 && <div className="lbl num" style={{ color: "var(--cyan)" }}>Planned TL {pl}</div>}
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>

        <div className="grid" style={{ marginTop: 12 }}>
          <Card title="Fitness forecast" className="span2" info={<Info title="Fitness forecast"><p>Solid lines are your actual Base Fitness and Load Impact. Dotted lines project the next 6 weeks from the workouts in your calendar, using their estimated Training Load. With nothing planned, the forecast shows how fitness fades with rest.</p></Info>}>
            {!forecast ? <div className="na">Not enough history yet</div> : <>
              <LineChart height="lg" legend labels={forecast.labels} series={forecast.series} />
              <div className="lbl num" style={{ marginTop: 6 }}>In 6 weeks: Base Fitness {forecast.end.baseFitness}, Load Impact {forecast.end.loadImpact}, Intensity Trend {forecast.end.intensityTrend}%<Est /> {forecast.planned ? "" : "· no workouts planned yet"}</div>
            </>}
          </Card>
        </div>
      </>}

      {adding && <AddSheet date={adding} library={lib.data || []} onClose={() => setAdding(null)} onDone={reload} />}
      {open && (
        <Sheet title={open.name} onClose={() => setOpen(null)}>
          <div className="lbl" style={{ marginBottom: 8 }}>{CAT[open.category]?.[1]} · {fmtDate(open.date, { weekday: "long", day: "numeric", month: "long" })}</div>
          {open.estimate && <><WorkoutStrip blocks={open.estimate.blocks} /><div className="lbl num" style={{ marginTop: 6 }}>{fmtDur(open.estimate.seconds)} · {fmtKm(open.estimate.km, 1)} km · TL {open.estimate.load} (est.)</div></>}
          {open.description && <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "var(--text-2)" }}>{open.description}</pre>}
          <button className="iconbtn" style={{ color: "var(--red)", marginTop: 8 }} onClick={() => del(open)}>Delete from calendar</button>
        </Sheet>
      )}
    </>
  );
}
