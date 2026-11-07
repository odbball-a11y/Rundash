import { useState } from "react";
import { Link } from "react-router-dom";
import { FEEL_LABELS } from "../../../src/metrics/epoc.mjs";
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
  return <Wrap title="Recovery">{({ m, data }) => <RecoveryBody m={m} data={data} />}</Wrap>;
}

function RecoveryBody({ m, data }) {
  const [method, setMethod] = C.useRecoveryMethod();
  const co = m.current?.recovery, kf = m.current?.recoveryTime;
  if (!co && !kf) return <Card><div className="na">Needs runs with heart rate</div></Card>;
  const acts = Object.fromEntries((data?.activities || []).map((a) => [a.id, a]));
  const recent = (m.activities || []).filter((a) => a.load).slice(-8).reverse();
  const sig = kf?.signals || {};
  const hist = (co?.history || []).map((h, i) => ({ date: h.date, co: h.hours, kf: kf?.history?.[i]?.hours ?? null }));
  const trainingDiff = kf && co ? kf.baseHours - co.hoursToFull : 0;
  return <div className="grid">
    <div className="span2"><C.RecoveryCard m={m} to={null} /></div>
    <Card title="Why the two methods differ">
      <table className="tbl"><tbody>
        <tr><td>COROS method <div className="lbl">Training Load ÷ Base Fitness</div></td><td className="num" style={{ textAlign: "right", fontWeight: 600 }}>{co?.hoursToFull ?? "—"} h</td></tr>
        <tr><td>Kemp Fit, from training <div className="lbl">EPOC → Training Effect{kf?.lastSession ? ` (last run TE ${kf.lastSession.te})` : ""}</div></td><td className="num" style={{ textAlign: "right", fontWeight: 600 }}>{kf?.baseHours ?? "—"} h</td></tr>
        {(kf?.modifiers || []).map((x) => <tr key={x.key}><td>{x.label}<div className="lbl">{x.detail}</div></td><td className="num" style={{ textAlign: "right", fontWeight: 600, color: x.hours > 0 ? "var(--orange)" : "var(--green)" }}>{x.hours > 0 ? "+" : ""}{x.hours} h</td></tr>)}
        <tr><td><b>Kemp Fit method</b></td><td className="num" style={{ textAlign: "right", fontWeight: 700 }}>{kf?.hours ?? "—"} h</td></tr>
      </tbody></table>
      <p className="lbl">{Math.abs(trainingDiff) >= 4 ? (trainingDiff > 0
        ? "Kemp Fit rates your recent runs as harder than the COROS method does: time near or above threshold heart rate builds EPOC quickly."
        : "Kemp Fit rates your recent runs as easier than the COROS method does: steady running below threshold builds little EPOC.")
        : "From training alone, the two methods agree closely."} Today's signals: sleep {sig.sleepMin ? `${Math.floor(sig.sleepMin / 60)}h ${String(sig.sleepMin % 60).padStart(2, "0")}m` : "—"}{sig.sleepScore != null ? ` (score ${sig.sleepScore})` : ""} · resting HR {sig.restingHR ?? "—"} bpm.</p>
      {kf?.ignoredModifiers?.length > 0 && <p className="lbl">Already recovered from training, so these didn't shorten it further: {kf.ignoredModifiers.map((x) => x.label.toLowerCase()).join(", ")}.</p>}
    </Card>
    <Card title="Hours till full recovery at 7am (14 days)">
      <BarChart legend labels={hist.map((h) => fmtDate(h.date, { weekday: "narrow", day: "numeric" }))} series={[
        { label: "COROS method", data: hist.map((h) => h.co), color: method === "coros" ? "#22d3ee" : "#22d3ee77" },
        { label: "Kemp Fit (training)", data: hist.map((h) => h.kf), color: method === "kempfit" ? "#f97316" : "#f9731677" },
      ]} />
    </Card>
    <Card title="Recent sessions" className="span2">
      <div className="scrollx"><table className="tbl num">
        <thead><tr><th>Date</th><th>Run</th><th>Training Load</th><th>COROS adds</th><th>Peak EPOC</th><th>Aerobic TE</th><th>Kemp Fit adds</th><th>Felt</th></tr></thead>
        <tbody>{recent.map((a) => <tr key={a.id}>
          <td>{fmtDate(a.date)}</td>
          <td><Link to={`/activities/${a.id}`} style={{ color: "var(--cyan)" }}>{acts[a.id]?.title || "Run"}</Link></td>
          <td>{a.load}</td><td>{a.corosRecoveryHours != null ? `${a.corosRecoveryHours} h` : "—"}</td>
          <td>{a.peakEpoc ?? "—"}</td><td>{a.trainingEffect?.aerobic ?? "—"} <span className="lbl">{a.trainingEffect?.aerobicLabel}</span></td>
          <td>{a.recoveryHours != null ? `${a.recoveryHours} h` : "—"}</td><td>{a.feel ? FEEL_LABELS[a.feel] : <Link to={`/activities/${a.id}`} className="lbl">rate</Link>}</td>
        </tr>)}</tbody>
      </table></div>
    </Card>
    <Card title="How each method works" className="span2">
      <p className="muted"><b>COROS method.</b> Uses the inputs COROS describes: your Training Load, Base Fitness and the time since your last run. Each run adds recovery time in proportion to its load compared with your fitness; it counts down to 0, capped at 96 h. The % is calibrated to COROS's own example (64% with 33 h left). COROS doesn't use sleep or HRV for this.</p>
      <p className="muted"><b>Kemp Fit method.</b> Each run's heart rate is converted to effort relative to your threshold and accumulated into EPOC (exercise "after-burn"), following Firstbeat's published model. Peak EPOC compared with how much you usually train (activity class {kf?.activityClass ?? "—"}) gives the aerobic Training Effect, which sets the hours (TE 1 ≈ 2 h, 2 ≈ 6 h, 3 ≈ 14 h, 4 ≈ 28 h, 5 ≈ 54 h). Shorter sleep or a resting heart rate above your 30-day normal add time; good sleep, a low resting heart rate and feeling good take time off. Same % scale and levels as the COROS method.</p>
      <p className="lbl">Both are estimates. Neither COROS, Garmin nor Firstbeat publish their recovery formulas, and neither method can tell whether muscles, tendons or your nervous system have fully recovered.</p>
    </Card>
  </div>;
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

