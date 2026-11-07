// Structured workouts: model, estimates, intervals.icu text export, and future-load projection.
//
// Workout = { id, name, description, sport: "Run", steps: Step[] }
// Step    = { kind: "warmup"|"training"|"rest"|"cooldown", dur: { type: "time"|"distance"|"open", value }, target }
//         | { kind: "repeat", times, steps: Step[] }            (no nesting, like COROS / intervals.icu)
// target  = { type: "none" } | { type: "paceZone", zone } | { type: "hrZone", zone }
//         | { type: "pace", lo, hi }  (sec/km, lo = faster)  | { type: "hr", lo, hi } (bpm)
import { loadPerMinute } from "./load.mjs";
import { round } from "./util.mjs";

export const STEP_LABEL = { warmup: "Warm Up", training: "Training", rest: "Rest", cooldown: "Cool Down" };

const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

function durText(d) {
  if (!d || d.type === "open") return null;
  if (d.type === "distance") return d.value >= 1000 && d.value % 100 === 0 ? `${+(d.value / 1000).toFixed(2)}km` : `${Math.round(d.value)}mtr`;
  const s = Math.round(d.value), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return `${h ? h + "h" : ""}${m ? m + "m" : ""}${x ? x + "s" : ""}` || "0s";
}

// Resolve a target into absolute ranges using the athlete's zones.
export function resolveTarget(t, zones) {
  if (!t || t.type === "none") return null;
  if (t.type === "pace") return { pace: [t.lo, t.hi] };
  if (t.type === "hr") return { hr: [t.lo, t.hi] };
  if (t.type === "paceZone") {
    const z = zones?.pace?.find((q) => q.zone === t.zone);
    if (!z) return null;
    const fast = z.fastSec ?? Math.round(z.slowSec * 0.9), slow = z.slowSec ?? Math.round(z.fastSec * 1.12);
    return { pace: [fast, slow], zone: t.zone };
  }
  if (t.type === "hrZone") {
    const z = zones?.hr?.find((q) => q.zone === t.zone);
    if (!z) return null;
    const lo = z.lo ?? Math.round(z.hi * 0.9), hi = z.hi ?? Math.round(z.lo * 1.04);
    return { hr: [lo, hi], zone: t.zone };
  }
  return null;
}

function targetText(t, zones, settings) {
  const r = resolveTarget(t, zones);
  if (!r) return "";
  if (r.pace) return `${mmss(r.pace[0])}/km-${mmss(r.pace[1])}/km Pace`;
  if (r.hr && settings?.lthr) {
    const p = (x) => Math.round((x / settings.lthr) * 100);
    return `${p(r.hr[0])}-${p(r.hr[1])}% LTHR`;
  }
  return "";
}

function stepLine(s, zones, settings) {
  const parts = [STEP_LABEL[s.kind] || "Step", durText(s.dur), targetText(s.target, zones, settings)].filter(Boolean);
  if (!durText(s.dur)) parts.splice(1, 0, "Press lap"); // open step: cue only
  return `- ${parts.join(" ")}`;
}

// intervals.icu workout text (syncs to Garmin when "Upload planned workouts" is on).
export function toIntervalsText(w, zones, settings) {
  const out = [];
  for (const s of w.steps || []) {
    if (s.kind === "repeat") {
      out.push("", `Main Set ${s.times}x`, ...(s.steps || []).map((x) => stepLine(x, zones, settings)), "");
    } else out.push(stepLine(s, zones, settings));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// Estimate one step: seconds, metres, load. Pace targets are converted to HR via the
// matching zone index (est.); HR targets use the mid-point.
function estStep(s, zones, settings) {
  const r = resolveTarget(s.target, zones);
  const zi = r?.zone || (s.kind === "rest" ? 1 : s.kind === "training" ? 3 : 2);
  const paceMid = r?.pace ? (r.pace[0] + r.pace[1]) / 2 : (() => { const z = resolveTarget({ type: "paceZone", zone: zi }, zones); return z ? (z.pace[0] + z.pace[1]) / 2 : 390; })();
  const hrMid = r?.hr ? (r.hr[0] + r.hr[1]) / 2 : (() => { const z = resolveTarget({ type: "hrZone", zone: zi }, zones); return z ? (z.hr[0] + z.hr[1]) / 2 : null; })();
  let sec = 0, m = 0;
  if (s.dur?.type === "time") { sec = s.dur.value; m = (sec / paceMid) * 1000; }
  else if (s.dur?.type === "distance") { m = s.dur.value; sec = (m / 1000) * paceMid; }
  const load = hrMid && settings?.rest && settings?.max ? loadPerMinute(hrMid, settings.rest, settings.max) * (sec / 60) : 0;
  return { sec, m, load, zone: zi };
}

// Totals + blocks for the modular strip (width = share of time, height = zone).
export function estimateWorkout(w, zones, settings) {
  let sec = 0, m = 0, load = 0;
  const blocks = [];
  const add = (s) => { const e = estStep(s, zones, settings); sec += e.sec; m += e.m; load += e.load; blocks.push({ kind: s.kind, sec: e.sec, zone: e.zone }); };
  for (const s of w.steps || []) {
    if (s.kind === "repeat") for (let i = 0; i < (s.times || 1); i++) (s.steps || []).forEach(add);
    else add(s);
  }
  return { seconds: Math.round(sec), km: round(m / 1000, 2), load: Math.round(load), blocks };
}

// Project Base Fitness / Load Impact forward from today's values with planned daily loads.
export function projectSeries(lastBF, lastLI, futureLoads, bfDays = 42, liDays = 7) {
  let bf = lastBF || 0, li = lastLI || 0;
  return futureLoads.map((l) => {
    bf += (l - bf) / bfDays; li += (l - li) / liDays;
    return { baseFitness: round(bf, 1), loadImpact: round(li, 1), intensityTrend: bf > 0 ? Math.floor((li / bf) * 100) : null };
  });
}

export function validateWorkout(w) {
  const errs = [];
  if (!w || typeof w !== "object") return ["Workout missing"];
  if (!String(w.name || "").trim()) errs.push("Name is required");
  if (!Array.isArray(w.steps) || !w.steps.length) errs.push("Add at least one step");
  for (const s of w.steps || []) {
    if (s.kind === "repeat") {
      if (!(s.times >= 1 && s.times <= 50)) errs.push("Repeats must be 1-50");
      if (!s.steps?.length) errs.push("Interval needs steps");
      if (s.steps?.some((x) => x.kind === "repeat")) errs.push("Nested repeats are not supported");
    } else if (!STEP_LABEL[s.kind]) errs.push(`Unknown step ${s.kind}`);
    else if (s.dur?.type !== "open" && !(s.dur?.value > 0)) errs.push(`${STEP_LABEL[s.kind]} needs a duration or distance`);
  }
  return errs;
}
