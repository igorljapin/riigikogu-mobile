#!/usr/bin/env python3
"""Resolver regression tests against the frozen API payload.

Phase 5 of ARCHITECTURE_PLAN.md §5.4. Every assertion here describes
`tests/fixtures/` — the 2026-08-12 capture — not today's parliament, so the
suite is deterministic and offline. What it locks:

- the corrected faction resolver, against the `factions[0]` bug it replaced;
- the registered split, the Board, and the committee chairs;
- the guards that make the monthly job refuse to publish a bad payload;
- the ACTION REQUIRED path: a simulated defection must reach the reviewer,
  counted toward no bloc, with `alignment.json` untouched.

Run: python3 -m unittest discover -s tests/python
"""

from __future__ import annotations

import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
FIXTURES = REPO / "tests" / "fixtures"
sys.path.insert(0, str(REPO / "scripts"))

import build_data as B  # noqa: E402
import compare_mp_data as C  # noqa: E402
import fetch_mp_data as F  # noqa: E402
import generate_pr_body as P  # noqa: E402

# What the frozen capture must resolve to. Change these only together with the
# fixture — see tests/fixtures/README.md.
REGISTERED = {
    "reform": 36,
    "independent": 20,
    "e200": 12,
    "sde": 9,
    "ekre": 9,
    "isamaa": 8,
    "center": 7,
}
BOARD = [
    ("President of the Riigikogu", "Lauri Hussar"),
    ("First Vice-President of the Riigikogu", "Toomas Kivimägi"),
    ("Second Vice-President of the Riigikogu", "Arvo Aller"),
]
STANDING_COMMITTEES = 11
STANDING_CHAIRMEN = 10  # National Defence vacant since 2026-08-10
STANDING_DEPUTY_CHAIRMEN = 11
FACTION_CHAIRMEN = 6
FACTION_DEPUTY_CHAIRMEN = 8


def load(name: str):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


class Fixture(unittest.TestCase):
    """Resolved once — parsing 430 KB per test would be the slowest thing here."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.raw = load("plenary-members.json")
        cls.groups = load("usergroups.json")
        cls.usa_group = load("usergroup-usa-friendship.json")
        cls.usa = B.usa_friendship_uuids(offline=cls.usa_group)
        cls.mps = B.build_mps(cls.raw, cls.usa)
        cls.catalogues = B.build_catalogues(cls.groups)
        cls.alignment = json.loads(
            (REPO / "data" / "alignment.json").read_text(encoding="utf-8")
        )

    def standing(self, role: str) -> list[str]:
        return [
            m["name"]
            for m in self.mps
            for c in m["committees"]
            if c["type"] == "ALALINE_KOMISJON" and c["role"] == role
        ]


class TestFactionResolver(Fixture):
    def test_roster_is_complete(self):
        self.assertEqual(len(self.raw), 101)
        self.assertEqual(len(self.mps), 101)
        self.assertEqual(len({m["uuid"] for m in self.mps}), 101)

    def test_registered_split(self):
        counts: dict[str, int] = {}
        for m in self.mps:
            counts[m["registeredPartyId"]] = counts.get(m["registeredPartyId"], 0) + 1
        self.assertEqual(counts, REGISTERED)
        self.assertEqual(sum(counts.values()), 101)

    def test_every_mp_has_exactly_one_current_faction(self):
        for m in self.raw:
            current = [
                f
                for f in m["factions"]
                if f["type"]["code"] == B.FRAKTSIOON
                and f["membership"]["endDate"] is None
            ]
            self.assertEqual(
                len(current), 1, f"{m['fullName']} has {len(current)} current factions"
            )

    def test_factions_zero_would_be_wrong(self):
        """The bug this fixture exists to prevent.

        Every MP carries a `Non-affiliated members` membership that ended on
        2023-04-10, and for most of them it sorts first — so `factions[0]`
        reports a parliament of 50 non-affiliated members. If this ever stops
        differing from the correct answer, the fixture no longer covers the bug.
        """
        naive: dict[str, int] = {}
        for m in self.raw:
            name = m["factions"][0]["name"]
            naive[name] = naive.get(name, 0) + 1
        self.assertNotEqual(naive.get(B.NON_AFFILIATED), REGISTERED["independent"])
        self.assertGreater(naive.get(B.NON_AFFILIATED, 0), 40)

    def test_defection_metadata_is_recoverable(self):
        """Who left which group, and when — the input to the ACTION REQUIRED block."""
        kiili = next(m for m in self.mps if m["name"] == "Meelis Kiili")
        self.assertEqual(kiili["registeredPartyId"], "independent")
        self.assertEqual(
            kiili["leftFaction"], "Estonian Reform Party Parliamentary Group"
        )
        self.assertEqual(kiili["leftFactionDate"], "2026-08-10")
        # One documented gap: the API keeps no ended EKRE membership for Peeter
        # Ernits — his only FRAKTSIOON record is `Non-affiliated members` from
        # 2025-04-01, though he left EKRE in April 2024. The registry is not
        # complete, which is why the PR body falls back to the previous faction
        # and "an unrecorded date" rather than assuming these fields are there.
        missing = [
            m["name"]
            for m in self.mps
            if m["registeredPartyId"] == "independent" and not m["leftFaction"]
        ]
        self.assertEqual(missing, ["Peeter Ernits"])


class TestBoardAndCommittees(Fixture):
    def test_board_from_plenary_membership_job_title(self):
        board = B.build_board(self.mps)
        self.assertEqual([(b["role"], b["name"]) for b in board], BOARD)

    def test_standing_committee_chairs(self):
        chairs = self.standing("Chairman")
        deputies = self.standing("Deputy Chairman")
        self.assertEqual(len(chairs), STANDING_CHAIRMEN)
        self.assertEqual(len(deputies), STANDING_DEPUTY_CHAIRMEN)
        self.assertEqual(len(set(chairs)), len(chairs), "an MP chairs two committees")

    def test_one_chair_and_one_deputy_per_standing_committee(self):
        per: dict[str, dict[str, int]] = {}
        for m in self.mps:
            for c in m["committees"]:
                if c["type"] != "ALALINE_KOMISJON":
                    continue
                per.setdefault(c["name"], {}).setdefault(c["role"], 0)
                per[c["name"]][c["role"]] += 1
        self.assertEqual(len(per), STANDING_COMMITTEES)
        for name, roles in per.items():
            self.assertLessEqual(roles.get("Chairman", 0), 1, name)
            self.assertEqual(roles.get("Deputy Chairman", 0), 1, name)
            self.assertGreater(roles.get("member", 0), 0, name)
        # The one vacancy in this capture, asserted so that filling it shows up
        # as a fixture update rather than as silent drift.
        self.assertNotIn("Chairman", per["National Defence Committee"])

    def test_faction_offices(self):
        roles = [m["factionRole"] for m in self.mps]
        self.assertEqual(roles.count("Faction Chairman"), FACTION_CHAIRMEN)
        self.assertEqual(roles.count("Faction Deputy Chairman"), FACTION_DEPUTY_CHAIRMEN)
        # One chairman per group, and never for the non-affiliated, who are not
        # a parliamentary group and elect nobody.
        groups = [
            m["registeredPartyId"] for m in self.mps if m["factionRole"] == "Faction Chairman"
        ]
        self.assertEqual(len(groups), len(set(groups)))
        self.assertNotIn("independent", groups)


class TestCatalogue(Fixture):
    def test_catalogue_shape(self):
        self.assertEqual(len(self.catalogues["factions"]), 7)
        standing = [
            c for c in self.catalogues["committees"] if c["type"] == "ALALINE_KOMISJON"
        ]
        self.assertEqual(len(standing), STANDING_COMMITTEES)
        B.check_catalogue(self.catalogues, self.mps)

    def test_renamed_faction_is_caught(self):
        cat = copy.deepcopy(self.catalogues)
        for f in cat["factions"]:
            if f["name"] == "Isamaa Parliamentary Group":
                f["name"] = "Isamaa Group (renamed)"
        with self.assertRaises(RuntimeError) as ctx:
            B.check_catalogue(cat)
        self.assertIn("Isamaa Parliamentary Group", str(ctx.exception))

    def test_unknown_committee_is_caught(self):
        mps = copy.deepcopy(self.mps)
        mps[0]["committees"].append(
            {"name": "Committee on Nothing", "role": "member", "type": "ALALINE_KOMISJON"}
        )
        with self.assertRaises(RuntimeError):
            B.check_catalogue(self.catalogues, mps)


class TestGuards(unittest.TestCase):
    """Resilience: fail loudly, change nothing."""

    def members(self, n: int) -> list[dict]:
        return [{"uuid": f"u{i}", "fullName": f"MP {i}"} for i in range(n)]

    def test_member_count_band(self):
        B.guard(self.members(101))
        B.guard(self.members(95))
        B.guard(self.members(105))
        for n in (0, 94, 106):
            with self.assertRaises(RuntimeError, msg=f"{n} members must be refused"):
                B.guard(self.members(n))

    def test_malformed_payload(self):
        with self.assertRaises(RuntimeError):
            B.guard({"error": "nope"})
        broken = self.members(101)
        broken[7]["uuid"] = ""
        with self.assertRaises(RuntimeError):
            B.guard(broken)

    def test_unknown_faction_aborts(self):
        raw = load("plenary-members.json")
        for f in raw[0]["factions"]:
            if f["membership"]["endDate"] is None:
                f["name"] = "Pirate Party Parliamentary Group"
        with self.assertRaises(RuntimeError):
            B.build_mps(raw, set())

    def test_board_must_resolve_to_three(self):
        mps = [
            {"name": "A", "uuid": "a", "registeredPartyId": "reform", "boardRole": None}
        ]
        with self.assertRaises(RuntimeError):
            B.build_board(mps)


class TestDefectionIsSurfaced(Fixture):
    """A simulated defection must reach the reviewer, and change no bloc.

    This is ARCHITECTURE_PLAN.md §5's acceptance criterion, tightened: the job
    is forbidden from writing `alignment.json`, so the defector counts toward no
    bloc and the PR body must say so in an ACTION REQUIRED block naming them,
    the group they left and the date.
    """

    DEFECTOR = "Kristo Enn Vaga"  # Reform, in the fixture
    LEFT = "Estonian Reform Party Parliamentary Group"
    ON = "2026-09-01"

    def simulate(self) -> list[dict]:
        raw = copy.deepcopy(self.raw)
        mp = next(m for m in raw if m["fullName"] == self.DEFECTOR)
        for f in mp["factions"]:
            if f["type"]["code"] == B.FRAKTSIOON and f["membership"]["endDate"] is None:
                f["membership"]["endDate"] = self.ON
        nonaff = copy.deepcopy(
            next(f for f in mp["factions"] if f["name"] == B.NON_AFFILIATED)
        )
        nonaff["membership"] = dict(
            nonaff["membership"], startDate=self.ON, endDate=None
        )
        mp["factions"].append(nonaff)
        return raw

    def test_resolver_moves_them_to_non_affiliated(self):
        mps = B.build_mps(self.simulate(), self.usa)
        mp = next(m for m in mps if m["name"] == self.DEFECTOR)
        self.assertEqual(mp["registeredPartyId"], "independent")
        self.assertEqual(mp["leftFaction"], self.LEFT)
        self.assertEqual(mp["leftFactionDate"], self.ON)

    def test_seat_counts_move_and_no_bloc_gains(self):
        before = B.build_meta(self.mps, self.alignment)
        after = B.build_meta(
            B.build_mps(self.simulate(), self.usa), self.alignment, unclassified="unaligned"
        )
        self.assertEqual(after["registered"]["reform"], before["registered"]["reform"] - 1)
        self.assertEqual(after["registered"]["independent"],
                         before["registered"]["independent"] + 1)
        self.assertEqual(after["votingBloc"]["reform"], before["votingBloc"]["reform"] - 1)
        self.assertEqual(after["unalignedSeats"], before["unalignedSeats"] + 1)
        self.assertEqual(after["coalitionSeats"], before["coalitionSeats"] - 1)
        self.assertEqual(after["oppositionSeats"], before["oppositionSeats"])
        self.assertEqual(sum(after["registered"].values()), 101)
        self.assertEqual(sum(after["votingBloc"].values()), 101)

    def test_the_job_never_writes_alignment_json(self):
        """End to end through fetch_mp_data.py, on a defection it cannot classify."""
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            data, staged = tmp / "data", tmp / "staged"
            data.mkdir()
            raw_path = tmp / "raw.json"
            raw_path.write_text(json.dumps(self.simulate()), encoding="utf-8")
            for name in ("alignment.json",):
                (data / name).write_bytes((REPO / "data" / name).read_bytes())
            before = (data / "alignment.json").read_bytes()

            rc = subprocess.run(
                [
                    sys.executable, str(REPO / "scripts" / "fetch_mp_data.py"),
                    "--data", str(data), "--staging", str(staged),
                    "--offline", str(raw_path),
                    "--offline-usergroups", str(FIXTURES / "usergroups.json"),
                    "--offline-usa-group", str(FIXTURES / "usergroup-usa-friendship.json"),
                ],
                capture_output=True, text=True,
            )
            self.assertEqual(rc.returncode, 0, rc.stdout + rc.stderr)
            self.assertIn("ACTION REQUIRED", rc.stdout)
            self.assertIn(self.DEFECTOR, rc.stdout)
            # The overlay is the human's file: byte-identical after the run, and
            # never among the published outputs.
            self.assertEqual((data / "alignment.json").read_bytes(), before)
            self.assertNotIn("alignment.json", F.GENERATED)
            for name in F.GENERATED:
                self.assertTrue((data / name).is_file(), name)

    def test_change_report_and_pr_body(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            base, cur = tmp / "base", tmp / "cur"
            for d, raw in ((base, self.raw), (cur, self.simulate())):
                d.mkdir()
                mps = B.build_mps(raw, self.usa)
                (d / "mps.json").write_text(json.dumps(mps), encoding="utf-8")
                (d / "board.json").write_text(
                    json.dumps(B.build_board(mps)), encoding="utf-8"
                )
                (d / "meta.json").write_text(
                    json.dumps(B.build_meta(mps, self.alignment, unclassified="unaligned")),
                    encoding="utf-8",
                )
                (d / "alignment.json").write_bytes(
                    (REPO / "data" / "alignment.json").read_bytes()
                )

            report = C.classify(base, cur)
            self.assertTrue(C.has_changes(report))
            self.assertEqual(len(report["action_required"]), 1)
            item = report["action_required"][0]
            self.assertEqual(item["reason"], "new_non_affiliated")
            self.assertEqual(item["name"], self.DEFECTOR)
            self.assertEqual(item["leftFaction"], self.LEFT)
            self.assertEqual(item["leftFactionDate"], self.ON)
            self.assertEqual(report["stale_alignment"], [])
            self.assertEqual(report["board"], [])
            self.assertEqual(report["roster"], {"joined": [], "left": []})

            body = P.render(report, "September 2026")
            self.assertIn("🔴 ACTION REQUIRED", body)
            self.assertIn("[!CAUTION]", body)
            self.assertIn(self.DEFECTOR, body)
            self.assertIn(self.LEFT, body)
            self.assertIn(self.ON, body)
            self.assertIn("data/alignment.json", body)
            self.assertIn("counts toward **no bloc**", body)
            # The block leads: nothing but the title and provenance precedes it.
            self.assertLess(body.index("ACTION REQUIRED"), body.index("Seat arithmetic"))


class TestRosterChangeNeedsASeat(Fixture):
    """A substitution must reach the reviewer as a seat to assign.

    `data/seating.json` is the second curated file (`USABILITY.md` §10.6): the
    API publishes no seat, so nothing generates it and the monthly job may not
    write it. A member who joins parliament therefore arrives with nowhere to
    sit, and the chair they took is still recorded as the departing member's —
    both halves of a join `validate_data.py` would otherwise fail the job on.

    This is the seating twin of `TestDefectionIsSurfaced`, and it holds the same
    three things: the change is classified, the PR body names the person and the
    edit, and the job never writes the file.
    """

    ARRIVING = "Kaja Uustee"
    ARRIVING_UUID = "11111111-2222-3333-4444-555555555555"

    def substitute(self) -> tuple[list[dict], dict, str, str]:
        """One member replaced by another, and the floor plan left as it was.

        Returns the new roster, the *committed* seating plan, and the name of
        the member who left. The departing member is picked from a party rather
        than from the non-affiliated, so nothing about the bloc overlay changes
        and the only finding is the seat.
        """
        mps = copy.deepcopy(self.mps)
        leaving = next(
            m for m in mps
            if m["registeredPartyId"] != "independent" and not m.get("boardRole")
        )
        left_name, left_uuid = leaving["name"], leaving["uuid"]

        leaving["uuid"] = self.ARRIVING_UUID
        leaving["name"] = self.ARRIVING
        leaving["profileUrl"] = f"https://www.riigikogu.ee/en/saadik/{self.ARRIVING_UUID}"

        seating = {
            "gridDimensions": {"rows": 10, "cols": 12},
            # The committed plan seats the member who left, and nobody else has
            # moved: exactly what a fetch finds on the 1st of the month.
            "seats": {
                m["uuid"]: {"name": m["name"], "row": i // 12, "col": i % 12}
                for i, m in enumerate(self.mps)
            },
        }
        return mps, seating, left_name, left_uuid

    def dirs(self, tmp: Path, mps: list[dict], seating: dict | None) -> tuple[Path, Path]:
        base, cur = tmp / "base", tmp / "cur"
        for d, roster in ((base, self.mps), (cur, mps)):
            d.mkdir()
            (d / "mps.json").write_text(json.dumps(roster), encoding="utf-8")
            (d / "board.json").write_text(json.dumps(B.build_board(roster)), encoding="utf-8")
            (d / "meta.json").write_text(
                json.dumps(B.build_meta(roster, self.alignment, unclassified="unaligned")),
                encoding="utf-8",
            )
            (d / "alignment.json").write_bytes(
                (REPO / "data" / "alignment.json").read_bytes()
            )
        if seating is not None:
            (cur / "seating.json").write_text(json.dumps(seating), encoding="utf-8")
        return base, cur

    def test_both_halves_of_the_join_are_classified(self):
        with tempfile.TemporaryDirectory() as tmp:
            mps, seating, left_name, left_uuid = self.substitute()
            base, cur = self.dirs(Path(tmp), mps, seating)
            report = C.classify(base, cur)

        self.assertTrue(C.needs_seating(report))
        self.assertTrue(report["seating"]["present"])

        # The arriving member has nowhere to sit …
        self.assertEqual([s["uuid"] for s in report["seating"]["needs_seat"]],
                         [self.ARRIVING_UUID])
        self.assertEqual(report["seating"]["needs_seat"][0]["name"], self.ARRIVING)

        # … and the chair they took is still the departing member's.
        self.assertEqual([s["uuid"] for s in report["seating"]["orphan_seat"]], [left_uuid])
        self.assertEqual(report["seating"]["orphan_seat"][0]["name"], left_name)

        # It is a seating finding and not a bloc one: nobody's alignment moved.
        self.assertEqual(report["action_required"], [])
        self.assertEqual(report["stale_alignment"], [])
        self.assertEqual(len(report["roster"]["joined"]), 1)
        self.assertEqual(len(report["roster"]["left"]), 1)

    def test_the_pr_body_names_the_member_the_file_and_the_free_cell(self):
        with tempfile.TemporaryDirectory() as tmp:
            mps, seating, left_name, left_uuid = self.substitute()
            base, cur = self.dirs(Path(tmp), mps, seating)
            report = C.classify(base, cur)

        body = P.render(report, "September 2026")
        self.assertIn("🪑 ACTION REQUIRED", body)
        self.assertIn("[!CAUTION]", body)
        self.assertIn(self.ARRIVING, body)
        self.assertIn(self.ARRIVING_UUID, body)
        self.assertIn(left_name, body)
        self.assertIn("data/seating.json", body)
        self.assertIn("--allow-pending-seating", body)

        # The freed cell is offered to the arriving member — the Riigikogu seats
        # by parliamentary group, so a substitute usually inherits the chair
        # (data/README.md).
        freed = seating["seats"][left_uuid]
        self.assertIn(f'"row": {freed["row"]}, "col": {freed["col"]}', body)

        # It leads, like the alignment block: a reviewer cannot scroll past it.
        self.assertLess(body.index("🪑 ACTION REQUIRED"), body.index("Seat arithmetic"))
        self.assertIn("- [ ] Give every 🪑 member a cell", body)

    def test_the_job_never_writes_seating_json(self):
        """The second curated file, held the way the first one is: the fetcher
        publishes a fixed list of generated files and the floor plan is not on
        it, so an unattended run cannot invent a seat for anybody."""
        self.assertNotIn("seating.json", F.GENERATED)
        self.assertNotIn("alignment.json", F.GENERATED)

    def test_two_substitutions_are_not_paired_by_guesswork(self):
        """One arrival and one vacancy is a chair changing hands. Two of each is
        a question this report cannot answer — and a wrong seat is the one
        mistake the validator cannot catch, because every rule still passes on
        the wrong cell."""
        two = {"seating": {
            "present": True,
            "needs_seat": [
                {"uuid": "aaaa", "name": "First Arrival", "faction": "Isamaa Parliamentary Group"},
                {"uuid": "bbbb", "name": "Second Arrival", "faction": "Estonian Reform Party Parliamentary Group"},
            ],
            "orphan_seat": [
                {"uuid": "cccc", "name": "First Departure", "row": 2, "col": 3},
                {"uuid": "dddd", "name": "Second Departure", "row": 7, "col": 8},
            ],
        }}

        block = "\n".join(P.seating_block(two))
        self.assertIn("First Arrival", block)
        self.assertIn("Second Arrival", block)
        self.assertIn("row 2 col 3", block)
        self.assertIn("row 7 col 8", block)
        # No paste line: it would put one of them in the other's chair.
        self.assertNotIn('"row": 2, "col": 3', block)
        self.assertIn("never that they sit in the right place", block)

    def test_an_unchanged_roster_says_nothing_about_seats(self):
        with tempfile.TemporaryDirectory() as tmp:
            _, seating, _, _ = self.substitute()
            base, cur = self.dirs(Path(tmp), copy.deepcopy(self.mps), seating)
            report = C.classify(base, cur)

        self.assertFalse(C.needs_seating(report))
        self.assertEqual(report["seating"]["needs_seat"], [])
        self.assertEqual(report["seating"]["orphan_seat"], [])
        self.assertEqual(P.seating_block(report), [])
        self.assertNotIn("🪑", P.render(report, "September 2026"))

    def test_a_directory_without_seating_is_not_a_finding(self):
        """The monthly job's staging directory holds only generated files, and
        `fetch_mp_data.py` may not generate this one. Absent is silence, the
        same rule `validate_data.py` follows."""
        with tempfile.TemporaryDirectory() as tmp:
            mps, _, _, _ = self.substitute()
            base, cur = self.dirs(Path(tmp), mps, None)
            report = C.classify(base, cur)

        self.assertFalse(report["seating"]["present"])
        self.assertFalse(C.needs_seating(report))
        self.assertEqual(P.seating_block(report), [])


class TestStaleAlignment(Fixture):
    """♻️ — a uuid in the overlay that is no longer non-affiliated.

    `validate_data.py` treats these as fatal (they break the "exactly one of
    defectors/unaligned" rule), so the report has to name them or the reviewer
    is left with a red validator and no explanation.
    """

    def write(self, d: Path, mps: list[dict]) -> None:
        d.mkdir(parents=True, exist_ok=True)
        (d / "mps.json").write_text(json.dumps(mps), encoding="utf-8")
        (d / "board.json").write_text(json.dumps(B.build_board(mps)), encoding="utf-8")
        (d / "meta.json").write_text(
            json.dumps(B.build_meta(mps, self.alignment, unclassified="unaligned")),
            encoding="utf-8",
        )
        (d / "alignment.json").write_bytes(
            (REPO / "data" / "alignment.json").read_bytes()
        )

    def test_defector_who_left_parliament(self):
        gone = next(
            m for m in self.mps
            if m["uuid"] in (self.alignment.get("defectors") or {})
        )
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            self.write(tmp / "base", self.mps)
            self.write(tmp / "cur", [m for m in self.mps if m["uuid"] != gone["uuid"]])
            report = C.classify(tmp / "base", tmp / "cur")

            self.assertEqual(
                [s["uuid"] for s in report["stale_alignment"]], [gone["uuid"]]
            )
            self.assertEqual(report["stale_alignment"][0]["reason"],
                             "no longer in parliament")
            self.assertEqual([m["name"] for m in report["roster"]["left"]],
                             [gone["name"]])
            body = P.render(report, "September 2026")
            self.assertIn("♻️ Stale `alignment.json` entries", body)
            self.assertIn(gone["name"], body)

    def test_unaligned_mp_who_rejoined_a_group(self):
        mps = copy.deepcopy(self.mps)
        rejoined = next(
            m for m in mps if m["uuid"] in set(self.alignment.get("unaligned") or [])
        )
        rejoined.update(
            faction="Isamaa Parliamentary Group",
            registeredPartyId="isamaa",
        )
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            self.write(tmp / "base", self.mps)
            self.write(tmp / "cur", mps)
            report = C.classify(tmp / "base", tmp / "cur")

            self.assertEqual(
                [s["uuid"] for s in report["stale_alignment"]], [rejoined["uuid"]]
            )
            self.assertIn("Isamaa", report["stale_alignment"][0]["reason"])
            # Joining a group mid-term is not possible under §40-42 — the same
            # event is therefore also an ACTION REQUIRED item, not routine.
            self.assertEqual(
                [(a["name"], a["reason"]) for a in report["action_required"]],
                [(rejoined["name"], "unexpected_faction_change")],
            )
            self.assertIn("§40–42", P.render(report, "September 2026"))


class TestNoChangeIsNoPr(Fixture):
    """The fixture against itself: no categories, no PR."""

    def test_identical_data_reports_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            d = tmp / "d"
            d.mkdir()
            (d / "mps.json").write_text(json.dumps(self.mps), encoding="utf-8")
            (d / "board.json").write_text(
                json.dumps(B.build_board(self.mps)), encoding="utf-8"
            )
            (d / "meta.json").write_text(
                json.dumps(B.build_meta(self.mps, self.alignment)), encoding="utf-8"
            )
            (d / "alignment.json").write_bytes(
                (REPO / "data" / "alignment.json").read_bytes()
            )
            report = C.classify(d, d)
            self.assertFalse(C.has_changes(report))
            self.assertIn("No substantive changes", P.render(report, "August 2026"))


if __name__ == "__main__":
    unittest.main()
