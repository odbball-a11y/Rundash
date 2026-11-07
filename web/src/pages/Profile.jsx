import { Link } from "react-router-dom";
import { useState } from "react";
import { useAll, useApi } from "../api.js";
import { getKey, setKey } from "../edit.js";
import { PageHeader, Card, Icon, Loading, ErrorState, Soon, Est } from "../components/UI.jsx";
import { ZonesCard, PersonalRecordsCard } from "../components/Cards.jsx";
import { fmtDur, fmtPace, fmtDate, fmtNum } from "../format.js";
import { useRefresh } from "./Progress.jsx";

const MENU = [
  ["/profile/settings", "gear", "Heart rate & pace zones", "Thresholds and training zones"],
  ["/profile/records", "trophy", "Personal Records", "Fastest times and longest run"],
  ["/profile/workouts", "list", "Workout Library", "Structured workouts"],
  ["/profile/plans", "plan", "Training Plan Library", "Plans and schedules"],
  ["/calendar", "calendar", "Training Calendar", "Planned workouts, races, phases, forecast"],
  ["/profile/data", "refresh", "Data & sync", "Garmin → intervals.icu → Kemp Fit"],
  ["/profile/editing", "edit", "Editing access", "Unlock adding workouts and events"],
];

export default function Profile() {
  return (
    <>
      <PageHeader title="Profile" />
      <div className="list">
        {MENU.map(([to, icon, t, s]) => (
          <Link key={to} to={to} className="item">
            <div className="ic" style={{ color: "var(--cyan)" }}><Icon name={icon} /></div>
            <div><div className="t">{t}</div><div className="s">{s}</div></div>
            <div className="r muted"><Icon name="chevron" size={18} /></div>
          </Link>
        ))}
        <a href="/classic.html" className="item">
          <div className="ic" style={{ color: "var(--orange)" }}><Icon name="progress" /></div>
          <div><div className="t">Classic dashboard</div><div className="s">The earlier fitness-ring page</div></div>
          <div className="r muted"><Icon name="chevron" size={18} /></div>
        </a>
      </div>
    </>
  );
}

export function SettingsPage() {
  const { m, loading, error } = useAll();
  const s = m?.settings;
  return (
    <>
      <PageHeader title="Heart rate & pace zones" back="/profile" />
      {loading && !m ? <Loading /> : error && !m ? <ErrorState error={error} /> : <div className="grid">
        <Card title="Thresholds" className="span2">
          <table className="tbl"><tbody>
            {[["Lactate threshold heart rate", s.lthr ? `${s.lthr} bpm` : "—", s.sources.lthr],
              ["Max heart rate", s.max ? `${s.max} bpm` : "—", s.sources.max],
              ["Resting heart rate", s.rest ? `${s.rest} bpm` : "—", s.sources.rest],
              ["Threshold pace", s.tpSecPerKm ? `${fmtPace(s.tpSecPerKm)} /km` : "—", s.sources.tpSecPerKm]].map(([k, v, src]) => (
              <tr key={k}><td>{k}</td><td className="num" style={{ fontWeight: 600 }}>{v}</td><td className="lbl">{src}</td></tr>
            ))}
          </tbody></table>
          <p className="lbl">Editing thresholds and choosing other zone systems (max HR, heart-rate reserve) comes in the Settings phase.</p>
        </Card>
        <ZonesCard m={m} kind="hr" />
        <ZonesCard m={m} kind="pace" />
      </div>}
    </>
  );
}

export function RecordsPage() {
  const { m, loading, error } = useAll();
  const pr = m?.personalRecords || {};
  return (
    <>
      <PageHeader title="Personal Records" back="/profile" />
      {loading && !m ? <Loading /> : error && !m ? <ErrorState error={error} /> : <div className="grid">
        <PersonalRecordsCard m={m} to={null} />
        <Card title="Distance records">
          <table className="tbl num"><tbody>
            <tr><td>Longest run</td><td style={{ textAlign: "right", fontWeight: 600 }}>{pr.longestRun ? `${fmtNum(pr.longestRun.km, 2)} km` : "—"}</td><td className="muted" style={{ textAlign: "right" }}>{pr.longestRun ? fmtDate(pr.longestRun.date) : ""}</td></tr>
            <tr><td>Most elevation gain</td><td style={{ textAlign: "right", fontWeight: 600 }}>{pr.mostElevation ? `${Math.round(pr.mostElevation.m)} m` : "—"}</td><td className="muted" style={{ textAlign: "right" }}>{pr.mostElevation ? fmtDate(pr.mostElevation.date) : ""}</td></tr>
            <tr><td>3 km</td><td style={{ textAlign: "right", fontWeight: 600 }}>{pr["3k"] ? fmtDur(pr["3k"].seconds) : "—"}</td><td className="muted" style={{ textAlign: "right" }}>{pr["3k"] ? fmtDate(pr["3k"].date) : ""}</td></tr>
          </tbody></table>
          <p className="lbl">Fastest continuous segment within any run, including pauses. Only runs whose second-by-second data has been analysed are included.</p>
        </Card>
      </div>}
    </>
  );
}

export function PlansPage() {
  return <><PageHeader title="Training Plan Library" back="/profile" /><Soon phase="Phase 6 — create plans, start date, drag and drop, phases" /></>;
}

export function DataPage() {
  const inv = useApi("/api/inventory");
  const { m } = useAll();
  const { button, toast } = useRefresh();
  const d = inv.data;
  return (
    <>
      <PageHeader title="Data & sync" back="/profile" right={button} />
      {!d ? <Loading /> : <div className="grid">
        <Card title="Sync">
          <table className="tbl"><tbody>
            <tr><td>Last checked</td><td>{d.sync?.last_checked ? new Date(d.sync.last_checked).toLocaleString("en-GB") : "—"}</td></tr>
            <tr><td>Last new data</td><td>{d.sync?.last_updated ? new Date(d.sync.last_updated).toLocaleString("en-GB") : "—"}</td></tr>
            <tr><td>Activities</td><td className="num">{d.activities?.count}</td></tr>
            <tr><td>Wellness days</td><td className="num">{d.wellness?.days}</td></tr>
            <tr><td>Second-by-second data</td><td className="num">{d.details?.ok} of {d.activities?.count}</td></tr>
          </tbody></table>
        </Card>
        <Card title="Metric engine">
          <table className="tbl"><tbody>
            <tr><td>Version</td><td className="num">{m?.algorithmVersion}</td></tr>
            <tr><td>Calculated</td><td>{m?.generatedAt ? new Date(m.generatedAt).toLocaleString("en-GB") : "—"}</td></tr>
            <tr><td>Activities analysed</td><td className="num">{m?.coverage?.analysed} of {m?.coverage?.activities}</td></tr>
          </tbody></table>
          <p className="lbl">Metrics marked <Est /> are Kemp Fit estimates of COROS-style metrics, not COROS's own calculations.</p>
        </Card>
      </div>}
      {toast}
    </>
  );
}

export function EditingPage() {
  const [has, setHas] = useState(!!getKey());
  const [val, setVal] = useState("");
  return (
    <>
      <PageHeader title="Editing access" back="/profile" />
      <Card title={has ? "Editing is unlocked on this device" : "Unlock editing"}>
        <p className="muted">The site is public, so adding workouts, races and phases needs your private editing key: the <b>ADMIN_KEY</b> environment variable in Netlify. The key is stored only in this browser.</p>
        {has ? <button className="iconbtn" onClick={() => { setKey(""); setHas(false); }}>Lock editing on this device</button> : (
          <div className="row" style={{ gap: 8 }}>
            <input type="password" value={val} onChange={(e) => setVal(e.target.value)} placeholder="Editing key" aria-label="Editing key" />
            <button className="iconbtn" onClick={() => { if (val.trim()) { setKey(val.trim()); setHas(true); setVal(""); } }}>Save</button>
          </div>
        )}
      </Card>
    </>
  );
}
