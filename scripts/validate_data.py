#!/usr/bin/env python3
"""Validate data/*.json. Exit 0 = safe to publish, 1 = do not merge.

Phase 1 of ARCHITECTURE_PLAN.md. Reused by every later phase and run inside the
monthly workflow before it opens a PR, because PRs created with GITHUB_TOKEN do
not trigger other workflows.

Usage:
    python3 scripts/validate_data.py [--data DIR]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

TOTAL_SEATS = 101
BOARD_ROLES = [
    "President of the Riigikogu",
    "First Vice-President of the Riigikogu",
    "Second Vice-President of the Riigikogu",
]
FACTION_ROLES = ["Faction Chairman", "Faction Deputy Chairman"]
HEX = re.compile(r"^#[0-9A-F]{6}$")
URL = re.compile(r"^https://[^\s]+$")

errors: list[str] = []
warnings: list[str] = []


def err(msg: str) -> None:
    errors.append(msg)


def warn(msg: str) -> None:
    warnings.append(msg)


def check(data: Path) -> None:
    parties = json.loads((data / "parties.json").read_text(encoding="utf-8"))
    mps = json.loads((data / "mps.json").read_text(encoding="utf-8"))
    alignment = json.loads((data / "alignment.json").read_text(encoding="utf-8"))
    board = json.loads((data / "board.json").read_text(encoding="utf-8"))
    meta = json.loads((data / "meta.json").read_text(encoding="utf-8"))

    # ---- parties -------------------------------------------------------- #
    ids = [p["id"] for p in parties]
    if len(ids) != len(set(ids)):
        err("parties.json: duplicate party id")
    for p in parties:
        for field in ("id", "nameEn", "short", "color", "textColor", "factionName"):
            if not p.get(field):
                err(f"parties.json: {p.get('id')} missing {field}")
        if not HEX.match(p.get("color", "")):
            err(f"parties.json: {p['id']} color {p.get('color')!r} is not #RRGGBB uppercase")
        if not HEX.match(p.get("textColor", "")):
            err(f"parties.json: {p['id']} textColor {p.get('textColor')!r} is not #RRGGBB uppercase")
    party_ids = set(ids)
    factions = {p["factionName"]: p["id"] for p in parties}

    # ---- roster --------------------------------------------------------- #
    if len(mps) != TOTAL_SEATS:
        err(f"mps.json: {len(mps)} MPs, expected {TOTAL_SEATS}")
    uuids = [m["uuid"] for m in mps]
    if len(uuids) != len(set(uuids)):
        err("mps.json: duplicate uuid")
    for m in mps:
        if m.get("faction") not in factions:
            err(f"mps.json: {m['name']}: faction {m.get('faction')!r} maps to no party")
        elif factions[m["faction"]] != m.get("registeredPartyId"):
            err(f"mps.json: {m['name']}: registeredPartyId disagrees with faction")
        for field in ("photoUrl", "profileUrl"):
            if not URL.match(m.get(field) or ""):
                err(f"mps.json: {m['name']}: {field} is not a https URL")
        if m.get("boardRole") is not None and m["boardRole"] not in BOARD_ROLES:
            err(f"mps.json: {m['name']}: unknown boardRole {m['boardRole']!r}")
        if m.get("factionRole") is not None and m["factionRole"] not in FACTION_ROLES:
            err(f"mps.json: {m['name']}: unknown factionRole {m['factionRole']!r}")
        if not isinstance(m.get("usaFriendship"), bool):
            err(f"mps.json: {m['name']}: usaFriendship must be true or false")
        if not m.get("district"):
            warn(f"mps.json: {m['name']}: no electoral district")

    # The Members tab's `Chairs` filter is exactly the faction chairmen, so an
    # empty or duplicated set of them would silently blank a control.
    chairs = [m["name"] for m in mps if m.get("factionRole") == "Faction Chairman"]
    groups = {m["registeredPartyId"] for m in mps if m.get("factionRole") == "Faction Chairman"}
    if len(chairs) != len(groups):
        err(f"mps.json: {len(chairs)} faction chairmen across {len(groups)} groups — expected one each")
    if not chairs:
        err("mps.json: no faction chairmen resolved")
    if not any(m.get("usaFriendship") for m in mps):
        err("mps.json: no MP is in the USA friendship group — the 🇺🇸 filter would be empty")

    # ---- board ---------------------------------------------------------- #
    if [b["role"] for b in board] != BOARD_ROLES:
        err(f"board.json: expected exactly {BOARD_ROLES}, got {[b['role'] for b in board]}")
    by_uuid = {m["uuid"]: m for m in mps}
    for b in board:
        if b["uuid"] not in by_uuid:
            err(f"board.json: {b['name']} is not in the roster")

    # ---- alignment overlay ---------------------------------------------- #
    blocs = alignment.get("blocs", {})
    defectors = alignment.get("defectors", {})
    unaligned = alignment.get("unaligned", [])
    if len(unaligned) != len(set(unaligned)):
        err("alignment.json: duplicate uuid in unaligned")
    for pid, bloc in blocs.items():
        if pid not in party_ids:
            err(f"alignment.json: blocs references unknown party {pid!r}")
        if bloc not in ("coalition", "opposition"):
            err(f"alignment.json: {pid} has invalid bloc {bloc!r}")
    for uid, d in defectors.items():
        if uid not in by_uuid:
            err(f"alignment.json: defector {uid} is not in the roster")
        elif by_uuid[uid]["registeredPartyId"] != "independent":
            err(f"alignment.json: defector {by_uuid[uid]['name']} is not non-affiliated")
        if d.get("votesWith") not in party_ids or d.get("votesWith") == "independent":
            err(f"alignment.json: defector {uid} votesWith {d.get('votesWith')!r} is invalid")

    # every non-affiliated MP in exactly one of defectors / unaligned
    overlap = set(defectors) & set(unaligned)
    if overlap:
        err(f"alignment.json: {len(overlap)} uuid(s) in BOTH defectors and unaligned")
    nonaff = {m["uuid"] for m in mps if m.get("registeredPartyId") == "independent"}
    for uid in sorted(nonaff - set(defectors) - set(unaligned)):
        err(f"alignment.json: {by_uuid[uid]['name']} is non-affiliated but in neither list")
    for uid in sorted((set(defectors) | set(unaligned)) - nonaff):
        name = by_uuid[uid]["name"] if uid in by_uuid else uid
        err(f"alignment.json: stale entry — {name} is no longer non-affiliated")

    # ---- seat arithmetic ------------------------------------------------- #
    registered = meta.get("registered", {})
    voting = meta.get("votingBloc", {})
    if sum(registered.values()) != TOTAL_SEATS:
        err(f"meta.json: registered sums to {sum(registered.values())}, expected {TOTAL_SEATS}")
    if sum(voting.values()) != TOTAL_SEATS:
        err(f"meta.json: votingBloc sums to {sum(voting.values())}, expected {TOTAL_SEATS}")

    # recompute both counts independently of build_data.py
    exp_reg: dict[str, int] = {}
    exp_vote: dict[str, int] = {"unaligned": 0}
    for m in mps:
        pid = m["registeredPartyId"]
        exp_reg[pid] = exp_reg.get(pid, 0) + 1
        if pid != "independent":
            exp_vote[pid] = exp_vote.get(pid, 0) + 1
        elif m["uuid"] in defectors:
            tgt = defectors[m["uuid"]]["votesWith"]
            exp_vote[tgt] = exp_vote.get(tgt, 0) + 1
        else:
            exp_vote["unaligned"] += 1
    if registered != exp_reg:
        err(f"meta.json: registered {registered} != recomputed {exp_reg}")
    if voting != exp_vote:
        err(f"meta.json: votingBloc {voting} != recomputed {exp_vote}")

    coalition = sum(n for pid, n in exp_vote.items() if blocs.get(pid) == "coalition")
    opposition = sum(n for pid, n in exp_vote.items() if blocs.get(pid) == "opposition")
    if meta.get("coalitionSeats") != coalition:
        err(f"meta.json: coalitionSeats {meta.get('coalitionSeats')} != recomputed {coalition}")
    if meta.get("oppositionSeats") != opposition:
        err(f"meta.json: oppositionSeats {meta.get('oppositionSeats')} != recomputed {opposition}")
    if coalition + opposition + exp_vote["unaligned"] != TOTAL_SEATS:
        err(f"coalition {coalition} + opposition {opposition} + unaligned "
            f"{exp_vote['unaligned']} != {TOTAL_SEATS}")
    if meta.get("coalitionHasMajority") != (coalition >= meta.get("simpleMajority", 51)):
        err("meta.json: coalitionHasMajority disagrees with the arithmetic")

    print(f"  registered   {exp_reg} = {sum(exp_reg.values())}")
    print(f"  voting bloc  {exp_vote} = {sum(exp_vote.values())}")
    print(f"  coalition {coalition} / opposition {opposition} / unaligned {exp_vote['unaligned']}"
          f"  -> {'majority' if coalition >= 51 else 'NO majority'}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(Path(__file__).resolve().parent.parent / "data"))
    args = ap.parse_args()

    print(f"Validating {args.data} …")
    try:
        check(Path(args.data))
    except FileNotFoundError as exc:
        print(f"FAIL: missing file: {exc}", file=sys.stderr)
        return 1

    for w in warnings:
        print(f"  warn: {w}")
    if errors:
        print(f"\nFAIL — {len(errors)} error(s):", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1
    print(f"\nOK — all checks passed ({len(warnings)} warning(s)).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
