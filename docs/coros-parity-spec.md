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

## Open questions
1. **Target version:** match the current app (4.0: Progress / Activities / Explore / Profile) and the current Training Hub web, not the 2020 layout. (Recommended.)
2. Full list of Training Status words and their rules.
3. Screens still needed: Activities list + filters, Explore, Profile/settings, Training Hub web (dashboard, EvoLab, calendar, plan library, workout builder), all ⓘ panels.
