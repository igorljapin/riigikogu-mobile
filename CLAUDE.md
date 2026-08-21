# Riigikogu Mobile Dashboard — Claude Code Instructions

Mobile PWA dashboard for the XV Riigikogu (101 MPs), live at
https://igorljapin.github.io/riigikogu-mobile/ — GitHub Pages deploys `main`
from the repository root, so **every merge to `main` ships**.

## Architecture in one screen

The rebuild described in `ARCHITECTURE_PLAN.md` is **finished** (Phases 0–7,
Aug 2026). There is no bundler, no framework and no build step: the source in
this repository *is* what ships. Four layers, and knowing which one you are in
tells you what you are allowed to touch.

```
DATA      data/*.json      single source of truth, fetched by the app at runtime
LOGIC     src/lib/*.js     pure functions, no DOM, no I/O, unit-tested
VIEW      src/views/*.js   the only layer a redesign ever touches
          styles.css
CONTRACT  USABILITY.md     the promises, and tests/ the executable proof
          tests/
```

Two rules follow directly from that diagram, and they are the two ways this
repo has broken before:

- **A data change is a change to `data/*.json` and nothing else.** The app reads
  those files at runtime. Never edit `src/views/*` or `styles.css` to change a
  number.
- **A design change is a change to `styles.css` and `src/views/*` and nothing
  else.** It may rewrite either freely, but it must keep every `data-testid` in
  `USABILITY.md` §3 and ship with a green suite. A redesign already failed once
  here (`4dae72b`) because design, data and logic were fused; the testids are
  the mechanism that keeps them separable.

## File map (verified 2026-08-12)

| Path | What it actually is |
|---|---|
| `index.html` | Hand-written **shell**, ~1 KB. A `<div id=app>` and one `<script type=module>`. No data, no view markup, no inline styles. |
| `styles.css` | The whole stylesheet, plain CSS. Party colours are **not** here — `src/app.js` publishes them as `--party-<id>` from `parties.json`. |
| `src/app.js`, `src/data.js`, `src/dom.js` | Entry point + tab router; runtime loader for `data/*.json`; three DOM helpers. |
| `src/lib/*.js` | Pure, unit-tested logic: `calculator.js`, `factions.js`. No DOM, no I/O. |
| `src/views/*.js` | `parliament.js` (composition + Board), `mps.js`, `calculator.js`, `board.js`. **The redesign layer**, together with `styles.css`. |
| `desktop/index.html`, `desktop/manifest.json` | The desktop surface's own shell (same hand-written-shell rule as `index.html`) and its own manifest — `scope` is `/riigikogu-mobile/desktop/`, nested inside the mobile app's, so the two install as two separate apps. |
| `desktop.css` | The desktop stylesheet, built on the same design tokens as `styles.css` at desktop density. Party colours are data-driven here too, never hardcoded. |
| `src/views-desktop/*.js` | `app.js` (shell + router), `parts.js`, `floor.js`, `seating.js`, `parliament.js`, `directory.js`, `calculator.js`. **The desktop redesign layer**, together with `desktop.css`. Reuses `src/data.js` and `src/lib/*.js` untouched — see `USABILITY.md` §10. |
| `data/*.json` | The single source of truth, **read by the app at runtime**. See `data/README.md`. |
| `data/seating.json` | The one dataset only the desktop surface reads: each MP's session-hall seat position, keyed by uuid. Hand-maintained — see "Updating MP data" below. |
| `service-worker.js` | Precaches the whole layout for **both** surfaces — mobile shell, desktop shell, ES modules, `data/*.json` including `seating.json` — with **relative** entries, so one list is correct both at `/riigikogu-mobile/` and at `/` under the test server. One registration, one cache, shared by both apps (`USABILITY.md` §10.11). Bump `CACHE_NAME` whenever the list changes. |
| `manifest.json`, `offline.html`, `icons/` | Mobile PWA assets. `start_url` and `scope` are `/riigikogu-mobile/`. |
| `scripts/build_data.py`, `validate_data.py` | Rebuild `data/` from the live API, and gate it. |
| `scripts/fetch_mp_data.py` | The monthly job's fetcher. Same resolvers as `build_data.py` (it imports them), stages + validates before publishing, and **never writes `data/alignment.json`**. |
| `scripts/compare_mp_data.py`, `generate_pr_body.py` | Classify a fetch into the six change categories, and render the PR body — ACTION REQUIRED first. |
| `scripts/capture_screens.mjs` | Re-captures the Phase-0 states against the current app and builds the before/after strips. |
| `tests/` | The Usability Contract's suite: `tier1/` behaviour core, `tier2/` data-driven, `pwa/`, `unit/`, `python/`. |
| `tests/fixtures/` | Frozen API capture (2026-08-12) pinning the resolver regression suite. |
| `.github/workflows/usability-tests.yml` | Runs the suite on every PR to `main`. Red blocks merge. |
| `.github/workflows/monthly-mp-check.yml` | Monthly job. Fetches, validates, runs the suites in-job, commits `data/*.json`, opens a draft PR into `main`. `workflow_dispatch` takes a `force_pr` input for testing the pipeline. |
| `USABILITY.md` | The contract: every promise, its test, and the `data-testid` table (§3). |
| `data/README.md` | The data schemas, the two seat counts, and who is allowed to write which file. |
| `ARCHITECTURE_PLAN.md`, `EXECUTION_GUIDE.md` | The rebuild plan and its per-phase prompts. **Executed — historical record**, not a to-do list. |
| `BEHAVIOR_SNAPSHOT.md`, `snapshot/` | What the app did before the rebuild, plus the after/compare captures. |
| `docs/DEPRECATED_MONTHLY_PROCEDURE.md` | The hand-written monthly procedure the job replaced. History only — do not follow it. |
| `v-stable-pre-rebuild` | Rollback ref for the pre-rebuild app. |

**Files that do not exist**, despite older documents referring to them:
`mp-data-scraped.json`, `data/change_report.json`, `data/mp_data_fetched.json`,
`data/mp_data_current.json`. Nothing writes them; the monthly job's change
report is a workflow artifact, not a committed file.

## Critical rules

1. **Never commit directly to `main`.** Always a feature branch plus a PR.
   `main` is the production branch — a merge deploys.
2. **`npm test` must be green before any merge.** Not "usually", not "unless
   it's unrelated". That single rule is what prevents a repeat of `4dae72b`.
   If the suite is red, fix the app; changing a test is legitimate only when
   the *contract* changed, and then `USABILITY.md` §1 changes in the same PR.
3. **A data change touches `data/*.json` only** (see below).
4. **A design change touches `styles.css` + `src/views/*` only**, keeps every
   `data-testid` in `USABILITY.md` §3, and ships green. Mobile layout is
   optimised for small screens — do not alter spacing casually.
5. **`service-worker.js` and `manifest.json` are PWA configuration.** Touching
   them means bumping `CACHE_NAME` and keeping `tests/pwa/offline.spec.js`
   green.
6. **Never state Riigikogu seat arithmetic or coalition strength from memory.**
   Read it out of `data/meta.json`, or verify against the live API and cite the
   date.

## The data model: two seat counts, never conflate them

| Count | Source | Use for |
|---|---|---|
| **Registered** | 100% API | Procedural facts: speaking time, committee entitlements, any official Riigikogu figure |
| **Voting bloc** | API + `alignment.json` overlay | **Majority arithmetic — the calculator, coalition/opposition totals, "will this pass"** |

Under the Rules of Procedure §40–42 an MP who leaves a parliamentary group may
never join another for the rest of the term, so a defector stays *registered* as
non-affiliated while *voting* with their new party. Both numbers are correct;
they answer different questions. **The app displays voting-bloc numbers and must
continue to** — the calculator is meaningless otherwise.

A third state matters: MPs who left a group and joined **no** party. They have
no whip and no common position, and must **never** be added to either bloc to
reach a majority. They are a visible third bucket in the UI, not a rounding
error.

`USABILITY.md` §6 documents the sabotage that proves Tier 2 catches registered
counts leaking into a voting-bloc display. That is the failure mode this model
exists to prevent.

## Updating MP data

There are exactly two ways, and both end in a PR.

### 1. Review and merge the automated PR (the normal path)

`.github/workflows/monthly-mp-check.yml` runs on the 1st of each month, and on
`workflow_dispatch` (with `force_pr` to exercise the pipeline when nothing
changed). It fetches the live API, validates, runs the unit + resolver suites
**in-job** — necessary because a PR created with `GITHUB_TOKEN` does not trigger
the Usability Contract workflow — commits `data/*.json`, and opens a **draft**
PR into `main` with the changes classified:

| | Meaning | What you do |
|---|---|---|
| 🔴 **ACTION REQUIRED** | An MP became non-affiliated. The job cannot know which party they joined. | Add them to `alignment.json` — `unaligned` if they joined no party, `defectors` with a `votesWith` if they did. |
| 🟠 Roster change | An MP joined or left parliament (substitutions when a member becomes a minister). | Read it — and see 🪑 below, which a roster change always brings with it. |
| 🪑 **ACTION REQUIRED** | The roster moved and `data/seating.json` did not: someone has no seat, or a seat belongs to someone who has left. The API publishes no seat, so the job cannot fix it. | Give the arriving member a cell in `seating.json` — usually the one the departing member freed, which the PR body names. |
| 🟡 Board change | President or a Vice-President changed. | Read it. |
| 🟢 Routine | Committee moves, photos, contacts, districts. | Read it. |
| ♻️ Stale alignment | A uuid in `alignment.json` is no longer non-affiliated. | Remove the entry. |

Your job is: resolve every 🔴, seat every 🪑, remove every ♻️, confirm the suite
is green, then merge. Pages deploys `main`.

While a 🔴 is unresolved the arithmetic in the PR is still correct and
publishable — an unclassified MP counts toward **no bloc**. The worst case is
understating a bloc by one seat; the pipeline can never manufacture a majority
that does not exist. A 🪑 costs even less: the desktop floor plan is one member
short and no count moves at all, because every count is read from `mps.json` and
none of it from the seating plan.

### 2. Do it by hand

```bash
python3 scripts/build_data.py       # regenerate everything API-derived
python3 scripts/validate_data.py    # exit 0 = safe to publish
npm test                            # must be green before the PR
```

Then commit `data/*.json` on a branch and open a PR.

`data/alignment.json` and `data/seating.json` are the hand-maintained files —
`alignment.json` only in its `blocs` (change when a government changes) and
`defectors` sections.
`build_data.py`, run by hand, may append a newly non-affiliated MP to
`unaligned`; **the monthly job may not write that file at all**. See
`data/README.md`, "Who writes what".

## Running the tests

```bash
npm ci
npm test              # unit + resolver + Playwright; starts its own static server
npm run test:tier1    # behaviour core only
npm run test:report   # HTML report after a run
```

Chromium is pre-installed in this sandbox at `/opt/pw-browsers/chromium` — do
not run `playwright install` here. CI installs its own.

## Known-broken, do not treat as working

1. **The monthly job cannot open its own PR yet — one owner checkbox.**
   Everything else works (verified by dispatch on 2026-08-12: fetch, classify,
   validate, both suites, commit, push all green). `gh pr create` then failed
   with *"GitHub Actions is not permitted to create or approve pull requests"*.
   Fix: **Settings → Actions → General → Workflow permissions → Allow GitHub
   Actions to create and approve pull requests.** Until then the job pushes a
   validated branch and the run's error message links the compare page. Nothing
   in the repository can fix this.

2. **MP photos do not work offline.** They are served by `api.riigikogu.ee` and
   the service worker leaves cross-origin requests alone; the roster falls back
   to placeholders. Caching ~100 opaque responses of unknown size alongside the
   app was a deliberate no.

Everything else that older sessions were warned about is fixed: the service
worker's precache paths (Phase 6 — offline works, all five PWA specs run for
real), the workflow's gitignored `git add` and missing `--base main`, and the
`factions[0]` faction resolver that reported 50 non-affiliated members because
every MP carries a stale `Non-affiliated members` membership from April 2023.
`tests/python/test_resolvers.py` asserts the difference so it cannot come back.
