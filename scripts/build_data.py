#!/usr/bin/env python3
"""Build data/*.json from the live Riigikogu API.

Phase 1 of ARCHITECTURE_PLAN.md. Regenerates every API-derived file wholesale;
the curated overlay in data/alignment.json is read, never rewritten, except that
a newly non-affiliated MP is appended to `unaligned` under the safe-default rule.

Usage:
    python3 scripts/build_data.py [--offline PATH_TO_PLENARY_MEMBERS_JSON]

Exits non-zero and writes nothing if the API response fails its guards.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

API = "https://api.riigikogu.ee/api/plenary-members?lang=EN"
USERGROUPS = "https://api.riigikogu.ee/api/usergroups?lang=EN"
USERGROUP = "https://api.riigikogu.ee/api/usergroups/{uuid}?lang=EN"
# The catalogue types worth recording: the parliamentary groups an MP can belong
# to, and the committees they can sit on. Everything else /usergroups returns
# (delegations, friendship groups, office units) is out of scope here.
FACTION_TYPES = ("FRAKTSIOON",)
COMMITTEE_TYPES = ("ALALINE_KOMISJON", "ERIKOMISJON", "UURIMISKOMISJON")
# Sanity bands for the catalogue. Seven groups and eleven standing committees is
# the settled shape of this convocation; a result far outside means /usergroups
# answered with something we should not publish.
FACTION_COUNT_RANGE = (5, 12)
STANDING_COMMITTEE_RANGE = (8, 15)
WEB_BASE = (
    "https://www.riigikogu.ee/en/parliament-of-estonia/composition/"
    "members-riigikogu/saadik"
)
CONVOCATION = 15
TOTAL_SEATS = 101
REPO = Path(__file__).resolve().parent.parent
DATA = REPO / "data"

FRAKTSIOON = "FRAKTSIOON"
NON_AFFILIATED = "Non-affiliated members"

# The parliamentary friendship group behind the 🇺🇸 marker on the Members tab.
# Matched by name rather than by a hardcoded uuid so a re-created group is still
# found; the uuid is recorded only to make the lookup traceable.
USA_GROUP_NAME = "Estonia-USA Parliamentary Friendship Group"
USA_GROUP_UUID = "359b4825-96a5-c066-6a30-dad416b5b3d5"
# Sanity band for that group's current membership. It has sat in the thirties
# all convocation; anything far outside means we resolved the wrong group.
USA_GROUP_RANGE = (15, 70)

# Party catalogue. Colours are the values measured from the deployed bundle's
# computed styles in BEHAVIOR_SNAPSHOT.md §6 — do not invent new ones.
PARTIES = [
    {"id": "reform",  "nameEn": "Estonian Reform Party",        "nameEt": "Eesti Reformierakond",            "short": "Reform",      "color": "#FFD700", "textColor": "#000000", "factionName": "Estonian Reform Party Parliamentary Group"},
    {"id": "e200",    "nameEn": "Estonia 200",                  "nameEt": "Eesti 200",                       "short": "Eesti 200",   "color": "#00AEEF", "textColor": "#FFFFFF", "factionName": "Estonia 200 Parliamentary Group"},
    {"id": "sde",     "nameEn": "Social Democratic Party",      "nameEt": "Sotsiaaldemokraatlik Erakond",    "short": "SDE",         "color": "#E4002B", "textColor": "#FFFFFF", "factionName": "Social Democratic Party Parliamentary Group"},
    {"id": "ekre",    "nameEn": "Estonian Conservative People's Party", "nameEt": "Eesti Konservatiivne Rahvaerakond", "short": "EKRE", "color": "#8B4513", "textColor": "#FFFFFF", "factionName": "Estonian Conservative People’s Party Parliamentary Group"},
    {"id": "isamaa",  "nameEn": "Isamaa",                       "nameEt": "Isamaa",                          "short": "Isamaa",      "color": "#0072BC", "textColor": "#FFFFFF", "factionName": "Isamaa Parliamentary Group"},
    {"id": "center",  "nameEn": "Estonian Centre Party",        "nameEt": "Eesti Keskerakond",               "short": "Center",      "color": "#007438", "textColor": "#FFFFFF", "factionName": "Estonian Centre Party Parliamentary Group"},
    {"id": "independent", "nameEn": "Non-affiliated members",   "nameEt": "Fraktsiooni mittekuuluvad liikmed", "short": "Independent", "color": "#808080", "textColor": "#FFFFFF", "factionName": NON_AFFILIATED},
]
BY_FACTION = {p["factionName"]: p["id"] for p in PARTIES}
BOARD_ORDER = [
    "President of the Riigikogu",
    "First Vice-President of the Riigikogu",
    "Second Vice-President of the Riigikogu",
]


# --------------------------------------------------------------------------- #
# fetch
# --------------------------------------------------------------------------- #
def fetch(url: str, attempts: int = 4) -> list:
    """GET with backoff. Raises on exhaustion — the caller must not write data."""
    last = None
    for i in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=60) as r:
                if r.status != 200:
                    raise RuntimeError(f"HTTP {r.status}")
                return json.loads(r.read().decode("utf-8"))
        except Exception as exc:  # noqa: BLE001 - retried, then re-raised
            last = exc
            if i < attempts - 1:
                time.sleep(2 ** (i + 1))
    raise RuntimeError(f"giving up on {url} after {attempts} attempts: {last}")


def guard(members: list) -> None:
    """Refuse to publish a payload that does not look like the Riigikogu."""
    if not isinstance(members, list):
        raise RuntimeError("payload is not a list")
    if not 95 <= len(members) <= 105:
        raise RuntimeError(f"member count {len(members)} outside 95-105; refusing to publish")
    missing = [m.get("fullName", "?") for m in members if not m.get("uuid") or not m.get("fullName")]
    if missing:
        raise RuntimeError(f"{len(missing)} member(s) missing uuid/fullName")


# --------------------------------------------------------------------------- #
# resolvers
# --------------------------------------------------------------------------- #
def current_faction(m: dict) -> str | None:
    """The FRAKTSIOON entry whose membership.endDate is null.

    This is the corrected rule. Taking factions[0] — the pre-Phase-1 bug — picks
    an arbitrary, often expired, membership.
    """
    for f in m.get("factions") or []:
        if (f.get("type") or {}).get("code") != FRAKTSIOON:
            continue
        if ((f.get("membership") or {}).get("endDate")) is None:
            return f.get("name")
    return None


def faction_role(m: dict) -> str | None:
    """Role held inside the MP's *current* parliamentary group, if any.

    Yields the six Faction Chairmen behind the Members tab's `Chairs` filter and
    the eight Faction Deputy Chairmen captioned in the party sheet
    (BEHAVIOR_SNAPSHOT.md §2, §3). `member` is the default and is stored as None
    so the field only ever carries an office.
    """
    for f in m.get("factions") or []:
        if (f.get("type") or {}).get("code") != FRAKTSIOON:
            continue
        mem = f.get("membership") or {}
        if mem.get("endDate") is not None:
            continue
        role = (mem.get("role") or {}).get("value")
        return None if not role or role == "member" else f"Faction {role}"
    return None


def left_faction(m: dict) -> tuple[str | None, str | None]:
    """(name, endDate) of the most recent group this MP left, if any."""
    ended = [
        ((f.get("membership") or {}).get("endDate"), f.get("name"))
        for f in m.get("factions") or []
        if (f.get("type") or {}).get("code") == FRAKTSIOON
        and (f.get("membership") or {}).get("endDate")
        and f.get("name") != NON_AFFILIATED
    ]
    if not ended:
        return None, None
    ended.sort()
    return ended[-1][1], ended[-1][0]


def committees(m: dict) -> list[dict]:
    out = []
    for c in m.get("committees") or []:
        mem = c.get("membership") or {}
        if mem.get("endDate") is not None:
            continue
        out.append({
            "name": c.get("name"),
            "role": ((mem.get("role") or {}).get("value")) or "member",
            "type": (c.get("type") or {}).get("code"),
        })
    return sorted(out, key=lambda x: x["name"] or "")


def district(m: dict) -> str | None:
    """Current-convocation district, falling back to the most recent on record.

    Two MPs (Rene Kokk, Andrus Seeme) carry only a convocation-14 entry; the
    fallback keeps them from rendering blank rather than inventing a value.
    """
    hist = m.get("electoralDistrictHistory") or []
    for e in hist:
        if e.get("membership") == CONVOCATION:
            return (e.get("electoralDistrict") or {}).get("value")
    if hist:
        latest = max(hist, key=lambda e: e.get("membership") or 0)
        return (latest.get("electoralDistrict") or {}).get("value")
    return None


def board_role(m: dict) -> str | None:
    jt = ((m.get("plenaryMembership") or {}).get("jobTitle") or {}).get("value")
    return jt if jt in BOARD_ORDER else None


def slug(name: str) -> str:
    return name.replace(" ", "-")


def usa_friendship_uuids(groups: list | None = None, offline: dict | None = None) -> set[str]:
    """uuids with a current membership of the Estonia-USA friendship group.

    `/usergroups` is an undocumented endpoint (ARCHITECTURE_PLAN.md §1b), so it
    is guarded the same way the roster is: resolve the group by name, keep only
    memberships with a null `endDate`, and refuse a result outside the sanity
    band rather than silently emptying the Members tab's 🇺🇸 filter.
    """
    if offline is not None:
        group = offline
    else:
        if groups is None:
            groups = fetch(USERGROUPS)
        matches = [g for g in groups if g.get("name") == USA_GROUP_NAME]
        if len(matches) != 1:
            raise RuntimeError(
                f"expected exactly one {USA_GROUP_NAME!r}, found {len(matches)}"
            )
        group = fetch(USERGROUP.format(uuid=matches[0]["uuid"]))

    current = {
        m["uuid"]
        for m in group.get("members") or []
        if ((m.get("membership") or {}).get("endDate")) is None
    }
    lo, hi = USA_GROUP_RANGE
    if not lo <= len(current) <= hi:
        raise RuntimeError(
            f"{USA_GROUP_NAME}: {len(current)} current members, outside {lo}-{hi}; "
            "refusing to publish"
        )
    return current


# --------------------------------------------------------------------------- #
# catalogues
# --------------------------------------------------------------------------- #
def build_catalogues(groups: list) -> dict:
    """Faction and committee catalogues, refreshed from /usergroups.

    `/usergroups` carries every group this convocation has ever had, active and
    historical, so the catalogue is the `active` subset. Recording it means a
    renamed or newly formed committee shows up in the monthly diff without a
    code change — and, more importantly, a *renamed faction* is caught by
    `check_catalogue` below instead of silently unmapping a third of the roster.
    """
    if not isinstance(groups, list):
        raise RuntimeError("/usergroups payload is not a list")

    def take(codes: tuple[str, ...]) -> list[dict]:
        out = [
            {
                "uuid": g.get("uuid"),
                "name": g.get("name"),
                "shortName": g.get("shortName"),
                "colorHex": g.get("colorHex"),
                "type": (g.get("type") or {}).get("code"),
                "typeName": (g.get("type") or {}).get("value"),
            }
            for g in groups
            if (g.get("type") or {}).get("code") in codes
            and g.get("active")
            and g.get("name")
        ]
        return sorted(out, key=lambda g: (g["type"] or "", g["name"] or ""))

    return {
        "factions": take(FACTION_TYPES),
        "committees": take(COMMITTEE_TYPES),
        "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


def check_catalogue(cat: dict, mps: list[dict] | None = None) -> None:
    """Refuse to publish a catalogue that does not describe this parliament."""
    names = {f["name"] for f in cat["factions"]}
    lo, hi = FACTION_COUNT_RANGE
    if not lo <= len(cat["factions"]) <= hi:
        raise RuntimeError(
            f"catalogue: {len(cat['factions'])} active factions, outside {lo}-{hi}"
        )
    standing = [c for c in cat["committees"] if c["type"] == "ALALINE_KOMISJON"]
    lo, hi = STANDING_COMMITTEE_RANGE
    if not lo <= len(standing) <= hi:
        raise RuntimeError(
            f"catalogue: {len(standing)} active standing committees, outside {lo}-{hi}"
        )
    # The hard one: every party's factionName must still be a live group name.
    # If the Chancellery renames a group, this fires here rather than letting
    # build_mps reject 30 MPs one by one with no explanation of the cause.
    missing = sorted({p["factionName"] for p in PARTIES} - names)
    if missing:
        raise RuntimeError(
            "catalogue: parties.json faction name(s) no longer active in "
            f"/usergroups: {missing} — the group was renamed or dissolved; "
            "PARTIES must be updated before this can publish"
        )
    if mps is None:
        return
    unknown = sorted(
        {c["name"] for mp in mps for c in mp["committees"]}
        - {c["name"] for c in cat["committees"]}
    )
    if unknown:
        raise RuntimeError(
            f"catalogue: MPs sit on committee(s) absent from /usergroups: {unknown}"
        )


# --------------------------------------------------------------------------- #
# build
# --------------------------------------------------------------------------- #
def build_mps(members: list, usa: set[str]) -> list[dict]:
    mps = []
    for m in sorted(members, key=lambda x: x["fullName"]):
        faction = current_faction(m)
        if faction is None:
            raise RuntimeError(f"{m['fullName']}: no current FRAKTSIOON membership")
        if faction not in BY_FACTION:
            raise RuntimeError(f"{m['fullName']}: unknown faction {faction!r}")
        photo = ((m.get("photo") or {}).get("_links") or {}).get("download") or {}
        left_name, left_date = left_faction(m)
        mps.append({
            "name": m["fullName"],
            "uuid": m["uuid"],
            "photoUrl": photo.get("href"),
            # The file the app actually loads. `photoUrl` is where it came from
            # — an identifier the CMS re-mints on every re-publish, which is why
            # nothing renders it any more — and `scripts/fetch_mp_photos.mjs`
            # is what turns one into the other. Naming it here rather than
            # deriving it in a view keeps `validate_data.py` able to check that
            # the file is on disk before any of this publishes.
            "photo": f"assets/mps/{m['uuid']}.webp" if photo.get("href") else None,
            "profileUrl": f"{WEB_BASE}/{m['uuid']}/{slug(m['fullName'])}",
            "faction": faction,
            "registeredPartyId": BY_FACTION[faction],
            "factionRole": faction_role(m),
            "committees": committees(m),
            "boardRole": board_role(m),
            "district": district(m),
            "email": m.get("email"),
            "usaFriendship": m["uuid"] in usa,
            "leftFaction": left_name,
            "leftFactionDate": left_date,
            "active": bool(m.get("active", True)),
        })
    return mps


def build_board(mps: list[dict]) -> list[dict]:
    board = [
        {"role": r, "name": mp["name"], "uuid": mp["uuid"], "partyId": mp["registeredPartyId"]}
        for r in BOARD_ORDER
        for mp in mps
        if mp["boardRole"] == r
    ]
    if len(board) != 3:
        raise RuntimeError(f"expected 3 board members, resolved {len(board)}")
    return board


def apply_safe_default(alignment: dict, mps: list[dict]) -> list[str]:
    """Append newly non-affiliated MPs to `unaligned`. Never writes votesWith.

    An MP who has just left a group has no group, no whip and no common
    position, so `unaligned` is the factually correct state, not a placeholder.
    The only possible error is understating a bloc — never manufacturing one.
    """
    known = set(alignment.get("defectors", {})) | set(alignment.get("unaligned", []))
    added = []
    for mp in mps:
        if mp["registeredPartyId"] != "independent" or mp["uuid"] in known:
            continue
        alignment.setdefault("unaligned", []).append(mp["uuid"])
        added.append(mp["name"])
    return added


def stale_entries(alignment: dict, mps: list[dict]) -> list[str]:
    """uuids in the overlay that are no longer non-affiliated (or gone)."""
    nonaff = {mp["uuid"] for mp in mps if mp["registeredPartyId"] == "independent"}
    listed = set(alignment.get("defectors", {})) | set(alignment.get("unaligned", []))
    return sorted(listed - nonaff)


def build_meta(mps: list[dict], alignment: dict, unclassified: str = "raise") -> dict:
    """Recompute both seat counts from the roster plus the curated overlay.

    `unclassified` decides what happens to a non-affiliated MP who appears in
    neither `defectors` nor `unaligned`:

    - `"raise"` (default, used by this script, which appends to `unaligned`
      itself before calling): a gap here means the overlay is inconsistent.
    - `"unaligned"` (used by the monthly job, which is forbidden from writing
      `alignment.json` at all): count them toward no bloc. That is the
      conservative reading — it can only *understate* a bloc, never manufacture
      a majority — and the change report raises them as ACTION REQUIRED so the
      reviewer classifies them before the PR merges.
    """
    if unclassified not in ("raise", "unaligned"):
        raise ValueError(f"unclassified must be 'raise' or 'unaligned', got {unclassified!r}")
    defectors = alignment.get("defectors", {})
    unaligned = set(alignment.get("unaligned", []))
    blocs = alignment.get("blocs", {})

    registered: dict[str, int] = {p["id"]: 0 for p in PARTIES}
    voting: dict[str, int] = {p["id"]: 0 for p in PARTIES if p["id"] != "independent"}
    voting["unaligned"] = 0

    for mp in mps:
        registered[mp["registeredPartyId"]] += 1
        if mp["registeredPartyId"] != "independent":
            voting[mp["registeredPartyId"]] += 1
        elif mp["uuid"] in defectors:
            voting[defectors[mp["uuid"]]["votesWith"]] += 1
        elif mp["uuid"] in unaligned or unclassified == "unaligned":
            voting["unaligned"] += 1
        else:
            raise RuntimeError(f"{mp['name']}: non-affiliated but absent from the overlay")

    coalition = sum(n for pid, n in voting.items() if blocs.get(pid) == "coalition")
    opposition = sum(n for pid, n in voting.items() if blocs.get(pid) == "opposition")
    return {
        "totalSeats": TOTAL_SEATS,
        "simpleMajority": 51,
        "threeFifths": 61,
        "constitutionalMajority": 68,
        "fourFifths": 81,
        "registered": registered,
        "votingBloc": voting,
        "coalitionSeats": coalition,
        "oppositionSeats": opposition,
        "unalignedSeats": voting["unaligned"],
        "coalitionHasMajority": coalition >= 51,
        "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sourceDate": date.today().isoformat(),
    }


def write(path: Path, obj) -> None:
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    try:
        shown = path.relative_to(REPO)
    except ValueError:
        shown = path
    print(f"  wrote {shown}")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--offline", help="read plenary-members from a file instead of the API")
    ap.add_argument(
        "--offline-usergroups",
        help="read the /usergroups catalogue from a file instead of the API",
    )
    ap.add_argument(
        "--offline-usa-group",
        help=f"read the {USA_GROUP_NAME} from a file instead of the API",
    )
    ap.add_argument("--data", default=str(DATA), help="output directory (default: ./data)")
    args = ap.parse_args()
    out = Path(args.data)

    print("Fetching roster…")
    members = json.loads(Path(args.offline).read_text()) if args.offline else fetch(API)
    guard(members)
    print(f"  {len(members)} members")

    print("Fetching group catalogue…")
    groups = (
        json.loads(Path(args.offline_usergroups).read_text())
        if args.offline_usergroups
        else fetch(USERGROUPS)
    )
    catalogues = build_catalogues(groups)
    check_catalogue(catalogues)
    print(
        f"  {len(catalogues['factions'])} factions, "
        f"{len(catalogues['committees'])} committees"
    )

    print("Fetching parliamentary friendship group…")
    usa = usa_friendship_uuids(
        groups,
        offline=json.loads(Path(args.offline_usa_group).read_text())
        if args.offline_usa_group
        else None,
    )
    print(f"  {len(usa)} current members of {USA_GROUP_NAME}")

    mps = build_mps(members, usa)
    check_catalogue(catalogues, mps)
    board = build_board(mps)

    alignment_path = out / "alignment.json"
    alignment = json.loads(alignment_path.read_text(encoding="utf-8"))
    added = apply_safe_default(alignment, mps)
    stale = stale_entries(alignment, mps)
    if added:
        print(f"  safe-default: classified {len(added)} new MP(s) as unaligned: {', '.join(added)}")
    if stale:
        print(f"  ⚠ stale overlay entries (no longer non-affiliated): {', '.join(stale)}")

    meta = build_meta(mps, alignment)

    out.mkdir(parents=True, exist_ok=True)
    write(out / "parties.json", PARTIES)
    write(out / "mps.json", mps)
    write(out / "board.json", board)
    write(out / "catalogues.json", catalogues)
    write(out / "meta.json", meta)
    write(alignment_path, alignment)

    print(
        f"\nCoalition {meta['coalitionSeats']} / Opposition {meta['oppositionSeats']} "
        f"/ unaligned {meta['unalignedSeats']}  "
        f"({'majority' if meta['coalitionHasMajority'] else 'NO majority'})"
    )
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:  # noqa: BLE001 - deliberate: fail loudly, write nothing
        print(f"FATAL: {exc}", file=sys.stderr)
        sys.exit(1)
