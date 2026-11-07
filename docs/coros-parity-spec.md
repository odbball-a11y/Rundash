# COROS feature-parity spec

COROS is the functional specification; Kemp Fit is the implementation on Garmin
data (Garmin → intervals.icu → Netlify). We match screens, navigation,
interactions and documented metrics. Visual style is our own, and COROS
images/assets are not copied into this repo. Metrics we can only approximate
are labelled **est.**

**Data legend:** ✅ available · 🟡 estimated / needs checking · ❌ not available from a Venu Sq 2 via intervals.icu

---

## Confirmed formulas

| Metric | Definition | Evidence |
|---|---|---|
| Base Fitness | 42-day rolling average of daily training load | COROS help docs (per user research) |
| Load Impact | 7-day rolling average of daily training load | COROS help docs (per user research) |
| Intensity Trend | Load Impact ÷ Base Fitness, shown as % (rounded down) | App 4.0 screen: 140 / 123 = 113.8% → "113%" |
| HR zones (old app default) | 5 zones at 50 / 60 / 70 / 80 / 90 % of max HR | Long Run screen: 93‑110, 111‑128, 129‑147, 148‑165, >165 ⇒ max HR ≈ 185 |

| Intensity Trend (2nd check) | Training Hub dashboard: Load Impact 26 / Base Fitness 72 = 36.1% → "36%" | ✅ confirmed twice |
| Threshold HR zones (Training Hub) | 6 zones from LTHR: Recovery < 80% · Aerobic Endurance 80–90% · Aerobic Power 90–95% · Threshold 95–102% · Anaerobic Endurance 102–106% · Anaerobic Power > 106% | LTHR 161 → <129, 129‑145, 146‑153, 154‑164, 165‑171, >171 |
| Threshold pace zones | 6 zones from threshold pace (time per distance): Recovery > 136% · Aerobic Endurance 114–136% · Aerobic Power 106–114% · Threshold 98–106% · Anaerobic Endurance 90.5–98% · Anaerobic Power < 90.5% | TP 5'38"/mi → >7'40", 6'26"–7'40", 5'59"–6'25", 5'32"–5'58", 5'06"–5'31", <5'06" (±1 s rounding) |
| Running Fitness sub-scores | Endurance / Threshold / Speed / Sprint each tied to a pace band = Aerobic Endurance / Threshold / Anaerobic Endurance / Anaerobic Power zones | Dashboard card pace ranges match the pace-zone table exactly |
| Race predictor | 5k 16:37 · 10k 34:11 · HM 1:14:44 · M 2:33:34 → implied Riegel exponent ≈ 1.04–1.05 (not a single constant; COROS's model is proprietary) | Dashboard card. Ours: Riegel-style from Running Fitness / best efforts, labelled est. |



### Running Fitness (COROS article "Introducing Running Fitness", 09/2024)
- Overall score and four abilities, each on a **40–100** scale, calculated from the **last 6 weeks** of runs (rolling; moves slowly).
- Current app labels: **Base · Endurance · Tempo · Sprint** (older Training Hub screenshot: Endurance · Threshold · Speed · Sprint). Each shows a score and its training pace band.

| Ability | Distance focus | COROS evaluation criterion | Improve by training in | Our input |
|---|---|---|---|---|
| Base | > 30 km | Slowest pace of the Aerobic Power zone | Aerobic Endurance zone, 1–2 h continuous | ✅ from pace zones |
| Endurance | ~10 km | Threshold pace | Threshold zone, 15–30 min intervals | 🟡 detected threshold pace |
| Speed / Tempo | ~3 km | VO₂max | Anaerobic Endurance zone, 3–7 min intervals | 🟡 our VO₂max est. |
| Sprint | ~400 m | Fastest pace held for 30–60 s | Anaerobic Power zone, short sprints | ✅ best 30–60 s from pace streams |

- **Score mapping is not a plain pace → score table.** Published examples disagree with that: athlete B has faster bands than athlete A but lower Endurance/Tempo scores, and the Training Hub example scores 96 with ~6:30/mi paces. COROS likely grades by age/sex or another model. **Ours:** convert each criterion to a VDOT-style equivalent and map onto 40–100, labelled est.
- Running Fitness drives the **Race Predictor** and the **6 pace zones**.

**Scale note:** an "Optimized" athlete in the 4.0 promo shows Base Fitness 123, Load Impact 140.
Our current CTL (intervals load) for the user is ~13.5, so per-workout load needs calibrating to
COROS-like ranges. Real COROS values from a known week would let us calibrate exactly.

---

## Screens captured

### S1 · Today (App 4.0, phone) — source: COROS promo image
- Header: date ("Tuesday, Jul 15"), title **Today**, calendar icon, watch icon.
- Activity ring: steps (left), **kcal** (centre, large), active minutes (right) around a progress arc.
- **Today's Activity** card: route thumbnail, distance, duration, pace, location, sport icon → opens activity.
- **Training Status** card: status word (e.g. *Optimized*), explanation sentence, then Load Impact · Base Fitness · Intensity Trend.
- Bottom nav: **Progress · Activities · Explore · Profile**.

| Element | Data |
|---|---|
| Steps | ✅ wellness |
| kcal / active minutes | 🟡 check wellness / sum of activities |
| Today's activity + route | ✅ (route needs GPS stream) |
| Training status + 3 metrics | ✅ computed |
| Status words + rules | ❓ need the full list (Help Centre) |

### S2 · Daily activity / "Today" (older app, ~2020)
- Calendar icon (shows day number), title **Today**.
- Ring with active kcal vs goal (760 / 495 kcal).
- Cards, each with an intraday mini chart + total + goal, each with an ⓘ info panel:
  Active Energy (kcal, goal) · Exercise Time (h:min, goal) · Steps · Heart Rate (avg, min–max, intraday line) · Sleep (duration, stage timeline, start–end).
- Bottom nav (old): Data · Workouts · Training (shield) · Device.

| Element | Data |
|---|---|
| Daily totals (steps, sleep duration, resting HR) | ✅ |
| Goals | ✅ (our settings) |
| Intraday charts (hourly kcal/steps/HR) | ❌ intervals.icu stores daily wellness only |
| Sleep stage timeline | ❌ likely (duration + score only) — to verify |

### S3 · Data / fitness overview (older app)
- Latest activity header: route thumbnail, duration, pace, date, title.
- **Training Load** chart: daily load, ~7 days, with a status band label ("Low"), ⓘ.
- **Fitness Index** grid: Resting HR · VO₂max · LTHR · Threshold pace, ⓘ.
- **Fitness Level** gauge: single value (52.1) on a multi-colour scale, ⓘ.

| Element | Data |
|---|---|
| Training load chart | ✅ computed (calibration needed) |
| Resting HR | ✅ |
| VO₂max | 🟡 est. from pace + HR |
| LTHR / threshold pace | 🟡 detect from best efforts |
| Fitness Level | 🟡 equivalent score (COROS formula proprietary) |

### S4 · Activity detail (older app)
- Header: back, title (*Long Run*), date/time, **edit** and **share** icons.
- **Heart Rate** chart over time with Max / Avg, ⓘ.
- **Heart Rate Zone** table: zone name, bpm range, bar, %, time.
- **Training Effect**: Aerobic TE (3.1, "Productive") and Anaerobic TE (0.9, "Inefficient") dials, ⓘ.
- **Laps** table: Lap · Distance · Time · Avg pace; tap to highlight a lap (selected row in accent colour).

| Element | Data |
|---|---|
| HR chart over time | ✅ streams |
| Zone table | ✅ computed from streams + zone settings |
| Aerobic / Anaerobic TE | 🟡 Garmin computes TE on some watches; check whether Venu Sq 2 records it and whether intervals.icu passes it through. Else an est. equivalent. |
| Laps table | ✅ laps / auto 1 km splits |
| Edit / share | ✅ (title/notes edit; share = export/link) |

---

### S5 · Training Hub — Dashboard (web) — source: COROS "Welcome to the Training Hub" article
Layout: left icon rail (profile, athletes, athlete settings, avatar, notifications, menu); top tabs
**Dashboard · EvoLab Metrics · Activity List · Calendar**; card grid, each card with ⓘ.

| Card | Contents | Data |
|---|---|---|
| Running Fitness | Gauge score (96.4) + 4 bars: Endurance, Threshold, Speed, Sprint, each with pace band and score | 🟡 equivalent score |
| Training Status | Status word (*Decreasing*), explanation, Load Impact · Base Fitness · Intensity Trend | ✅ |
| Threshold Heart Rate Zones | LTHR · Max HR · Resting HR, 6-zone table | ✅ (LTHR detected or set) |
| Threshold Pace Zones | Threshold pace, 6-zone table | ✅ (TP detected or set) |
| Recovery | % recovered (100% "Full Recovery"), colour scale Poor → Excellent | 🟡 est. recovery timer from load + RHR/sleep |
| Overnight HRV | Range status, last-night avg, normal range, 7-day line with normal band | ❌ Venu Sq 2 has no HRV Status → show "needs HRV-capable watch"; offer RHR/sleep card |
| Weekly Activity | Metric dropdown (Distance…), total vs goal, completion rate, Mon–Sun bars | ✅ |
| Race Predictor | 5k / 10k / Half / Marathon: time + avg pace | 🟡 est. |
| Personal Running Record | Period dropdown (4 weeks…) + records table | ✅ best efforts |

### S6 · Training Hub — Activity detail (web)
- Header: sport icon, editable title, date/time; toolbar icons (export, etc.).
- **Main chart:** multi-metric overlay (Pace + Heart Rate shown), dual axes, **Custom chart** dropdown to pick metrics, **Time / Distance** x-axis toggle.
- **Overview strip** under the chart: drag to select/zoom a section (works without laps).
- **Laps table:** "Lap" dropdown (Lap / splits), columns Lap · Time · Distance · Elev Gain · Avg Pace · Avg HR · Avg Cadence · Effort Accuracy · Effort Pace · Max HR; rest rows greyed; **Best** markers; column chooser (sliders icon).
- **Right panel:** map with weather, **Summary** grid (Distance, Activity Time, Total Time, Avg Pace, Best mile, Avg HR, Avg Power, Avg Cadence, Elev Gain, Total Descent, Training Load, Calories, Effort Pace, Training Focus), then collapsible **Time in Zones · Comment · Perceived Exertion · Training Log**.

| Element | Data |
|---|---|
| Charts, zoom, laps, map, summary | ✅ streams + laps from intervals.icu |
| Avg Power | ❌ Venu Sq 2 has no running power (hide or "—") |
| Effort Pace / Effort Accuracy | 🟡 Effort Pace = grade/HR-adjusted pace (intervals GAP as base); Effort Accuracy = how close a lap was to its planned target → needs planned workouts |
| Weather | 🟡 intervals.icu has weather for activities — check |
| Training Focus | 🟡 classify by time in zones |
| Comment / RPE / Training log | ✅ our database |

### S7 · Training Hub — Calendar prediction chart
- Weekly **training load bars**; planned vs actual shown as split bars (*less than planned* = dark top, *more than planned* = bright top).
- **Orange = Intensity Trend**, **Green = Base Fitness**, as area + line.
- **Solid = past**, **dotted = predicted** from planned workouts; "This week" marker; month bands.
- ✅ fully computable once we store planned workouts with estimated load.

### S8 · Training Hub — Coach / team view (later module)
- Group list ("Add groups", All Members), athlete table with sortable columns (Weekly Training Load, Weekly Exercise Time, Weekly Exercise Distance, Threshold Pace, Base Fitness), metric chooser, pagination.

### Out of scope
- COROS watch management (storage, watch faces, custom activities, find device) — COROS-hardware only.

## Open questions
1. **Target version:** match the current app (4.0: Progress / Activities / Explore / Profile) and the current Training Hub web, not the 2020 layout. (Recommended.)
2. Full list of Training Status words and their rules.
3. Screens still needed: EvoLab Metrics tab, Activity List + filters, Calendar month/week + workout builder + plan library, app Explore / Profile, all ⓘ panels.
4. coros.com and static.coros.com are reachable from the build session; support.coros.com is not.
