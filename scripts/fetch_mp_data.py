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
from collections import Counter
from datetime import datetime

API_URL = "https://api.riigikogu.ee/api/plenary-members?lang=en"
WEB_BASE = "https://www.riigikogu.ee/en/parliament-of-estonia/composition/members-riigikogu/saadik"

FACTION_MAP = {
    "Estonian Reform Party Parliamentary Group": "reform",
    "Eesti 200 Parliamentary Group": "eesti200",
    "Social Democratic Party Parliamentary Group": "sde",
    "Estonian Conservative People's Party Parliamentary Group": "ekre",
    "Isamaa Parliamentary Group": "isamaa",
    "Estonian Centre Party Parliamentary Group": "center",
}

PARTY_CONFIG = [
    {"id": "reform",   "name": "Reform",      "color": "#FFCE00", "textColor": "#1a1a1a", "side": "government"},
    {"id": "eesti200", "name": "Eesti 200",   "color": "#1FB6E6", "textColor": "#fff",    "side": "government"},
    {"id": "sde",      "name": "SDE",         "color": "#E5163C", "textColor": "#fff",    "side": "government"},
    {"id": "ekre",     "name": "EKRE",        "color": "#8B4513", "textColor": "#fff",    "side": "opposition"},
    {"id": "isamaa",   "name": "Isamaa",      "color": "#0F66B3", "textColor": "#fff",    "side": "opposition"},
    {"id": "center",   "name": "Centre",      "color": "#0E7A3C", "textColor": "#fff",    "side": "opposition"},
    {"id": "indep",    "name": "Independent", "color": "#888B91", "textColor": "#fff",    "side": "opposition"},
]


def fetch_mps():
    session = requests.Session()
    session.headers.update({
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
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


def _split_name(full_name):
    full_name = full_name.strip()
    if " " in full_name:
        first, last = full_name.rsplit(" ", 1)
        return first, last
    return full_name, ""


def generate_data_js():
    """Bake data/mp_data_current.json + data/board.json into app/data.js."""
    print("\nGenerating app/data.js...")

    with open("data/mp_data_current.json", "r", encoding="utf-8") as f:
        current = json.load(f)
    with open("data/board.json", "r", encoding="utf-8") as f:
        board = json.load(f)

    mps_out = []
    unknown_factions = set()
    for m in current:
        faction = (m.get("faction") or "").strip()
        party_id = FACTION_MAP.get(faction, "indep")
        if faction not in FACTION_MAP:
            unknown_factions.add(faction)
        first, last = _split_name(m.get("name", ""))
        mps_out.append({
            "name": m.get("name", ""),
            "first": first,
            "last": last,
            "uuid": m.get("uuid", ""),
            "photoUrl": m.get("photoUrl", ""),
            "profileUrl": m.get("profileUrl", ""),
            "faction": faction,
            "party": party_id,
        })

    for f in sorted(unknown_factions):
        print(f"WARNING: faction not in FACTION_MAP: {f!r} (mapped to 'indep')")

    if len(mps_out) != 101:
        print(f"ERROR: expected 101 MPS, got {len(mps_out)}")

    seat_counts = Counter(m["party"] for m in mps_out)
    parties_out = []
    for cfg in PARTY_CONFIG:
        parties_out.append({**cfg, "seats": seat_counts.get(cfg["id"], 0)})

    os.makedirs("app", exist_ok=True)
    out_path = "app/data.js"
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("// AUTO-GENERATED by scripts/fetch_mp_data.py — do not edit by hand.\n")
        f.write("const FACTION_MAP = ")
        json.dump(FACTION_MAP, f, ensure_ascii=False, indent=2)
        f.write(";\n\n")
        f.write("const PARTY_CONFIG = ")
        json.dump(PARTY_CONFIG, f, ensure_ascii=False, indent=2)
        f.write(";\n\n")
        f.write("const PARTIES = ")
        json.dump(parties_out, f, ensure_ascii=False, indent=2)
        f.write(";\n\n")
        f.write("const BOARD = ")
        json.dump(board, f, ensure_ascii=False, indent=2)
        f.write(";\n\n")
        f.write("const MPS = ")
        json.dump(mps_out, f, ensure_ascii=False, indent=2)
        f.write(";\n")

    print(f"Wrote {out_path} ({len(mps_out)} MPs, {len(parties_out)} parties)")


def main():
    fetch_mps()
    generate_data_js()


if __name__ == "__main__":
    main()
