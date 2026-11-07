# Runalyze Dashboard

A training analytics dashboard that automatically fetches all your data from [Runalyze](https://runalyze.com) and displays it in a web app hosted on GitHub Pages.

## Architecture

```
Runalyze API  ←──  GitHub Actions (daily cron + on-demand)
                         │
                         ▼
                   data/*.json  (committed to repo)
                         │
                         ▼
              GitHub Pages serves index.html + data/
                         │
                         ▼
               Browser loads JSON, renders dashboard
                         │
              [Refresh] → GitHub API → triggers workflow → new data committed
```

## Data Collected

| File | Source | Contents |
|------|--------|----------|
| `data/activities.json` | `/api/v1/activities` | All activities with full details |
| `data/hrv.json` | `/api/v1/metrics/hrv` | HRV (RMSSD) measurements |
| `data/sleep.json` | `/api/v1/metrics/sleep` | Sleep data |
| `data/resting_hr.json` | `/api/v1/metrics/heartrate/rest` | Resting heart rate |
| `data/metadata.json` | Generated | Timestamps and record counts |

## Setup

### Garmin

Connect Garmin to Runalyze once (Runalyze → Settings → Connections → Garmin).
New watch activities, sleep, HRV and resting HR then flow Garmin → Runalyze →
this dashboard automatically; no Garmin credentials are stored here.

### 1. GitHub secrets

**Settings → Secrets and variables → Actions → New repository secret**

| Secret | Used for |
|--------|----------|
| `RUNALYZE_USERNAME` | Runalyze login email (activities CSV export) |
| `RUNALYZE_PASSWORD` | Runalyze password (activities CSV export) |
| `RUNALYZE_TOKEN` | Personal API token from https://runalyze.com/settings/personal-api (health metrics read scope) |

Each source is optional and independent: if one fails, the previously saved
data for it is kept instead of being wiped.

### 2. Workflow permissions

**Settings → Actions → General → Workflow permissions → Read and write permissions**

### 3. Make sure the schedule is enabled

GitHub switches off scheduled workflows after 60 days without repo activity.
If the dashboard stops updating, open **Actions → Fetch Runalyze Data** and
click **Enable workflow**. While runs succeed, each data commit keeps it alive.

The workflow checks every 15 minutes (only new records are fetched, and it only commits when something changed) and can be run on demand
(**Actions → Fetch Runalyze Data → Run workflow**).

### 4. Hosting

Netlify (kempfit.netlify.app) or GitHub Pages deploy straight from `main`; each
data commit triggers a redeploy.

### 5. Refresh button (optional)

Create a fine-grained token at https://github.com/settings/tokens with access to
**only this repo** and **Actions: Read and write**. The first time you press
**Refresh Data**, the dashboard asks for it and stores it in that browser's
localStorage. **Never put the token in `index.html`**, because this repo is public.

## Live data via intervals.icu (recommended)

Garmin → intervals.icu → Netlify (checks every 5 min) → dashboard (refreshes every minute).
Gives runs, HRV, sleep, resting HR and fitness/fatigue/form. No GitHub Actions needed.

1. Free account at https://intervals.icu → **Settings → Connections → Garmin**.
2. **Settings → Developer Settings**: copy your Athlete ID (e.g. `i12345`) and API key.
3. Netlify → kempfit → **Site configuration → Environment variables**:
   `INTERVALS_ATHLETE_ID`, `INTERVALS_API_KEY`. The site must be linked to this repo.
4. **Deploys → Trigger deploy**, then open `https://kempfit.netlify.app/api/sync` once
   to import your history. After that it updates on its own.

Endpoints: `/api/data` (dashboard JSON), `/api/sync` (pull now, max once a minute).
The old Runalyze/GitHub Actions files in `data/` are only used as a fallback.

## Local Development

```bash
pip install -r requirements.txt
export RUNALYZE_TOKEN="your_token"

# Fetch data locally
python fetch_all_data.py

# Serve locally
python -m http.server 8000
# Open http://localhost:8000
```

## Customising

The dashboard is a single `index.html`. The data files are plain JSON. Extend with charts, CTL/ATL/TSB, sparklines, pace trends, etc.

## Rate Limits

Runalyze: 40 req/hr (Supporter) or 150/hr (Premium). The script includes delays and retries. Use `--skip-details` to skip individual activity detail calls if you hit limits.

## License

MIT
