"""Validate normalized national polling snapshots and compare with a baseline."""
import argparse
from datetime import date, datetime
import json
import re
from pathlib import Path

SOURCE_URL = "https://kiir.kusitlus.com/_datasets_public/rk-ratings/ratings-compact.json"
PARTIES_FILE = Path(__file__).resolve().parents[1] / "data/poll-parties.json"
SERIES = ("weekly", "fourWeek")
SAMPLES = ("total", "voters", "effectiveTotal", "effectiveVoters")
LARGE_CHANGE = {"weekly": 10, "fourWeek": 5}


class InvalidPolls(ValueError):
    """The provider or candidate violated an expected polling data contract."""


def require(condition, message):
    if not condition:
        raise InvalidPolls(message)


def iso_date(value):
    require(isinstance(value, str) and bool(re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value)),
            f"Invalid date: {value!r}")
    try:
        return date.fromisoformat(value)
    except ValueError as error:
        raise InvalidPolls(f"Invalid date: {value!r}") from error


def parse_json(data):
    def unique(pairs):
        record = {}
        for key, value in pairs:
            require(key not in record, f"Duplicate JSON key {key!r}")
            record[key] = value
        return record

    def invalid_constant(value):
        raise InvalidPolls(f"Invalid JSON number {value}")

    return json.loads(data, object_pairs_hook=unique, parse_constant=invalid_constant)


def read_json(path):
    return parse_json(Path(path).read_bytes())


def public_parties(mapping):
    return [{key: row[key] for key in ("id", "name", "color", "other")} for row in mapping]


def valid_scaled(value, scale):
    return value is None or type(value) is int and 0 <= value <= 100 * scale


def validate(snapshot, mapping=None):
    require(isinstance(snapshot, dict) and type(snapshot.get("schema")) is int and snapshot["schema"] == 1, "Wrong normalized schema")
    scale = snapshot.get("scale")
    require(type(scale) is int and scale in (1, 10, 100, 1000, 10000), "Invalid scaling divisor")
    source = snapshot.get("source")
    require(isinstance(source, dict) and source.get("url") == SOURCE_URL and
            source.get("schema") == 3 and type(source.get("importerVersion")) is int and
            source["importerVersion"] > 0 and isinstance(source.get("sha256"), str) and
            bool(re.fullmatch(r"[0-9a-f]{64}", source["sha256"])), "Invalid source provenance")
    retrieved = source.get("retrievedAt")
    require(isinstance(retrieved, str) and bool(re.fullmatch(
        r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z", retrieved)),
        "Invalid retrieval timestamp")
    try:
        retrieved_date = datetime.fromisoformat(retrieved).date()
    except ValueError as error:
        raise InvalidPolls("Invalid retrieval timestamp") from error
    require(snapshot.get("basis") == "voters" and snapshot.get("nonvoterLabel") == "Mittevalija",
            "Unknown denominator or nonvoter label")
    expected = public_parties(mapping if mapping is not None else read_json(PARTIES_FILE))
    require(snapshot.get("parties") == expected, "Missing or altered mapped party metadata")
    party_ids = {party["id"] for party in expected}
    require(len(party_ids) == len(expected) and "other" not in party_ids and
            any(p["other"] for p in expected) and any(not p["other"] for p in expected),
            "Invalid party IDs or Other grouping")
    require(isinstance(snapshot.get("series"), dict) and set(snapshot["series"]) == set(SERIES),
            "Expected exactly the two national series")
    weekly_dates = {}
    for series in SERIES:
        waves = snapshot["series"][series]
        require(isinstance(waves, list) and waves, f"Missing {series} observations")
        ids = set()
        last_start = last_end = date.min
        for wave in waves:
            require(isinstance(wave, dict), f"Invalid {series} observation")
            wave_id = wave.get("id")
            pattern = r"[0-9]+" if series == "weekly" else r"[0-9]+-[0-9]+"
            require(isinstance(wave_id, str) and bool(re.fullmatch(pattern, wave_id)) and wave_id not in ids,
                    f"Missing or duplicate {series} wave ID {wave_id!r}")
            ids.add(wave_id)
            label = f"{series} {wave_id}"
            start, end = iso_date(wave.get("start")), iso_date(wave.get("end"))
            require(last_start <= start <= end <= retrieved_date and last_end < end,
                    f"{label}: unordered fieldwork")
            last_start, last_end = start, end
            if series == "weekly":
                weekly_dates[wave_id] = end
            else:
                first, last = wave_id.split("-")
                require(first in weekly_dates and int(last) - int(first) == 3 and
                        weekly_dates.get(last) == end, f"{label}: inconsistent weekly references")
            require(type(wave.get("startInferred")) is bool, f"{label}: missing start provenance")
            if wave.get("published") is not None:
                require(end <= iso_date(wave["published"]) <= retrieved_date, f"{label}: bad release date")
            sample = wave.get("sample")
            require(isinstance(sample, dict) and set(sample) == set(SAMPLES) and
                    all(type(value) is int and value > 0 for value in sample.values()) and
                    sample["voters"] <= sample["total"] and sample["effectiveTotal"] <= sample["total"] and
                    sample["effectiveVoters"] <= min(sample["voters"], sample["effectiveTotal"]),
                    f"{label}: invalid sample measures")
            values = wave.get("values")
            require(isinstance(values, dict) and set(values) == party_ids and
                    all(valid_scaled(value, scale) for value in values.values()),
                    f"{label}: invalid or incomplete party values")
            require("nonvoter" in wave and valid_scaled(wave["nonvoter"], scale),
                    f"{label}: invalid nonvoter value")
            available = [value for value in values.values() if value is not None]
            total = sum(available)
            # Half of one source unit per rounded category. Missing history has only an upper bound.
            tolerance = len(available) / 2
            require(total <= 100 * scale + tolerance and
                    (len(available) < len(values) or total >= 100 * scale - tolerance),
                    f"{label}: party total {total / scale:g}% outside rounding tolerance")
        require(all(value is not None for value in waves[-1]["values"].values()),
                f"{series}: latest observation has unavailable categories")
    return snapshot


def compare(candidate, baseline):
    result = {"changed": baseline is None, "latest": {}, "corrections": [], "reviewFlags": []}
    for series in SERIES:
        waves = candidate["series"][series]
        result["latest"][series] = {k: waves[-1][k] for k in ("id", "start", "end")}
    if baseline is None:
        return result
    require(candidate["source"]["retrievedAt"] >= baseline["source"]["retrievedAt"],
            "Candidate was retrieved before the published snapshot")
    require(candidate["scale"] == baseline["scale"], "Source precision changed; review the migration")
    result["changed"] = any(candidate[key] != baseline[key]
                            for key in ("parties", "series", "basis", "nonvoterLabel"))
    for series in SERIES:
        waves = candidate["series"][series]
        old = baseline["series"][series]
        old_by_id = {wave["id"]: wave for wave in old}
        current_ids = {wave["id"] for wave in waves}
        missing = old_by_id.keys() - current_ids
        require(not missing, f"{series}: history removed ({', '.join(sorted(missing)[:10])})")
        require(waves[-1]["end"] >= old[-1]["end"], f"{series}: latest fieldwork rolled back")
        for index, wave in enumerate(waves):
            previous = old_by_id.get(wave["id"])
            if previous is not None:
                corrected = [key for key in wave if key != "published" and wave[key] != previous.get(key)]
                if corrected:
                    result["corrections"].append(f"{series} {wave['id']} ({', '.join(corrected)})")
                continue
            if wave["end"] <= old[-1]["end"]:
                result["reviewFlags"].append(f"{series} {wave['id']}: historical observation added")
            if index == 0:
                continue
            for party, value in wave["values"].items():
                prior = waves[index - 1]["values"].get(party)
                if value is not None and prior is not None:
                    delta = (value - prior) / candidate["scale"]
                    if abs(delta) >= LARGE_CHANGE[series]:
                        result["reviewFlags"].append(f"{series} {wave['id']} {party}: {delta:+g} pp")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("candidate", type=Path)
    args = parser.parse_args()
    try:
        snapshot = validate(read_json(args.candidate))
    except (ValueError, OSError) as error:
        parser.exit(1, f"Invalid polls dataset: {error}\n")
    print("Validated " + ", ".join(f"{key}: {len(waves)} observations"
                                   for key, waves in snapshot["series"].items()))
