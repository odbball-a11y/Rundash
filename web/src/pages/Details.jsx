import { useState } from "react";
import { useAll } from "../api.js";
import { PageHeader, Card, Loading, ErrorState, Seg, Info, Est, NA, Gauge } from "../components/UI.jsx";
import { LineChart, BarChart } from "../components/Charts.jsx";
import * as C from "../components/Cards.jsx";
import { fmtDate, fmtNum, fmtDur, fmtPace, fmtHours, STATUS_COLOR, RECOVERY_COLOR } from "../format.js";

const RANGES = [["28", "4W"], ["84", "12W"], ["182", "6M"], ["365", "1Y"]];
function useRange(def = "84") { const [r, setR] = useState(def); return [Number(r), <Seg options={RANGES} value={r} onChange={setR} />]; }

function Wrap({ title, children }) {
  const { data, m, loading, error } = useAll();
  return (
    <>
      <PageHeader title={title} back="/progress" />
      {loading && !m ? <Loading /> : error && !m ? <ErrorState error={error} /> : children({ data, m })}
    </>
  );
}

export function TrainingStatusDetail() {
  const [days, seg] = useRange();
  return <Wrap title="Training Status">{({ m }) => {
    const s = (m.series || []).slice(-days);
    const labels = s.map((r) => fmtDate(r.date));
    const counts = s.reduce((o, r) => ((o[r.status] = (o[r.status] || 0) + 1), o), {});
    return <div className="stack">
      <C.TrainingStatusCard m={m} to={null} />
      <Card title="Base Fitness & Load Impact" right={<span style={{ marginLeft: "auto" }}>{seg}</span>}>
        <LineChart height="lg" legend labels={labels} series={[
          { label: "Base Fitness", data: s.map((r) => r.baseFitness), color: "#22c55e", fill: true },
          { label: "Load Impact", data: s.map((r) => r.loadImpact), color: "#22d3ee" },
        ]} />
      </Card>
      <Card title="Intensity Trend">
        <LineChart labels={labels} series={[{ label: "Intensity Trend %", data: s.map((r) => r.intensityTrend), color: "#f97316", fill: true }]} />
        <div className="row" style={{ flexWrap: "wrap", gap: 12, marginTop: 10 }}>
          {["Excessive", "Optimized", "Maintaining", "Resuming", "Performance", "Decreasing"].map((k) => (
            <span key={k} className="lbl"><span className="dot" style={{ background: STATUS_COLOR[k] }} />{k} {counts[k] ? `· ${counts[k]} d` : ""}</span>
          ))}
        </div>
      </Card>
    </div>;
  }}</Wrap>;
}

export function TrainingLoadDetail() {
  const [view, setView] = useState("weekly");
  return <Wrap title="Training Load">{({ m }) => {
    const weeks = (m.weeks || []).slice(-12);
    const daily = (m.series || []).slice(-28);
    return <div className="stack">
      <C.TrainingLoadCard m={m} to={null} />
      <Card title={view === "weekly" ? "Weekly Training Load (12 weeks)" : "Daily Training Load (4 weeks)"} right={<span style={{ marginLeft: "auto" }}><Seg options={[["weekly", "Weekly"], ["daily", "Daily"]]} value={view} onChange={setView} /></span>}>
        {view === "weekly"
          ? <BarChart height="lg" labels={weeks.map((w) => fmtDate(w.week))} series={[{ label: "Load", data: weeks.map((w) => w.load), color: "#22d3ee" }]} />
          : <BarChart height="lg" labels={daily.map((d) => fmtDate(d.date))} series={[{ label: "Load", data: daily.map((d) => d.load), color: "#22d3ee" }]} />}
      </Card>
      <Card title="Recent activities">
        <table className="tbl num"><thead><tr><th>Date</th><th>Load</th><th>Level</th><th>Focus</th></tr></thead><tbody>
          {(m.activities || []).slice(-10).reverse().map((a) => <tr key={a.id}><td>{fmtDate(a.date)}</td><td>{a.load ?? "—"}</td><td>{a.loadLevel || "—"}</td><td>{a.focus || "—"}</td></tr>)}
        </tbody></table>
      </Card>
    </div>;
  }}</Wrap>;
}

export function RecoveryDetail() {
  return <Wrap title="Recovery">{({ m }) => {
    const r = m.current?.recovery || {};
    return <div className="stack">
      <Card title="Current recovery">
        <div className="row" style={{ flexWrap: "wrap" }}>
          <Gauge value={r.pct} color={RECOVERY_COLOR[r.state]} size={170} sub="%" />
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: RECOVERY_COLOR[r.state] }}>{r.state}</div>
            <div className="muted">{r.advice}</div>
            <div style={{ marginTop: 8 }}>{r.hoursToFull ? `About ${r.hoursToFull} hours to full recovery` : "Fully recovered"}<Est /></div>
          </div>
        </div>
      </Card>
      <Card title="What the levels mean">
        <table className="tbl"><tbody>
          {[["90–100%", "Fresh", "Ready for hard training"], ["70–89%", "Normal", "Ready for easy or moderate training"], ["20–69%", "Fatigued", "Easy running only"], ["0–19%", "Exhausted", "Rest"]].map(([p, s, t]) =>
            <tr key={s}><td className="num">{p}</td><td style={{ color: RECOVERY_COLOR[s], fontWeight: 600 }}>{s}</td><td className="muted">{t}</td></tr>)}
        </tbody></table>
        <p className="lbl">Based on your recent Training Load and Base Fitness. Sleep, HRV and muscle soreness aren't included, so listen to your body.</p>
      </Card>
    </div>;
  }}</Wrap>;
}

export function RunningFitnessDetail() {
  return <Wrap title="Running Fitness">{({ m, data }) => {
    const c = m.current || {};
    return <div className="grid">
      <div className="span2"><C.RunningFitnessCard m={m} to={null} /></div>
      <Card title="How to improve each ability">
        <table className="tbl"><tbody>
          <tr><td><b>Base</b></td><td className="muted">Long continuous runs (1–2 h) in Aerobic Endurance</td></tr>
          <tr><td><b>Endurance</b></td><td className="muted">Long intervals (15–30 min) in Threshold</td></tr>
          <tr><td><b>Speed</b></td><td className="muted">Intervals of 3–7 min in Anaerobic Endurance</td></tr>
          <tr><td><b>Sprint</b></td><td className="muted">Short sprints in Anaerobic Power</td></tr>
        </tbody></table>
        <p className="lbl">Speed is based on {c.runningFitness?.speedSource === "best efforts" ? `your recent best efforts (running fitness ${fmtNum(c.performanceVdot, 1)})` : "VO₂max"}.<Est /></p>
      </Card>
      <C.VO2Card m={m} data={data} to={null} />
    </div>;
  }}</Wrap>;
}

export function RacePredictorDetail() {
  return <Wrap title="Race Predictor">{({ m }) => (
    <div className="stack">
      <C.RacePredictorCard m={m} to={null} />
      <Card title="About these predictions">
        <p className="muted">Estimates assume a flat course in good weather. They come from your last 6 weeks of running (90 days if there isn't enough), anchored to your actual best efforts{m.current?.performanceVdot ? ` (running fitness ${fmtNum(m.current.performanceVdot, 1)})` : ""}. The marathon time includes a penalty while your longest recent run is under 25 km.<Est /></p>
      </Card>
    </div>
  )}</Wrap>;
}

export function RestingHrDetail() {
  const [days, seg] = useRange();
  return <Wrap title="Resting Heart Rate">{({ data }) => {
    const rows = (data.restHR || []).slice(0, days).reverse();
    return <Card title="Resting heart rate" right={<span style={{ marginLeft: "auto" }}>{seg}</span>}>
      {!rows.length ? <NA>No data</NA> : <LineChart height="lg" labels={rows.map((r) => fmtDate(r.date))} series={[{ label: "RHR (bpm)", data: rows.map((r) => r.value), color: "#f87171", fill: true }]} />}
      <p className="lbl">A resting heart rate several beats above your normal can mean fatigue, stress or illness.</p>
    </Card>;
  }}</Wrap>;
}

export function SleepDetail() {
  const [days, seg] = useRange("28");
  return <Wrap title="Sleep">{({ data }) => {
    const rows = (data.sleep || []).slice(0, days).reverse();
    const score = Object.fromEntries((data.sleepScore || []).map((s) => [s.date, s.value]));
    const avg = rows.length ? rows.reduce((s, r) => s + r.value, 0) / rows.length : null;
    return <div className="stack">
      <Card title="Sleep duration" right={<span style={{ marginLeft: "auto" }}>{seg}</span>}>
        <div className="lbl">Average {fmtHours(avg)}</div>
        <BarChart height="lg" labels={rows.map((r) => fmtDate(r.date))} series={[{ label: "Hours", data: rows.map((r) => +(r.value / 60).toFixed(2)), color: "#818cf8" }]} />
      </Card>
      <Card title="Sleep score">
        <LineChart labels={rows.map((r) => fmtDate(r.date))} series={[{ label: "Score", data: rows.map((r) => score[r.date] ?? null), color: "#22d3ee" }]} yMin={0} yMax={100} />
        <p className="lbl">Sleep stages aren't available from your watch's data feed.</p>
      </Card>
    </div>;
  }}</Wrap>;
}

export function Vo2Detail() {
  return <Wrap title="VO₂max">{({ m, data }) => <C.VO2Card m={m} data={data} to={null} />}</Wrap>;
}
