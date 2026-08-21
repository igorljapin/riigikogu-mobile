#!/usr/bin/env python3
"""Render a change report as the monthly PR body.

Phase 5 of ARCHITECTURE_PLAN.md §5.3. Prose lives here; classification lives in
`compare_mp_data.py`. The ACTION REQUIRED blocks come first and use GitHub
alerts so they cannot be scrolled past: they are the things in this pipeline
that need a human, and merging without them would publish a roster in which a
defector counts toward no bloc — conservative, but incomplete.

There are two of them, one per curated file, because the job may write neither:
`alignment.json` says which bloc a defector votes with, and `seating.json`
(Phase 3 PR C) says where a new member sits. Both are raised the same way —
name the person, name the edit, say what the app does meanwhile.

Usage:
    MONTH_YEAR="August 2026" python3 scripts/generate_pr_body.py --report r.json
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

PARTY_LABEL = {
    "reform": "Reform",
    "e200": "Eesti 200",
    "sde": "SDE",
    "ekre": "EKRE",
    "isamaa": "Isamaa",
    "center": "Center",
    "independent": "Non-affiliated",
    "unaligned": "Unaligned",
}


def seat_table(before: dict, after: dict, key: str) -> list[str]:
    b, a = before.get(key) or {}, after.get(key) or {}
    rows = ["| Party | Before | After | Δ |", "|---|---:|---:|---:|"]
    for pid in sorted(set(b) | set(a), key=lambda p: -(a.get(p, 0))):
        was, now = b.get(pid, 0), a.get(pid, 0)
        delta = now - was
        rows.append(
            f"| {PARTY_LABEL.get(pid, pid)} | {was} | {now} | "
            f"{'—' if delta == 0 else format(delta, '+d')} |"
        )
    rows.append(f"| **Total** | **{sum(b.values())}** | **{sum(a.values())}** | |")
    return rows


def action_block(report: dict) -> list[str]:
    items = report["action_required"]
    if not items:
        return []
    out = [
        "> [!CAUTION]",
        "> ## 🔴 ACTION REQUIRED — classify before merging",
        ">",
    ]
    for it in items:
        if it["reason"] == "unexpected_faction_change":
            out += [
                f"> **{it['name']}** moved from **{it['previousFaction']}** to "
                f"**{it['faction']}**.",
                "> Under the Rules of Procedure §40–42 an MP who has left a "
                "parliamentary group may never join another, so this is either an "
                "upstream data error or a genuinely new situation. **Do not merge "
                "until it is understood.**",
                ">",
            ]
            continue
        left = it["leftFaction"] or it["previousFaction"] or "their parliamentary group"
        when = it["leftFactionDate"] or "an unrecorded date"
        out += [
            f"> **{it['name']}** left **{left}** on **{when}** and is now registered "
            "as non-affiliated.",
            ">",
            f"> Add `{it['uuid']}` to **`data/alignment.json`** before merging, in "
            "exactly one of:",
            ">",
            "> - `defectors` — *if they now vote with a party*:",
            f">   `\"{it['uuid']}\": {{ \"name\": \"{it['name']}\", \"votesWith\": "
            f"\"<party id>\", \"since\": \"{when}\", \"note\": \"left {left}\" }}`",
            "> - `unaligned` — *if they joined no party*: append the uuid to the list.",
            ">",
        ]
    out += [
        "> Until an entry exists, this MP counts toward **no bloc** — the voting-bloc "
        "totals below deliberately exclude them. That is conservative and publishable, "
        "but it is not the whole picture, which is why this PR is a draft.",
        ">",
        "> **The job never guesses.** It cannot know which party a defector joined, so "
        "it does not write `alignment.json` at all — that file is yours.",
        "",
    ]
    return out


def seating_block(report: dict) -> list[str]:
    """🪑 — a roster change the floor plan has not caught up with.

    Raised as its own CAUTION block rather than folded into the one above,
    because it is a different edit to a different file and the reviewer may well
    have one and not the other. `validate_data.py` runs with
    `--allow-pending-seating` while this is open, so its two join rules warn
    instead of failing the job — the data is publishable, the floor plan is one
    member short, and the seat arithmetic is untouched because it is read from
    `mps.json` and never from here.
    """
    seating = report.get("seating") or {}
    needs, orphans = seating.get("needs_seat") or [], seating.get("orphan_seat") or []
    if not needs and not orphans:
        return []

    out = [
        "> [!CAUTION]",
        "> ## 🪑 ACTION REQUIRED — assign seats before merging",
        ">",
        "> The roster moved and `data/seating.json` did not. Nothing generates that "
        "file — the API publishes no seat — so the job cannot fix this itself.",
        ">",
    ]
    for it in needs:
        out.append(f"> - **{it['name']}** ({it['faction']}) has **no seat**. Add "
                   f"`{it['uuid']}` to `seats`.")
    for it in orphans:
        out.append(f"> - Row **{it['row']}**, col **{it['col']}** is still "
                   f"**{it['name']}**'s, and they are no longer an MP. Remove or "
                   "reassign that entry.")
    out.append(">")

    # The paste line is offered for **one** arrival and **one** vacancy, and not
    # otherwise. A single substitution is one chair changing hands, so pairing
    # them is a good guess; with two of each there is nothing in this report that
    # says which arrival took which chair, and a wrong seat is a mistake no
    # validator can catch — every rule would still pass, on the wrong cell.
    if len(needs) == 1 and len(orphans) == 1:
        arriving, freed = needs[0], orphans[0]
        out += [
            "> A substitution is usually one chair changing hands — the Riigikogu "
            "seats by parliamentary group — so unless you know better, give the "
            "freed cell to the arriving member:",
            ">",
            f'>   `"{arriving["uuid"]}": {{ "name": "{arriving["name"]}", '
            f'"row": {freed["row"]}, "col": {freed["col"]} }}`',
            ">",
        ]
    elif needs and orphans:
        cells = ", ".join(f"row {o['row']} col {o['col']}" for o in orphans)
        out += [
            f"> {len(orphans)} cells are free — {cells} — and {len(needs)} members "
            "need one. Which arrival took which chair is not in this report and "
            "the validator cannot tell: it checks that everyone sits somewhere, "
            "never that they sit in the right place. Check the seating plan on "
            "`riigikogu.ee` before pairing them.",
            ">",
        ]

    out += [
        "> Until then the desktop floor plan is short a member and "
        "`validate_data.py` is running with `--allow-pending-seating`, which "
        "downgrades exactly these two rules to warnings. Every other seating rule "
        "still fails the job, and the seat arithmetic is unaffected — it is read "
        "from `mps.json`, never from the floor plan.",
        "",
    ]
    return out


def render(report: dict, month_year: str) -> str:
    before = report["seats"]["before"]
    after = report["seats"]["after"]
    lines = [
        f"## MP Data Update — {month_year}",
        "",
        f"Automated refresh of `data/*.json` from `api.riigikogu.ee`, "
        f"source date **{report.get('sourceDate', '?')}**.",
        "",
    ]
    seating = seating_block(report)
    lines += action_block(report)
    lines += seating

    # ---- seats ------------------------------------------------------------ #
    lines += ["### Seat arithmetic", ""]
    moved = before.get("coalitionSeats") != after.get("coalitionSeats") or before.get(
        "oppositionSeats"
    ) != after.get("oppositionSeats")
    lines += [
        f"| | Coalition | Opposition | Unaligned | Majority? |",
        "|---|---:|---:|---:|---|",
        f"| Before | {before.get('coalitionSeats')} | {before.get('oppositionSeats')} "
        f"| {before.get('unalignedSeats')} | "
        f"{'yes' if before.get('coalitionHasMajority') else 'no'} |",
        f"| After | {after.get('coalitionSeats')} | {after.get('oppositionSeats')} "
        f"| {after.get('unalignedSeats')} | "
        f"{'yes' if after.get('coalitionHasMajority') else 'no'} |",
        "",
    ]
    if not moved:
        lines += ["Bloc totals unchanged.", ""]
    lines += ["<details><summary>Registered seats per party</summary>", ""]
    lines += seat_table(before, after, "registered")
    lines += ["", "</details>", ""]
    lines += ["<details><summary>Voting-bloc seats per party</summary>", ""]
    lines += seat_table(before, after, "votingBloc")
    lines += [
        "",
        "Registered = the API's formal group sizes. Voting bloc = those plus the "
        "defectors `alignment.json` maps to a party. The calculator uses the voting "
        "bloc; both sum to 101.",
        "",
        "</details>",
        "",
    ]

    # ---- roster ----------------------------------------------------------- #
    joined, left = report["roster"]["joined"], report["roster"]["left"]
    if joined or left:
        lines += ["### 🟠 Roster", ""]
        for m in joined:
            lines.append(f"- **Joined** — {m['name']} ({m['faction']})")
        for m in left:
            lines.append(f"- **Left** — {m['name']} ({m['faction']})")
        lines += [
            "",
            "Substitutions happen when a member becomes a minister and when they "
            "return; check the totals above still read 101.",
            "",
        ]

    # ---- board ------------------------------------------------------------ #
    if report["board"]:
        lines += ["### 🟡 Board of the Riigikogu", ""]
        for b in report["board"]:
            lines.append(f"- **{b['role']}** — {b['from'] or '(vacant)'} → **{b['to']}**")
        lines.append("")

    # ---- stale ------------------------------------------------------------ #
    if report["stale_alignment"]:
        lines += ["### ♻️ Stale `alignment.json` entries", ""]
        for s in report["stale_alignment"]:
            lines.append(f"- **{s['name']}** — {s['reason']}; remove their entry.")
        lines += [
            "",
            "These uuids are in `defectors` or `unaligned` but are no longer "
            "non-affiliated. `validate_data.py` fails on them, so they must be "
            "removed in this PR.",
            "",
        ]

    # ---- routine ---------------------------------------------------------- #
    routine = report["routine"]
    if routine:
        lines += [
            "### 🟢 Routine",
            "",
            f"<details><summary>{len(routine)} change(s) — committees, offices, "
            "photos, contacts, districts</summary>",
            "",
        ]
        for r in routine:
            frm = r.get("from")
            to = r.get("to")
            if frm is None:
                change = f"+ {to}"
            elif to is None:
                change = f"− {frm}"
            else:
                change = f"{frm} → {to}"
            note = f" _({r['note']})_" if r.get("note") else ""
            lines.append(f"- {r['name']} — {r['field']}: {change}{note}")
        lines += ["", "</details>", ""]

    if not any([
        report["action_required"], joined, left, report["board"],
        report["stale_alignment"], routine,
    ]):
        lines += [
            "### No substantive changes",
            "",
            "The roster, board, committees and contacts are identical to the "
            "committed data; only `meta.updatedAt` moved.",
            "",
        ]

    # ---- provenance ------------------------------------------------------- #
    lines += [
        "---",
        "",
        "### How this was produced",
        "",
        "- `scripts/fetch_mp_data.py` — faction resolved as the `FRAKTSIOON` entry "
        "whose `membership.endDate` is `null`, committees with roles, Board from "
        "`plenaryMembership.jobTitle`, faction/committee catalogues refreshed from "
        "`/usergroups`, both seat counts recomputed.",
        "- `scripts/validate_data.py` and the unit + resolver test suites ran **inside "
        "the workflow** before this PR was opened — PRs created with `GITHUB_TOKEN` do "
        "not trigger the Usability Contract workflow, so the gate has to be in-job.",
        "- The fetch stages its output and publishes only after validation passes; a "
        "non-200, a malformed payload or a member count outside 95–105 aborts the run "
        "with `data/` untouched.",
        "- **`data/alignment.json` and `data/seating.json` are never written by "
        "the job.** Both are curated by hand; it flags them and stops.",
        "",
        "### Before merging",
        "",
        "- [ ] Resolve every 🔴 ACTION REQUIRED item in `data/alignment.json`",
    ]
    if seating:
        lines.append("- [ ] Give every 🪑 member a cell in `data/seating.json`, and free "
                     "the cells nobody sits in")
    lines += [
        "- [ ] Remove any ♻️ stale entry",
        "- [ ] `python3 scripts/validate_data.py` is green",
        "- [ ] Mark ready for review, and merge — Pages deploys `main` on merge",
    ]
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--report", default="change_report.json")
    ap.add_argument("--month-year", default=os.environ.get("MONTH_YEAR", "Unknown Month"))
    args = ap.parse_args()

    report = json.loads(Path(args.report).read_text(encoding="utf-8"))
    print(render(report, args.month_year), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
