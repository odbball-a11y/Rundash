# Kemp Fit × COROS — research deliverables

Response to the *COROS App 4.0 Reverse Engineering Research Pack* (7 Nov 2026).
Evidence log with screenshot-by-screenshot notes: [`coros-parity-spec.md`](coros-parity-spec.md).

**Ground rules**

- COROS is the functional reference. We match information architecture, screen hierarchy,
  navigation, workflows, metric definitions and interaction patterns.
- Visual style: dark, high-contrast, card-based, functional accent colours (as the pack's
  design observations describe). We do **not** copy COROS logos, icons, illustrations,
  fonts, screenshots or other assets into the repo, and the app is never branded as COROS.
- Every metric is labelled **exact** (public formula reproduced), **est.** (our model of
  undocumented behaviour) or **n/a** (source data does not exist). No fabricated values.

**Primary sources used** (fetched 7 Nov 2026 via the public Help Centre API and coros.com):
Training Hub Manual · Training Hub Athlete Tutorial · Coaches Tutorial · COROS Fitness Metrics
Explained · EvoLab · Progress Page · Daily Features · Understanding the Recovery Widget ·
Understanding Running Efficiency · Understanding Your Running Fitness Score · Running VO2 Max ·
How to Receive and Update Running Fitness Metrics · Personal Records · Effort Accuracy ·
Activities Page & Activity Summary · Create Custom Workouts · Creating and Using Training Plans ·
Personalized Marathon Plans · Explore Page · Heart Rate Recovery · coros.com stories
(Training Load, Base Fitness, Running Fitness, Effort Pace, Welcome to the Training Hub).

---

## 1. Repository architecture summary (current state)

| Layer | Today |
|---|---|
| Hosting | Netlify site `kempfit`, deploys from `odbball-a11y/Rundash` `main` |
| Data source | Garmin → intervals.icu (official Garmin link) → Netlify |
| Ingestion | `netlify/functions/intervals-sync.mjs` scheduled every 5 min; incremental 14-day window, full history at least hourly |
| Storage | Netlify Blobs store `intervals`: `activities` (slim summary per activity), `wellness` (daily rows), `meta` |
| API | `GET /api/data` (dashboard JSON), `GET /api/sync` (pull now, rate-limited) |
| Front end | `index.html` — single-file fitness-ring dashboard (Chart.js), metrics computed in the browser; `details.html` — activity table + health lists |
| Legacy | `fetch_all_data.py` + `.github/workflows/fetch_data.yml` (Runalyze → `data/*.json`) — fallback only; GitHub Actions runs are stuck |
| Secrets | `INTERVALS_ATHLETE_ID`, `INTERVALS_API_KEY` in Netlify env; none in code |

**Limits for the COROS target:** no router or component system; metrics live in page JS
(untestable, unversioned); only activity *summaries* are stored (no streams, laps, GPS);
no database for plans, workouts, labels, settings, notes; no append-only history of
daily metric snapshots.

---

## 2. Screen-by-screen parity matrix

Status: ✅ built · 🟡 partial · ⬜ not started. Data: ✅ available · 🟡 needs work / est. · ❌ not in Garmin source.
Priority follows the pack (P0 → P2).

### 2.1 App navigation (phone) — Progress · Activities · Explore · Profile

| # | Screen / feature | COROS behaviour (source) | Kemp Fit now | Data | Pri | Acceptance test |
|---|---|---|---|---|---|---|
| A1 | Bottom navigation | 4 persistent tabs (Progress Page; pack §2) | ⬜ | ✅ | P0 | Each tab reachable from every screen in one tap |
| A2 | Progress / Today | Customisable cards; tap any card → detail with history (Progress Page) | 🟡 single fixed page | ✅ | P0 | Cards reorder/hide, persist; each opens a detail page |
| A3 | Daily activity card | Steps, active kcal, exercise time vs goals (Daily Features) | ⬜ | 🟡 steps ✅; kcal/exercise time from activities | P0 | Values match intervals.icu day totals |
| A4 | Training Calendar (in Progress) | Planned + completed, accuracy score on completed planned workouts (Progress Page) | ⬜ | ✅ | P0 | Score = (quality+quantity)/2 reproduces COROS worked example (80, 90 → 85) |
| A5 | Training Load card | This week vs recommended range (Progress Page) | ⬜ | ✅ | P0 | Week = Mon–Sun sum; range shown |
| A6 | Training Status card + detail | Status label, Base Fitness, Load Impact, Intensity Trend; history charts with range selector | 🟡 values only | ✅ | P0 | Bands: ≥150 Excessive, 100–149 Optimized, 80–99 Maintaining, 50–79 Resuming/Performance, 0–49 Decreasing |
| A7 | Recovery card + detail | % + state + hours to full (max 96 h) | ⬜ | ✅ est. | P0 | States 0–19/20–69/70–89/90–100; decays faster when low |
| A8 | Running Fitness card + detail | Score + Base/Endurance/Speed(Tempo)/Sprint with pace bands; VO₂max under Base Metrics | 🟡 composite score only | 🟡 | P0 | Four sub-scores 40–100, pace band per ability, 6-week window |
| A9 | Race Predictor | 5k/10k/HM/M time + pace; independent per distance; trend chart (4.5) | ⬜ | 🟡 est. | P0 | Each distance driven by its own ability input |
| A10 | Sleep card + detail | Duration, stages, score, trends | ⬜ | 🟡 duration ✅, score ✅, stages ❓ | P1 | Shows "n/a" for stages if absent |
| A11 | Overnight HRV card | Range, last-night avg, normal band | ⬜ | ❌ Venu Sq 2 | P1 | Card shows clear "not measured by your watch" |
| A12 | Resting HR card | Trend | 🟡 value only | ✅ | P0 | 12-week chart |
| A13 | Activities list | Feed; All Activities type filter; Activity Tags (notes/RPE, media, group); Recently Deleted; Statistics menu | 🟡 table on details.html | ✅ | P0 | Filter by type/date/keyword; stats by sport incl. HR-zone distribution |
| A14 | Activity detail | Map, charts (tap to expand, overlay, scrub), laps (manual/auto, 1 km/mi view, active-only for structured), edit (name, distance, max elev, type, disable EvoLab), crop, delete, share, export | ⬜ | 🟡 needs streams + laps | P0 | All sections render from real streams; missing sensors show "n/a" |
| A15 | Personal Records | Longest run, most elevation, 1 km, 1 mi, 3 k, 5 k, 10 k, HM, M; ignore a PR → next best | ⬜ | ✅ best efforts | P1 | Ignore recalculates from history |
| A16 | Explore | Route library, create route (snap/manual), waypoints, undo/erase, back-to-start/out-and-back/reverse, 3D/elevation, import GPX, filter | ⬜ | 🟡 routing service needed | P2 | Create + save + export GPX |
| A17 | Profile → Workout Library | Mine / Official toggle; filters (type, training type, level); create | ⬜ | ✅ (our DB) | P1 | Create, edit, delete, send to Garmin via intervals.icu |
| A18 | Profile → Training Plan Library | Mine / Official; create weekly plan, drag, copy day/week, start date, start mid-plan (4.4), exit | ⬜ | ✅ | P1 | Start plan → workouts on calendar and on watch |
| A19 | Personalized Marathon Plan | Inputs: 10 k + marathon times, last-month distance, race date, target time slider, intensity → phased plan | ⬜ | ✅ est. | P2 | Generates Base → Progress/Peak → Race phases |
| A20 | Profile → Settings | HR zone type (Max HR / HRR / LTHR) + custom %; pace zones (TP + %); max/rest HR; units; personal info; privacy; 3rd-party | ⬜ | ✅ | P0 | Changing zones recalculates load and zone charts |

### 2.2 Training Hub (web) — Dashboard · EvoLab Metrics · Activity List · Calendar

| # | Screen / feature | COROS behaviour (Manual, Athlete Tutorial) | Now | Data | Pri | Acceptance test |
|---|---|---|---|---|---|---|
| H1 | Dashboard customisation | Add/remove/reorder charts | ⬜ | ✅ | P0 | Layout persists per user |
| H2 | Marathon Level / Running Fitness | Score vs similar age/sex | 🟡 | 🟡 est. | P0 | — |
| H3 | 7-Day Fatigue Trend | Daily load vs 7-day average | ⬜ | ✅ | P0 | Rises in build week, falls in recovery |
| H4 | 7-Day Running Performance | Efficiency per run, 80–120% | ⬜ | ✅ est. | P1 | Only runs ≥7 min, intervals ≥3 min, HR 65–95% max |
| H5 | Fatigue Status | Snapshot | ⬜ | ✅ | P0 | — |
| H6 | 7-Day Workout | Planned vs done | ⬜ | ✅ | P1 | — |
| H7 | Future Plans | Upcoming sessions | ⬜ | ✅ | P1 | — |
| H8 | Recent Workouts | Distance, avg speed, load → opens detail | 🟡 | ✅ | P0 | — |
| H9 | Personal Running Record | Period dropdown | ⬜ | ✅ | P1 | — |
| H10 | Race Predictor | as A9 | ⬜ | 🟡 | P0 | — |
| H11 | Threshold HR Zones | LTHR, max, rest + 6-zone table | ⬜ | ✅ | P0 | Default % reproduce COROS example (LTHR 161 → <129 … >171) |
| H12 | Threshold Pace Zones | TP + 6-zone table | ⬜ | ✅ | P0 | Default % reproduce example (TP 5:38/mi → >7:40 … <5:06) |
| H13 | Recovery, Overnight HRV, Weekly Activity | as A7/A11; weekly metric dropdown + goal + completion rate | ⬜ | ✅/❌/✅ | P0 | — |
| E1 | EvoLab: Training Load Management | 12-week Base Fitness, Load Impact, Fatigue | ⬜ | ✅ | P0 | — |
| E2 | EvoLab: Training Summary | 4-week distance, time, load, frequency, avg HR | ⬜ | ✅ | P0 | Weekly averages per **day**, not per workout |
| E3 | EvoLab: Workout Data | 12-week bars by load/distance/time | ⬜ | ✅ | P0 | — |
| E4 | EvoLab: Marathon Level & Running Performance | 12-week lines | ⬜ | 🟡 | P1 | — |
| E5 | EvoLab: 4-Week Intensity Distribution | Zone distribution in 4-week blocks | ⬜ | ✅ | P1 | — |
| E6 | EvoLab: VO₂max | 12-week line | 🟡 | 🟡 est. | P1 | — |
| E7 | EvoLab: 7-Day Total TL | Rolling 7-day total over 4 weeks | ⬜ | ✅ | P0 | — |
| E8 | EvoLab: Resting HR | 12-week line | ⬜ | ✅ | P0 | — |
| E9 | EvoLab: Pace Zone Distribution | 4 weeks, by load/distance/time | ⬜ | ✅ streams | P1 | — |
| E10 | EvoLab: Threshold HR & Pace | 12-week lines | ⬜ | 🟡 | P1 | — |
| E11 | EvoLab chart customisation; 4–24 week range | | ⬜ | ✅ | P1 | — |
| L1 | Workout List | Type, date range, keyword search; customise columns (ii); Import (.fit/.zip) | 🟡 | ✅ | P0 | — |
| L2 | Workout analysis | Up to 4 overlaid metrics; zoom by selection, "entire" to reset; custom lap columns; time in zones; comments; RPE; training log; map + weather; summary grid | ⬜ | 🟡 streams | P0 | Overlay of 4 metrics with independent axes; zoom changes lap stats |
| C1 | Calendar views | Weekly calendar; annual chart (6 months past + 6 months future) by load/time/distance | ⬜ | ✅ | P0 | — |
| C2 | Add Training / Workout / Event | "+" on day → menu | ⬜ | ✅ | P0 | — |
| C3 | Labels | Rest, test, other | ⬜ | ✅ | P1 | — |
| C4 | Training phases per week | Preparation, Base, Progress, Peak, Race, Transition | ⬜ | ✅ | P1 | — |
| C5 | Workout & plan libraries in sidebar | Drag onto day; "View plan"/exit | ⬜ | ✅ | P1 | — |
| C6 | Predictive modelling | Planned workouts → projected Base Fitness, Load Impact, fatigue (dotted) | ⬜ | ✅ | P1 | Projection uses estimated load of planned sessions |
| C7 | Planned vs actual weekly bars | Less / more than planned rendering | ⬜ | ✅ | P1 | — |
| T1 | Team / coach (later) | Teams, sort by plan completion / fatigue / marathon level, member panels, comments, plan to whole team | ⬜ | ✅ | P2 | — |

### 2.3 Out of scope
COROS watch management (storage, watch faces, custom activity modes, find device, toolbox,
widgets layout), COROS-hardware-only metrics, other sports until running is complete.

---

## 3. Missing data fields in the Garmin pipeline

Current pipeline keeps only an activity summary and daily wellness rows. Needed:

| Field / dataset | Needed for | Source | Status |
|---|---|---|---|
| Activity **streams**: time, distance, HR, pace/velocity, cadence, altitude, lat/lng, grade | Charts, zoom, zones, load, efficiency, sprint ability, maps | intervals.icu activity streams | ⬜ add (store per activity in Blobs) |
| **Laps / intervals** with start/end index | Lap table, structured-workout phases, effort accuracy | intervals.icu activity intervals/laps | ⬜ add |
| Best efforts (1 km … M, 30–60 s) | PRs, Sprint ability, race predictor | compute from streams (or intervals.icu) | ⬜ |
| Total ascent/descent, calories, max HR, moving vs elapsed time | Summary grid | intervals.icu activity | 🟡 partly stored |
| Weather (temp, wind) | Activity header | intervals.icu (if present) | ❓ verify |
| Device name, sport sub-type (Run / Trail / Treadmill / Track) | Filters, which runs count for EvoLab | intervals.icu activity | ⬜ |
| Running dynamics (stride, GCT, VO) | Activity detail | ❌ Venu Sq 2 has none | n/a |
| Running power | Summary, zones | ❌ | n/a |
| Garmin Training Effect (aerobic/anaerobic) | Compare with our TE | ❓ verify in intervals.icu fields | verify |
| Wellness: steps, resting HR, sleep secs, sleep score, SpO₂, weight | Progress cards | intervals.icu wellness | ✅ (steps/sleep score to verify) |
| Sleep stages timeline | Sleep detail | ❓ likely not exposed | verify |
| Overnight HRV | HRV card | ❌ device | n/a |
| Body Battery / stress | Readiness context | ❓ | verify |
| User settings: max HR, rest HR, LTHR, TP, zone type/% , goals, units | All metrics | our DB | ⬜ |
| Plans, workouts, events, labels, phases, notes, RPE, comments, ignored PRs, EvoLab-disabled flag | Calendar, libraries | our DB | ⬜ |
| Daily metric snapshots (append-only) | History charts, audit | our DB | ⬜ |

First step of the build: a read-only **field inventory** endpoint that lists which intervals.icu
fields actually arrive for this athlete (names and counts only, no values), to settle every ❓.

---

## 4. Analytics: exact vs approximated

| Metric | Public definition | Our implementation | Label |
|---|---|---|---|
| Intensity Trend | Load Impact ÷ Base Fitness | Same; floor to whole % | **exact** (verified on two COROS screenshots: 140/123→113%, 26/72→36%) |
| Training Status bands | ≥150 Excessive · 100–149 Optimized · 80–99 Maintaining · 50–79 Resuming/Performance · 0–49 Decreasing | Same; Resuming vs Performance by Base Fitness direction | **exact** bands; Resuming/Performance split est. |
| Weekly Training Load | Sum Mon–Sun | Same | **exact** |
| Weekly averages | Per day, not per workout | Same | **exact** |
| 7-Day Total TL | Rolling 7-day total | Same | **exact** |
| Base Fitness | Weighted 42-day rolling average of TL | EWMA, τ = 42 d | **est.** (weights unpublished) |
| Load Impact | 7-day equivalent | EWMA, τ = 7 d | **est.** |
| Training Load per activity | TRIMP; HR when slower than threshold pace, Effort Pace when faster; trail = Effort Pace | Banister TRIMP on HR stream with personal rest/max HR; scale constant calibrated so COROS examples land near 99 / 199 / 295 | **est.** |
| Recovery % and timer | Base Fitness + TL + remaining energy; max 96 h; faster rise when low; bands 0–19/20–69/70–89/90–100 (also 0–29/30–89/90–100 for timer advice) | Exponential recovery toward 100% with time constant from Base Fitness; drop proportional to TL ÷ Base Fitness | **est.** |
| HR zones (LTHR) | 6 zones | <80 / 80–90 / 90–95 / 95–102 / 102–106 / >106 % LTHR | **exact** defaults (derived from COROS example) |
| Pace zones | 6 zones from threshold pace | >136 / 114–136 / 106–114 / 98–106 / 90.5–98 / <90.5 % TP | **exact** defaults (derived) |
| Max-HR and HRR zone systems | Selectable, custom % | Standard % of max / Karvonen | **exact** formulas, defaults est. |
| Effort Accuracy | Quality (time in target) + quantity (completion), averaged | Same; reproduces 80/90→85 | **exact** for documented case |
| Running Efficiency (Running Performance) | Pace vs HR compared to last 42 days; 80–120%; bands; eligibility rules | Speed÷HR (efficiency factor) of run ÷ 42-day baseline; same rules and bands | **est.** model, **exact** bands/rules |
| Training Effect (aero/anaero) | From load per minute split at LT; 0–5 scale + 6 labels | Load/min above vs below LTHR mapped to 0–5 | **est.** (labels exact) |
| Training Focus | Load per threshold pace zone → Easy/Base/Tempo/Threshold/VO₂max/Anaerobic | Largest-load zone with tie rules | **est.** |
| Running Fitness + 4 abilities | 40–100; criteria: Base = slowest Aerobic Power pace, Endurance = TP, Speed = VO₂max, Sprint = best 30–60 s; 6 weeks | VDOT-style equivalence per criterion → 40–100 | **est.** (COROS examples show non-monotonic pace→score) |
| VO₂max | From HR + pace of outdoor runs; stable | Daniels oxygen cost ÷ %VO₂max from %HRmax, smoothed over 6 weeks | **est.** |
| Threshold pace / LTHR detection | From qualifying 25-min runs | Best sustained 20–60 min effort model | **est.** |
| Race Predictor | 6 weeks; distances independent | 5k/10k from Speed+Endurance, HM from Endurance, M from Endurance+Base and long-run volume | **est.** |
| EvoLab eligibility | 25-min continuous outdoor run ≥ 65% HRR (+rest); updates if one every 90 days | Same rules | **exact** |
| Personal records | Fastest continuous segment incl. pauses | Same from streams | **exact** |
| Recommended weekly TL range | Based on fitness + 3:1 cycle | Base Fitness × 7 × band, 4th week reduced | **est.** |

Every value carries `algorithmVersion` and inputs so it can be traced and recalculated.

---

## 5. Prioritised implementation plan

0. **Field inventory + data model** — inventory endpoint; add streams + laps ingestion; database
   (Supabase/Postgres) for settings, plans, workouts, events, labels, notes, snapshots.
1. **Metric engine** — standalone, unit-tested module with versioned algorithms (section 4);
   calibration fixtures from COROS worked examples; side-by-side with intervals.icu load/CTL.
2. **App shell** — installable responsive web app (React + router), bottom nav on phone,
   top tabs + left rail on desktop, component library (section 6). All screens stubbed.
3. **Progress dashboard** (A2–A12) with card → detail navigation.
4. **Training Status / load analytics** (A6, E1, E3, E7, H3, H5) and **Recovery** (A7).
5. **Activities** list + full analysis (A13, A14, L1, L2), PRs (A15).
6. **Calendar** + workout builder + libraries + phases/labels + predictions (A4, C1–C7, A17, A18);
   push structured workouts to Garmin through intervals.icu.
7. **Running Fitness, race predictor, efficiency, VO₂max, threshold** (A8, A9, H4, E4, E6, E10).
8. **Settings** (A20, H11, H12), import/export.
9. Explore (A16), marathon plan generator (A19), team module (T1).
10. Parity review against the evidence log and acceptance tests; phone + desktop.

Exit criteria per phase = the acceptance tests in section 2, plus the pack's section 11.

---

## 6. Visual component inventory

| Component | Used by | Notes |
|---|---|---|
| App shell: bottom tab bar (phone), top tabs + left icon rail (desktop) | all | 4 destinations |
| Page header: back, title, date, actions (edit, share, ⋯) | details | — |
| Metric card (title, ⓘ, headline number, unit, sub-label, chevron) | Progress, Dashboard | tap → detail |
| Info panel / tooltip (ⓘ) with definition + source + est. label | every metric | mandatory |
| Ring / arc gauge (daily activity, Running Fitness, Recovery) | A3, A7, A8 | — |
| Status badge (Excessive…Decreasing; Fresh…Exhausted) | A6, A7 | colour by band |
| Segmented colour scale with marker (Recovery, HRV normal range) | A7, A11 | — |
| Ability bars with score + pace band | A8 | 4 rows |
| Zone table (name, colour dot, range) and zone distribution bars (%, time) | H11, H12, L2 | 6 zones |
| Time-series chart: multi-series, dual axis, range selector (7d/4w/12w/6m/1y), dotted projection | E1, C6 | — |
| Bar chart: weekly load with planned vs actual split | E3, C7 | — |
| Activity chart: up to 4 overlaid metrics, time/distance x-axis, scrubber, drag-to-zoom, overview strip | L2 | — |
| Map: route, start/end, pace/HR colouring, layers | A14 | — |
| Lap table: selectable rows, Best marker, rest rows dimmed, column chooser, lap/split toggle | A14, L2 | — |
| Activity list row/card (sport icon, title, date, distance, time, pace, load) | A13, H8 | — |
| Filter bar: type, date range, keyword, tags | A13, L1 | — |
| Calendar: week rows with weekly summary + phase, month view, day cell with "+" menu, drag-and-drop | C1–C5 | — |
| Workout block strip (width = volume, height = intensity, fill = completed) | A4, A17 | per Effort Accuracy doc |
| Workout builder: phase list (Warm Up, Training, Rest, Cool Down, Interval), repeats, target + intensity pickers | A17 | run first |
| Form controls: dropdown, segmented toggle, slider, stepper | settings | — |
| Empty / n/a state ("not measured by your watch") | all | never blank |
| Toast, confirm dialog, loading skeleton | all | — |

---

## Assumptions and open items

1. "Marathon Level" was replaced by Running Fitness in the app (Progress Page); Training Hub
   docs still name it. We show Running Fitness and treat Marathon Level as the same card.
2. Ability labels differ by version: Endurance/Threshold/Speed/Sprint (Training Hub docs) vs
   Base/Endurance/Tempo/Sprint (2024 article image). We use the current app's labels and note both.
3. COROS's official MCP (`mcp.coros.com`) needs a COROS account and device data; useful only
   for validation if a COROS account with overlapping activities exists.
4. Training Load calibration: COROS examples (50–60 min Z1–2 → 99; Z3–4 → 199; >2 h Z2 → 295)
   are the calibration targets until real paired data exists.
