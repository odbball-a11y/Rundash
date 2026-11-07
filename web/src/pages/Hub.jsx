import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAll } from "../api.js";
import { PageHeader, Card, Loading, ErrorState, Seg, Info, Icon } from "../components/UI.jsx";
import { LineChart, BarChart } from "../components/Charts.jsx";
import * as C from "../components/Cards.jsx";
import { fmtDate, fmtDur, fmtKm, fmtPace, fmtNum, ZONE_COLORS } from "../format.js";
import { useFilteredActivities, Stats } from "./Activities.jsx";
import { useRefresh } from "./Progress.jsx";

function useData() { return useAll(); }

export function HubDashboard() {
  const { data, m, loading, error } = useData();
  const { button, toast } = useRefresh();
  return (
    <>
      <PageHeader title="Dashboard" right={button} />
      {loading && !m ? <Loading /> : error && !m ? <ErrorState error={error} /> : (
        <div className="grid g4">
          <C.RunningFitnessCard m={m} />
          <C.TrainingStatusCard m={m} />
          <C.ZonesCard m={m} kind="hr" />
          <C.ZonesCard m={m} kind="pace" />
          <C.RecoveryCard m={m} />
          <C.HrvCard />
          <C.WeeklyActivityCard data={data} />
          <C.RacePredictorCard m={m} />
          <C.PersonalRecordsCard m={m} />
          <C.RecentActivityCard data={data} m={m} title="Recent Workout" />
          <C.TrainingLoadCard m={m} />
          <C.RestingHrCard data={data} />
        </div>
      )}
      {toast}
    </>
  );
}

export function EvoLab() {
  const { data, m, loading, error } = useData();
  const [weeks, setWeeks] = useState("12");
  const [wdMetric, setWdMetric] = useState("load");
  if (loading && !m) return <><PageHeader title="EvoLab Metrics" /><Loading /></>;
  if (error && !m) return <><PageHeader title="EvoLab Metrics" /><ErrorState error={error} /></>;
  const nW = Number(weeks);
  const s = (m.series || []).slice(-nW * 7);
  const labels = s.map((r) => fmtDate(r.date));
  // Weekly workout data by load / distance / time
  const acts = data?.activities || [];
  const wk = {};
  for (const r of (m.weeks || []).slice(-nW)) wk[r.week] = { load: r.load, km: 0, sec: 0 };
  const monday = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
  for (const a of acts) { const k = monday(a.date); if (wk[k]) { wk[k].km += a.distance || 0; wk[k].sec += a.duration || 0; } }
  const wkeys = Object.keys(wk).sort();
  // 4-week training summary
  const cut = Date.now() - 28 * 86400000;
  const recent = acts.filter((a) => Date.parse(a.date) >= cut);
  const loads = Object.fromEntries((m.activities || []).map((a) => [a.id, a]));
  const hrs = recent.filter((a) => a.heartRateAvg);
  // 4-week pace-zone distribution
  const pz = [0, 0, 0, 0, 0, 0];
  for (const a of recent) (loads[a.id]?.paceZoneSeconds || []).forEach((v, i) => (pz[i] += v));
  const pzTot = pz.reduce((x, y) => x + y, 0) || 1;
  const rhr = (data?.restHR || []).slice(0, nW * 7).reverse();
  const vo2 = (data?.vo2Series || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).filter((r) => Date.parse(r.date) >= Date.now() - nW * 7 * 86400000);
  // rolling 7-day total load, last 4 weeks
  const ser = m.series || [];
  const roll = ser.map((r, i) => ser.slice(Math.max(0, i - 6), i + 1).reduce((x, y) => x + y.load, 0)).slice(-28);
  const names = ["Recovery", "Aerobic Endurance", "Aerobic Power", "Threshold", "Anaerobic Endurance", "Anaerobic Power"];

  return (
    <>
      <PageHeader title="EvoLab Metrics" right={<Seg options={[["4", "4W"], ["12", "12W"], ["24", "24W"]]} value={weeks} onChange={setWeeks} />} />
      <div className="grid">
        <Card title="Training Load Management" className="span2" info={<Info title="Training Load Management" method={m.methods?.baseFitness}><p>Base Fitness (long-term load), Load Impact (short-term load) and Intensity Trend (Load Impact ÷ Base Fitness). To build fitness you want Base Fitness trending up while Intensity Trend stays in the Optimized range (100–149%).</p></Info>}>
          <LineChart height="lg" legend y2 labels={labels} series={[
            { label: "Base Fitness", data: s.map((r) => r.baseFitness), color: "#22c55e", fill: true },
            { label: "Load Impact", data: s.map((r) => r.loadImpact), color: "#22d3ee" },
            { label: "Intensity Trend %", data: s.map((r) => r.intensityTrend), color: "#f97316", axis: "y2", dashed: true },
          ]} />
        </Card>
        <Card title="Workout Data" right={<span style={{ marginLeft: "auto" }}><Seg options={[["load", "Load"], ["km", "Distance"], ["sec", "Time"]]} value={wdMetric} onChange={setWdMetric} /></span>}>
          <BarChart labels={wkeys.map((k) => fmtDate(k))} series={[{ label: wdMetric === "load" ? "Training Load" : wdMetric === "km" ? "km" : "hours",
            data: wkeys.map((k) => (wdMetric === "sec" ? +(wk[k].sec / 3600).toFixed(2) : wdMetric === "km" ? +wk[k].km.toFixed(1) : wk[k].load)), color: "#3b82f6" }]} />
        </Card>
        <Card title="Training Summary (4 weeks)">
          <table className="tbl num"><tbody>
            <tr><td>Distance</td><td style={{ textAlign: "right" }}>{fmtKm(recent.reduce((x, a) => x + (a.distance || 0), 0), 1)} km</td></tr>
            <tr><td>Time</td><td style={{ textAlign: "right" }}>{fmtDur(recent.reduce((x, a) => x + (a.duration || 0), 0))}</td></tr>
            <tr><td>Training Load</td><td style={{ textAlign: "right" }}>{recent.reduce((x, a) => x + (loads[a.id]?.load || 0), 0)}</td></tr>
            <tr><td>Workouts</td><td style={{ textAlign: "right" }}>{recent.length}</td></tr>
            <tr><td>Avg distance per day</td><td style={{ textAlign: "right" }}>{fmtKm(recent.reduce((x, a) => x + (a.distance || 0), 0) / 28, 2)} km</td></tr>
            <tr><td>Avg heart rate</td><td style={{ textAlign: "right" }}>{hrs.length ? Math.round(hrs.reduce((x, a) => x + a.heartRateAvg, 0) / hrs.length) : "—"} bpm</td></tr>
          </tbody></table>
          <p className="lbl">Averages are per day, not per workout.</p>
        </Card>
        <Card title="7-Day Total Training Load (4 weeks)">
          <LineChart labels={ser.slice(-28).map((r) => fmtDate(r.date))} series={[{ label: "7-day total", data: roll, color: "#22d3ee", fill: true }]} />
        </Card>
        <Card title="Pace Zone Distribution (4 weeks)">
          {names.map((n, i) => (
            <div key={n} style={{ marginBottom: 6 }}>
              <div className="row between lbl"><span><span className="dot" style={{ background: ZONE_COLORS[i] }} />{n}</span><span className="num">{Math.round((pz[i] / pzTot) * 100)}% · {fmtDur(pz[i])}</span></div>
              <div className="bar"><i style={{ width: `${(pz[i] / pzTot) * 100}%`, background: ZONE_COLORS[i] }} /></div>
            </div>
          ))}
        </Card>
        <Card title="VO₂max">
          {vo2.length > 1 ? <LineChart labels={vo2.map((r) => fmtDate(r.date))} series={[{ label: "VO₂max (Garmin)", data: vo2.map((r) => r.value), color: "#a78bfa", fill: true }]} /> : <div className="na">Not enough VO₂max readings in this range</div>}
        </Card>
        <Card title="Resting Heart Rate">
          <LineChart labels={rhr.map((r) => fmtDate(r.date))} series={[{ label: "RHR", data: rhr.map((r) => r.value), color: "#f87171", fill: true }]} />
        </Card>
      </div>
    </>
  );
}

export function HubActivities() {
  const { data, m, loading, error } = useData();
  const { list, controls } = useFilteredActivities(data);
  const loads = Object.fromEntries((m?.activities || []).map((a) => [a.id, a]));
  return (
    <>
      <PageHeader title="Activity List" />
      {loading && !data ? <Loading /> : error && !data ? <ErrorState error={error} /> : <>
        {controls}
        <Stats list={list} m={m} />
        <div className="card scrollx" style={{ padding: 0 }}>
          <table className="tbl num">
            <thead><tr><th>Date</th><th>Title</th><th>Distance</th><th>Time</th><th>Avg pace</th><th>Avg HR</th><th>Training Load</th><th>Focus</th><th>Efficiency</th></tr></thead>
            <tbody>{list.map((a) => (
              <tr key={a.id}>
                <td>{fmtDate(a.date, { day: "2-digit", month: "short", year: "2-digit" })}</td>
                <td><Link to={`/activities/${a.id}`} style={{ color: "var(--cyan)" }}>{a.title}</Link></td>
                <td>{fmtKm(a.distance)} km</td><td>{fmtDur(a.duration)}</td><td>{fmtPace(a.pace)}</td><td>{a.heartRateAvg ?? "—"}</td>
                <td>{loads[a.id]?.load ?? "—"}</td><td>{loads[a.id]?.focus || "—"}</td><td>{loads[a.id]?.efficiency ? `${loads[a.id].efficiency}%` : "—"}</td>
              </tr>))}
            </tbody>
          </table>
        </div>
      </>}
    </>
  );
}

export function Calendar() {
  const { data, m, loading, error } = useData();
  const [offset, setOffset] = useState(0);
  const loads = Object.fromEntries((m?.activities || []).map((a) => [a.id, a]));
  const { weeks, title } = useMemo(() => {
    const first = new Date(); first.setDate(1); first.setMonth(first.getMonth() + offset); first.setHours(0, 0, 0, 0);
    const start = new Date(first); start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const weeks = [];
    for (let w = 0; w < 6; w++) {
      const days = [];
      for (let d = 0; d < 7; d++) { const x = new Date(start); x.setDate(start.getDate() + w * 7 + d); days.push(x); }
      if (w > 3 && days[0].getMonth() !== first.getMonth()) break;
      weeks.push(days);
    }
    return { weeks, title: first.toLocaleDateString("en-GB", { month: "long", year: "numeric" }), month: first.getMonth() };
  }, [offset]);
  const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const byDay = {};
  for (const a of data?.activities || []) (byDay[String(a.date).slice(0, 10)] ||= []).push(a);
  const today = key(new Date());
  return (
    <>
      <PageHeader title="Calendar" sub={title} right={<>
        <button className="iconbtn" onClick={() => setOffset(offset - 1)} aria-label="Previous month"><Icon name="back" size={16} /></button>
        <button className="iconbtn" onClick={() => setOffset(0)}>Today</button>
        <button className="iconbtn" onClick={() => setOffset(offset + 1)} aria-label="Next month"><Icon name="chevron" size={16} /></button>
      </>} />
      {loading && !data ? <Loading /> : error && !data ? <ErrorState error={error} /> : <div className="card scrollx" style={{ padding: 8 }}>
        <table className="tbl" style={{ tableLayout: "fixed", minWidth: 760 }}>
          <thead><tr>{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <th key={d}>{d}</th>)}<th>Week</th></tr></thead>
          <tbody>{weeks.map((days, i) => {
            const items = days.flatMap((d) => byDay[key(d)] || []);
            const wl = items.reduce((x, a) => x + (loads[a.id]?.load || 0), 0);
            const wkm = items.reduce((x, a) => x + (a.distance || 0), 0);
            return (
              <tr key={i}>
                {days.map((d) => (
                  <td key={key(d)} style={{ verticalAlign: "top", height: 86, opacity: d.getMonth() === new Date(new Date().getFullYear(), new Date().getMonth() + offset, 1).getMonth() ? 1 : 0.4 }}>
                    <div className="lbl" style={{ color: key(d) === today ? "var(--cyan)" : undefined, fontWeight: key(d) === today ? 700 : 400 }}>{d.getDate()}</div>
                    {(byDay[key(d)] || []).map((a) => (
                      <Link key={a.id} to={`/activities/${a.id}`} style={{ display: "block", marginTop: 4, padding: "4px 6px", borderRadius: 6, background: "var(--card-2)", fontSize: 12 }}>
                        <div style={{ fontWeight: 600 }} className="num">{fmtKm(a.distance, 1)} km</div>
                        <div className="lbl num">{fmtDur(a.duration)} · TL {loads[a.id]?.load ?? "—"}</div>
                      </Link>
                    ))}
                  </td>
                ))}
                <td style={{ verticalAlign: "top" }} className="lbl num">{fmtKm(wkm, 1)} km<br />TL {wl}</td>
              </tr>
            );
          })}</tbody>
        </table>
        <p className="lbl" style={{ padding: "0 8px" }}>Planned workouts, events, labels, training phases and fitness predictions come in Phase 6.</p>
      </div>}
    </>
  );
}
