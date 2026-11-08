import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useApi, useAll, fetchCached } from "../api.js";
import { write } from "../edit.js";
import { PageHeader, Card, Loading, ErrorState, Icon, Info, Est, Seg } from "../components/UI.jsx";
import WorkoutStrip from "../components/WorkoutStrip.jsx";
import { estimateWorkout, toIntervalsText, validateWorkout, STEP_LABEL } from "../../../src/metrics/workouts.mjs";
import { fmtDur, fmtKm, fmtPace, ZONE_COLORS } from "../format.js";

const ZN = ["Recovery", "Aerobic Endurance", "Aerobic Power", "Threshold", "Anaerobic Endurance", "Anaerobic Power"];
const newStep = (kind) => kind === "repeat"
  ? { kind: "repeat", times: 5, steps: [newStep("training"), newStep("rest")] }
  : { kind, dur: { type: "time", value: kind === "rest" ? 90 : kind === "training" ? 300 : 600 }, target: kind === "rest" ? { type: "none" } : { type: "paceZone", zone: kind === "training" ? 4 : 2 } };

export const TEMPLATES = [
  { name: "Easy Run", description: "Conversational pace.", steps: [{ kind: "training", dur: { type: "time", value: 2400 }, target: { type: "paceZone", zone: 2 } }] },
  { name: "Threshold 3 x 10 min", description: "Lactate threshold development.", steps: [newStep("warmup"), { kind: "repeat", times: 3, steps: [{ kind: "training", dur: { type: "time", value: 600 }, target: { type: "paceZone", zone: 4 } }, { kind: "rest", dur: { type: "time", value: 120 }, target: { type: "none" } }] }, { kind: "cooldown", dur: { type: "time", value: 600 }, target: { type: "paceZone", zone: 1 } }] },
  { name: "VO2max 5 x 3 min", description: "Speed development.", steps: [newStep("warmup"), { kind: "repeat", times: 5, steps: [{ kind: "training", dur: { type: "time", value: 180 }, target: { type: "paceZone", zone: 5 } }, { kind: "rest", dur: { type: "time", value: 120 }, target: { type: "none" } }] }, { kind: "cooldown", dur: { type: "time", value: 600 }, target: { type: "paceZone", zone: 1 } }] },
  { name: "Long Run", description: "Base endurance.", steps: [{ kind: "training", dur: { type: "distance", value: 12000 }, target: { type: "paceZone", zone: 2 } }] },
];

export function Library() {
  const { data, loading, error } = useApi("/api/workouts");
  const { m } = useAll();
  return (
    <>
      <PageHeader title="Workout Library" back="/profile" right={<Link className="iconbtn" to="/profile/workouts/new"><Icon name="edit" size={16} />Create</Link>} />
      {loading ? <Loading /> : error ? <ErrorState error={error} /> : (
        <div className="list">
          {!data?.length && <Card><div className="empty">No workouts yet. Create one, or start from a template.</div></Card>}
          {(data || []).map((w) => {
            const e = m ? estimateWorkout(w, m.zones, m.settings) : null;
            return (
              <Link key={w.id} to={`/profile/workouts/${w.id}`} className="card" style={{ display: "block" }}>
                <div className="row between"><b>{w.name}</b><span className="lbl num">{e ? `${fmtDur(e.seconds)} · ${fmtKm(e.km, 1)} km · TL ${e.load}` : ""}</span></div>
                {e && <div style={{ marginTop: 8 }}><WorkoutStrip blocks={e.blocks} height={30} /></div>}
              </Link>
            );
          })}
          <div className="month">Templates</div>
          {TEMPLATES.map((t) => (
            <Link key={t.name} to={`/profile/workouts/new?template=${encodeURIComponent(t.name)}`} className="item">
              <div className="ic" style={{ color: "var(--cyan)" }}><Icon name="plan" /></div>
              <div><div className="t">{t.name}</div><div className="s">{t.description}</div></div>
              <div className="r muted"><Icon name="chevron" size={18} /></div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function TargetPicker({ t, onChange, m }) {
  const kind = t?.type || "none";
  return (
    <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
      <select value={kind} onChange={(e) => onChange(e.target.value === "none" ? { type: "none" } : e.target.value === "pace" ? { type: "pace", lo: 330, hi: 360 } : e.target.value === "hr" ? { type: "hr", lo: 140, hi: 150 } : { type: e.target.value, zone: 2 })} aria-label="Intensity">
        <option value="none">No target</option>
        <option value="paceZone">Pace zone</option>
        <option value="hrZone">Heart-rate zone</option>
        <option value="pace">Custom pace</option>
        <option value="hr">Custom heart rate</option>
      </select>
      {(kind === "paceZone" || kind === "hrZone") && (
        <select value={t.zone} onChange={(e) => onChange({ ...t, zone: +e.target.value })} aria-label="Zone">
          {ZN.map((n, i) => {
            const z = kind === "paceZone" ? m?.zones?.pace?.find((q) => q.zone === i + 1) : m?.zones?.hr?.find((q) => q.zone === i + 1);
            const r = !z ? "" : kind === "paceZone" ? ` (${z.fastSec ? fmtPace(z.fastSec) : "<"}${z.fastSec && z.slowSec ? "–" : ""}${z.slowSec ? fmtPace(z.slowSec) : "+"})` : ` (${z.lo ?? "<"}${z.lo && z.hi ? "–" : ""}${z.hi ?? "+"})`;
            return <option key={i} value={i + 1}>Z{i + 1} {n}{r}</option>;
          })}
        </select>
      )}
      {kind === "pace" && <>
        <input type="text" style={{ width: 70 }} defaultValue={fmtPace(t.lo).replace(/'|"/g, (c) => (c === "'" ? ":" : ""))} onBlur={(e) => { const [a, b] = e.target.value.split(":").map(Number); if (a >= 0) onChange({ ...t, lo: a * 60 + (b || 0) }); }} aria-label="Fastest pace (m:ss per km)" />
        <span className="lbl">to</span>
        <input type="text" style={{ width: 70 }} defaultValue={fmtPace(t.hi).replace(/'|"/g, (c) => (c === "'" ? ":" : ""))} onBlur={(e) => { const [a, b] = e.target.value.split(":").map(Number); if (a >= 0) onChange({ ...t, hi: a * 60 + (b || 0) }); }} aria-label="Slowest pace (m:ss per km)" />
        <span className="lbl">/km</span>
      </>}
      {kind === "hr" && <>
        <input type="number" style={{ width: 70 }} value={t.lo} onChange={(e) => onChange({ ...t, lo: +e.target.value })} aria-label="Lowest heart rate" />
        <span className="lbl">to</span>
        <input type="number" style={{ width: 70 }} value={t.hi} onChange={(e) => onChange({ ...t, hi: +e.target.value })} aria-label="Highest heart rate" />
        <span className="lbl">bpm</span>
      </>}
    </div>
  );
}

function DurPicker({ d, onChange }) {
  const type = d?.type || "time";
  return (
    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
      <select value={type} onChange={(e) => onChange({ type: e.target.value, value: e.target.value === "distance" ? 1000 : e.target.value === "time" ? 300 : 0 })} aria-label="Target type">
        <option value="time">Time</option><option value="distance">Distance</option><option value="open">Open (press lap)</option>
      </select>
      {type === "time" && <>
        <input type="number" min="0" style={{ width: 64 }} value={Math.floor(d.value / 60)} onChange={(e) => onChange({ ...d, value: Math.max(0, +e.target.value) * 60 + (d.value % 60) })} aria-label="Minutes" /><span className="lbl">min</span>
        <input type="number" min="0" max="59" style={{ width: 56 }} value={d.value % 60} onChange={(e) => onChange({ ...d, value: Math.floor(d.value / 60) * 60 + Math.min(59, Math.max(0, +e.target.value)) })} aria-label="Seconds" /><span className="lbl">s</span>
      </>}
      {type === "distance" && <><input type="number" min="0" step="0.1" style={{ width: 80 }} value={d.value / 1000} onChange={(e) => onChange({ ...d, value: Math.round(+e.target.value * 1000) })} aria-label="Kilometres" /><span className="lbl">km</span></>}
    </div>
  );
}

function StepEditor({ s, onChange, onRemove, onMove, m, inRepeat }) {
  const color = s.kind === "rest" ? "var(--text-3)" : s.kind === "training" ? "var(--orange)" : "var(--cyan)";
  return (
    <div className="card" style={{ padding: 12, borderLeft: `3px solid ${color}` }}>
      <div className="row between" style={{ marginBottom: 8 }}>
        <select value={s.kind} onChange={(e) => onChange({ ...s, kind: e.target.value })} aria-label="Phase">
          {Object.entries(STEP_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <div className="row" style={{ gap: 4 }}>
          <button className="iconbtn" onClick={() => onMove(-1)} aria-label="Move up">↑</button>
          <button className="iconbtn" onClick={() => onMove(1)} aria-label="Move down">↓</button>
          <button className="iconbtn" onClick={onRemove} aria-label="Delete step">✕</button>
        </div>
      </div>
      <div className="stack">
        <DurPicker d={s.dur} onChange={(dur) => onChange({ ...s, dur })} />
        <TargetPicker t={s.target} m={m} onChange={(target) => onChange({ ...s, target })} />
      </div>
    </div>
  );
}

export function Builder() {
  const { id } = useParams();
  const nav = useNavigate();
  const lib = useApi("/api/workouts");
  const { m } = useAll();
  const [w, setW] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    if (w) return;
    if (id && id !== "new") { const found = lib.data?.find((x) => x.id === id); if (found) setW(structuredClone(found)); return; }
    const t = new URLSearchParams(window.location.hash.split("?")[1] || "").get("template");
    const tpl = TEMPLATES.find((x) => x.name === t);
    setW(tpl ? structuredClone(tpl) : { name: "", description: "", steps: [newStep("warmup"), newStep("training"), newStep("cooldown")] });
  }, [id, lib.data]);

  const est = useMemo(() => (w && m ? estimateWorkout(w, m.zones, m.settings) : null), [w, m]);
  const text = useMemo(() => (w && m ? toIntervalsText(w, m.zones, m.settings) : ""), [w, m]);
  if (!w) return <><PageHeader title="Workout" back="/profile/workouts" /><Loading /></>;

  const setSteps = (steps) => setW({ ...w, steps });
  const upd = (i, v) => setSteps(w.steps.map((x, j) => (j === i ? v : x)));
  const move = (arr, i, d) => { const a = [...arr]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; };
  const errs = validateWorkout(w);

  const save = async () => {
    setBusy(true); setMsg("");
    try { const saved = await write("POST", "/api/workouts", w); await fetchCached("/api/workouts", { force: true }); setW(saved); setMsg("Saved to your library"); if (!id || id === "new") nav(`/profile/workouts/${saved.id}`, { replace: true }); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  const schedule = async () => {
    setBusy(true); setMsg("");
    try { await write("POST", "/api/calendar", { action: "workout", date, workout: w }); setMsg(`Added to your calendar on ${date}. It syncs to your Garmin via intervals.icu.`); }
    catch (e) { setMsg(e.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!w.id || !window.confirm(`Delete "${w.name}" from your library?`)) return;
    try { await write("DELETE", `/api/workouts?id=${encodeURIComponent(w.id)}`); await fetchCached("/api/workouts", { force: true }); nav("/profile/workouts"); } catch (e) { setMsg(e.message); }
  };

  return (
    <>
      <PageHeader title={w.id ? "Edit workout" : "New workout"} back="/profile/workouts" />
      <div className="grid g3">
        <div className="span2 stack">
          <Card title="Details">
            <div className="stack">
              <input type="text" placeholder="Workout name" value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} aria-label="Workout name" style={{ width: "100%" }} />
              <input type="text" placeholder="Description (optional)" value={w.description || ""} onChange={(e) => setW({ ...w, description: e.target.value })} aria-label="Description" style={{ width: "100%" }} />
            </div>
          </Card>
          {w.steps.map((s, i) => s.kind === "repeat" ? (
            <div key={i} className="card" style={{ borderLeft: "3px solid var(--purple)" }}>
              <div className="row between" style={{ marginBottom: 8 }}>
                <div className="row" style={{ gap: 6 }}><b>Interval</b><input type="number" min="1" max="50" style={{ width: 64 }} value={s.times} onChange={(e) => upd(i, { ...s, times: Math.max(1, Math.min(50, +e.target.value)) })} aria-label="Repeats" /><span className="lbl">times</span></div>
                <div className="row" style={{ gap: 4 }}>
                  <button className="iconbtn" onClick={() => setSteps(move(w.steps, i, -1))} aria-label="Move up">↑</button>
                  <button className="iconbtn" onClick={() => setSteps(move(w.steps, i, 1))} aria-label="Move down">↓</button>
                  <button className="iconbtn" onClick={() => setSteps(w.steps.filter((_, j) => j !== i))} aria-label="Delete interval">✕</button>
                </div>
              </div>
              <div className="stack">
                {s.steps.map((c, k) => <StepEditor key={k} s={c} m={m} inRepeat
                  onChange={(v) => upd(i, { ...s, steps: s.steps.map((x, q) => (q === k ? v : x)) })}
                  onRemove={() => upd(i, { ...s, steps: s.steps.filter((_, q) => q !== k) })}
                  onMove={(d) => upd(i, { ...s, steps: move(s.steps, k, d) })} />)}
                <div className="row" style={{ gap: 6 }}>
                  <button className="iconbtn" onClick={() => upd(i, { ...s, steps: [...s.steps, newStep("training")] })}>+ Training</button>
                  <button className="iconbtn" onClick={() => upd(i, { ...s, steps: [...s.steps, newStep("rest")] })}>+ Rest</button>
                </div>
              </div>
            </div>
          ) : (
            <StepEditor key={i} s={s} m={m} onChange={(v) => upd(i, v)} onRemove={() => setSteps(w.steps.filter((_, j) => j !== i))} onMove={(d) => setSteps(move(w.steps, i, d))} />
          ))}
          <div className="filters">
            {["warmup", "training", "rest", "cooldown"].map((k) => <button key={k} className="iconbtn" onClick={() => setSteps([...w.steps, newStep(k)])}>+ {STEP_LABEL[k]}</button>)}
            <button className="iconbtn" onClick={() => setSteps([...w.steps, newStep("repeat")])}>+ Interval</button>
          </div>
        </div>
        <div className="stack">
          <Card title="Overview" info={<Info title="Workout estimates"><p>Time, distance and Training Load are estimated from your pace and heart-rate zones. Pace-zone steps use the middle of the zone.</p></Info>}>
            {est && <>
              <WorkoutStrip blocks={est.blocks} />
              <div className="trio num">
                <div><div className="v">{fmtDur(est.seconds)}</div><div className="lbl">Time</div></div>
                <div><div className="v">{fmtKm(est.km, 1)}</div><div className="lbl">km</div></div>
                <div><div className="v">{est.load}</div><div className="lbl">Load<Est /></div></div>
              </div>
            </>}
            {errs.length > 0 && <div className="lbl" style={{ color: "var(--orange)", marginTop: 8 }}>{errs.join(" · ")}</div>}
          </Card>
          <Card title="Save & schedule">
            <div className="stack">
              <button className="iconbtn" onClick={save} disabled={busy || errs.length > 0}>Save to library</button>
              <div className="row" style={{ gap: 6 }}>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
                <button className="iconbtn" onClick={schedule} disabled={busy || errs.length > 0}>Add to calendar</button>
              </div>
              {w.id && <button className="iconbtn" onClick={remove} style={{ color: "var(--red)" }}>Delete workout</button>}
              {msg && <div className="lbl" role="status">{msg}</div>}
              <p className="lbl">Added workouts go into your intervals.icu calendar. With "Upload planned workouts" on in intervals.icu's Garmin settings, they appear on your watch.</p>
            </div>
          </Card>
          <Card title="Watch / intervals.icu text" right={<span style={{ marginLeft: "auto" }}><Seg options={[["0", "Hide"], ["1", "Show"]]} value={showText ? "1" : "0"} onChange={(v) => setShowText(v === "1")} /></span>}>
            {showText && <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, margin: 0, color: "var(--text-2)" }}>{text}</pre>}
          </Card>
        </div>
      </div>
    </>
  );
}
