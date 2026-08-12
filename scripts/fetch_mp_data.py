#!/usr/bin/env python3
"""The monthly job's fetcher: regenerate the API-derived half of `data/`.

Phase 5 of ARCHITECTURE_PLAN.md. This is the script
`.github/workflows/monthly-mp-check.yml` runs. It produces the **full app
schema** — `parties.json`, `mps.json`, `board.json`, `catalogues.json`,
`meta.json` — using the same corrected resolvers as `scripts/build_data.py`,
which it imports rather than re-implements. (The pre-Phase-5 version of this
file took `factions[0]`, an arbitrary and often expired membership, and wrote a
five-field roster nothing read.)

Two rules define its behaviour:

1. **It never writes `data/alignment.json`.** Not `blocs`, not `defectors`, not
   even an append to `unaligned`. The curated overlay is the human's file. A
   newly non-affiliated MP is counted toward **no bloc** (the conservative
   reading — it can only understate a bloc, never manufacture a majority) and
   raised by `compare_mp_data.py` as an ACTION REQUIRED item for the reviewer to
   classify before the PR merges.

   > Note: this is a deliberate tightening of ARCHITECTURE_PLAN.md §5.2, which
   > had the job append the safe default itself. `build_data.py` — the
   > hand-run tool — still does that. The unattended job does not.

2. **It publishes nothing it has not validated.** Everything is built into a
   staging directory and run past `validate_data.py` there; `data/` is only
   touched once that exits 0. A non-200 response, a malformed payload, a member
   count outside 95–105, an unknown faction, a renamed committee or a Board that
   does not resolve to three people aborts the run non-zero with `data/`
   untouched.

Usage:
    python3 scripts/fetch_mp_data.py                       # fetch and publish
    python3 scripts/fetch_mp_data.py --dry-run --staging /tmp/fetched
    python3 scripts/fetch_mp_data.py --offline raw.json --offline-usergroups g.json \\
        --offline-usa-group usa.json --dry-run
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import build_data as B  # noqa: E402  (path set above)

REPO = Path(__file__).resolve().parent.parent
DATA = REPO / "data"
VALIDATOR = Path(__file__).resolve().parent / "validate_data.py"

# Regenerated wholesale on every run. `alignment.json` is deliberately absent.
GENERATED = ("parties.json", "mps.json", "board.json", "catalogues.json", "meta.json")


def load(path: str | None, url: str, what: str):
    """Offline file when given, otherwise the live API with backoff."""
    if path:
        print(f"  ({what}: reading {path})")
        return json.loads(Path(path).read_text(encoding="utf-8"))
    return B.fetch(url)


def unclassified_nonaffiliated(mps: list[dict], alignment: dict) -> list[dict]:
    """Non-affiliated MPs the overlay says nothing about — the human's queue."""
    known = set(alignment.get("defectors") or {}) | set(alignment.get("unaligned") or [])
    return [
        m
        for m in mps
        if m["registeredPartyId"] == "independent" and m["uuid"] not in known
    ]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--data", default=str(DATA), help="published data dir (default: ./data)")
    ap.add_argument("--staging", help="build here and keep it (default: a temp dir, removed)")
    ap.add_argument("--dry-run", action="store_true", help="validate but do not publish")
    ap.add_argument("--offline", help="read plenary-members from a file instead of the API")
    ap.add_argument("--offline-usergroups", help="read /usergroups from a file")
    ap.add_argument("--offline-usa-group", help="read the USA friendship group from a file")
    args = ap.parse_args()

    data = Path(args.data)
    alignment_path = data / "alignment.json"
    if not alignment_path.is_file():
        raise RuntimeError(f"{alignment_path} not found — the curated overlay is required")
    alignment_before = alignment_path.read_bytes()
    alignment = json.loads(alignment_before.decode("utf-8"))

    # ---- fetch (guarded; nothing is written until all of this succeeds) ---- #
    print("Fetching roster…")
    members = load(args.offline, B.API, "roster")
    B.guard(members)
    print(f"  {len(members)} members")

    print("Fetching group catalogue…")
    groups = load(args.offline_usergroups, B.USERGROUPS, "usergroups")
    catalogues = B.build_catalogues(groups)
    B.check_catalogue(catalogues)
    standing = [c for c in catalogues["committees"] if c["type"] == "ALALINE_KOMISJON"]
    print(
        f"  {len(catalogues['factions'])} factions, {len(catalogues['committees'])} "
        f"committees ({len(standing)} standing)"
    )

    print("Fetching parliamentary friendship group…")
    usa = B.usa_friendship_uuids(
        groups,
        offline=json.loads(Path(args.offline_usa_group).read_text(encoding="utf-8"))
        if args.offline_usa_group
        else None,
    )
    print(f"  {len(usa)} current members of {B.USA_GROUP_NAME}")

    # ---- resolve ---------------------------------------------------------- #
    mps = B.build_mps(members, usa)
    B.check_catalogue(catalogues, mps)
    board = B.build_board(mps)
    meta = B.build_meta(mps, alignment, unclassified="unaligned")

    pending = unclassified_nonaffiliated(mps, alignment)
    stale = B.stale_entries(alignment, mps)

    # ---- stage ------------------------------------------------------------ #
    tmp = None
    if args.staging:
        staging = Path(args.staging)
        if staging.exists():
            shutil.rmtree(staging)
        staging.mkdir(parents=True)
    else:
        tmp = tempfile.mkdtemp(prefix="riigikogu-fetch-")
        staging = Path(tmp)

    try:
        payload = {
            "parties.json": B.PARTIES,
            "mps.json": mps,
            "board.json": board,
            "catalogues.json": catalogues,
            "meta.json": meta,
        }
        for name, obj in payload.items():
            (staging / name).write_text(
                json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
        # A read-only copy, so the validator can check the seat arithmetic
        # against the overlay. It is never copied back.
        (staging / "alignment.json").write_bytes(alignment_before)

        # ---- validate ----------------------------------------------------- #
        print(f"\nValidating staged data in {staging} …")
        cmd = [sys.executable, str(VALIDATOR), "--data", str(staging)]
        if pending:
            # The one condition the job is allowed to hand to a human: an MP who
            # just left a group and is not in the overlay yet. The arithmetic
            # already excludes them from every bloc, so the staged data is
            # publishable and correct; what it is not is *complete*, and the
            # ACTION REQUIRED block in the PR says so.
            cmd.append("--allow-pending-alignment")
        if subprocess.run(cmd, check=False).returncode != 0:
            raise RuntimeError("validation failed — data/ left untouched")

        # ---- publish ------------------------------------------------------ #
        if args.dry_run:
            print("\n--dry-run: validated, published nothing.")
        else:
            data.mkdir(parents=True, exist_ok=True)
            for name in GENERATED:
                shutil.copyfile(staging / name, data / name)
                print(f"  wrote {data / name}")
            if alignment_path.read_bytes() != alignment_before:
                raise RuntimeError(
                    "alignment.json changed during the run — this script must never "
                    "write the curated overlay"
                )
    finally:
        if tmp:
            shutil.rmtree(tmp, ignore_errors=True)

    # ---- summary ---------------------------------------------------------- #
    print(
        f"\nRegistered  {meta['registered']}\n"
        f"Voting bloc {meta['votingBloc']}\n"
        f"Coalition {meta['coalitionSeats']} / Opposition {meta['oppositionSeats']} "
        f"/ unaligned {meta['unalignedSeats']}  "
        f"({'majority' if meta['coalitionHasMajority'] else 'NO majority'})"
    )
    if pending:
        print("\nACTION REQUIRED — non-affiliated MP(s) missing from alignment.json:")
        for m in pending:
            left = m["leftFaction"] or "?"
            print(f"  - {m['name']} (left {left} on {m['leftFactionDate'] or '?'})")
        print("  Counted toward no bloc until classified. See the change report.")
    if stale:
        print(f"\nStale overlay entries (no longer non-affiliated): {', '.join(stale)}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001 - deliberate: fail loudly, write nothing
        print(f"FATAL: {exc}", file=sys.stderr)
        sys.exit(1)
