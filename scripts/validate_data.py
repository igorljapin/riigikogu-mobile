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


def check_seating(data: Path, mps: list[dict], by_uuid: dict[str, dict]) -> None:
    """`seating.json` — the desktop surface's floor plan, joined to the roster by uuid.

    The join is the whole point: the desktop seating grid paints one tile per
    entry here and colours it from the MP that uuid resolves to, so an orphan
    entry paints a seat for nobody and a missing entry silently drops a member
    off the floor. Both are caught here rather than in a view.

    **Absent is not an error.** `fetch_mp_data.py` stages only the files it
    generates and validates *that* directory before publishing; seating is
    hand-maintained and never staged, so requiring it would fail the monthly job
    on a file it is forbidden to write. When the file is missing every rule below
    is skipped with a warning — which is correct for a staging directory and
    loud enough locally, where `data/seating.json` is always present.
    """
    path = data / "seating.json"
    if not path.is_file():
        warn(f"{path.name} not found in {data} — seating checks skipped "
             "(expected for the monthly job's staging directory)")
        return

    # Hand-maintained, so every shape below is checked before it is used: this
    # validator's job is to print a FAIL report, and a traceback on a mistyped
    # bracket is a worse answer to "what is wrong with my edit" than a sentence.
    seating = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(seating, dict):
        err("seating.json: expected an object at the top level")
        return

    dims = seating.get("gridDimensions")
    if not isinstance(dims, dict):
        err(f"seating.json: gridDimensions must be an object, got {type(dims).__name__}")
        dims = {}
    rows, cols = dims.get("rows"), dims.get("cols")
    for name, value in (("rows", rows), ("cols", cols)):
        if not isinstance(value, int) or value <= 0:
            err(f"seating.json: gridDimensions.{name} is {value!r}, expected a positive integer")

    seats = seating.get("seats")
    if not isinstance(seats, dict):
        err("seating.json: seats must be an object keyed by MP uuid")
        return

    if len(seats) != TOTAL_SEATS:
        err(f"seating.json: {len(seats)} seats, expected {TOTAL_SEATS}")

    # Both directions of the join. A seat for someone who left parliament is as
    # wrong as a member with nowhere to sit, and only one of the two is visible
    # on the floor — the other is a hole the reader cannot see.
    active = {m["uuid"] for m in mps if m.get("active") is not False}
    for uid in sorted(set(seats) - active):
        entry = seats[uid]
        name = (entry.get("name") if isinstance(entry, dict) else None) or uid
        err(f"seating.json: seat for {name} ({uid}) — not an active MP")
    for uid in sorted(active - set(seats)):
        err(f"seating.json: {by_uuid[uid]['name']} has no seat — the floor would drop them")

    occupied: dict[tuple[int, int], str] = {}
    for uid, seat in sorted(seats.items()):
        if not isinstance(seat, dict):
            err(f"seating.json: {uid}: expected an object with name/row/col, "
                f"got {type(seat).__name__}")
            continue
        who = seat.get("name") or uid
        row, col = seat.get("row"), seat.get("col")
        if not isinstance(row, int) or not isinstance(col, int):
            err(f"seating.json: {who}: row/col must be integers, got {row!r}/{col!r}")
            continue
        if isinstance(rows, int) and not 0 <= row < rows:
            err(f"seating.json: {who}: row {row} outside 0..{rows - 1}")
        if isinstance(cols, int) and not 0 <= col < cols:
            err(f"seating.json: {who}: col {col} outside 0..{cols - 1}")
        if (row, col) in occupied:
            err(f"seating.json: {who} and {occupied[(row, col)]} both sit at row {row}, col {col}")
        else:
            occupied[(row, col)] = who
        # Advisory only: mps.json is the authority on names, and the API does
        # respell them. A drift here means the file was last touched before that
        # rename, which is worth saying and not worth failing a publish over.
        if uid in by_uuid and seat.get("name") != by_uuid[uid]["name"]:
            warn(f"seating.json: {who} is {by_uuid[uid]['name']!r} in mps.json")

    print(f"  seating      {len(seats)} seats on a {rows}×{cols} grid, "
          f"{(rows * cols - len(seats)) if isinstance(rows, int) and isinstance(cols, int) else '?'} empty")


def check(data: Path, allow_pending: bool = False) -> None:
    parties = json.loads((data / "parties.json").read_text(encoding="utf-8"))
    mps = json.loads((data / "mps.json").read_text(encoding="utf-8"))
    alignment = json.loads((data / "alignment.json").read_text(encoding="utf-8"))
    board = json.loads((data / "board.json").read_text(encoding="utf-8"))
    meta = json.loads((data / "meta.json").read_text(encoding="utf-8"))
    catalogues = json.loads((data / "catalogues.json").read_text(encoding="utf-8"))

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

    # ---- catalogues ------------------------------------------------------ #
    # Refreshed from /usergroups each run, so a renamed or newly formed group is
    # picked up without a code change. Checked here because the catalogue is
    # what makes that rename *visible* instead of silently unmapping MPs.
    cat_factions = catalogues.get("factions") or []
    cat_committees = catalogues.get("committees") or []
    cat_uuids = [g.get("uuid") for g in cat_factions + cat_committees]
    if len(cat_uuids) != len(set(cat_uuids)):
        err("catalogues.json: duplicate group uuid")
    for g in cat_factions + cat_committees:
        if not g.get("uuid") or not g.get("name") or not g.get("type"):
            err(f"catalogues.json: group {g!r} missing uuid/name/type")
    cat_faction_names = {g.get("name") for g in cat_factions}
    for p in parties:
        if p.get("factionName") not in cat_faction_names:
            err(f"catalogues.json: {p['id']} factionName {p.get('factionName')!r} "
                "is not an active group — renamed or dissolved")
    standing = [g for g in cat_committees if g.get("type") == "ALALINE_KOMISJON"]
    if not standing:
        err("catalogues.json: no standing committees")
    cat_committee_names = {g.get("name") for g in cat_committees}
    for name in sorted({c["name"] for m in mps for c in m.get("committees") or []}):
        if name not in cat_committee_names:
            err(f"catalogues.json: MPs sit on {name!r}, absent from the catalogue")

    # ---- board ---------------------------------------------------------- #
    if [b["role"] for b in board] != BOARD_ROLES:
        err(f"board.json: expected exactly {BOARD_ROLES}, got {[b['role'] for b in board]}")
    by_uuid = {m["uuid"]: m for m in mps}
    for b in board:
        if b["uuid"] not in by_uuid:
            err(f"board.json: {b['name']} is not in the roster")

    # ---- seating plan ----------------------------------------------------- #
    check_seating(data, mps, by_uuid)

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
        # --allow-pending-alignment downgrades exactly this one condition, and
        # only for the monthly job: it is forbidden from writing the overlay, so
        # a fresh defection legitimately reaches the PR unclassified. The seat
        # arithmetic below already counts such an MP toward no bloc, so the data
        # is conservative and publishable; what the reviewer must do before
        # merging is classify them. Every other rule stays fatal.
        (warn if allow_pending else err)(
            f"alignment.json: {by_uuid[uid]['name']} is non-affiliated but in neither "
            "list — PENDING CLASSIFICATION (counted toward no bloc)"
        )
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
    ap.add_argument(
        "--allow-pending-alignment",
        action="store_true",
        help="downgrade 'non-affiliated MP missing from the overlay' to a warning "
             "(the monthly job only — it may not write alignment.json)",
    )
    args = ap.parse_args()

    print(f"Validating {args.data} …")
    try:
        check(Path(args.data), allow_pending=args.allow_pending_alignment)
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
