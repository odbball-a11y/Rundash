# Recovery Time module — research notes

Goal: an *estimated training recovery time* (not a medical measurement), personalised to the athlete,
alongside the COROS-style Recovery % (which by design ignores sleep/HRV/stress).

## Sources

| Source | What it gives us |
|---|---|
| Firstbeat, *Indirect EPOC Prediction Method Based on Heart Rate Measurement* (2005, upd. 2012) — firstbeat.com/wp-content/uploads/2015/10/white_paper_epoc.pdf | EPOC(t) = f(EPOC(t−1), %VO₂max(t), Δt), recursive, HR-only. Built from a meta-analysis (48 settings, 158 subjects, 2–180 min, 18–108% VO₂max). Validation r² 0.79 vs measured EPOC, MAE ≈ 14 ml/kg. Accumulation curves by intensity (Fig. 5). Typical values (Table 4). |
| Firstbeat, *EPOC Based Training Effect Assessment* (2005, upd. 2012) — firstbeat.com/wp-content/uploads/2015/10/white_paper_training_effect.pdf | TE 1–5 = peak EPOC relative to **activity class** 0–10 (Fig. 2); activity class from weekly training time (Table 2); fitter/more active athletes need more EPOC for the same TE. |
| COROS, *Your COROS Recovery Metrics Explained* | 64% ↔ 33 h till full recovery (used for the COROS-style %); inputs Base Fitness, Training Load, remaining energy; hourly. |
| Fellrnr, *Firstbeat's Training Effect, EPOC & Recovery Time* | Independent confirmation that **no recovery-time formula has been published**; recovery time reflects cumulative fatigue across sessions. |

## Facts extracted

**EPOC accumulation (Fig. 5, read from chart, ml/kg):**

| %VO₂max | 15 min | 30 min | 60 min |
|---|---|---|---|
| ≤ 40% | ~3 | ~5 | ~5 (plateaus) |
| 50% | ~10 | ~18 | ~25 |
| 60% | ~25 | ~40 | ~62 |
| 70% | ~50 | ~85 | ~135 |
| 80% | ~85 | ~155 | (≥ 250 by ~50 min) |
| 90% | ~150 | ≥ 250 | — |

Below ~40% VO₂max EPOC stops accumulating; above ~50% it accumulates continuously, steeper with intensity.
Rest or low intensity during a session makes EPOC fall (intervals → lower peak than continuous at the same intensity).

**Typical EPOC (Table 4):** 60 min easy run (55–65% VO₂max) 40–90 · 10 km race 120–260 · marathon 120–650 ·
brisk 1 h walk 10–25.

**Training Effect from peak EPOC (Fig. 2, approx. thresholds, ml/kg):**

| Activity class | TE 1 | TE 2 | TE 3 | TE 4 | TE 5 |
|---|---|---|---|---|---|
| 0 | ~1 | ~5 | ~10 | ~18 | ~25 |
| 5 | ~6 | ~22 | ~50 | ~100 | ~160 |
| 10 | ~12 | ~40 | ~95 | ~190 | ~300 |

**Activity class (Table 2):** 1–3 h/week of hard exercise = 6; 3–5 h = 7; 5–7 h = 7.5; 7–9 h = 8.
This athlete (~3 runs/week, ~1–1.5 h) ≈ class 6.

**Intensity input:** %VO₂max from heart rate. Without HRV/respiration (Venu Sq 2 via intervals.icu) use the
standard %HRR ≈ %VO₂R relationship (Swain): %VO₂max ≈ (%HRR × (VO₂max − 3.5) + 3.5) / VO₂max.

## Not published anywhere

- Firstbeat's exact EPOC equations (only the form and charts).
- Any recovery-time formula (Firstbeat, Garmin or COROS).

## Proposed design (Version 1)

1. **EPOC engine:** recursive per-second model fitted to the Fig. 5 curves; tests against Table 4 ranges.
2. **Training Effect:** peak EPOC vs activity class (Fig. 2), replacing the current guess.
3. **Recovery time:** base hours from peak EPOC relative to the athlete's typical EPOC (est.), cumulative
   across sessions, capped at 96 h; then **modifiers** with stated sizes:
   - last night's sleep vs personal 14-day baseline (duration + score);
   - resting HR vs 30-day baseline (bpm above normal);
   - post-run "how do you feel?" (1–5).
   Each modifier is shown as "+6 h" / "−3 h" so the user sees why.
4. Labelled "estimated training recovery time — not a medical measurement".

**Version 2 (personal calibration):** after hard sessions, observe next-day RHR elevation and the next run's
efficiency (pace at a given HR) to fit the athlete's personal recovery rate.

**Version 3:** small statistical model updated from Version 2 outcomes; true ML only with far more data.
