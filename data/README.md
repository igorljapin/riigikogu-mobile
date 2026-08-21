# `data/` — the single source of truth

The app fetches these files at runtime. Every one of them except
`alignment.json` and `seating.json` is **generated**. Regenerate with:

```bash
python3 scripts/build_data.py          # fetches the live API
python3 scripts/validate_data.py       # exit 0 = safe to publish
```

Do not hand-edit `mps.json`, `board.json`, `catalogues.json`, `meta.json` or
`parties.json` — the next build overwrites them. Two files are yours:
`alignment.json` (its `blocs` and `defectors` sections) and `seating.json`,
which no script can generate because the API does not publish seats.

Once a month `.github/workflows/monthly-mp-check.yml` does the same thing
unattended via `scripts/fetch_mp_data.py` and opens a PR with the diff. **That
job never writes `alignment.json` or `seating.json`** — see "Who writes what"
below.

---

## The two seat counts

This is the distinction the whole data model exists to preserve. Conflating them
is the single biggest correctness risk in the app.

| Count | Source | Use it for |
|---|---|---|
| **registered** | 100% API | Procedural facts: speaking time, committee entitlements, anything quoted as an official Riigikogu figure |
| **votingBloc** | API + `alignment.json` | **Majority arithmetic** — the calculator, coalition/opposition totals, "will this pass" |

Under the Rules of Procedure §40–42 an MP who leaves a parliamentary group may
never join another for the rest of the term. A defector who joins a new party is
therefore *registered* as non-affiliated forever while *voting* with their new
group. Both numbers are correct; they answer different questions.

Both must sum to 101. The validator enforces it.

---

## Files

### `parties.json` — catalogue

```jsonc
{ "id": "reform", "nameEn": "Estonian Reform Party", "nameEt": "Eesti Reformierakond",
  "short": "Reform", "color": "#FFD700", "textColor": "#000000",
  "factionName": "Estonian Reform Party Parliamentary Group" }
```

`color` / `textColor` are the values **measured from the deployed app's computed
styles** (`BEHAVIOR_SNAPSHOT.md` §6). They are not design choices to revisit
casually — changing one changes the app's appearance. `factionName` is the exact
API string and is how `mps.json` joins to a party.

### `mps.json` — roster, 101 entries, 100% API-derived

```jsonc
{ "name": "Aivar Kokk", "uuid": "…", "photoUrl": "…", "profileUrl": "…",
  "faction": "Isamaa Parliamentary Group", "registeredPartyId": "isamaa",
  "factionRole": null,
  "committees": [{ "name": "Finance Committee", "role": "member", "type": "ALALINE_KOMISJON" }],
  "boardRole": null, "district": "Jõgevamaa and Tartumaa", "email": "…",
  "usaFriendship": true,
  "leftFaction": null, "leftFactionDate": null, "active": true }
```

- `faction` uses the **corrected resolver**: the `FRAKTSIOON` entry whose
  `membership.endDate` is `null`. The pre-Phase-1 bug took `factions[0]`, an
  arbitrary and often expired membership.
- `photoUrl` is the API's durable `files/{uuid}/download` link, not the fragile
  `wpcms/temp/` thumbnail the old bundle used.
- `leftFaction` / `leftFactionDate` record the most recent group an MP left —
  this is what makes defections detectable with no human input.
- `committees` covers standing (`ALALINE_KOMISJON`) and select (`ERIKOMISJON`)
  committees, with roles (`member`, `Chairman`, `Deputy Chairman`).
- `factionRole` is the office held inside the MP's *current* parliamentary
  group — `Faction Chairman` (6, one per group), `Faction Deputy Chairman` (8),
  or `null`. It drives the Members tab's `Chairs` filter and the role captions
  in the party sheet.
- `usaFriendship` is current membership of the **Estonia-USA Parliamentary
  Friendship Group** (`/usergroups`, type `PARLAMENDIRYHM`), the 🇺🇸 marker on
  the Members tab. Added in Phase 4: the deployed bundle had it baked in, and
  reproducing the Members tab 1:1 needs it as data. It is Tier A — nobody
  maintains it by hand.

  > **This number moved.** The bundle marked 33 MPs; the live group has 38
  > current members who sit in this Riigikogu, having added Ando Kiviberg,
  > Helle-Moonika Helme, Mart Helme, Martin Helme and Raimond Kaljulaid since
  > the bundle's "Jan 2026" vintage. The bundle's 33 are a strict subset of the
  > API's 38, so this is a refresh, not a resolver disagreement.

### `alignment.json` — the curated voting overlay

```jsonc
{
  "blocs":     { "reform": "coalition", "e200": "coalition", "sde": "opposition", … },
  "defectors": { "<uuid>": { "name": "Tanel Kiik", "votesWith": "sde",
                             "since": "2024-01-05", "note": "Left Centre Jan 2024, joined SDE" } },
  "unaligned": ["<uuid>", …]
}
```

Three states, and the third one matters:

| State | Meaning | Counted toward a bloc? |
|---|---|---|
| in a registered group | ordinary member | yes, their own party |
| `defectors` | left a group, joined another party, votes with it | yes, `votesWith` |
| `unaligned` | left a group, joined **no** party | **never** |

**The `unaligned` MPs have no whip and no common position. Never add one to a
bloc to reach a majority.** As of 2026-08-11 there are 9 of them, and with the
coalition at 50 of 101 they decide outcomes vote by vote — which is exactly why
they must not be silently attributed.

#### Who writes what

Two files in here are curated rather than generated, and neither is safe for an
unattended job to touch.

| Tool | `alignment.json` | `seating.json` |
|---|---|---|
| You, by hand | yes — it is your file | yes — it is your file |
| `scripts/build_data.py` (hand-run) | appends a new uuid to `unaligned`, nothing else | **never** |
| `scripts/fetch_mp_data.py` (the monthly job) | **never** | **never** |

Phase 5 tightened `ARCHITECTURE_PLAN.md` §5.2 on the last row: the *unattended*
job does not touch the curated overlay at all. A newly non-affiliated MP reaches
you as a 🔴 **ACTION REQUIRED** block in the PR, naming them, the group they left
and the date, and the PR opens as a **draft** until you classify them.

Phase 3 PR C gave `seating.json` the same treatment. A roster change reaches you
as a 🪑 **ACTION REQUIRED** block naming the arriving member, the cell the
departing one has left free, and the line to paste; the PR is a draft until you
paste it. The job runs `validate_data.py --allow-pending-seating` while that is
open, which downgrades the two halves of the seat join — a member with no seat,
a seat for someone who is no longer an MP — to warnings and leaves every other
rule fatal. What it publishes meanwhile is a floor plan one member short; no
count moves, because every count is read from `mps.json` and none of it from
here.

The seat arithmetic in that PR is still correct and publishable while you decide,
because an unclassified MP is counted toward **no bloc**. That is the same
asymmetry the safe-default rule was built on: the worst case is understating a
bloc by one seat, never manufacturing a majority that does not exist. What
changed is only *who* records the decision — and since the job cannot know which
party a defector joined, recording it was never something it could do.

Promoting someone from `unaligned` to `defectors` is an enrichment you make when
they actually join a party. If it never happens, the published numbers stay
conservative and defensible. Nothing automated ever writes a `votesWith`.

Change `blocs` when a government changes.

### `seating.json` — the curated floor plan, read by the desktop surface only

```jsonc
{ "gridDimensions": { "rows": 10, "cols": 12 },
  "seats": { "<uuid>": { "name": "Evelin Poolamets", "row": 0, "col": 0 } } }
```

101 seats on a 10 × 12 grid; `row` and `col` are 0-based, so 19 of the 120 cells
are empty and render as invisible placeholders that keep the grid rigid. The
desktop surface joins this to `mps.json` by uuid and colours each tile with the
party its member **votes with** — the same rule as every other count in the app
(`USABILITY.md` §10.2). The mobile app never reads it.

**Nothing generates this file.** The Riigikogu API exposes no seat, so the
positions were harvested once from the retiring `riigikogu-desktop` bundle
(Phase 0 of `docs/desktop-2026/DESIGN_AND_MERGE_PLAN.md`) and are maintained by
hand from there. Only the seat positions were carried over: that bundle's party
data was stale — pre-2026-08-09, before two defections — which is the reason the
two apps were merged in the first place.

`name` is a review aid, so a diff reads as people rather than uuids; `mps.json`
is the authority and the validator only *warns* when the two disagree.

**When the roster changes, this file needs a hand.** An MP who joins parliament
has no seat until you give them one, and the validator fails on both halves of
that join — a member with no seat and a seat for someone who has left. Take the
departing member's cell unless you know better; the Riigikogu seats by
parliamentary group, so a substitute usually inherits the seat.

### `board.json` — derived from `plenaryMembership.jobTitle`

Exactly three entries, in fixed order: President, First Vice-President, Second
Vice-President. Auto-updates.

> The API is **more current here than most secondary sources**. It gives Arvo
> Aller as Second Vice-President (since 2024-07-15); several references still
> list Helir-Valdor Seeder, who last held a Board office in 2023. Trust the API.

### `catalogues.json` — the group registry, refreshed from `/usergroups`

```jsonc
{ "factions":   [{ "uuid": "…", "name": "Isamaa Parliamentary Group", "shortName": "I",
                   "colorHex": "6FABD4", "type": "FRAKTSIOON", "typeName": "faction" }],
  "committees": [{ "uuid": "…", "name": "Finance Committee", "type": "ALALINE_KOMISJON",
                   "typeName": "standing committee" }],
  "fetchedAt": "…" }
```

The `active` subset of `/usergroups`: 7 parliamentary groups, 11 standing
committees and the select committees. Nothing in the app reads it — it exists so
that a **renamed or newly formed group is caught**. `parties.json` matches MPs to
parties by exact faction string, so a rename would otherwise unmap a third of the
roster with no single error to point at; instead `check_catalogue()` fails the
build with the old name and the instruction to update `PARTIES`. Same for a
committee an MP sits on that the catalogue does not list.

### `meta.json` — every total computed, never hand-typed

```jsonc
{ "totalSeats": 101, "simpleMajority": 51, "threeFifths": 61,
  "constitutionalMajority": 68, "fourFifths": 81,
  "registered": { … }, "votingBloc": { … },
  "coalitionSeats": 50, "oppositionSeats": 42, "unalignedSeats": 9,
  "coalitionHasMajority": false, "updatedAt": "…", "sourceDate": "2026-08-11" }
```

`updatedAt` is what the app will surface as "Data updated …", replacing the
hand-typed `Jan 2026` baked into the current bundle.

---

## Current state (2026-08-11)

| Party | Registered | Voting bloc | Bloc |
|---|---|---|---|
| Reform | 36 | 38 | coalition |
| Eesti 200 | 12 | 12 | coalition |
| SDE | 9 | 14 | opposition |
| Isamaa | 8 | 11 | opposition |
| EKRE | 9 | 9 | opposition |
| Center | 7 | 8 | opposition |
| Non-affiliated / unaligned | 20 | 9 | **neither** |
| **Total** | **101** | **101** | |

**Coalition 50 · Opposition 42 · unaligned 9.** Reform + Eesti 200 have been a
**minority government since 2026-08-10**, after Grigore-Kalev Stoicescu left
Eesti 200 (Aug 9) and Meelis Kiili left Reform (Aug 10).

---

## Validation

`validate_data.py` enforces, and fails the build on any of:

- exactly 101 MPs, no duplicate uuids
- every faction maps to a known party, consistent with `registeredPartyId`
- `registered` **and** `votingBloc` each sum to 101
- both counts recomputed from `mps.json` + `alignment.json` and compared to
  `meta.json` — a hand-edited total is caught
- every non-affiliated MP in **exactly one** of `defectors` / `unaligned`
- no stale overlay entry (someone who is no longer non-affiliated)
- `coalition + opposition + unaligned == 101`, and `coalitionHasMajority`
  agreeing with the arithmetic
- colours are `#RRGGBB` uppercase; photo/profile URLs are https
- the Board has exactly the three roles, all present in the roster
- `seating.json` holds exactly 101 seats, every one of them an active MP, every
  active MP among them, each at integer coordinates inside `gridDimensions` and
  no two in the same cell

The seating rules are **skipped, with a warning, when the file is absent** —
`fetch_mp_data.py` validates a staging directory holding only the files it
generates, and requiring a file that job may not write would fail it every
month. Locally, `data/seating.json` is always there and the rules always run.

It is deliberately paranoid about the seat arithmetic, because that is the number
readers act on.

Two rules bend, and only for the monthly job, one per curated file:
`--allow-pending-alignment` downgrades "non-affiliated MP in neither list" to a
warning, and `--allow-pending-seating` does the same for the two halves of the
seat join. Both exist because that job may not write the file in question, so a
fresh defection legitimately arrives unclassified and a substitution
legitimately arrives unseated. Every other rule stays fatal, the arithmetic still
counts an unclassified MP toward no bloc, and neither flag covers the other's
file. Run the validator without them — as you would locally — and both gaps are
errors again, which is what stops the draft PR merging unresolved.

### Guards in `build_data.py` and `fetch_mp_data.py`

The API is a third party and only `/votings` is contractually documented, so a
build **fails loudly and writes nothing** on a non-200 response, a malformed
payload, a member count outside 95–105, an MP with no current faction, an unknown
or renamed faction name, a committee missing from the catalogue, or a Board that
does not resolve to exactly three people. Retries use exponential backoff.

`fetch_mp_data.py` goes one step further: it builds into a staging directory and
runs `validate_data.py` there, copying into `data/` only after that exits 0. A
partial or invalid roster is never published, and a failed run leaves the
committed data exactly as it was.

`tests/python/test_resolvers.py` holds all of this to a frozen API capture — the
registered split, the Board, the committee chairs, every guard, and the ACTION
REQUIRED path. Run it with `npm run test:resolvers`.

**The registry lags reality.** Stoicescu announced his departure on Aug 9; the
API recorded it on Aug 10 and only exposed it partway through Aug 11 — observed
directly, between two fetches hours apart. Do not assume same-day accuracy.
