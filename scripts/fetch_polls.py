#!/usr/bin/env python3
"""Fetch or read compact v3 national polling data and write a validated candidate."""
import argparse
from datetime import datetime, timedelta, timezone
import gzip
import hashlib
from http.client import HTTPException
import io
import json
from pathlib import Path
import re
import time
import unicodedata
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener
import zlib

from validate_polls import (
    InvalidPolls, PARTIES_FILE, SAMPLES, SERIES, SOURCE_URL, compare, iso_date,
    parse_json, public_parties, read_json, require, validate,
)

IMPORTER_VERSION = 1
MAX_PAYLOAD = 12_000_000


class SourceUnavailable(RuntimeError):
    """No source response was available to validate."""


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def named(value):
    return isinstance(value, str) and bool(value.strip())


def compact_date(value):
    require(isinstance(value, str) and bool(re.fullmatch(r"[0-9]{4}\.[0-9]{2}\.[0-9]{2}", value)),
            f"Invalid compact fieldwork date {value!r}")
    return iso_date(value.replace(".", "-"))


def party_key(name):
    require(named(name), "Missing source party label")
    return unicodedata.normalize("NFC", " ".join(name.split())).casefold()


def resolve_parties(names, mapping):
    aliases = {}
    ids = set()
    for party in mapping:
        party_id = party["id"]
        require(isinstance(party_id, str) and bool(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", party_id))
                and party_id not in ids and party_id != "other", f"Invalid party ID {party_id!r}")
        require(named(party["name"]) and type(party["other"]) is bool and
                bool(re.fullmatch(r"#[0-9a-fA-F]{6}", party["color"])), f"Invalid metadata for {party_id}")
        ids.add(party_id)
        for label in [party["sourceName"], *party["aliases"]]:
            key = party_key(label)
            require(key not in aliases, f"Duplicate party alias {label!r}")
            aliases[key] = party_id
    mapped = [aliases.get(party_key(name)) for name in names]
    unknown = [name for name, party_id in zip(names, mapped) if party_id is None]
    require(not unknown, f"Review unmapped source categories: {unknown!r}")
    require(len(set(mapped)) == len(mapped), "Several source categories resolve to the same party")
    return mapped


def reference(value, length):
    return type(value) is int and 0 <= value < length


def wave_dates(rows, series, weekly):
    resolved = {}
    previous_end = None
    for row in rows:
        require(isinstance(row, list) and len(row) in (2, 3), f"{series}: malformed wave")
        wave_id = row[0]
        pattern = r"[0-9]+" if series == "weekly" else r"[0-9]+-[0-9]+"
        require(isinstance(wave_id, str) and bool(re.fullmatch(pattern, wave_id)) and wave_id not in resolved,
                f"{series}: malformed or duplicate wave ID {wave_id!r}")
        end = compact_date(row[-1])
        explicit_start = row[1] if len(row) == 3 else ""
        inferred = explicit_start == ""
        if series == "fourWeek":
            first, last = wave_id.split("-")
            require(first in weekly and last in weekly and
                    int(last) - int(first) == 3 and end.isoformat() == weekly[last]["end"],
                    f"{series} {wave_id}: invalid weekly references")
        if not inferred:
            start = compact_date(explicit_start)
        elif series == "fourWeek":
            start = iso_date(weekly[first]["start"])
        else:
            start = previous_end + timedelta(days=1) if previous_end else end
        require(start <= end and (previous_end is None or end > previous_end),
                f"{series} {wave_id}: unordered fieldwork")
        resolved[wave_id] = {
            "id": wave_id, "start": start.isoformat(), "end": end.isoformat(),
            "startInferred": inferred, "published": None,
        }
        previous_end = end
    return resolved


def block_dimensions(block, axes, party_count, block_index):
    label = f"Block {block_index}"
    require(isinstance(block, list) and len(block) == 5, f"{label}: expected five fields")
    axis, party_refs, rows, nonvoter, samples = block
    require(reference(axis, len(axes)), f"{label}: invalid axis reference")
    require(isinstance(party_refs, list) and all(reference(index, party_count) for index in party_refs)
            and len(set(party_refs)) == len(party_refs), f"{label}: invalid party references")
    require(isinstance(rows, list) and len(rows) == len(party_refs) and
            isinstance(samples, list) and len(samples) == len(SAMPLES), f"{label}: invalid dimensions")
    width = len(axes[axis][1])
    require(all(isinstance(row, list) and len(row) == width for row in [*rows, nonvoter, *samples]),
            f"{label}: values and axis have different lengths")


def decode(payload, mapping, source):
    require(isinstance(payload, dict) and type(payload.get("v")) is int and payload["v"] == 3,
            "Unsupported source schema; review the publisher decoder")
    require(set(payload) == set("vqnsparbg"), "Unexpected compact v3 fields")
    scale = payload["q"]
    require(type(scale) is int and scale in (1, 10, 100, 1000, 10000), "Invalid source divisor")
    require(payload["n"] == "Mittevalija" and payload["s"] == list(SAMPLES),
            "Unrecognized sample fields or nonvoter label")
    names, axes, national, blocks, groups = (payload[key] for key in "parbg")
    require(isinstance(names, list) and isinstance(axes, list) and isinstance(blocks, list) and
            isinstance(groups, list), "Invalid compact dictionaries")
    ids = resolve_parties(names, mapping)
    require(len(axes) == 2 and all(isinstance(axis, list) and len(axis) == 2 and
                                  named(axis[0]) and isinstance(axis[1], list) and axis[1] for axis in axes)
            and {name for name, _ in axes} == {"w1", "w4"}, "Expected weekly and four-week axes")
    require(isinstance(national, list) and len(national) == 2 and
            all(reference(index, len(blocks)) for index in national) and national[0] != national[1],
            "Invalid national block references")
    for index, block in enumerate(blocks):
        block_dimensions(block, axes, len(names), index)

    group_keys = set()
    for group in groups:
        require(isinstance(group, list) and len(group) == 3, "Invalid demographic group reference")
        key, label, entries = group
        require(named(key) and key not in group_keys and named(label) and isinstance(entries, list),
                "Invalid or duplicate demographic group")
        group_keys.add(key)
        entry_labels = set()
        for entry in entries:
            require(isinstance(entry, list) and len(entry) == 2 and named(entry[0]) and
                    entry[0] not in entry_labels and reference(entry[1], len(blocks)),
                    f"Invalid category reference in demographic group {key!r}")
            entry_labels.add(entry[0])

    result = {}
    weekly_dates = {}
    for series, expected_axis, block_index in zip(SERIES, ("w1", "w4"), national):
        axis, party_refs, party_rows, nonvoter, samples = blocks[block_index]
        axis_name, rows = axes[axis]
        require(axis_name == expected_axis, f"Wrong axis for {series}: {axis_name}")
        lookup = {ids[index]: row for index, row in zip(party_refs, party_rows)}
        require(lookup.keys() == {row["id"] for row in mapping},
                f"{series}: review missing national categories")
        waves = wave_dates(rows, series, weekly_dates)
        if series == "weekly":
            weekly_dates = waves
        result[series] = [
            {**wave, "sample": dict(zip(SAMPLES, (row[index] for row in samples))),
             "nonvoter": nonvoter[index],
             "values": {p["id"]: lookup[p["id"]][index] for p in mapping}}
            for index, wave in enumerate(waves.values())
        ]
    return validate({
        "schema": 1, "scale": scale, "basis": "voters", "nonvoterLabel": payload["n"],
        "source": source, "parties": public_parties(mapping), "series": result,
    }, mapping)


def source_metadata(body, at, headers):
    timestamp = datetime.fromisoformat(at)
    require(timestamp.tzinfo is not None, "Retrieval timestamp has no timezone")
    return {
        "url": SOURCE_URL, "schema": 3, "importerVersion": IMPORTER_VERSION,
        "retrievedAt": timestamp.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z"),
        "sha256": hashlib.sha256(body).hexdigest(),
        "etag": headers.get("etag"), "lastModified": headers.get("last-modified"),
    }


def from_capture(path, metadata_file):
    metadata = read_json(metadata_file)
    require(isinstance(metadata, dict) and metadata.get("status") == 200 and metadata.get("requestedUrl") == SOURCE_URL and
            metadata.get("finalUrl") == SOURCE_URL, "Invalid capture source")
    require(path.stat().st_size <= MAX_PAYLOAD, "Capture is too large")
    body = path.read_bytes()
    headers = {key.lower(): value for key, value in metadata["headers"]}
    source = source_metadata(body, metadata["retrievedAt"], headers)
    require(len(body) == metadata.get("decodedBytes") and source["sha256"] == metadata.get("decodedSha256"),
            "Capture checksum or byte count does not match")
    return body, source


def fetch(previous):
    headers = {"Accept": "application/json", "Accept-Encoding": "gzip", "User-Agent": "Riigikogu-Polls/1"}
    if previous and previous.get("importerVersion") == IMPORTER_VERSION:
        for key, header in (("etag", "If-None-Match"), ("lastModified", "If-Modified-Since")):
            if previous.get(key):
                headers[header] = previous[key]
    opener = build_opener(NoRedirect())
    for attempt in range(3):
        try:
            deadline = time.monotonic() + 20
            with opener.open(Request(SOURCE_URL, headers=headers), timeout=8) as response:
                require(response.status == 200 and response.headers.get_content_type() == "application/json",
                        "Unexpected source response status or content type")
                chunks = bytearray()
                while chunk := response.read1(65536):
                    if time.monotonic() > deadline:
                        raise TimeoutError("Source read exceeded 20 seconds")
                    chunks.extend(chunk)
                    require(len(chunks) <= MAX_PAYLOAD, "Source payload is too large")
                encoding = response.headers.get("Content-Encoding", "identity").lower()
                if encoding == "gzip":
                    with gzip.GzipFile(fileobj=io.BytesIO(chunks)) as compressed:
                        body = compressed.read(MAX_PAYLOAD + 1)
                else:
                    require(encoding == "identity", f"Unsupported content encoding: {encoding}")
                    body = bytes(chunks)
                require(len(body) <= MAX_PAYLOAD, "Decoded source payload is too large")
                return body, source_metadata(body, datetime.now(timezone.utc).isoformat(),
                                             {key.lower(): value for key, value in response.headers.items()})
        except HTTPError as error:
            if error.code == 304 and previous and ("If-None-Match" in headers or "If-Modified-Since" in headers):
                return None
            reason = f"HTTP {error.code}"
            if error.code not in (408, 429, 500, 502, 503, 504):
                raise SourceUnavailable(reason) from error
        except (gzip.BadGzipFile, EOFError, zlib.error) as error:
            raise InvalidPolls("Invalid gzip source response") from error
        except (URLError, OSError, HTTPException) as error:
            reason = str(error)
        if attempt < 2:
            time.sleep(2 ** attempt)
    raise SourceUnavailable(reason)


def published_dates(candidate, baseline, release_date):
    if baseline:
        for series in SERIES:
            known = {(wave["id"], wave["start"], wave["end"]): wave["published"]
                     for wave in baseline["series"][series] if wave["published"]}
            for wave in candidate["series"][series]:
                wave["published"] = known.get((wave["id"], wave["start"], wave["end"]))
    if release_date:
        candidate["series"]["fourWeek"][-1]["published"] = release_date


def write_candidate(path, candidate):
    # One observation per line keeps ordinary weekly diffs small.
    header = {key: value for key, value in candidate.items() if key != "series"}
    series = []
    for key in SERIES:
        rows = ",\n".join("      " + json.dumps(wave, ensure_ascii=False) for wave in candidate["series"][key])
        series.append(f'    "{key}": [\n{rows}\n    ]')
    text = json.dumps(header, indent=2, ensure_ascii=False)[:-2] + ',\n  "series": {\n'
    path.write_text(text + ",\n".join(series) + "\n  }\n}\n", encoding="utf-8")


def run(args):
    if args.baseline and args.baseline.resolve() == args.output.resolve():
        raise InvalidPolls("Output must be staged separately from the baseline")
    mapping = read_json(PARTIES_FILE)
    baseline = validate(read_json(args.baseline), mapping) if args.baseline else None
    source_result = (from_capture(args.input, args.capture_metadata) if args.input else
                     fetch(baseline["source"] if baseline and not args.release_date else None))
    if source_result is None:
        return {**compare(baseline, baseline), "status": "source unchanged (HTTP 304)"}
    body, source = source_result
    # Disallow duplicate keys and non-finite constants on both input paths.
    payload = parse_json(body)
    candidate = decode(payload, mapping, source)
    published_dates(candidate, baseline, args.release_date)
    validate(candidate, mapping)
    report = compare(candidate, baseline)
    if report["changed"]:
        write_candidate(args.output, candidate)
    return {**report, "status": "validated change" if report["changed"] else "source unchanged (normalized content)"}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, help="Read a decompressed local source capture")
    parser.add_argument("--capture-metadata", type=Path, help="Capture provenance, timestamp and SHA-256")
    parser.add_argument("--baseline", type=Path, help="Last published normalized snapshot")
    parser.add_argument("--release-date", type=str, help="Independently verified date of latest four-week release")
    parser.add_argument("--output", type=Path, required=True, help="Write only validated, changed content here")
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    if bool(args.input) != bool(args.capture_metadata):
        parser.error("--input and --capture-metadata must be supplied together")
    protected = [path.resolve() for path in (args.baseline, args.input, args.capture_metadata) if path]
    if len({args.output.resolve(), args.report.resolve()}) != 2 or any(
        path.resolve() in protected for path in (args.output, args.report)
    ):
        parser.error("Output and report must be separate from each other and from inputs")
    try:
        report = run(args)
    except SourceUnavailable as error:
        report = {"status": "source unavailable", "error": str(error)}
    except (ValueError, OSError, TypeError, KeyError) as error:
        report = {"status": "invalid source data", "error": str(error)}
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(report["status"] + (f": {report['error']}" if "error" in report else ""))
    return 1 if "error" in report else 0


if __name__ == "__main__":
    raise SystemExit(main())
