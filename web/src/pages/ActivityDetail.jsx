import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Chart } from "chart.js";
import "../components/Charts.jsx";
import { useApi, useAll } from "../api.js";
import { PageHeader, Card, Loading, ErrorState, Seg, Info, Est, NA, Bar } from "../components/UI.jsx";
import { fmtDur, fmtPace, fmtKm, fmtDateTime, fmtNum, ZONE_COLORS } from "../format.js";

const METRICS = {
  hr: { label: "Heart Rate", unit: "bpm", color: "#f87171", stream: "heartrate" },
  pace: { label: "Pace", unit: "/km", color: "#22c55e", stream: "velocity_smooth", reverse: true },
  cadence: { label: "Cadence", unit: "spm", color: "#a78bfa", stream: "cadence" },
  elevation: { label: "Elevation", unit: "m", color: "#94a3b8", stream: "fixed_altitude", alt: "altitude" },
};

function streamMap(detail) {
  const s = {};
  for (const x of detail?.streams || []) s[x.type] = x.data;
  if (s.cadence) { const med = [...s.cadence].filter((x) => x > 0).sort((a, b) => a - b)[Math.floor(s.cadence.length / 2)]; if (med && med < 120) s.cadence = s.cadence.map((x) => x * 2); }
  return s;
}

function MultiChart({ s, picked, xMode, onSelect, range }) {
  const ref = useRef(null);
  const n = s.time?.length || 0;
  const step = Math.max(1, Math.floor(n / 700));
  const idx = useMemo(() => { const out = []; for (let i = range[0]; i < Math.min(n, range[1]); i += step) out.push(i); return out; }, [n, step, range]);
  useEffect(() => {
    if (!ref.current || !n) return;
    const xs = idx.map((i) => (xMode === "distance" ? (s.distance?.[i] || 0) / 1000 : s.time[i] / 60));
    const datasets = picked.filter((k) => s[METRICS[k].stream] || s[METRICS[k].alt]).map((k, j) => {
      const def = METRICS[k]; const arr = s[def.stream] || s[def.alt];
      const data = idx.map((i, q) => {
        let v = arr[i];
        if (k === "pace") v = v > 0.8 ? 1000 / v : null;
        return { x: xs[q], y: v };
      });
      return { label: def.label, data, borderColor: def.color, backgroundColor: def.color + "22", fill: j === 0, pointRadius: 0, borderWidth: 1.6, tension: 0.2, yAxisID: "y" + j };
    });
    const scales = { x: { type: "linear", grid: { display: false }, ticks: { maxTicksLimit: 8, callback: (v) => (xMode === "distance" ? `${v.toFixed(1)} km` : fmtDur(v * 60)) } } };
    picked.forEach((k, j) => {
      const def = METRICS[k];
      scales["y" + j] = { position: j % 2 ? "right" : "left", display: j < 2, reverse: !!def.reverse, grid: { color: j === 0 ? "#1c2640" : "transparent" },
        ticks: { maxTicksLimit: 5, color: def.color, callback: (v) => (k === "pace" ? fmtPace(v) : Math.round(v)) } };
    });
    let dragStart = null;
    const chart = new Chart(ref.current, {
      type: "line", data: { datasets },
      options: { responsive: true, maintainAspectRatio: false, animation: false, parsing: false, normalized: true,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: true, labels: { boxWidth: 10, boxHeight: 10 } },
          tooltip: { callbacks: { title: (it) => (xMode === "distance" ? `${it[0].parsed.x.toFixed(2)} km` : fmtDur(it[0].parsed.x * 60)),
            label: (it) => { const k = picked[it.datasetIndex]; return `${METRICS[k].label}: ${k === "pace" ? fmtPace(it.parsed.y) : Math.round(it.parsed.y)} ${k === "pace" ? "/km" : METRICS[k].unit}`; } } } },
        scales,
      },
    });
    // Drag across the chart to zoom into a section (works without laps).
    const el = ref.current;
    const toIndex = (evt) => { const x = chart.scales.x.getValueForPixel(evt.offsetX); let best = idx[0]; for (let q = 0; q < xs.length; q++) if (xs[q] <= x) best = idx[q]; return best; };
    // Pointer events cover mouse, pen and touch; offsetX is relative to the canvas.
    const down = (e) => { dragStart = toIndex(e); };
    const up = (e) => { if (dragStart == null) return; const end = toIndex(e); if (Math.abs(end - dragStart) > 20) onSelect([Math.min(dragStart, end), Math.max(dragStart, end) + 1]); dragStart = null; };
    const cancel = () => { dragStart = null; };
    el.addEventListener("pointerdown", down); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", cancel);
    return () => { el.removeEventListener("pointerdown", down); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", cancel); chart.destroy(); };
  }, [s, picked.join(), xMode, idx]);
  // touch-action: pan-y lets a horizontal finger drag select a section while vertical swipes still scroll.
  return <div className="chart lg"><canvas ref={ref} style={{ touchAction: "pan-y" }} /></div>;
}

function splitsFromStreams(s) {
  if (!s.time || !s.distance) return [];
  const out = []; let start = 0, km = 1;
  for (let i = 1; i < s.distance.length; i++) {
    if (s.distance[i] >= km * 1000 || i === s.distance.length - 1) {
      const dist = s.distance[i] - s.distance[start], t = s.time[i] - s.time[start];
      if (dist < 50) break;
      const hrs = s.heartrate ? s.heartrate.slice(start, i).filter((x) => x > 0) : [];
      out.push({ n: km, distance: dist, time: t, pace: t / (dist / 1000), hr: hrs.length ? Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length) : null });
      start = i; km++;
    }
  }
  return out;
}

export default function ActivityDetail() {
  const { id } = useParams();
  const { data, loading, error } = useApi(`/api/activity?id=${encodeURIComponent(id)}`);
  const { m } = useAll();
  const [picked, setPicked] = useState(["pace", "hr"]);
  const [xMode, setXMode] = useState("time");
  const [lapView, setLapView] = useState("laps");
  const [range, setRange] = useState([0, Infinity]);
  const s = useMemo(() => streamMap(data?.detail), [data]);
  const am = m?.activities?.find((x) => x.id === id);
  const a = data?.summary;

  const toggle = (k) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : p.length >= 4 ? p : [...p, k]));
  const laps = (data?.detail?.intervals?.icu_intervals || []).filter((l) => l.distance || l.moving_time);
  const splits = useMemo(() => splitsFromStreams(s), [s]);
  const bestLap = laps.filter((l) => l.type !== "RECOVERY" && l.distance > 200).reduce((b, l) => (!b || (l.average_speed || 0) > (b.average_speed || 0) ? l : b), null);
  const zoomed = range[1] !== Infinity;
  const sel = zoomed && s.time ? (() => {
    const i0 = range[0], i1 = Math.min(range[1], s.time.length) - 1;
    const dist = (s.distance?.[i1] || 0) - (s.distance?.[i0] || 0), t = s.time[i1] - s.time[i0];
    const hrs = (s.heartrate || []).slice(i0, i1).filter((x) => x > 0);
    return { dist, t, pace: dist > 0 ? t / (dist / 1000) : null, hr: hrs.length ? Math.round(hrs.reduce((x, y) => x + y, 0) / hrs.length) : null };
  })() : null;

  if (loading) return <><PageHeader title="Activity" back="/activities" /><Loading /></>;
  if (error || !a) return <><PageHeader title="Activity" back="/activities" /><ErrorState error={error || "not found"} /></>;
  const zoneRows = (secs) => { const tot = (secs || []).reduce((x, y) => x + y, 0) || 1; return (secs || []).map((v, i) => ({ i, v, pct: Math.round((v / tot) * 100) })); };
  const names = ["Recovery", "Aerobic Endurance", "Aerobic Power", "Threshold", "Anaerobic Endurance", "Anaerobic Power"];

  return (
    <>
      <PageHeader title={a.title} sub={fmtDateTime(a.date)} back="/activities" />
      <div className="grid g3">
        <Card title="Summary" className="span2">
          <div className="trio num" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", marginTop: 0, rowGap: 14 }}>
            <div><div className="v">{fmtKm(a.distance)}<span className="unit">km</span></div><div className="lbl">Distance</div></div>
            <div><div className="v">{fmtDur(a.duration)}</div><div className="lbl">Moving time</div></div>
            <div><div className="v">{fmtPace(a.pace)}</div><div className="lbl">Avg pace /km</div></div>
            <div><div className="v">{a.gapSpeed ? fmtPace(1000 / a.gapSpeed) : "—"}</div><div className="lbl">Grade-adj. pace</div></div>
            <div><div className="v">{a.heartRateAvg ?? "—"}</div><div className="lbl">Avg HR</div></div>
            <div><div className="v">{a.heartRateMax ?? "—"}</div><div className="lbl">Max HR</div></div>
            <div><div className="v">{a.cadence ?? "—"}</div><div className="lbl">Avg cadence</div></div>
            <div><div className="v">{fmtNum(a.elevation)}<span className="unit">m</span></div><div className="lbl">Elevation gain</div></div>
            <div><div className="v">{a.calories ?? "—"}</div><div className="lbl">Calories</div></div>
            <div><div className="v">{am?.load ?? "—"}</div><div className="lbl">Training Load<Est /></div></div>
          </div>
        </Card>
        <Card title="Training analysis" info={<Info title="Training analysis"><p>Training Effect (0–5) shows how much the run developed your aerobic and anaerobic fitness. Training Focus is the main improvement, from the load in each pace zone. Efficiency compares this run's pace-to-heart-rate with your last 42 days (80–120%).</p><p>All three are Kemp Fit estimates; Garmin's own Training Effect isn't available from your watch's data feed.</p></Info>}>
          <table className="tbl"><tbody>
            <tr><td>Aerobic TE</td><td className="num" style={{ textAlign: "right" }}><b>{fmtNum(am?.trainingEffect?.aerobic, 1)}</b> <span className="muted">{am?.trainingEffect?.aerobicLabel}</span></td></tr>
            <tr><td>Anaerobic TE</td><td className="num" style={{ textAlign: "right" }}><b>{fmtNum(am?.trainingEffect?.anaerobic, 1)}</b> <span className="muted">{am?.trainingEffect?.anaerobicLabel}</span></td></tr>
            <tr><td>Training Focus</td><td style={{ textAlign: "right" }}>{am?.focus || "—"}</td></tr>
            <tr><td>Efficiency</td><td className="num" style={{ textAlign: "right" }}>{am?.efficiency ? `${am.efficiency}% · ${am.efficiencyLevel}` : "—"}</td></tr>
            <tr><td>Load level</td><td style={{ textAlign: "right" }}>{am?.loadLevel || "—"}</td></tr>
          </tbody></table>
        </Card>

        <Card title="Charts" className="span2" right={<span style={{ marginLeft: "auto" }}><Seg options={[["time", "Time"], ["distance", "Distance"]]} value={xMode} onChange={setXMode} /></span>}>
          {data.pending ? <NA>Second-by-second data is still being fetched. Check back in a few minutes.</NA> : !s.time ? <NA>No chart data for this activity.</NA> : <>
            <div className="filters" role="group" aria-label="Metrics (up to 4)">
              {Object.entries(METRICS).map(([k, d]) => (
                <button key={k} className="iconbtn" aria-pressed={picked.includes(k)} onClick={() => toggle(k)}
                  style={{ borderColor: picked.includes(k) ? d.color : undefined, color: picked.includes(k) ? d.color : "var(--text-2)" }}
                  disabled={!s[d.stream] && !s[d.alt]}>{d.label}</button>
              ))}
              {zoomed && <button className="iconbtn" onClick={() => setRange([0, Infinity])}>Show entire activity</button>}
            </div>
            <MultiChart s={s} picked={picked} xMode={xMode} range={zoomed ? range : [0, s.time.length]} onSelect={setRange} />
            {sel ? <div className="lbl num" style={{ marginTop: 6 }}>Selection: {fmtKm(sel.dist / 1000)} km · {fmtDur(sel.t)} · {fmtPace(sel.pace)} /km{sel.hr ? ` · ${sel.hr} bpm` : ""}</div>
              : <div className="lbl" style={{ marginTop: 6 }}>Drag across the chart to zoom into a section.</div>}
          </>}
        </Card>

        <Card title="Time in zones">
          {!am?.hrZoneSeconds ? <NA>Available once second-by-second data is analysed</NA> : (
            <div className="stack">
              <div className="lbl">Heart rate</div>
              {zoneRows(am.hrZoneSeconds).map(({ i, v, pct }) => (
                <div key={"h" + i}>
                  <div className="row between lbl"><span><span className="dot" style={{ background: ZONE_COLORS[i] }} />{names[i]}</span><span className="num">{pct}% · {fmtDur(v)}</span></div>
                  <Bar value={pct} color={ZONE_COLORS[i]} />
                </div>
              ))}
              {am.paceZoneSeconds && <>
                <div className="lbl" style={{ marginTop: 10 }}>Pace</div>
                {zoneRows(am.paceZoneSeconds).map(({ i, v, pct }) => (
                  <div key={"p" + i} className="row between lbl"><span><span className="dot" style={{ background: ZONE_COLORS[i] }} />{names[i]}</span><span className="num">{pct}% · {fmtDur(v)}</span></div>
                ))}
              </>}
            </div>
          )}
        </Card>

        <Card title={lapView === "laps" ? "Laps" : "Splits (1 km)"} className="span2" right={<span style={{ marginLeft: "auto" }}><Seg options={[["laps", "Laps"], ["splits", "1 km"]]} value={lapView} onChange={setLapView} /></span>}>
          <div className="scrollx">
            {lapView === "laps" ? (!laps.length ? <NA>No laps recorded</NA> : (
              <table className="tbl num">
                <thead><tr><th></th><th>Lap</th><th>Time</th><th>Distance</th><th>Avg pace</th><th>GAP</th><th>Avg HR</th><th>Max HR</th><th>Cadence</th><th>Elev</th></tr></thead>
                <tbody>{laps.map((l, i) => (
                  <tr key={l.id || i} className={l.type === "RECOVERY" ? "dim" : ""}>
                    <td style={{ color: "var(--cyan)", fontWeight: 600 }}>{bestLap && l === bestLap ? "Best" : ""}</td>
                    <td>{i + 1}{l.type === "RECOVERY" ? " Rest" : ""}</td>
                    <td>{fmtDur(l.moving_time || l.elapsed_time)}</td>
                    <td>{fmtKm((l.distance || 0) / 1000)} km</td>
                    <td>{l.average_speed ? fmtPace(1000 / l.average_speed) : "—"}</td>
                    <td>{l.gap ? fmtPace(1000 / l.gap) : "—"}</td>
                    <td>{l.average_heartrate ? Math.round(l.average_heartrate) : "—"}</td>
                    <td>{l.max_heartrate ? Math.round(l.max_heartrate) : "—"}</td>
                    <td>{l.average_cadence ? Math.round(l.average_cadence < 120 ? l.average_cadence * 2 : l.average_cadence) : "—"}</td>
                    <td>{l.total_elevation_gain != null ? `${Math.round(l.total_elevation_gain)} m` : "—"}</td>
                  </tr>))}
                </tbody>
              </table>
            )) : (!splits.length ? <NA>No distance data</NA> : (
              <table className="tbl num">
                <thead><tr><th>km</th><th>Time</th><th>Pace</th><th>Avg HR</th></tr></thead>
                <tbody>{splits.map((x) => <tr key={x.n}><td>{x.n}{x.distance < 990 ? ` (${fmtKm(x.distance / 1000)})` : ""}</td><td>{fmtDur(x.time)}</td><td>{fmtPace(x.pace)}</td><td>{x.hr ?? "—"}</td></tr>)}</tbody>
              </table>
            ))}
          </div>
        </Card>

        <Card title="Map">
          <NA>Route maps arrive with private login, so your home location isn't shown publicly.</NA>
        </Card>
        <Card title="Not available from your watch">
          <div className="lbl">Running power · Running dynamics (ground contact, vertical oscillation) · Temperature · Garmin Training Effect</div>
        </Card>
      </div>
    </>
  );
}
