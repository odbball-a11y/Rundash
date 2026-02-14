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
    """Get Runalyze login credentials."""
    username = os.environ.get("RUNALYZE_USERNAME")
    password = os.environ.get("RUNALYZE_PASSWORD")

    if not username or not password:
        print("Error: RUNALYZE_USERNAME and RUNALYZE_PASSWORD required.")
        print("Set them as environment variables or in a .env file.")
        sys.exit(1)

    return username, password


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
        print("  Error: Could not find CSRF token on login page.")
        sys.exit(1)

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
        print("  Error: Login failed. Check your username and password.")
        sys.exit(1)

    print("  Login successful!")

    # Step 3: Download activities CSV
    print("  Downloading activities CSV...")
    csv_resp = session.get(ACTIVITIES_CSV_URL)
    csv_resp.raise_for_status()

    # Parse CSV
    content = csv_resp.text
    reader = csv.DictReader(io.StringIO(content))
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


def fetch_paginated(endpoint_url: str, token: str, label: str) -> list:
    """Fetch all pages from a paginated API endpoint."""
    all_items = []
    page = 1

    while True:
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

    stats = {}

    # -------------------------------------------------------------------
    # 1. Activities (via web scraping)
    # -------------------------------------------------------------------
    print("\nFetching activities (web scraping)...")
    activities = fetch_activities_csv(username, password)
    stats["activities"] = len(activities)

    save_json(activities, "activities.json")
    save_csv_copy(activities, "activities.csv")

    # -------------------------------------------------------------------
    # 2. Health metrics (via API, if token available)
    # -------------------------------------------------------------------
    if api_token:
        # Test API connection
        print("\nTesting API connection...")
        try:
            ping = api_get(f"{API_BASE}/ping", api_token)
            print("  API connection OK!")
        except Exception as e:
            print(f"  API connection failed: {e}")
            api_token = None

    if api_token:
        # HRV
        print("\nFetching HRV data...")
        hrv = fetch_paginated(f"{API_BASE}/metrics/hrv", api_token, "hrv")
        stats["hrv"] = len(hrv)
        print(f"  Total HRV records: {len(hrv)}")
        save_json(hrv, "hrv.json")

        # Sleep
        print("\nFetching sleep data...")
        sleep_data = fetch_paginated(f"{API_BASE}/metrics/sleep", api_token, "sleep")
        stats["sleep"] = len(sleep_data)
        print(f"  Total sleep records: {len(sleep_data)}")
        save_json(sleep_data, "sleep.json")

        # Resting heart rate
        print("\nFetching resting heart rate data...")
        hr_rest = fetch_paginated(f"{API_BASE}/metrics/heartrate/rest", api_token, "resting HR")
        stats["resting_hr"] = len(hr_rest)
        print(f"  Total resting HR records: {len(hr_rest)}")
        save_json(hr_rest, "resting_hr.json")
    else:
        print("\nNo API token found — skipping health metrics.")
        print("  Set RUNALYZE_TOKEN for HRV, sleep, and resting HR data.")

    # -------------------------------------------------------------------
    # 3. Metadata
    # -------------------------------------------------------------------
    print("\nSaving metadata...")
    save_metadata(stats)

    # -------------------------------------------------------------------
    # Summary
    # -------------------------------------------------------------------
    print("\n" + "=" * 50)
    print("COMPLETE")
    print("=" * 50)
    for key, count in stats.items():
        print(f"  {key}: {count} records")
    print(f"\n  Files saved to: {OUTPUT_DIR.resolve()}")


if __name__ == "__main__":
    main()
