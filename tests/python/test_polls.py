"""National polling adapter tests use a small extract of the Nov 18 capture."""
from copy import deepcopy
from hashlib import sha256
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import fetch_polls
from validate_polls import InvalidPolls, PARTIES_FILE, SOURCE_URL, compare, read_json

FIXTURE = ROOT / "tests/fixtures/polls/compact-v3.json"
MAPPING = read_json(PARTIES_FILE)
AT = "2026-11-18T13:44:46.834615+00:00"


def capture(raw, path):
    payload = json.dumps(raw).encode()
    source = path / "capture.json"
    source.write_bytes(payload)
    meta = path / "metadata.json"
    meta.write_text(json.dumps({
        "requestedUrl": SOURCE_URL, "finalUrl": SOURCE_URL, "status": 200,
        "retrievedAt": AT, "decodedBytes": len(payload), "decodedSha256": sha256(payload).hexdigest(),
        "headers": [["ETag", '"test-etag"']],
    }))
    return ["--input", str(source), "--capture-metadata", str(meta)]


class PollsAdapterTests(unittest.TestCase):
    def setUp(self):
        self.raw = read_json(FIXTURE)
        self.source = fetch_polls.source_metadata(FIXTURE.read_bytes(), AT, {})
        self.base = self.decode()

    def decode(self):
        return fetch_polls.decode(self.raw, MAPPING, self.source)

    def test_series_percentages_samples_and_other(self):
        weekly, latest = [self.base["series"][key][-1] for key in ("weekly", "fourWeek")]
        self.assertEqual((weekly["id"], latest["id"]), ("395", "392-395"))
        self.assertEqual((latest["start"], latest["end"]), ("2026-10-19", "2026-11-15"))
        self.assertEqual(self.base["scale"], 10)
        self.assertEqual(latest["values"]["center"], 253)
        self.assertEqual(latest["values"]["stalnuhhin"], 0)
        self.assertEqual(latest["nonvoter"], 314)
        self.assertEqual(latest["sample"], dict(total=4000, voters=2760, effectiveTotal=3896, effectiveVoters=2695))
        self.assertEqual(weekly["sample"]["voters"], 696)
        self.assertEqual(sum(latest["values"][p["id"]] for p in self.base["parties"] if p["other"]), 28)

    def test_resolves_refs_aliases_missing_and_legacy_dates(self):
        self.raw["p"][1] = "  Reformierakond "
        self.raw["b"][0][2][1][0] = None
        self.raw["a"][0][1][-2].pop(1)
        self.raw["a"][1][1][-1].pop(1)
        self.raw["r"].reverse()
        self.raw["b"].reverse()
        self.raw["a"].reverse()
        for block in self.raw["b"]:
            block[0] = 1 - block[0]
        actual = self.decode()
        self.assertIsNone(actual["series"]["weekly"][0]["values"]["reform"])
        self.assertTrue(actual["series"]["weekly"][-2]["startInferred"])
        self.assertEqual(actual["series"]["fourWeek"][-1]["start"], "2026-10-19")
        self.assertTrue(actual["series"]["fourWeek"][-1]["startInferred"])

    def test_invalid_sources(self):
        invalid = {
            "schema": lambda raw: raw.update(v=4),
            "dimensions": lambda raw: raw["b"][0][3].pop(),
            "unknown party": lambda raw: raw["p"].__setitem__(1, "Unrecognized"),
            "bad flag as scale": lambda raw: raw.update(q=True),
            "duplicate party alias": lambda raw: raw["p"].__setitem__(1, "Isamaa"),
            "bad sample order": lambda raw: raw["s"].reverse(),
            "bad samples": lambda raw: raw["b"][0][4][1].__setitem__(-1, 1001),
            "bad references": lambda raw: raw["r"].__setitem__(1, -1),
            "null latest": lambda raw: raw["b"][0][2][1].__setitem__(-1, None),
            "no renormalization": lambda raw: raw["b"][0][2][1].__setitem__(-1, 0),
            "bad day": lambda raw: raw["a"][0][1][-1].__setitem__(2, "2026.11.31"),
        }
        for reason, mutate in invalid.items():
            with self.subTest(reason=reason):
                raw = deepcopy(self.raw)
                mutate(raw)
                with self.assertRaises(InvalidPolls):
                    fetch_polls.decode(raw, MAPPING, self.source)

    def test_changes_corrections_large_movements_and_rollback(self):
        later = deepcopy(self.base)
        retry = deepcopy(self.base)
        retry["source"]["retrievedAt"] = "2026-11-19T00:00:00.000000Z"
        self.assertFalse(compare(retry, self.base)["changed"])
        retry["series"]["fourWeek"][0]["sample"]["voters"] -= 1
        self.assertEqual(compare(retry, self.base)["corrections"], ["fourWeek 391-394 (sample)"])
        prior = deepcopy(self.base)
        prior["series"]["weekly"].pop()
        prior["series"]["fourWeek"].pop()
        later["series"]["weekly"][-1]["values"]["reform"] += 101
        later["series"]["weekly"][-1]["values"]["center"] -= 101
        fetch_polls.validate(later, MAPPING)
        self.assertTrue(compare(later, prior)["changed"])
        self.assertTrue(compare(later, prior)["reviewFlags"])
        with self.assertRaisesRegex(InvalidPolls, "history removed"):
            compare(prior, later)

    def test_staged_initial_unchanged_changed_and_invalid(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            initial, candidate, report = [path / name for name in ("initial.json", "candidate.json", "report.json")]
            args = capture(self.raw, path)

            def import_capture(output, baseline=None):
                command = ["fetch_polls", *args, "--output", str(output), "--report", str(report)]
                if baseline:
                    command.extend(("--baseline", str(baseline)))
                with patch.object(sys, "argv", command):
                    return fetch_polls.main()

            self.assertEqual(import_capture(initial), 0)
            original = initial.read_bytes()
            self.assertEqual(import_capture(candidate, initial), 0)
            self.assertFalse(candidate.exists())
            self.assertEqual(read_json(report)["status"], "source unchanged (normalized content)")
            self.raw["b"][1][4][1][0] -= 1
            args = capture(self.raw, path)
            self.assertEqual(import_capture(candidate, initial), 0)
            self.assertTrue(read_json(report)["changed"])
            candidate.unlink()
            self.raw["v"] = 4
            args = capture(self.raw, path)
            self.assertEqual(import_capture(candidate, initial), 1)
            self.assertFalse(candidate.exists())
            self.assertEqual(original, initial.read_bytes())

    def test_http_conditional_gzip_and_failure_share_decoder(self):
        import gzip
        from email.message import Message
        from urllib.error import HTTPError
        from io import BytesIO

        class Response(BytesIO):
            status = 200
            headers = Message()

        Response.headers["Content-Type"] = "application/json"
        Response.headers["Content-Encoding"] = "gzip"
        with patch.object(fetch_polls, "build_opener") as opener:
            opener.return_value.open.return_value = Response(gzip.compress(FIXTURE.read_bytes()))
            body, source = fetch_polls.fetch(None)
            self.assertEqual(body, FIXTURE.read_bytes())
            self.assertEqual(fetch_polls.decode(json.loads(body), MAPPING, source)["series"], self.base["series"])
            opener.return_value.open.side_effect = HTTPError(SOURCE_URL, 304, "", None, None)
            self.assertIsNone(fetch_polls.fetch({**self.source, "etag": '"test"'}))
            request = opener.return_value.open.call_args.args[0]
            self.assertEqual(dict(request.header_items())["If-none-match"], '"test"')
            opener.return_value.open.side_effect = HTTPError(SOURCE_URL, 403, "", None, None)
            with self.assertRaises(fetch_polls.SourceUnavailable):
                fetch_polls.fetch(None)
