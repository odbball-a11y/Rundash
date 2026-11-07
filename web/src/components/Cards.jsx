import { Card, Info, Gauge, Bar, Badge, Est, NA, Icon } from "./UI.jsx";
import { LineChart, BarChart } from "./Charts.jsx";
import { fmtDur, fmtPace, fmtKm, fmtHours, fmtDate, fmtNum, STATUS_COLOR, RECOVERY_COLOR, ZONE_COLORS } from "../format.js";
import { Link } from "react-router-dom";

const M = (m, k) => m?.methods?.[k];

export function TrainingStatusCard({ m, to = "/progress/training-status" }) {
  const c = m?.current || {};
  return (
    <Card title="Training Status" to={to} info={<Info title="Training Status" method={M(m, "trainingStatus")}>
      <p>Compares your short-term load (Load Impact, last 7 days) with your long-term load (Base Fitness, last 42 days). Intensity Trend is Load Impact ÷ Base Fitness.</p>
      <p>Excessive ≥150% · Optimized 100–149% · Maintaining 80–99% · Resuming / Performance 50–79% · Decreasing below 50%.</p>
    </Info>}>
      <div style={{ color: STATUS_COLOR[c.status], fontSize: 24, fontWeight: 700 }}>{c.status || "—"}</div>
      <div className="lbl" style={{ marginTop: 4 }}>{c.statusText}</div>
      <div className="trio num">
        <div><div className="v">{fmtNum(c.loadImpact)}</div><div className="lbl">Load Impact</div></div>
        <div><div className="v">{fmtNum(c.baseFitness)}</div><div className="lbl">Base Fitness</div></div>
        <div><div className="v">{c.intensityTrend ?? "—"}%</div><div className="lbl">Intensity Trend</div></div>
      </div>
    </Card>
  );
}

export function TrainingLoadCard({ m, to = "/progress/training-load" }) {
  const c = m?.current || {};
  const rec = c.recommendedWeekLoad;
  const max = Math.max(c.weekLoad || 0, rec?.max || 0) * 1.15 || 1;
  return (
    <Card title="Training Load" to={to} info={<Info title="Training Load" method={M(m, "trainingLoad")}>
      <p>Each run gets a load from its duration and heart-rate intensity. This week's total (Monday–Sunday) is compared with a suggested range based on your Base Fitness; after three rising weeks the suggestion drops for a recovery week.</p>
    </Info>}>
      <div className="row between">
        <div><span className="big num">{c.weekLoad ?? "—"}</span><span className="unit">this week</span></div>
        {rec && <div className="lbl num">Recommended {rec.min}–{rec.max}<Est /></div>}
      </div>
      <div style={{ position: "relative", marginTop: 12 }}>
        <Bar value={c.weekLoad || 0} max={max} color="var(--cyan)" />
        {rec && <div style={{ position: "absolute", top: -3, height: 14, left: `${(rec.min / max) * 100}%`, width: `${((rec.max - rec.min) / max) * 100}%`, border: "1px solid var(--green)", borderRadius: 4 }} />}
      </div>
    </Card>
  );
}

export function RecoveryCard({ m, to = "/progress/recovery" }) {
  const r = m?.current?.recovery;
  return (
    <Card title="Recovery" to={to} info={<Info title="Recovery" method={M(m, "recovery")}>
      <p>How recovered you are from recent training, based on your recent load and Base Fitness. It rises quickly at first and slows near 100%. Sleep and HRV are not part of it.</p>
      <p>0–19% Exhausted · 20–69% Fatigued · 70–89% Normal · 90–100% Fresh. The timer is capped at 96 hours.</p>
    </Info>}>
      <div className="row">
        <Gauge value={r?.pct} color={RECOVERY_COLOR[r?.state]} size={120} sub="%" />
        <div>
          <div style={{ color: RECOVERY_COLOR[r?.state], fontWeight: 700, fontSize: 18 }}>{r?.state || "—"}</div>
          <div className="lbl">{r?.advice}</div>
          <div className="lbl" style={{ marginTop: 6 }}>{r?.hoursToFull ? `Full recovery in ~${r.hoursToFull} h` : "Fully recovered"}<Est /></div>
        </div>
      </div>
    </Card>
  );
}

export function abilityBands(m) {
  const pz = m?.zones?.pace;
  if (!pz) return {};
  const z = (n) => pz.find((x) => x.zone === n);
  const rng = (q) => (q ? `${q.fastSec ? fmtPace(q.fastSec) : ""}${q.fastSec && q.slowSec ? " – " : ""}${q.slowSec ? fmtPace(q.slowSec) : ""}` : "");
  return { base: rng(z(2)), endurance: rng(z(4)), speed: rng(z(5)), sprint: `< ${fmtPace((z(6) || {}).slowSec)}` };
}

export function RunningFitnessCard({ m, to = "/progress/running-fitness" }) {
  const rf = m?.current?.runningFitness;
  const bands = abilityBands(m);
  const rows = [["Base", "base", "> 30 km"], ["Endurance", "endurance", "~10 km"], ["Speed", "speed", "~3 km"], ["Sprint", "sprint", "~400 m"]];
  return (
    <Card title="Running Fitness" to={to} info={<Info title="Running Fitness" method={M(m, "runningFitness")}>
      <p>Your running ability on a 40–100 scale, from the last 6 weeks, with four abilities: Base (long aerobic), Endurance (threshold), Speed (VO₂max) and Sprint (30–60 s). The pace beside each ability is the zone to train in to improve it.</p>
    </Info>}>
      <div className="row" style={{ alignItems: "flex-start" }}>
        <Gauge value={rf?.score} min={40} max={100} color="var(--orange)" size={120} sub={<tspan>score</tspan>} />
        <div style={{ flex: 1, minWidth: 0 }} className="stack">
          {rows.map(([name, k, dist]) => (
            <div key={k}>
              <div className="row between lbl"><span><b style={{ color: "var(--text)" }}>{name}</b> {dist}</span><span className="num" style={{ color: "var(--text)" }}>{fmtNum(rf?.abilities?.[k], 1)}</span></div>
              <Bar value={(rf?.abilities?.[k] || 40) - 40} max={60} color="var(--orange)" />
              <div className="lbl num" style={{ fontSize: 11 }}>{bands[k] ? `${bands[k]} /km` : ""}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function RacePredictorCard({ m, to = "/progress/race-predictor" }) {
  const p = m?.current?.racePredictor;
  const rows = [["5K", "5k"], ["10K", "10k"], ["Half Marathon", "half"], ["Marathon", "marathon"]];
  return (
    <Card title="Race Predictor" to={to} info={<Info title="Race Predictor" method={M(m, "racePredictor")}>
      <p>Predicted race times under ideal conditions. Each distance is estimated separately: short races lean on your speed, longer races on your threshold and base. Long runs matter most for the marathon.</p>
    </Info>}>
      {!p ? <NA>Needs a few runs with heart rate</NA> : (
        <table className="tbl num"><tbody>
          {rows.map(([n, k]) => <tr key={k}><td>{n}</td><td style={{ textAlign: "right", fontWeight: 600 }}>{fmtDur(p[k]?.seconds)}</td><td style={{ textAlign: "right" }} className="muted">{fmtPace(p[k]?.paceSecPerKm)} /km</td></tr>)}
        </tbody></table>
      )}
    </Card>
  );
}

export function RecentActivityCard({ data, m, title = "Latest Activity" }) {
  const a = data?.activities?.[0];
  if (!a) return <Card title={title}><NA>No activities yet</NA></Card>;
  const am = m?.activities?.find((x) => x.id === a.id);
  return (
    <Card title={title} to={`/activities/${a.id}`}>
      <div className="row">
        <div className="ic" style={{ width: 44, height: 44, borderRadius: 12, background: "var(--card-2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--green)" }}><Icon name="run" /></div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.title}</div>
          <div className="lbl">{fmtDate(a.date, { weekday: "short", day: "2-digit", month: "short" })}</div>
        </div>
      </div>
      <div className="trio num">
        <div><div className="v">{fmtKm(a.distance)}<span className="unit">km</span></div><div className="lbl">Distance</div></div>
        <div><div className="v">{fmtDur(a.duration)}</div><div className="lbl">Time</div></div>
        <div><div className="v">{fmtPace(a.pace)}</div><div className="lbl">Avg pace /km</div></div>
      </div>
      {am?.load != null && <div className="lbl" style={{ marginTop: 8 }}>Training Load <b style={{ color: "var(--text)" }}>{am.load}</b>{am.loadLevel ? ` · ${am.loadLevel}` : ""}{am.focus ? ` · ${am.focus}` : ""}</div>}
    </Card>
  );
}

const spark = (rows, n = 30) => rows.slice(0, n).reverse();

export function RestingHrCard({ data, to = "/progress/resting-hr" }) {
  const rows = spark(data?.restHR || []);
  const last = data?.restHR?.[0];
  return (
    <Card title="Resting Heart Rate" to={to}>
      {!last ? <NA>No resting heart rate yet</NA> : <>
        <div><span className="big num">{last.value}</span><span className="unit">bpm · {fmtDate(last.date)}</span></div>
        <LineChart height="sm" labels={rows.map((r) => fmtDate(r.date))} series={[{ label: "RHR", data: rows.map((r) => r.value), color: "#f87171", fill: true }]} />
      </>}
    </Card>
  );
}

export function SleepCard({ data, to = "/progress/sleep" }) {
  const last = data?.sleep?.[0];
  const score = data?.sleepScore?.find((s) => s.date === last?.date);
  const rows = spark(data?.sleep || [], 14);
  return (
    <Card title="Sleep" to={to}>
      {!last ? <NA>No sleep data yet</NA> : <>
        <div className="row between">
          <div><span className="big num">{fmtHours(last.value)}</span><span className="unit">{fmtDate(last.date)}</span></div>
          {score && <div className="lbl">Score <b style={{ color: "var(--text)", fontSize: 18 }}>{score.value}</b></div>}
        </div>
        <BarChart height="sm" labels={rows.map((r) => fmtDate(r.date, { weekday: "narrow" }))} series={[{ label: "Sleep (h)", data: rows.map((r) => +(r.value / 60).toFixed(1)), color: "#818cf8" }]} />
      </>}
    </Card>
  );
}

export function HrvCard() {
  return (
    <Card title="Overnight HRV" info={<Info title="Overnight HRV"><p>Overnight heart-rate variability needs a watch with HRV Status. The Garmin Venu Sq 2 doesn't record it, so this card stays empty. Resting heart rate and sleep are the best recovery signals available from your watch.</p></Info>}>
      <NA />
    </Card>
  );
}

export function StepsCard({ data }) {
  const s = data?.steps?.[0];
  return (
    <Card title="Steps">
      {!s ? <NA>No step data yet</NA> : <div><span className="big num">{s.value.toLocaleString("en-GB")}</span><span className="unit">{fmtDate(s.date)}</span></div>}
    </Card>
  );
}

export function ZonesCard({ m, kind = "hr" }) {
  const z = m?.zones?.[kind];
  const s = m?.settings || {};
  const title = kind === "hr" ? "Threshold Heart Rate Zones" : "Threshold Pace Zones";
  return (
    <Card title={title} info={<Info title={title} method={M(m, kind === "hr" ? "hrZones" : "paceZones")}>
      <p>Six training zones from your lactate threshold{kind === "hr" ? " heart rate" : " pace"}: Recovery, Aerobic Endurance, Aerobic Power, Threshold, Anaerobic Endurance and Anaerobic Power.</p>
    </Info>}>
      {kind === "hr" ? (
        <div className="trio num" style={{ marginTop: 0, marginBottom: 8 }}>
          <div><div className="v">{s.lthr ?? "—"}</div><div className="lbl">Lactate threshold</div></div>
          <div><div className="v">{s.max ?? "—"}</div><div className="lbl">Max HR</div></div>
          <div><div className="v">{s.rest ?? "—"}</div><div className="lbl">Resting HR</div></div>
        </div>
      ) : (
        <div style={{ marginBottom: 8 }}><span className="lbl">Threshold pace </span><b className="num">{fmtPace(s.tpSecPerKm)} /km</b>{/est/.test(s.sources?.tpSecPerKm || "") && <Est />}</div>
      )}
      {!z ? <NA>Not enough data yet</NA> : (
        <table className="tbl num"><tbody>
          {z.map((q) => (
            <tr key={q.zone}>
              <td><span className="dot" style={{ background: ZONE_COLORS[q.zone - 1] }} />{q.name}</td>
              <td style={{ textAlign: "right" }}>{kind === "hr"
                ? (q.lo == null ? `< ${q.hi + 1}` : q.hi == null ? `> ${q.lo - 1}` : `${q.lo} – ${q.hi}`)
                : (q.fastSec == null ? `< ${fmtPace(q.slowSec + 1)}` : q.slowSec == null ? `> ${fmtPace(q.fastSec - 1)}` : `${fmtPace(q.fastSec)} – ${fmtPace(q.slowSec)}`)}</td>
            </tr>
          ))}
        </tbody></table>
      )}
    </Card>
  );
}

export function WeeklyActivityCard({ data }) {
  const now = new Date(); const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(d.getDate() + i); return d; });
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const per = Object.fromEntries(days.map((d) => [key(d), 0]));
  for (const a of data?.activities || []) { const k = String(a.date).slice(0, 10); if (k in per) per[k] += a.distance || 0; }
  const total = Object.values(per).reduce((s, x) => s + x, 0);
  return (
    <Card title="Weekly Activity">
      <div><span className="big num">{fmtKm(total, 1)}</span><span className="unit">km this week</span></div>
      <BarChart height="sm" labels={days.map((d) => d.toLocaleDateString("en-GB", { weekday: "short" }))} series={[{ label: "km", data: Object.values(per).map((x) => +x.toFixed(2)), color: "#3b82f6" }]} />
    </Card>
  );
}

export function PersonalRecordsCard({ m, to = "/profile/records" }) {
  const pr = m?.personalRecords || {};
  const rows = [["1 km", "1k"], ["1 mile", "1mi"], ["5 km", "5k"], ["10 km", "10k"], ["Half", "half"], ["Marathon", "marathon"]];
  return (
    <Card title="Personal Records" to={to}>
      <table className="tbl num"><tbody>
        {rows.map(([n, k]) => <tr key={k}><td>{n}</td><td style={{ textAlign: "right", fontWeight: 600 }}>{pr[k] ? fmtDur(pr[k].seconds) : "—"}</td><td style={{ textAlign: "right" }} className="muted">{pr[k] ? fmtDate(pr[k].date, { day: "2-digit", month: "short", year: "2-digit" }) : ""}</td></tr>)}
      </tbody></table>
    </Card>
  );
}

export function VO2Card({ m, data, to = "/progress/vo2max" }) {
  const rows = (data?.vo2Series || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(-120);
  return (
    <Card title="VO₂max" to={to} info={<Info title="VO₂max" method={M(m, "vo2max")}><p>Garmin's VO₂max estimate. Watch VO₂max often runs higher than race results suggest, so the race predictor uses your actual best efforts instead.</p></Info>}>
      <div><span className="big num">{fmtNum(m?.current?.vo2max, 0)}</span><span className="unit">{m?.current?.vo2Source === "Garmin" ? "Garmin" : "est."}</span></div>
      {rows.length > 1 && <LineChart height="sm" labels={rows.map((r) => fmtDate(r.date))} series={[{ label: "VO₂max", data: rows.map((r) => r.value), color: "#a78bfa", fill: true }]} />}
    </Card>
  );
}

export { Link };
