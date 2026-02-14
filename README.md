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

### 1. Runalyze API Token

1. Go to [https://runalyze.com/settings/personal-api](https://runalyze.com/settings/personal-api)
2. Create a token with scopes: **activity read**, **health metrics read**
3. Note the token

### 2. GitHub Repository

1. Create a **private** repo on GitHub and push this code
2. Go to **Settings → Secrets and variables → Actions**
3. Add secret: `RUNALYZE_TOKEN` = your Runalyze token
4. Go to **Settings → Actions → General → Workflow permissions**
5. Select **Read and write permissions** and save

### 3. Enable GitHub Pages

1. Go to **Settings → Pages**
2. Source: **Deploy from a branch**
3. Branch: **main**, folder: **/ (root)**
4. Save — your dashboard will be at `https://YOUR_USERNAME.github.io/runalyze-dashboard/`

### 4. GitHub PAT (for the refresh button)

1. Go to [https://github.com/settings/tokens](https://github.com/settings/tokens)
2. Create a **Fine-grained personal access token**:
   - Repository access: **Only select repositories** → pick this repo
   - Permissions: **Actions** → Read and write
3. Copy the token
4. Open `index.html` and update the `GITHUB_CONFIG` section near the bottom:
   ```js
   const GITHUB_CONFIG = {
     owner: 'YOUR_GITHUB_USERNAME',
     repo: 'runalyze-dashboard',
     pat: 'YOUR_GITHUB_PAT',
     ...
   };
   ```

> **Security note:** Since the PAT is in client-side JS, keep the repo **private**. The fine-grained token only has Actions permission on this one repo, so exposure risk is minimal.

### 5. First Data Fetch

Go to **Actions** tab → **Fetch Runalyze Data** → **Run workflow**

Once complete, your dashboard will have data.

### 6. Done!

- Data refreshes daily at 6am UTC automatically
- Click **Refresh Data** in the dashboard for on-demand updates
- Dashboard loads instantly from pre-fetched JSON (no API calls in the browser)

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
