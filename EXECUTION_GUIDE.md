# How to Execute the Architecture Plan — Copy-Paste Guide (v2)

For each phase: **copy the prompt block, paste it to Claude Code, wait for it to finish, then review using the checklist.** Do phases in order. Full technical detail lives in `ARCHITECTURE_PLAN.md` (v2).

**Branch model:** Phase 0 creates a real `main` branch. Every phase after that runs on its own branch and opens its own PR into `main` — you review and merge each one before starting the next.

**Golden rule:** never merge a PR with failing tests. From Phase 2 onward, that is what guarantees your parties, MP names, colors, buttons, menus, and calculator survive every change.

---

## Phase 0 — Baseline, snapshot & repo repair (safe — no app changes)

```
Execute Phase 0 of ARCHITECTURE_PLAN.md (v2). Tag the current default-branch HEAD
as v-stable-pre-rebuild and push the tag. Using the local Chromium + Playwright
yourself, load the current index.html and produce BEHAVIOR_SNAPSHOT.md plus a
snapshot/ folder of screenshots: every tab, the MP popup, and the calculator with
selections; extract tab names, party names with their rendered hex colors,
displayed seat totals, all clickable elements, and 3 calculator scenarios. Note
which displayed numbers are stale versus the live API. Create a `main` branch from
the current default HEAD and retarget PR #18 to it. Correct CLAUDE.md to stop
referencing files that don't exist. Commit, push, open the PR, and tell me the two
things I must do by hand in GitHub Settings.
```

**Your two manual clicks after this phase (Claude will remind you):**
1. Settings → Branches → switch the default branch to `main`.
2. Settings → Pages → confirm which branch/folder deploys the live site, and tell Claude.

**Review checklist:** tag exists; screenshots look like your app; snapshot doc matches what you see on your phone.

---

## Phase 1 — Data layer (safe — app unchanged)

```
Execute Phase 1 of ARCHITECTURE_PLAN.md (v2) on a new branch off main. Create
data/parties.json, data/mps.json, data/board.json, data/meta.json and data/README.md
from the live Riigikogu API using the corrected faction resolver (current FRAKTSIOON
membership, endDate null), with party colors from the Phase 0 snapshot. Propose
coalition/opposition bloc assignments for my confirmation in the PR description.
Add scripts/validate_data.py (101 MPs, seat sums, partyId integrity) and show me its
passing output. Commit, push, open a PR into main.
```

**Review checklist:** validator output shows 101; **you personally confirm the coalition/opposition assignments** — that's a political judgment, not a technical one; check the composition-drift note (the old app's numbers are from 2023 — the new data will differ, that's correct).

---

## Phase 2 — Usability Contract tests (safe — app unchanged)

```
Execute Phase 2 of ARCHITECTURE_PLAN.md (v2) on a new branch off main. Write
USABILITY.md and the Playwright suite: Tier-1 behavior tests using text/role
selectors that pass against the CURRENT app served locally (tabs, 101 MPs with
names, calculator self-consistency: totals add up and the 51/68 badges flip at the
thresholds). Write the Tier-2 data-driven specs but leave them skipped, and the PWA
spec marked fixme with the documented service-worker path bug as the reason. Add the
CI workflow that runs the suite on every PR to main and blocks merge on red. Prove
the suite has teeth: show me it passing, then a sabotage run where you temporarily
break the calculator and the suite fails, then restore and show green again.
Commit, push, open a PR into main.
```

**Review checklist:** you saw three runs — green, deliberately red, green again. If the sabotage run didn't fail, the tests are decorative — don't merge.

---

## Phase 3 — Calculator logic module (safe — app unchanged)

```
Execute Phase 3 of ARCHITECTURE_PLAN.md (v2) on a new branch off main. Implement
src/lib/calculator.js and src/lib/factions.js as pure modules with no DOM access,
matching the calculator behavior recorded in BEHAVIOR_SNAPSHOT.md. Add unit tests
with node:test covering the 50/51 and 67/68 boundaries, party add/remove, individual
MP add/remove, and the snapshot scenarios recomputed from data/*.json. Wire the unit
tests into the CI workflow. Show me the passing run. Commit, push, open a PR into main.
```

**Review checklist:** unit test output green in CI; no UI files changed in the diff.

---

## Phase 4 — The rebuild (the big one — review carefully)

```
Execute Phase 4 of ARCHITECTURE_PLAN.md (v2) on a new branch off main. Rebuild the
app as plain HTML + CSS + native ES modules per the plan's file structure: index.html
shell, styles.css with party colors as CSS custom properties, src/app.js, src/data.js
reading data/*.json at runtime, and src/views/* importing calculator logic only from
src/lib/. Match the behavior in BEHAVIOR_SNAPSHOT.md 1:1 and give every interactive
element its data-testid (document the list in USABILITY.md). Un-skip the Tier-2
tests. Done only when Tier-1 + Tier-2 + unit tests are ALL green. Attach side-by-side
before/after screenshots to the PR and list every visible data difference (stale 2023
numbers -> current). Commit, push, open a PR into main.
```

**Review checklist:** full suite green in CI; compare the before/after screenshots yourself — same tabs, same interactions, same look; data differences listed are *expected* (composition is now current); confirm on your phone from the PR preview if possible. **This is the one PR to review slowly.**

---

## Phase 5 — Monthly API check, fixed end-to-end

```
Execute Phase 5 of ARCHITECTURE_PLAN.md (v2) on a new branch off main. Fix
scripts/fetch_mp_data.py (corrected faction resolver, current committees, full app
schema output, abort on validation failure using validate_data.py). Fix
compare_mp_data.py for the new schema with party switches flagged prominently. Fix
the monthly workflow: resolve the gitignore/git-add conflict, target main, and run
validation plus the unit tests inside the workflow before opening the PR (bot PRs
made with GITHUB_TOKEN don't trigger our CI, so validation must happen in-job). Add
a resolver regression test from a fixture of the raw API payload. Do a local dry-run
and show me the output, then trigger the workflow once via workflow_dispatch and
link me the PR it opens. Commit, push, open a PR into main.
```

**Review checklist:** the dry-run shows 101 MPs with the correct faction split; the test-fired workflow actually opened a data PR against `main`; party switches (if any) are clearly flagged in it.

---

## Phase 6 — PWA repair

```
Execute Phase 6 of ARCHITECTURE_PLAN.md (v2) on a new branch off main. Fix
service-worker.js paths from /riigikogu-dashboard/ to /riigikogu-mobile/, set the
precache list to the new files including data/*.json, bump the cache version, and
verify manifest.json start_url and scope. Remove the fixme from the PWA spec — it
must now pass for real. Show me the green run. Commit, push, open a PR into main.
```

**Review checklist:** PWA test green; after merging, on your phone: open the site, install it, turn on airplane mode, reopen — it must still work.

---

## Phase 7 — Docs & go live

```
Execute Phase 7 of ARCHITECTURE_PLAN.md (v2) on a new branch off main. Rewrite
CLAUDE.md for the new architecture: monthly updates = review/merge the automated
data PR or edit data/*.json only; design changes = styles.css and src/views/* only,
keeping all data-testids; npm test must be green before any merge; never commit to
main. Update README.md so its numbers come from the current data. Mark
ARCHITECTURE_PLAN.md as executed. Run the full suite, commit, push, open a PR into
main, and give me a checklist of what to verify on the live site.
```

**Review checklist:** read the new CLAUDE.md — it's the instruction set every future session follows; walk the live-site checklist on your phone.

---

## Afterwards — how a future design upgrade works

Whenever you want a new look, paste this:

```
Redesign the app's visual design. You may change styles.css and src/views/* only.
Do not touch data/, src/data.js, src/lib/, or any data-testid attribute. All
Playwright and unit tests must stay green — show me the full passing run and
before/after screenshots when done.
```

Green suite = parties, MP names, colors, links, menus, and the calculator are all intact, guaranteed by tests rather than by hope.

---

## Quick reference

| Phase | What | Risk | App changes? |
|------|------|------|--------------|
| 0 | Tag + automated snapshot + create `main` | none | no |
| 1 | Fresh data into JSON (you confirm blocs) | none | no |
| 2 | Tests with proven teeth + CI gate | none | no |
| 3 | Pure calculator module + unit tests | none | no |
| 4 | Vanilla rebuild | medium | **yes — review slowly** |
| 5 | Monthly API check fixed end-to-end | low | automation only |
| 6 | PWA/offline repair | low | offline+install |
| 7 | Docs + live verification | none | docs |

You can pause after any phase — 0–3 already give you rollback, clean data, and a regression net without touching the deployed app.
