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

Run: python3 -m unittest discover -s tests/python
"""

from __future__ import annotations

import copy
import json
import subprocess
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "data"
VALIDATOR = REPO / "scripts" / "validate_data.py"

FILES = (
    "parties.json",
    "mps.json",
    "alignment.json",
    "board.json",
    "meta.json",
    "catalogues.json",
    "seating.json",
)


class SeatingValidation(unittest.TestCase):
    """Each test copies `data/` to a temp dir, sabotages the seating, and runs
    the real validator over it. Nothing here mutates the repository."""

    def run_validator(self, data: Path) -> subprocess.CompletedProcess:
        return subprocess.run(
            [sys.executable, str(VALIDATOR), "--data", str(data)],
            capture_output=True,
            text=True,
        )

    def stage(self, tmp: str, mutate=None, *, omit_seating: bool = False) -> Path:
        data = Path(tmp) / "data"
        data.mkdir()
        for name in FILES:
            if name == "seating.json" and omit_seating:
                continue
            (data / name).write_bytes((DATA / name).read_bytes())

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


if __name__ == "__main__":
    unittest.main()
