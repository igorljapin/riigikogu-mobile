# Riigikogu Mobile Dashboard - Claude Code Instructions

## Repository Purpose
Mobile PWA dashboard for the XV Riigikogu (101 MPs).
Hosted at https://igorljapin.github.io/riigikogu-mobile/

## Current state: mid-rebuild (read this first)

The app is being rebuilt in phases per `ARCHITECTURE_PLAN.md` (v3).
**Phases 0–5 have landed.** The minified bundle is gone: the shipped app is
plain HTML + CSS + native ES modules, with all source in this repository and
no build step, and the monthly job now refreshes the JSON the app actually
reads. Phases 6 (PWA) and 7 (docs) are outstanding. The hand-written monthly
procedure that used to live in this file is obsolete — the job does it; the
old text survives in `docs/DEPRECATED_MONTHLY_PROCEDURE.md` as a historical
record only.

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
| `service-worker.js` | Precaches `/riigikogu-dashboard/...` while the site is served from `/riigikogu-mobile/`. Registration fails; offline mode does not work. Fixed in Phase 6. |
| `manifest.json`, `offline.html`, `icons/` | PWA assets. |
| `scripts/build_data.py`, `validate_data.py` | Rebuild `data/` from the live API, and gate it. Both current. |
| `scripts/fetch_mp_data.py` | The monthly job's fetcher. Same resolvers as `build_data.py` (it imports them), stages + validates before publishing, and **never writes `data/alignment.json`**. |
| `scripts/compare_mp_data.py`, `generate_pr_body.py` | Classify a fetch into the five Phase-5 categories, and render the PR body — ACTION REQUIRED first. |
| `tests/fixtures/`, `tests/python/` | Frozen API capture (2026-08-12) and the resolver regression suite it pins. `npm run test:resolvers`. |
| `scripts/capture_screens.mjs` | Re-captures the Phase-0 states against the current app and builds the before/after strips. |
| `.github/workflows/monthly-mp-check.yml` | Monthly job, working. Commits `data/*.json`, validates and runs the suites in-job, opens a PR into `main`. `workflow_dispatch` takes a `force_pr` input for testing the pipeline. |
| `USABILITY.md`, `tests/` | The Usability Contract and its suite. Tier 1 + Tier 2 + unit tests all live. |
| `ARCHITECTURE_PLAN.md`, `EXECUTION_GUIDE.md` | The rebuild plan and its per-phase prompts. |
| `BEHAVIOR_SNAPSHOT.md`, `snapshot/` | Phase 0 characterization, plus the Phase 4 after/compare captures. |

**Files that do not exist**, despite earlier versions of this document
referring to them: `mp-data-scraped.json`, `data/change_report.json`,
`data/mp_data_fetched.json`, `data/mp_data_current.json`. Nothing writes them
any more — the monthly job's change report is a workflow artifact, not a
committed file. Do not look for them and do not write instructions around them.

## Known-broken, do not treat as working

1. **The service worker path is wrong** (see file map). Offline mode does
   not work for anyone, and the PWA specs are `fixme` until Phase 6.

Fixed in Phase 5, kept here because older sessions were told otherwise: the
monthly workflow's gitignored `git add` and missing `--base main` are gone, and
`fetch_mp_data.py` no longer takes `factions[0]` — every MP carries a stale
`Non-affiliated members` membership from April 2023, which is why that bug
reported 50 non-affiliated members. `tests/python/test_resolvers.py` asserts the
difference so it cannot come back.

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
and `defectors` sections. `build_data.py` may append a newly non-affiliated MP
to `unaligned`; **the monthly job may not write the file at all** — it raises
them as an ACTION REQUIRED item in a draft PR instead, and counts them toward
no bloc until you decide. See `data/README.md`, "Who writes what".

### The monthly job

`.github/workflows/monthly-mp-check.yml` runs on the 1st, and on
`workflow_dispatch` (with a `force_pr` input to exercise the pipeline when
nothing changed). It fetches, validates and runs the suites **before** opening
the PR, because a PR created with `GITHUB_TOKEN` does not trigger the Usability
Contract workflow. Your job is to review that PR: resolve any 🔴 ACTION REQUIRED
item in `alignment.json`, remove any ♻️ stale entry, then merge — Pages deploys
`main`.

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
