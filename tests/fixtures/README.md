# `tests/fixtures/` — frozen API payloads

Raw responses from `api.riigikogu.ee`, captured **2026-08-12**, byte-for-byte as
the service returned them (minified only — no fields removed, so schema drift is
visible rather than papered over).

| File | Endpoint |
|---|---|
| `plenary-members.json` | `GET /api/plenary-members?lang=EN` — 101 members |
| `usergroups.json` | `GET /api/usergroups?lang=EN` — 347 groups, active and historical |
| `usergroup-usa-friendship.json` | `GET /api/usergroups/359b4825-…?lang=EN` — Estonia-USA Parliamentary Friendship Group, 226 memberships |

## Why they are committed

`tests/python/test_resolvers.py` runs the real resolvers against these files and
asserts the exact split they must produce. That is what permanently locks out
the `factions[0]` class of bug: every MP in this payload carries a stale
`Non-affiliated members` membership from April 2023, so a resolver that takes the
first entry rather than the one whose `membership.endDate` is `null` reports 50
non-affiliated members instead of 20. The test proves both — the correct answer,
and that the naive answer differs.

## Updating them

Don't, unless you mean to. These are a *frozen* record: the assertions in
`test_resolvers.py` describe this capture, not today's parliament, and that is
the point — a test that follows the live API tests nothing. Re-capture only when
the API's *shape* changes, and update the expected numbers in the same commit:

```bash
curl -s "https://api.riigikogu.ee/api/plenary-members?lang=EN" \
  | python3 -c 'import json,sys; json.dump(json.load(sys.stdin), open("tests/fixtures/plenary-members.json","w"), ensure_ascii=False, separators=(",",":"))'
```

## What this capture happens to record

- Registered: Reform 36, Non-affiliated 20, Eesti 200 12, SDE 9, EKRE 9,
  Isamaa 8, Centre 7 — the post-erratum figures, three defections on from the
  Reform 37 / Non-affiliated 18 split `ARCHITECTURE_PLAN.md` §5.4 was written
  against.
- Board: Hussar (President), Kivimägi (First VP), Aller (Second VP).
- Standing committees: 11, with **10** Chairmen and 11 Deputy Chairmen — the
  National Defence Committee chair fell vacant on 2026-08-10 when
  Grigore-Kalev Stoicescu left it. The plan's "11 chairs" predates that.
