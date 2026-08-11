# `data/` — the single source of truth

Every file here except `alignment.json` is **generated**. Regenerate with:

```bash
python3 scripts/build_data.py          # fetches the live API
python3 scripts/validate_data.py       # exit 0 = safe to publish
```

Do not hand-edit `mps.json`, `board.json`, `meta.json` or `parties.json` — the
next build overwrites them. The one file you may edit by hand is
`alignment.json`, and only its `blocs` and `defectors` sections.

> Nothing in the deployed app reads these files yet. Runtime loading arrives in
> Phase 4 of `ARCHITECTURE_PLAN.md`; until then this directory is the staging
> ground the rebuild will consume.

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
  "committees": [{ "name": "Finance Committee", "role": "member", "type": "ALALINE_KOMISJON" }],
  "boardRole": null, "district": "Jõgevamaa and Tartumaa", "email": "…",
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

### `alignment.json` — the only curated file

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

#### The safe-default rule

`build_data.py` classifies every newly non-affiliated MP as `unaligned`
automatically, and the monthly job merges without waiting for anyone.

This is not a placeholder awaiting a ruling — it is the **factually correct
state**. An MP who just left a group has no group. The rule makes the pipeline
safe by construction: the only possible error is understating a bloc by a seat,
never manufacturing a majority that does not exist.

Promoting someone from `unaligned` to `defectors` is an **optional enrichment**
you make when they actually join a party. If it never happens, the published
numbers stay conservative and defensible. The job never writes a `votesWith` and
never touches `blocs` or `defectors`.

Change `blocs` when a government changes.

### `board.json` — derived from `plenaryMembership.jobTitle`

Exactly three entries, in fixed order: President, First Vice-President, Second
Vice-President. Auto-updates.

> The API is **more current here than most secondary sources**. It gives Arvo
> Aller as Second Vice-President (since 2024-07-15); several references still
> list Helir-Valdor Seeder, who last held a Board office in 2023. Trust the API.

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

It is deliberately paranoid about the seat arithmetic, because that is the number
readers act on.

### Guards in `build_data.py`

The API is a third party and only `/votings` is contractually documented, so the
build **fails loudly and writes nothing** on a non-200 response, a malformed
payload, a member count outside 95–105, an MP with no current faction, an unknown
faction name, or a Board that does not resolve to exactly three people. Retries
use exponential backoff. A partial roster is never published.

**The registry lags reality.** Stoicescu announced his departure on Aug 9; the
API recorded it on Aug 10 and only exposed it partway through Aug 11 — observed
directly, between two fetches hours apart. Do not assume same-day accuracy.
