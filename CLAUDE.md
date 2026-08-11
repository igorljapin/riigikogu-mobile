# Riigikogu Mobile Dashboard - Claude Code Instructions

## Repository Purpose
Mobile PWA dashboard for the XV Riigikogu (101 MPs).
Hosted at https://igorljapin.github.io/riigikogu-mobile/

## Current state: mid-rebuild (read this first)

The app is being rebuilt in phases per `ARCHITECTURE_PLAN.md` (v3).
Until Phase 4 lands, the shipped app is a **compiled, minified bundle
with no source in this repository**, and the monthly update procedure
that used to live in this file **does not work**. It is reproduced in
`docs/DEPRECATED_MONTHLY_PROCEDURE.md` as a historical record only.

- `BEHAVIOR_SNAPSHOT.md` + `snapshot/` — what the app does today,
  captured automatically. Phase 4 must reproduce this behavior 1:1.
- `v-stable-pre-rebuild` — rollback ref for the last known-good app.

## File Map (verified 2026-08-11)

| Path | What it actually is |
|---|---|
| `index.html` | 253 KB **compiled artifact**. Tailwind-compiled CSS plus a minified bundle mounting into `<div id=root>`. All MP data, party colours and calculator logic are baked in. **Not hand-editable.** |
| `data/mp_data_current.json` | Committed baseline for the monthly diff. **Nothing in the app reads it** — the bundle performs no runtime data loading at all. |
| `service-worker.js` | Precaches `/riigikogu-dashboard/...` while the site is served from `/riigikogu-mobile/`. Registration fails; offline mode does not work. Fixed in Phase 6. |
| `manifest.json`, `offline.html`, `icons/` | PWA assets. |
| `scripts/*.py` | Monthly fetch/compare/PR-body scripts. Currently broken — see below. |
| `.github/workflows/monthly-mp-check.yml` | Monthly job. Currently broken — see below. |
| `ARCHITECTURE_PLAN.md`, `EXECUTION_GUIDE.md` | The rebuild plan and its per-phase prompts. |
| `BEHAVIOR_SNAPSHOT.md`, `snapshot/` | Phase 0 characterization of the current app. |

**Files that do not exist**, despite earlier versions of this document
referring to them: `mp-data-scraped.json`, `data/change_report.json`,
`data/mp_data_fetched.json` (the workflow's own output path, and it is
gitignored). Do not look for them and do not write instructions around them.

## Known-broken, do not treat as working

1. **The app never reads `data/`.** Updating any JSON in this repo has no
   effect on what users see until Phase 4.
2. **The monthly workflow cannot succeed.** Its `git add
   data/mp_data_fetched.json` hits a gitignored path, and its
   `gh pr create --base main` targeted a branch that did not exist until
   Phase 0 created it.
3. **`scripts/fetch_mp_data.py` resolves factions wrongly.** It takes
   `factions[0]`, which may be an expired membership. The correct rule is
   the `FRAKTSIOON` entry whose `membership.endDate` is `null`.
4. **The service worker path is wrong** (see file map).

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

## Changing MP data before Phase 4

Don't, unless explicitly asked. The data lives inside the minified bundle
and cannot be edited safely by hand — that is the whole reason for the
rebuild. If a data change is genuinely urgent, say so and ask; the answer
is normally "wait for Phase 1/4", not "edit `index.html`".

## Critical Rules

- Never commit directly to the default branch — always a feature branch
  plus a PR.
- Never change UI layout, CSS, or PWA configuration outside the phase that
  owns it. Phase 6 owns `service-worker.js` and `manifest.json`.
- Mobile layout is optimised for small screens — do not alter spacing.
- Every phase must leave the repo shippable, and from Phase 2 on must not
  merge with a red test suite.
- Never state Riigikogu seat arithmetic or coalition strength from memory.
  Verify against the live API and cite the date.
