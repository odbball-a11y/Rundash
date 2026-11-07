import { useState } from "react";
import { useAll, refreshAll } from "../api.js";
import { PageHeader, Loading, ErrorState, Icon } from "../components/UI.jsx";
import * as C from "../components/Cards.jsx";
import PlanCard from "../components/PlanCard.jsx";
import { todayLong } from "../format.js";

export const PROGRESS_CARDS = [
  ["recent", "Latest Activity", (p) => <C.RecentActivityCard {...p} />],
  ["plan", "Training Calendar", () => <PlanCard />],
  ["status", "Training Status", (p) => <C.TrainingStatusCard {...p} />],
  ["load", "Training Load", (p) => <C.TrainingLoadCard {...p} />],
  ["recoveryTime", "Recovery Time", (p) => <C.RecoveryTimeCard {...p} />],
  ["recovery", "Recovery (COROS-style %)", (p) => <C.RecoveryCard {...p} />],
  ["fitness", "Running Fitness", (p) => <C.RunningFitnessCard {...p} />],
  ["predictor", "Race Predictor", (p) => <C.RacePredictorCard {...p} />],
  ["rhr", "Resting Heart Rate", (p) => <C.RestingHrCard {...p} />],
  ["sleep", "Sleep", (p) => <C.SleepCard {...p} />],
  ["steps", "Steps", (p) => <C.StepsCard {...p} />],
  ["vo2", "VO₂max", (p) => <C.VO2Card {...p} />],
  ["hrv", "Overnight HRV", () => <C.HrvCard />],
];

const KEY = "kf_progress_layout_v1";
function loadLayout() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.order)) {
      const ids = PROGRESS_CARDS.map((c) => c[0]);
      return { order: [...s.order.filter((x) => ids.includes(x)), ...ids.filter((x) => !s.order.includes(x))], hidden: s.hidden || [] };
    }
  } catch {}
  return { order: PROGRESS_CARDS.map((c) => c[0]), hidden: ["steps"] };
}
function saveLayout(l) { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch {} }

export function useRefresh() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const run = async () => {
    setBusy(true);
    const r = await refreshAll();
    setBusy(false);
    setMsg(r.error ? `Refresh failed: ${r.error}` : r.changed ? "Updated with new data" : "Up to date");
    setTimeout(() => setMsg(""), r.error ? 8000 : 3000);
  };
  const button = <button className="iconbtn" onClick={run} disabled={busy} aria-label="Refresh"><Icon name="refresh" size={16} />{busy ? "Syncing…" : "Refresh"}</button>;
  return { button, toast: msg && <div className="toast" role="status">{msg}</div> };
}

export default function Progress() {
  const { data, m, loading, error } = useAll();
  const [layout, setLayout] = useState(loadLayout);
  const [editing, setEditing] = useState(false);
  const { button, toast } = useRefresh();
  const update = (l) => { setLayout(l); saveLayout(l); };
  const move = (id, d) => {
    const o = [...layout.order]; const i = o.indexOf(id); const j = i + d;
    if (j < 0 || j >= o.length) return; [o[i], o[j]] = [o[j], o[i]]; update({ ...layout, order: o });
  };
  const toggle = (id) => update({ ...layout, hidden: layout.hidden.includes(id) ? layout.hidden.filter((x) => x !== id) : [...layout.hidden, id] });
  const byId = Object.fromEntries(PROGRESS_CARDS.map((c) => [c[0], c]));

  return (
    <>
      <PageHeader title="Today" sub={todayLong()} right={<>
        <button className="iconbtn" onClick={() => setEditing(!editing)} aria-pressed={editing}><Icon name="edit" size={16} />{editing ? "Done" : "Edit"}</button>
        {button}
      </>} />
      {loading && !m ? <Loading /> : error && !m ? <ErrorState error={error} /> : editing ? (
        <div className="stack">
          <div className="lbl">Reorder or hide cards. Saved on this device.</div>
          {layout.order.map((id, i) => (
            <div className="edit-row" key={id}>
              <input type="checkbox" checked={!layout.hidden.includes(id)} onChange={() => toggle(id)} aria-label={`Show ${byId[id][1]}`} />
              <span className="grow">{byId[id][1]}</span>
              <button className="iconbtn" onClick={() => move(id, -1)} disabled={i === 0} aria-label="Move up">↑</button>
              <button className="iconbtn" onClick={() => move(id, 1)} disabled={i === layout.order.length - 1} aria-label="Move down">↓</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid g3">
          {layout.order.filter((id) => !layout.hidden.includes(id)).map((id) => <div key={id} style={{ display: "contents" }}>{byId[id][2]({ data, m })}</div>)}
        </div>
      )}
      {toast}
    </>
  );
}
