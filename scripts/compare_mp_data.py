#!/usr/bin/env python3
"""Classify what a fresh fetch changed, into the five Phase-5 categories.

Phase 5 of ARCHITECTURE_PLAN.md §5.2. Reads two `data/` directories — the
committed baseline and the freshly fetched one — and writes a change report:

    🔴 ACTION REQUIRED  a non-affiliated MP the overlay says nothing about, or a
                        faction change the Rules of Procedure do not allow.
                        Names the MP, the group they left and the date, and asks
                        the reviewer to classify them in `alignment.json` before
                        merging. Until then they count toward **no bloc**.
    🟠 Roster           an MP joined or left parliament (substitutions when a
                        member becomes a minister, and back again).
    🟡 Board            President or a Vice-President changed.
    🟢 Routine          committee moves, faction offices, photo, e-mail,
                        district, friendship-group membership, name spelling.
    ♻️  Stale alignment  a uuid in `alignment.json` that is no longer
                        non-affiliated — rejoined a group, or left parliament.

The report is data, not prose: `generate_pr_body.py` renders it. Both the
report and the exit signalling stay silent about `meta.updatedAt`, which changes
on every run and is not a change to anything.

Usage:
    python3 scripts/compare_mp_data.py --baseline BASE_DIR --current data \\
        [--report change_report.json]
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Fields whose change is routine — noted in the PR, never a gate. `faction` is
# deliberately absent: it is classified separately, because under §40-42 the
# only lawful faction change is *out* of a group, and that is a bloc-arithmetic
# event, not a routine one.
ROUTINE_FIELDS = [
    ("name", "name"),
    ("photoUrl", "photo"),
    ("profileUrl", "profile link"),
    ("email", "e-mail"),
    ("district", "electoral district"),
    ("factionRole", "faction office"),
    ("boardRole", "board office"),
    ("usaFriendship", "USA friendship group"),
]


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def by_uuid(mps: list[dict]) -> dict[str, dict]:
    return {m["uuid"]: m for m in mps}


def committee_set(mp: dict) -> set[tuple[str, str]]:
    return {(c["name"], c["role"]) for c in mp.get("committees") or []}


def classify(base_dir: Path, cur_dir: Path) -> dict:
    base = by_uuid(load(base_dir / "mps.json"))
    cur = by_uuid(load(cur_dir / "mps.json"))
    base_board = load(base_dir / "board.json")
    cur_board = load(cur_dir / "board.json")
    base_meta = load(base_dir / "meta.json")
    cur_meta = load(cur_dir / "meta.json")
    # The overlay is the human's file and the job never writes it, so there is
    # only one version of it: the committed one.
    alignment = load(cur_dir / "alignment.json")
    defectors = alignment.get("defectors") or {}
    unaligned = set(alignment.get("unaligned") or [])
    classified = set(defectors) | unaligned

    report: dict = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "action_required": [],
        "roster": {"joined": [], "left": []},
        "board": [],
        "routine": [],
        "stale_alignment": [],
        "seats": {
            "before": {
                "registered": base_meta.get("registered"),
                "votingBloc": base_meta.get("votingBloc"),
                "coalitionSeats": base_meta.get("coalitionSeats"),
                "oppositionSeats": base_meta.get("oppositionSeats"),
                "unalignedSeats": base_meta.get("unalignedSeats"),
                "coalitionHasMajority": base_meta.get("coalitionHasMajority"),
            },
            "after": {
                "registered": cur_meta.get("registered"),
                "votingBloc": cur_meta.get("votingBloc"),
                "coalitionSeats": cur_meta.get("coalitionSeats"),
                "oppositionSeats": cur_meta.get("oppositionSeats"),
                "unalignedSeats": cur_meta.get("unalignedSeats"),
                "coalitionHasMajority": cur_meta.get("coalitionHasMajority"),
            },
        },
        "totals": {"baseline": len(base), "current": len(cur)},
        "sourceDate": cur_meta.get("sourceDate"),
    }

    # ---- 🟠 roster -------------------------------------------------------- #
    for uid in sorted(set(cur) - set(base), key=lambda u: cur[u]["name"]):
        m = cur[uid]
        report["roster"]["joined"].append(
            {"uuid": uid, "name": m["name"], "faction": m["faction"]}
        )
    for uid in sorted(set(base) - set(cur), key=lambda u: base[u]["name"]):
        m = base[uid]
        report["roster"]["left"].append(
            {"uuid": uid, "name": m["name"], "faction": m["faction"]}
        )

    # ---- 🔴 action required ---------------------------------------------- #
    # Two sources: an MP whose faction changed in this run, and an MP who is
    # non-affiliated and still absent from the overlay (which also catches a
    # defection that a previous run surfaced and nobody has classified yet).
    flagged: set[str] = set()
    for uid, m in sorted(cur.items(), key=lambda kv: kv[1]["name"]):
        was = base.get(uid)
        changed = was is not None and was["faction"] != m["faction"]
        if m["registeredPartyId"] == "independent" and uid not in classified:
            report["action_required"].append({
                "reason": "new_non_affiliated" if changed else "unclassified_non_affiliated",
                "uuid": uid,
                "name": m["name"],
                "leftFaction": m.get("leftFaction") or (was["faction"] if was else None),
                "leftFactionDate": m.get("leftFactionDate"),
                "previousFaction": was["faction"] if was else None,
            })
            flagged.add(uid)
        elif changed and m["registeredPartyId"] != "independent":
            # Joining a group mid-term is not possible under §40-42 for someone
            # who has left one. Either an error upstream or a genuinely novel
            # situation; both want a human before it ships.
            report["action_required"].append({
                "reason": "unexpected_faction_change",
                "uuid": uid,
                "name": m["name"],
                "previousFaction": was["faction"],
                "faction": m["faction"],
            })
            flagged.add(uid)
        elif changed:
            # Faction change to non-affiliated, already classified by hand.
            report["routine"].append({
                "uuid": uid,
                "name": m["name"],
                "field": "faction",
                "from": was["faction"],
                "to": m["faction"],
                "note": "already classified in alignment.json",
            })

    # ---- ♻️ stale alignment ---------------------------------------------- #
    for uid in sorted(classified):
        m = cur.get(uid)
        if m is None:
            report["stale_alignment"].append({
                "uuid": uid,
                "name": (defectors.get(uid) or {}).get("name")
                or (alignment.get("unalignedNames") or {}).get(uid)
                or (base[uid]["name"] if uid in base else uid),
                "reason": "no longer in parliament",
            })
        elif m["registeredPartyId"] != "independent":
            report["stale_alignment"].append({
                "uuid": uid,
                "name": m["name"],
                "reason": f"now registered with {m['faction']}",
            })

    # ---- 🟡 board --------------------------------------------------------- #
    base_roles = {b["role"]: b for b in base_board}
    for b in cur_board:
        was = base_roles.get(b["role"])
        if was is None or was["uuid"] != b["uuid"]:
            report["board"].append({
                "role": b["role"],
                "from": was["name"] if was else None,
                "to": b["name"],
            })

    # ---- 🟢 routine ------------------------------------------------------- #
    for uid in sorted(set(base) & set(cur), key=lambda u: cur[u]["name"]):
        if uid in flagged:
            continue
        was, now = base[uid], cur[uid]
        for field, label in ROUTINE_FIELDS:
            if was.get(field) != now.get(field):
                report["routine"].append({
                    "uuid": uid,
                    "name": now["name"],
                    "field": label,
                    "from": was.get(field),
                    "to": now.get(field),
                })
        gone = committee_set(was) - committee_set(now)
        added = committee_set(now) - committee_set(was)
        for name, role in sorted(added):
            report["routine"].append({
                "uuid": uid, "name": now["name"], "field": "committee",
                "from": None, "to": f"{name} ({role})",
            })
        for name, role in sorted(gone):
            report["routine"].append({
                "uuid": uid, "name": now["name"], "field": "committee",
                "from": f"{name} ({role})", "to": None,
            })

    return report


def has_changes(report: dict) -> bool:
    return bool(
        report["action_required"]
        or report["roster"]["joined"]
        or report["roster"]["left"]
        or report["board"]
        or report["routine"]
        or report["stale_alignment"]
    )


def emit_output(**kv: str) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as f:
        for k, v in kv.items():
            f.write(f"{k}={v}\n")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--baseline", required=True, help="data dir as committed, before the fetch")
    ap.add_argument("--current", default="data", help="data dir after the fetch (default: data)")
    ap.add_argument("--report", default="change_report.json", help="where to write the report")
    args = ap.parse_args()

    report = classify(Path(args.baseline), Path(args.current))
    Path(args.report).write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    changes = has_changes(report)
    action = bool(report["action_required"])
    emit_output(
        changes_detected="true" if changes else "false",
        action_required="true" if action else "false",
    )

    print(f"Report written to {args.report}")
    print(f"  action required : {len(report['action_required'])}")
    print(f"  roster          : {len(report['roster']['joined'])} joined, "
          f"{len(report['roster']['left'])} left")
    print(f"  board           : {len(report['board'])}")
    print(f"  routine         : {len(report['routine'])}")
    print(f"  stale alignment : {len(report['stale_alignment'])}")
    print(f"Changes detected: {changes}")

    for item in report["action_required"]:
        if item["reason"] == "unexpected_faction_change":
            print(f"  🔴 {item['name']}: {item['previousFaction']} → {item['faction']}")
        else:
            print(f"  🔴 {item['name']} left {item['leftFaction']} on "
                  f"{item['leftFactionDate']} — classify in alignment.json before merge")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001 - the workflow must see this
        print(f"FATAL: {exc}", file=sys.stderr)
        sys.exit(1)
