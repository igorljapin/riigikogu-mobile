#!/usr/bin/env python3
"""
Fetches current MP data from the Riigikogu official API.
Endpoint: GET https://api.riigikogu.ee/api/plenary-members?lang=en
Returns 101 active MPs in a single call.
"""

import requests
import json
import sys
import os
from datetime import datetime

API_URL = "https://api.riigikogu.ee/api/plenary-members?lang=en"
WEB_BASE = "https://www.riigikogu.ee/en/parliament-of-estonia/composition/members-riigikogu/saadik"

session = requests.Session()
session.headers.update({
    "Accept": "application/json",
    "User-Agent": "RiigikoguMonitor/1.0"
})

print("Fetching MP data from Riigikogu API...")

try:
    resp = session.get(API_URL, timeout=30)
    resp.raise_for_status()
    raw = resp.json()
except Exception as e:
    print(f"ERROR: API request failed - {e}")
    sys.exit(1)

print(f"API returned {len(raw)} records")

if len(raw) < 90:
    print(f"ERROR: Only {len(raw)} MPs returned. Aborting.")
    sys.exit(1)

mps = []
skipped = 0

for m in raw:
    if not m.get("active", True):
        skipped += 1
        continue

    uuid = m.get("uuid", "")
    full_name = m.get("fullName", "").strip()

    if not full_name:
        skipped += 1
        continue

    faction = "Unknown"
    for f in m.get("factions", []):
        if f.get("name"):
            faction = f["name"].strip()
            break

    photo_url = ""
    try:
        photo_url = m["photo"]["_links"]["download"]["href"]
    except (KeyError, TypeError):
        pass

    name_slug = full_name.replace(" ", "-")
    profile_url = f"{WEB_BASE}/{uuid}/{name_slug}" if uuid else ""

    mps.append({
        "name": full_name,
        "uuid": uuid,
        "photoUrl": photo_url,
        "profileUrl": profile_url,
        "faction": faction,
        "fetched_at": datetime.utcnow().isoformat()
    })

print(f"Processed {len(mps)} active MPs ({skipped} skipped)")

os.makedirs("data", exist_ok=True)
with open("data/mp_data_fetched.json", "w", encoding="utf-8") as f:
    json.dump(mps, f, ensure_ascii=False, indent=2)

print("Saved to data/mp_data_fetched.json")

if mps:
    sample = mps[0]
    print(f"\nSample entry:")
    print(f"  Name:    {sample['name']}")
    print(f"  Faction: {sample['faction']}")
    print(f"  Photo:   {sample['photoUrl'][:60]}...")
    print(f"  Profile: {sample['profileUrl']}")
