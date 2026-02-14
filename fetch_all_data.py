#!/usr/bin/env python3
"""
Runalyze Full Data Fetcher
==========================
Fetches ALL available data from the Runalyze Personal API:
- Activities (with detail for each)
- HRV measurements
- Sleep data
- Resting heart rate

Outputs JSON files ready for consumption by the web dashboard.

Setup:
  export RUNALYZE_TOKEN="your_token_here"
  pip install requests

Usage:
  python fetch_all_data.py
"""

import os
import sys
import json
import time
import argparse
from datetime import datetime
from pathlib import Path

try:
    import requests
except ImportError:
    print("Error: 'requests' library required. Install with: pip install requests")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
BASE_URL = "https://runalyze.com/api/v1"
OUTPUT_DIR = Path("data")
RATE_LIMIT_DELAY = 1.5  # seconds between API calls
MAX_RETRIES = 3
RETRY_WAIT = 60  # seconds to wait on rate limit

ENDPOINTS = {
    "activities": f"{BASE_URL}/activities",
    "hrv": f"{BASE_URL}/metrics/hrv",
    "sleep": f"{BASE_URL}/metrics/sleep",
    "heartrate_rest": f"{BASE_URL}/metrics/heartrate/rest",
}


def get_token() -> str:
    """Get API token from environment variable or .env file."""
    token = os.environ.get("RUNALYZE_TOKEN")

    if not token:
        env_path = Path(".env")
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                line = line.strip()
                if line.startswith("RUNALYZE_TOKEN="):
                    token = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break

    if not token:
        print("Error: No API token found.")
        print("Set RUNALYZE_TOKEN environment variable or create a .env file.")
        print("Get your token at: https://runalyze.com/settings/personal-api")
        sys.exit(1)

    return token


def api_get(url: str, token: str, params: dict = None) -> dict | list:
    """Make an authenticated GET request with retry logic."""
    headers = {"token": token}

    for attempt in range(MAX_RETRIES):
        try:
            response = requests.get(url, headers=headers, params=params, timeout=30)

            if response.status_code == 429:
                print(f"    Rate limited. Waiting {RETRY_WAIT}s... (attempt {attempt + 1})")
                time.sleep(RETRY_WAIT)
                continue

            response.raise_for_status()
            return response.json()

        except requests.exceptions.Timeout:
            print(f"    Timeout. Retrying... (attempt {attempt + 1})")
            time.sleep(5)
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                return []
            raise

    print(f"    Failed after {MAX_RETRIES} retries.")
    return []


def fetch_paginated(endpoint_url: str, token: str, label: str) -> list:
    """Fetch all pages from a paginated endpoint."""
    all_items = []
    page = 1

    while True:
        print(f"  [{label}] Page {page}...", end=" ", flush=True)

        data = api_get(endpoint_url, token, params={"page": page})

        # Handle different response formats
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


def extract_activity_id(activity: dict) -> str | None:
    """Extract numeric activity ID from a raw activity record."""
    for key in ["id", "@id", "activityId"]:
        if key in activity:
            val = activity[key]
            if isinstance(val, str) and "/" in val:
                return val.rstrip("/").split("/")[-1]
            return str(val)
    return None


def fetch_activity_details(activities: list, token: str) -> list:
    """Fetch detailed data for each activity by ID."""
    detailed = []
    total = len(activities)

    for i, activity in enumerate(activities):
        activity_id = extract_activity_id(activity)
        if not activity_id:
            detailed.append(activity)  # keep raw if no ID found
            continue

        print(f"  [activity detail] {i + 1}/{total} (ID: {activity_id})...", end=" ", flush=True)

        detail_url = f"{BASE_URL}/activities/{activity_id}"
        detail = api_get(detail_url, token)

        if detail:
            # Merge detail into the activity (detail has more fields)
            if isinstance(detail, dict):
                merged = {**activity, **detail}
                detailed.append(merged)
                print("ok")
            else:
                detailed.append(activity)
                print("unexpected format, using summary")
        else:
            detailed.append(activity)
            print("failed, using summary")

        time.sleep(RATE_LIMIT_DELAY)

    return detailed


def save_json(data, filename: str):
    """Save data to a JSON file in the output directory."""
    OUTPUT_DIR.mkdir(exist_ok=True)
    filepath = OUTPUT_DIR / filename

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)

    size_kb = filepath.stat().st_size / 1024
    print(f"  Saved {filepath} ({size_kb:.1f} KB)")


def save_metadata(stats: dict):
    """Save fetch metadata (timestamps, counts) for the dashboard."""
    OUTPUT_DIR.mkdir(exist_ok=True)
    filepath = OUTPUT_DIR / "metadata.json"

    metadata = {
        "last_updated": datetime.utcnow().isoformat() + "Z",
        "counts": stats,
    }

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print(f"  Saved {filepath}")


def main():
    parser = argparse.ArgumentParser(description="Fetch all Runalyze data")
    parser.add_argument(
        "--skip-details",
        action="store_true",
        help="Skip fetching individual activity details (faster, less data)",
    )
    parser.add_argument(
        "--activities-only",
        action="store_true",
        help="Only fetch activities, skip health metrics",
    )
    args = parser.parse_args()

    print("=" * 50)
    print("Runalyze Full Data Fetcher")
    print("=" * 50)

    token = get_token()

    # Test connection
    print("\nTesting API connection...")
    try:
        ping = api_get(f"{BASE_URL}/ping", token)
        print("  Connection OK!\n")
    except Exception as e:
        print(f"  Connection failed: {e}")
        sys.exit(1)

    stats = {}

    # -----------------------------------------------------------------------
    # 1. Activities
    # -----------------------------------------------------------------------
    print("Fetching activities...")
    activities = fetch_paginated(ENDPOINTS["activities"], token, "activities")
    stats["activities"] = len(activities)
    print(f"  Total activities: {len(activities)}")

    if activities and not args.skip_details:
        print("\nFetching activity details...")
        activities = fetch_activity_details(activities, token)

    save_json(activities, "activities.json")

    # -----------------------------------------------------------------------
    # 2. Health metrics (unless --activities-only)
    # -----------------------------------------------------------------------
    if not args.activities_only:
        # HRV
        print("\nFetching HRV data...")
        hrv = fetch_paginated(ENDPOINTS["hrv"], token, "hrv")
        stats["hrv"] = len(hrv)
        print(f"  Total HRV records: {len(hrv)}")
        save_json(hrv, "hrv.json")

        # Sleep
        print("\nFetching sleep data...")
        sleep = fetch_paginated(ENDPOINTS["sleep"], token, "sleep")
        stats["sleep"] = len(sleep)
        print(f"  Total sleep records: {len(sleep)}")
        save_json(sleep, "sleep.json")

        # Resting heart rate
        print("\nFetching resting heart rate data...")
        hr_rest = fetch_paginated(ENDPOINTS["heartrate_rest"], token, "resting HR")
        stats["resting_hr"] = len(hr_rest)
        print(f"  Total resting HR records: {len(hr_rest)}")
        save_json(hr_rest, "resting_hr.json")

    # -----------------------------------------------------------------------
    # 3. Metadata
    # -----------------------------------------------------------------------
    print("\nSaving metadata...")
    save_metadata(stats)

    # -----------------------------------------------------------------------
    # Summary
    # -----------------------------------------------------------------------
    print("\n" + "=" * 50)
    print("COMPLETE")
    print("=" * 50)
    for key, count in stats.items():
        print(f"  {key}: {count} records")
    print(f"\n  Files saved to: {OUTPUT_DIR.resolve()}")


if __name__ == "__main__":
    main()
