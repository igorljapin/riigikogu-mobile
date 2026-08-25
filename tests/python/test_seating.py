#!/usr/bin/env python3
"""`validate_data.py`'s seating rules — the desktop surface's floor plan.

`data/seating.json` is the one file in `data/` that no script can generate: the
Riigikogu API publishes no seat, so the positions were harvested once from the
retiring desktop bundle and are hand-maintained from there (`data/README.md`,
"Who writes what"). Hand-maintained plus roster churn is exactly the shape of
data that silently rots, so the validator joins it to `mps.json` in both
directions and this file holds that join to the four ways it can break: an
orphan seat, a member with none, two members in one cell, and a coordinate off
the grid.

The fifth case is the one that is *not* a failure: a staging directory with no
`seating.json` at all. `fetch_mp_data.py` stages only the files it generates and
validates that directory before publishing; a hard requirement there would fail
the monthly job every month on a file it is forbidden to write.

The sixth is the one the monthly job meets in the wild — a roster change nobody
has seated yet (`SeatingPendingFlag`, Phase 3 PR C). `--allow-pending-seating`
downgrades the two join rules to warnings so the job can still open its PR, and
downgrades nothing else.

**Every test here reads the committed `data/`, and therefore assumes a complete
floor plan** — true on `main` and in any PR a human opens, and *not* true inside
the monthly job between its fetch and the reviewer's edit. The job runs this
suite in-process on that mid-flight tree (a PR created with `GITHUB_TOKEN` does
not trigger the Usability Contract workflow, so its gate has to be in-job), and
without the guard below the module would fail there on exactly the state
`--allow-pending-seating` exists to let through — no PR, and nothing for the
reviewer to fix it in. `PENDING_SEATING=true` is set by that job and by nothing
else, from its own compare step; the flagged validator is the gate for that run,
and the moment the reviewer commits the seat, their push runs this module in full
against the fixed data.

Run: python3 -m unittest discover -s tests/python
"""

from __future__ import annotations

import copy
import json
import os
import subprocess
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "data"
VALIDATOR = REPO / "scripts" / "validate_data.py"

#: Set by `.github/workflows/monthly-mp-check.yml` when its compare step found a
#: roster change the curated floor plan has not caught up with. Never set
#: locally or in the Usability Contract workflow.
PENDING_SEATING = os.environ.get("PENDING_SEATING") == "true"


def setUpModule() -> None:
    if PENDING_SEATING:
        raise unittest.SkipTest(
            "PENDING_SEATING=true: the monthly job fetched a roster the committed "
            "seating plan has not caught up with, so `data/` is mid-flight and "
            "every assertion here assumes it is not. `validate_data.py "
            "--allow-pending-seating` is that run's gate; this module runs in full "
            "again on the reviewer's push."
        )

FILES = (
    "parties.json",
    "mps.json",
    "alignment.json",
    "board.json",
    "meta.json",
    "catalogues.json",
    "seating.json",
)


class SeatingCase(unittest.TestCase):
    """Each test copies `data/` to a temp dir, sabotages the seating, and runs
    the real validator over it. Nothing here mutates the repository."""

    def run_validator(self, data: Path, *flags: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            [sys.executable, str(VALIDATOR), "--data", str(data), *flags],
            capture_output=True,
            text=True,
        )

    def stage(
        self,
        tmp: str,
        mutate=None,
        *,
        omit_seating: bool = False,
        mutate_mps=None,
    ) -> Path:
        data = Path(tmp) / "data"
        data.mkdir()
        for name in FILES:
            if name == "seating.json" and omit_seating:
                continue
            (data / name).write_bytes((DATA / name).read_bytes())

        if mutate_mps is not None:
            mps = json.loads((data / "mps.json").read_text(encoding="utf-8"))
            mutate_mps(mps)
            (data / "mps.json").write_text(
                json.dumps(mps, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )

        if mutate is not None:
            seating = json.loads((data / "seating.json").read_text(encoding="utf-8"))
            mutate(seating)
            (data / "seating.json").write_text(
                json.dumps(seating, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
        return data

    def assert_fails_with(self, mutate, needle: str) -> None:
        with TemporaryDirectory() as tmp:
            result = self.run_validator(self.stage(tmp, mutate))
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn(needle, result.stdout + result.stderr)


class SeatingValidation(SeatingCase):
    """The join, and the four ways it breaks."""

    # ---- the file as committed ------------------------------------------- #

    def test_the_committed_seating_validates(self):
        with TemporaryDirectory() as tmp:
            result = self.run_validator(self.stage(tmp))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("101 seats on a 10×12 grid", result.stdout)

    def test_every_active_mp_has_exactly_one_seat(self):
        seating = json.loads((DATA / "seating.json").read_text(encoding="utf-8"))
        mps = json.loads((DATA / "mps.json").read_text(encoding="utf-8"))
        active = {m["uuid"] for m in mps if m.get("active") is not False}

        self.assertEqual(set(seating["seats"]), active)
        cells = {(s["row"], s["col"]) for s in seating["seats"].values()}
        self.assertEqual(len(cells), len(active))

    # ---- the four ways the join breaks ----------------------------------- #

    def test_a_seat_for_someone_who_is_not_an_mp_fails(self):
        def mutate(seating):
            seating["seats"]["00000000-dead-beef-0000-000000000000"] = {
                "name": "Nobody At All", "row": 9, "col": 11,
            }

        self.assert_fails_with(mutate, "not an active MP")

    def test_an_mp_with_no_seat_fails(self):
        def mutate(seating):
            seating["seats"].pop(next(iter(seating["seats"])))

        # The half a reader cannot see: the floor just quietly loses a member.
        self.assert_fails_with(mutate, "has no seat")

    def test_two_mps_in_one_cell_fails(self):
        def mutate(seating):
            first, second = list(seating["seats"])[:2]
            seating["seats"][second] = copy.deepcopy(seating["seats"][first])
            seating["seats"][second]["name"] = "Doubled Up"

        self.assert_fails_with(mutate, "both sit at row")

    def test_a_coordinate_off_the_grid_fails(self):
        def mutate(seating):
            seating["seats"][next(iter(seating["seats"]))]["row"] = 99

        self.assert_fails_with(mutate, "outside 0..9")

    def test_a_non_integer_coordinate_fails(self):
        def mutate(seating):
            seating["seats"][next(iter(seating["seats"]))]["col"] = "3"

        self.assert_fails_with(mutate, "must be integers")

    def test_a_broken_grid_dimension_fails(self):
        def mutate(seating):
            seating["gridDimensions"]["rows"] = 0

        self.assert_fails_with(mutate, "gridDimensions.rows")

    def test_a_malformed_entry_reports_rather_than_tracebacks(self):
        """A hand-edited file is a file with typos in it. The validator's job is
        to print a FAIL report naming the bad entry; a traceback is a worse
        answer to "what is wrong with my edit" than a sentence is."""
        cases = (
            ("a seat as a list", lambda s: s["seats"].update(
                {next(iter(s["seats"])): ["Someone", 0, 0]}), "expected an object"),
            ("gridDimensions as a list", lambda s: s.update(
                {"gridDimensions": [10, 12]}), "gridDimensions must be an object"),
            ("seats as a list", lambda s: s.update({"seats": []}),
             "seats must be an object"),
        )
        for label, mutate, needle in cases:
            with self.subTest(label):
                with TemporaryDirectory() as tmp:
                    result = self.run_validator(self.stage(tmp, mutate))
                self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
                self.assertNotIn("Traceback", result.stderr)
                self.assertIn(needle, result.stdout + result.stderr)

    def test_a_top_level_that_is_not_an_object_reports(self):
        with TemporaryDirectory() as tmp:
            data = self.stage(tmp)
            (data / "seating.json").write_text('["not", "an", "object"]', encoding="utf-8")
            result = self.run_validator(data)
        self.assertEqual(result.returncode, 1)
        self.assertNotIn("Traceback", result.stderr)
        self.assertIn("expected an object at the top level", result.stdout + result.stderr)

    # ---- names are advisory ---------------------------------------------- #

    def test_a_stale_name_warns_but_publishes(self):
        """`mps.json` is the authority on names; a drift here is a note, not a
        blocker. The API does respell people, and a rename must not stop a
        publish whose seat arithmetic is perfectly correct."""

        def mutate(seating):
            seating["seats"][next(iter(seating["seats"]))]["name"] = "Renamed Since"

        with TemporaryDirectory() as tmp:
            result = self.run_validator(self.stage(tmp, mutate))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("in mps.json", result.stdout)

    # ---- absent is not an error ------------------------------------------ #

    def test_a_staging_directory_without_seating_still_validates(self):
        """The monthly job's staging directory holds only generated files. It
        must keep validating — `fetch_mp_data.py` may not write this one."""
        with TemporaryDirectory() as tmp:
            result = self.run_validator(self.stage(tmp, omit_seating=True))
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("seating checks skipped", result.stdout)


class SeatingPendingFlag(SeatingCase):
    """`--allow-pending-seating` — the monthly job's escape hatch, and its limit.

    The job is forbidden from writing `seating.json`, so a substitution it
    fetched reaches the PR with a member who has nowhere to sit and a chair
    nobody is in. Failing there would leave the reviewer with no PR to fix it in.
    The flag therefore downgrades exactly those two rules and leaves every other
    one fatal — the same bargain `--allow-pending-alignment` strikes with the
    bloc overlay, and `generate_pr_body.py` is what turns the warning into an
    instruction the reviewer can act on.
    """

    #: A substitution: one member of a parliamentary group replaced by someone
    #: the floor plan has never heard of. Picked from a party rather than from
    #: the non-affiliated so the alignment overlay stays intact and the seating
    #: rules are the only thing under test.
    NEW_UUID = "11111111-2222-3333-4444-555555555555"

    def substitute(self, mps: list[dict]) -> None:
        leaving = next(
            m for m in mps
            if m["registeredPartyId"] != "independent" and not m.get("boardRole")
        )
        leaving["uuid"] = self.NEW_UUID
        leaving["name"] = "Kaja Uustee"
        leaving["profileUrl"] = f"https://www.riigikogu.ee/en/saadik/{self.NEW_UUID}"
        # The portrait is keyed by uuid, and the validator says so: a member
        # carrying the record of the one they replaced is a wrong face on a row,
        # which is a rule that must stay fatal here rather than becoming the
        # seating failure this class is about.
        leaving["photo"] = f"assets/mps/{self.NEW_UUID}.webp"

    def test_an_unseated_substitution_fails_by_default(self):
        with TemporaryDirectory() as tmp:
            result = self.run_validator(self.stage(tmp, mutate_mps=self.substitute))
        out = result.stdout + result.stderr
        self.assertEqual(result.returncode, 1, out)
        self.assertIn("has no seat", out)
        self.assertIn("not an active MP", out)

    def test_the_flag_downgrades_both_halves_to_warnings(self):
        with TemporaryDirectory() as tmp:
            result = self.run_validator(
                self.stage(tmp, mutate_mps=self.substitute), "--allow-pending-seating"
            )
        out = result.stdout + result.stderr
        self.assertEqual(result.returncode, 0, out)
        self.assertIn("PENDING SEAT ASSIGNMENT", out)
        # A warning, not a silence: the reviewer has to be able to see it in the
        # job log as well as in the PR body.
        self.assertIn("warn:", out)

    def test_the_flag_downgrades_nothing_else(self):
        """Every other seating rule still fails the job with the flag on. A
        pending seat is a file waiting for an edit; a duplicated cell or a
        coordinate off the grid is a file with a mistake in it."""
        cases = (
            ("two members in one cell", "both sit at row"),
            ("a coordinate off the grid", "outside 0..9"),
        )
        for label, needle in cases:
            with self.subTest(label):
                def mutate(seating, label=label):
                    first, second = list(seating["seats"])[:2]
                    if label.startswith("two"):
                        seating["seats"][second] = copy.deepcopy(seating["seats"][first])
                    else:
                        seating["seats"][first]["row"] = 99

                with TemporaryDirectory() as tmp:
                    result = self.run_validator(
                        self.stage(tmp, mutate, mutate_mps=self.substitute),
                        "--allow-pending-seating",
                    )
                out = result.stdout + result.stderr
                self.assertEqual(result.returncode, 1, out)
                self.assertIn(needle, out)

    def test_the_flag_changes_nothing_when_nothing_is_pending(self):
        """The committed data validates identically either way — the flag is
        about a state the repository is not normally in."""
        with TemporaryDirectory() as tmp:
            result = self.run_validator(self.stage(tmp), "--allow-pending-seating")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertNotIn("PENDING SEAT ASSIGNMENT", result.stdout)
        self.assertIn("101 seats on a 10×12 grid", result.stdout)

    def test_the_alignment_flag_does_not_cover_seats(self):
        """The two escape hatches are separate on purpose: a defection is not a
        substitution, and neither flag may quietly forgive the other's file."""
        with TemporaryDirectory() as tmp:
            result = self.run_validator(
                self.stage(tmp, mutate_mps=self.substitute), "--allow-pending-alignment"
            )
        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("has no seat", result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
