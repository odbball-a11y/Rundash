#!/usr/bin/env python3
"""
Runalyze Full Data Fetcher
==========================
Fetches ALL data from Runalyze using two methods:

1. ACTIVITIES: Web scraping via internal CSV export endpoint
   (requires username + password, exports all activities as CSV)

2. HEALTH METRICS: Personal API for HRV, sleep, resting HR
   (requires API token with read scopes)

Environment variables (or .env file):
  RUNALYZE_USERNAME   - Your Runalyze login email
  RUNALYZE_PASSWORD   - Your Runalyze login password
  RUNALYZE_TOKEN      - Personal API token (for health metrics)
"""

import os
import sys
import json
import csv
import time
import io
from datetime import datetime, timezone
from pathlib import Path

try:
    import requests
    from requests import Session
except ImportError:
    print("Error: 'requests' required. Install with: pip install requests")
    sys.exit(1)

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("Error: 'beautifulsoup4' required. Install with: pip install beautifulsoup4")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BASE_URL = "https://runalyze.com"
API_BASE = f"{BASE_URL}/api/v1"
ACTIVITIES_CSV_URL = f"{BASE_URL}/_internal/data/activities/all"
LOGIN_URL = f"{BASE_URL}/login"
OUTPUT_DIR = Path("data")
RATE_LIMIT_DELAY = 1.5
MAX_RETRIES = 3
RETRY_WAIT = 60
# Health metrics: after the first full download, only the newest pages are
# fetched and merged in, to stay well inside Runalyze's API rate limit.
INCREMENTAL_PAGES = int(os.environ.get("RUNALYZE_INCREMENTAL_PAGES", "1"))
FULL_REFRESH = os.environ.get("FULL_REFRESH", "").lower() in ("1", "true", "yes")


# ---------------------------------------------------------------------------
# Credential loading
# ---------------------------------------------------------------------------
def load_env():
    """Load credentials from environment or .env file."""
    env_path = Path(".env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                if key not in os.environ:
                    os.environ[key] = val


def get_credentials():
    """Get Runalyze login credentials (optional, needed for activities)."""
    username = os.environ.get("RUNALYZE_USERNAME")
    password = os.environ.get("RUNALYZE_PASSWORD")
    if not username or not password:
        return None, None
    return username, password


def load_existing(filename: str):
    """Load the previously saved JSON file, if any."""
    filepath = OUTPUT_DIR / filename
    try:
        with open(filepath, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return []


def get_api_token():
    """Get API token (optional, for health metrics)."""
    return os.environ.get("RUNALYZE_TOKEN")


# ---------------------------------------------------------------------------
# Activities via web scraping
# ---------------------------------------------------------------------------
def fetch_activities_csv(username: str, password: str) -> list:
    """
    Log into Runalyze and download all activities as CSV.
    Returns a list of dicts (one per activity).
    """
    session = Session()

    # Step 1: Get login page and extract CSRF token
    print("  Logging in to Runalyze...")
    login_page = session.get(LOGIN_URL)
    login_page.raise_for_status()

    soup = BeautifulSoup(login_page.text, "html.parser")
    csrf_input = soup.find("input", {"name": "_csrf_token"})

    if not csrf_input:
        raise RuntimeError("Could not find CSRF token on login page.")

    csrf_token = csrf_input["value"]

    # Step 2: POST login
    login_data = {
        "_username": username,
        "_password": password,
        "_remember_me": "on",
        "_csrf_token": csrf_token,
    }

    login_resp = session.post(LOGIN_URL, data=login_data, allow_redirects=True)

    # Check if login succeeded (redirects to dashboard, not back to login)
    if "/login" in login_resp.url:
        raise RuntimeError("Login failed. Check RUNALYZE_USERNAME / RUNALYZE_PASSWORD.")

    print("  Login successful!")

    # Step 3: Download activities CSV
    print("  Downloading activities CSV...")
    csv_resp = session.get(ACTIVITIES_CSV_URL)
    csv_resp.raise_for_status()

    # Parse CSV
    content = csv_resp.text
    if "<html" in content[:500].lower():
        raise RuntimeError("Expected CSV but got an HTML page (session not logged in?).")
    try:
        dialect = csv.Sniffer().sniff(content[:4096], delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    reader = csv.DictReader(io.StringIO(content), dialect=dialect)
    activities = list(reader)

    print(f"  Downloaded {len(activities)} activities.")
    return activities


# ---------------------------------------------------------------------------
# Health metrics via API
# ---------------------------------------------------------------------------
def api_get(url: str, token: str, params: dict = None):
    """Make an authenticated API GET request with retry logic."""
    headers = {"token": token}

    for attempt in range(MAX_RETRIES):
        try:
            response = requests.get(url, headers=headers, params=params, timeout=30)

            if response.status_code == 429:
                print(f"    Rate limited. Waiting {RETRY_WAIT}s...")
                time.sleep(RETRY_WAIT)
                continue

            response.raise_for_status()
            return response.json()

        except requests.exceptions.Timeout:
            print(f"    Timeout. Retrying... ({attempt + 1})")
            time.sleep(5)
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                return []
            raise

    return []


def fetch_paginated(endpoint_url: str, token: str, label: str, max_pages: int = None) -> list:
    """Fetch pages from a paginated API endpoint (all pages unless max_pages)."""
    all_items = []
    page = 1

    while max_pages is None or page <= max_pages:
        print(f"  [{label}] Page {page}...", end=" ", flush=True)

        data = api_get(endpoint_url, token, params={"page": page})

        if isinstance(data, dict):
            items = data.get("data", data.get("hydra:member", []))
        elif isinstance(data, list):
            items = data
        else:
            items = []

        if not items:
            print("done.")
            break

        print(f"{len(items)} records.")
        all_items.extend(items)
        page += 1
        time.sleep(RATE_LIMIT_DELAY)

    return all_items


def merge_by_id(new_items: list, old_items: list) -> list:
    """Merge records by id (new wins), newest first."""
    merged = {}
    for item in list(old_items) + list(new_items):
        key = item.get("id") if isinstance(item, dict) else None
        if key is None:
            key = json.dumps(item, sort_keys=True, default=str)
        merged[key] = item
    def sort_key(item):
        if not isinstance(item, dict):
            return ""
        return str(item.get("date_time") or item.get("date") or item.get("created_at") or "")
    return sorted(merged.values(), key=sort_key, reverse=True)


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------
def save_json(data, filename: str):
    """Save data to JSON."""
    OUTPUT_DIR.mkdir(exist_ok=True)
    filepath = OUTPUT_DIR / filename

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)

    size_kb = filepath.stat().st_size / 1024
    print(f"  Saved {filepath} ({size_kb:.1f} KB)")


def save_csv_copy(data: list, filename: str):
    """Save list of dicts as CSV."""
    OUTPUT_DIR.mkdir(exist_ok=True)
    filepath = OUTPUT_DIR / filename

    if not data:
        filepath.write_text("")
        return

    fieldnames = list(data[0].keys())

    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(data)

    size_kb = filepath.stat().st_size / 1024
    print(f"  Saved {filepath} ({size_kb:.1f} KB)")


def save_metadata(stats: dict):
    """Save fetch metadata."""
    OUTPUT_DIR.mkdir(exist_ok=True)
    filepath = OUTPUT_DIR / "metadata.json"

    metadata = {
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "counts": stats,
    }

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print(f"  Saved {filepath}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    print("=" * 50)
    print("Runalyze Full Data Fetcher")
    print("=" * 50)

    load_env()
    username, password = get_credentials()
    api_token = get_api_token()

    if not (username and password) and not api_token:
        print("Error: set RUNALYZE_USERNAME + RUNALYZE_PASSWORD and/or RUNALYZE_TOKEN.")
        sys.exit(1)

    stats = {}
    errors = []
    changed = []

    def keep_or_replace(new_data, filename, key):
        """Save new data, but never overwrite good data with an empty result."""
        old = load_existing(filename)
        if not new_data and old:
            print(f"  No new {key} records returned - keeping {len(old)} existing records.")
            new_data = old
        elif json.dumps(new_data, sort_keys=True, default=str) != json.dumps(old, sort_keys=True, default=str):
            save_json(new_data, filename)
            changed.append(key)
        else:
            print(f"  {key}: no changes.")
        stats[key] = len(new_data)
        return new_data

    # -------------------------------------------------------------------
    # 1. Activities (via web login + CSV export)
    # -------------------------------------------------------------------
    if username and password:
        print("\nFetching activities (web export)...")
        try:
            activities = fetch_activities_csv(username, password)
            activities = keep_or_replace(activities, "activities.json", "activities")
            save_csv_copy(activities, "activities.csv")
        except Exception as e:
            print(f"  Activities fetch failed: {e}")
            errors.append(f"activities: {e}")
            stats["activities"] = len(load_existing("activities.json"))
    else:
        print("\nNo RUNALYZE_USERNAME/RUNALYZE_PASSWORD - skipping activities.")
        stats["activities"] = len(load_existing("activities.json"))

    # -------------------------------------------------------------------
    # 2. Health metrics (via API, if token available)
    # -------------------------------------------------------------------
    if api_token:
        print("\nTesting API connection...")
        try:
            api_get(f"{API_BASE}/ping", api_token)
            print("  API connection OK!")
        except Exception as e:
            print(f"  API connection failed: {e}")
            errors.append(f"api: {e}")
            api_token = None

    metrics = [
        ("hrv", f"{API_BASE}/metrics/hrv", "hrv.json"),
        ("sleep", f"{API_BASE}/metrics/sleep", "sleep.json"),
        ("resting_hr", f"{API_BASE}/metrics/heartrate/rest", "resting_hr.json"),
    ]
    for key, url, filename in metrics:
        if not api_token:
            stats[key] = len(load_existing(filename))
            continue
        old = load_existing(filename)
        full = FULL_REFRESH or not old
        print(f"\nFetching {key} ({'full history' if full else 'latest page'})...")
        try:
            data = fetch_paginated(url, api_token, key, max_pages=None if full else INCREMENTAL_PAGES)
            if not full:
                data = merge_by_id(data, old)
            keep_or_replace(data, filename, key)
        except Exception as e:
            print(f"  {key} fetch failed: {e}")
            errors.append(f"{key}: {e}")
            stats[key] = len(load_existing(filename))

    # If nothing at all could be fetched, fail loudly instead of
    # pretending the data is fresh.
    if errors and (not api_token) and (not username or any(e.startswith("activities") for e in errors)):
        print("\nAll data sources failed:")
        for err in errors:
            print(f"  - {err}")
        sys.exit(1)

    # -------------------------------------------------------------------
    # 3. Metadata
    # -------------------------------------------------------------------
    if changed:
        print(f"\nData changed ({', '.join(changed)}) - saving metadata...")
        save_metadata(stats)
    else:
        print("\nNo data changes - metadata left as is.")

    # -------------------------------------------------------------------
    # Summary
    # -------------------------------------------------------------------
    print("\n" + "=" * 50)
    print("COMPLETE")
    print("=" * 50)
    for key, count in stats.items():
        print(f"  {key}: {count} records")
    print(f"\n  Files saved to: {OUTPUT_DIR.resolve()}")

    if errors:
        print("\nWarnings:")
        for err in errors:
            print(f"  - {err}")


if __name__ == "__main__":
    main()
