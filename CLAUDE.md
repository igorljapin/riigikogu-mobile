# Riigikogu Mobile Dashboard - Claude Code Instructions

## Repository Purpose
Mobile PWA dashboard for the XV Riigikogu (101 MPs).
Hosted at https://igorljapin.github.io/riigikogu-mobile/

## Current state: mid-rebuild (read this first)

The app is being rebuilt in phases per `ARCHITECTURE_PLAN.md` (v3).
**Phases 0–4 have landed.** The minified bundle is gone: the shipped app is
plain HTML + CSS + native ES modules, with all source in this repository and
no build step. Phases 5 (monthly job), 6 (PWA) and 7 (docs) are outstanding,
so the monthly update procedure that used to live in this file still **does
not work** — it is reproduced in `docs/DEPRECATED_MONTHLY_PROCEDURE.md` as a
historical record only.

- `BEHAVIOR_SNAPSHOT.md` + `snapshot/` — what the app did before the rebuild.
  Phase 4 reproduces it 1:1; `snapshot/phase4/` and `snapshot/compare/` are
  the after and side-by-side captures.
- `v-stable-pre-rebuild` — rollback ref for the pre-rebuild app.

## File Map (verified 2026-08-12)

| Path | What it actually is |
|---|---|
| `index.html` | Hand-written **shell**, ~1 KB. A `<div id=app>` and one `<script type=module>`. No data, no view markup, no inline styles. |
| `styles.css` | The whole stylesheet, plain CSS. Party colours are **not** here — `src/app.js` publishes them as `--party-<id>` from `parties.json`. |
| `src/app.js`, `src/data.js`, `src/dom.js` | Entry point + tab router; runtime loader for `data/*.json`; three DOM helpers. |
| `src/lib/*.js` | Pure, unit-tested logic: `calculator.js`, `factions.js`. No DOM, no I/O. |
| `src/views/*.js` | `parliament.js`, `mps.js`, `calculator.js`, `board.js`. **The only layer a redesign touches**, together with `styles.css`. |
| `data/*.json` | The single source of truth, **read by the app at runtime**. See `data/README.md`. |
| `data/mp_data_current.json` | Legacy baseline for the monthly diff. Nothing reads it; Phase 5 retires it. |
| `service-worker.js` | Precaches `/riigikogu-dashboard/...` while the site is served from `/riigikogu-mobile/`. Registration fails; offline mode does not work. Fixed in Phase 6. |
| `manifest.json`, `offline.html`, `icons/` | PWA assets. |
| `scripts/build_data.py`, `validate_data.py` | Rebuild `data/` from the live API, and gate it. Both current. |
| `scripts/fetch_mp_data.py`, `compare_mp_data.py`, `generate_pr_body.py` | Monthly job scripts. Still broken — see below. Phase 5. |
| `scripts/capture_screens.mjs` | Re-captures the Phase-0 states against the current app and builds the before/after strips. |
| `.github/workflows/monthly-mp-check.yml` | Monthly job. Still broken — see below. |
| `USABILITY.md`, `tests/` | The Usability Contract and its suite. Tier 1 + Tier 2 + unit tests all live. |
| `ARCHITECTURE_PLAN.md`, `EXECUTION_GUIDE.md` | The rebuild plan and its per-phase prompts. |
| `BEHAVIOR_SNAPSHOT.md`, `snapshot/` | Phase 0 characterization, plus the Phase 4 after/compare captures. |

**Files that do not exist**, despite earlier versions of this document
referring to them: `mp-data-scraped.json`, `data/change_report.json`,
`data/mp_data_fetched.json` (the workflow's own output path, and it is
gitignored). Do not look for them and do not write instructions around them.

## Known-broken, do not treat as working

1. **The monthly workflow cannot succeed.** Its `git add
   data/mp_data_fetched.json` hits a gitignored path, and its
   `gh pr create --base main` targeted a branch that did not exist until
   Phase 0 created it.
2. **`scripts/fetch_mp_data.py` resolves factions wrongly.** It takes
   `factions[0]`, which may be an expired membership. The correct rule is
   the `FRAKTSIOON` entry whose `membership.endDate` is `null` — already
   implemented correctly in `scripts/build_data.py`; Phase 5 retires the
   old script.
3. **The service worker path is wrong** (see file map). Offline mode does
   not work for anyone, and the PWA specs are `fixme` until Phase 6.

## Data model: two seat counts, never conflate them

| Count | Source | Use for |
|---|---|---|
| Registered | 100% API | Procedural facts: speaking time, committee entitlements, any official Riigikogu figure |
| Voting bloc | API + curated overlay | **Majority arithmetic — the calculator, coalition/opposition totals, "will this pass"** |

Under the Rules of Procedure §40–42 an MP who leaves a parliamentary group
may never join another, so a defector stays registered as non-affiliated
while voting with their new party. The app displays **voting-bloc** numbers
and must continue to.

A third state matters as of 2026-08-10: MPs who left a group and joined
**no** party. They have no whip and no common position, and must never be
added to either bloc to reach a majority.

## Changing MP data

A data change is a change to `data/*.json` and **nothing else**. The app
reads those files at runtime; never edit `src/views/*` or `styles.css` to
change a number.

```bash
python3 scripts/build_data.py       # regenerate everything API-derived
python3 scripts/validate_data.py    # exit 0 = safe to publish
npm test                            # must be green before the PR
```

`data/alignment.json` is the only hand-maintained file, and only its `blocs`
and `defectors` sections. A newly non-affiliated MP is classified `unaligned`
automatically, and that is the correct answer, not a placeholder — see
`data/README.md`.

## Critical Rules

- Never commit directly to the default branch — always a feature branch
  plus a PR.
- Never change UI layout, CSS, or PWA configuration outside the phase that
  owns it. Phase 6 owns `service-worker.js` and `manifest.json`.
- Mobile layout is optimised for small screens — do not alter spacing.
- A redesign may rewrite `styles.css` and `src/views/*` freely, but it must
  keep every `data-testid` in `USABILITY.md` §3 and ship with a green suite.
  That is the whole mechanism that makes a redesign safe here.
- Every phase must leave the repo shippable, and from Phase 2 on must not
  merge with a red test suite.
- Never state Riigikogu seat arithmetic or coalition strength from memory.
  Verify against the live API and cite the date.
