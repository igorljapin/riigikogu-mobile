# How to Execute the Architecture Plan — Copy-Paste Guide (v3)

For each phase: **copy the prompt block, paste it to Claude Code, wait for it to finish, then review using the checklist.** Do phases in order. Full technical detail lives in `ARCHITECTURE_PLAN.md` (v3).

## The one thing to understand before you start

Estonian parliamentary rules create a permanent gap between two different seat counts, and the app depends on knowing the difference:

- **Registered count** — the official parliamentary group size. The API gives this, always correct, always free.
- **Voting bloc count** — who actually votes together. **This is what your app shows and what the calculator needs.**

They differ because an MP who leaves a parliamentary group can never join another one (Rules of Procedure §40–42). So when an MP defects to another party, they vote with their new party forever while the registry still calls them "non-affiliated." Right now 18 MPs are registered non-affiliated; 11 of them reliably vote with a party.

Your coalition shows **52** because that is the voting bloc. The API would say 50.

**What this means for you in practice:** the monthly job updates everything automatically — names, photos, committees, the Board, contact details, roster changes. The *only* thing it will ever ask you is: *"MP X just left their group. Which bloc do they vote with now?"* You answer that in one line of `data/alignment.json`, and it happens only when someone actually defects — a handful of times per term.

**Branch model:** Phase 0 creates a real `main` branch. Every phase after that runs on its own branch and opens its own PR into `main` — you review and merge each one before starting the next.

**Golden rule:** never merge a PR with failing tests. From Phase 2 onward, that is what guarantees your parties, MP names, colors, buttons, menus, and calculator survive every change.

---

## Phase 0 — Baseline, snapshot & repo repair (safe — no app changes)

```
Execute Phase 0 of ARCHITECTURE_PLAN.md (v3). Tag the current default-branch HEAD
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
Execute Phase 1 of ARCHITECTURE_PLAN.md (v3) on a new branch off main. Create
data/parties.json (using the exact hex colors already in the deployed bundle),
data/mps.json, data/board.json, data/meta.json, data/README.md from the live API
with the corrected faction resolver, plus data/alignment.json seeded with the 11
current defectors and 7 unaligned MPs. Derive the Board from plenaryMembership
jobTitle. Compute BOTH registered and voting-bloc seat counts. Apply the sanity
gate: voting-bloc numbers must reproduce the deployed app's (Reform 39, SDE 14,
E200 13, Isamaa 11, Center 8, coalition 52) with only EKRE 9 and unaffiliated 7
differing — investigate any other mismatch before continuing. Add
scripts/validate_data.py enforcing both counts sum to 101 and every non-affiliated
MP is classified exactly once. Show me the passing output and a table of each
defector with the party you propose they vote with. Commit, push, open a PR into main.
```

**Review checklist:** validator green; coalition reads **52**, not 50 — if it says 50, the overlay isn't being applied; **you personally confirm the defector table and the coalition/opposition assignments** (political judgment, not technical); only expected data change vs. the live app is EKRE 10→9 and independents 6→7.

---

## Phase 2 — Usability Contract tests (safe — app unchanged)

```
Execute Phase 2 of ARCHITECTURE_PLAN.md (v3) on a new branch off main. Write
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
Execute Phase 3 of ARCHITECTURE_PLAN.md (v3) on a new branch off main. Implement
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
Execute Phase 4 of ARCHITECTURE_PLAN.md (v3) on a new branch off main. Rebuild the
app as plain HTML + CSS + native ES modules per the plan's file structure: index.html
shell, styles.css with party colors as CSS custom properties, src/app.js, src/data.js
reading data/*.json at runtime, and src/views/* importing calculator logic only from
src/lib/. Match the behavior in BEHAVIOR_SNAPSHOT.md 1:1 and give every interactive
element its data-testid (document the list in USABILITY.md). The calculator and all
headline totals must use VOTING BLOC counts, not registered counts. Un-skip the
Tier-2 tests. Done only when Tier-1 + Tier-2 + unit tests are ALL green. Attach
side-by-side before/after screenshots and list every visible number that changed —
the only expected changes are EKRE 10->9 and independents 6->7. Commit, push, open
a PR into main.
```

**Review checklist:** full suite green; compare the screenshots yourself — same tabs, same interactions, same look; **coalition still reads 52**; the only changed numbers are EKRE and independents. **Any other changed number is a bug — most likely registered counts leaking into the display. This is the one PR to review slowly.**

---

## Phase 5 — Monthly API check, fixed end-to-end

```
Execute Phase 5 of ARCHITECTURE_PLAN.md (v3) on a new branch off main. Fix
scripts/fetch_mp_data.py: corrected faction resolver, committees with roles, Board
from plenaryMembership jobTitle, faction/committee catalogues refreshed from
/usergroups, full app schema, both seat counts recomputed, abort non-zero on
validation failure. It must NEVER write data/alignment.json. Fix
compare_mp_data.py to classify changes into the five categories in the plan, with
newly non-affiliated MPs surfaced as a prominent ACTION REQUIRED block naming the
MP, the faction they left and the date, and telling me to classify them in
alignment.json before merge; also flag stale alignment entries. Add API resilience:
fail loudly and change nothing on non-200, malformed payload, or a member count
outside 95-105. Fix the monthly workflow: resolve the gitignore/git-add conflict,
target main, and run validation plus unit tests inside the workflow before opening
the PR (bot PRs made with GITHUB_TOKEN don't trigger our CI). Add resolver
regression tests from a committed fixture asserting the registered split, the board,
and 11 chairs plus 11 deputy chairs. Do a local dry-run, then simulate a defection
to prove the ACTION REQUIRED block appears, then trigger the workflow via
workflow_dispatch and link me the PR. Commit, push, open a PR into main.
```

**Review checklist:** dry-run shows 101 with the correct registered split; the simulated defection produced a clear ACTION REQUIRED block (this is the feature that prevents silently wrong majority math); the test-fired workflow opened a real PR against `main`.

---

## Phase 6 — PWA repair

```
Execute Phase 6 of ARCHITECTURE_PLAN.md (v3) on a new branch off main. Fix
service-worker.js paths from /riigikogu-dashboard/ to /riigikogu-mobile/, set the
precache list to the new files including data/*.json, bump the cache version, and
verify manifest.json start_url and scope. Remove the fixme from the PWA spec — it
must now pass for real. Show me the green run. Commit, push, open a PR into main.
```

**Review checklist:** PWA test green; after merging, on your phone: open the site, install it, turn on airplane mode, reopen — it must still work.

---

## Phase 7 — Docs & go live

```
Execute Phase 7 of ARCHITECTURE_PLAN.md (v3) on a new branch off main. Rewrite
CLAUDE.md for the new architecture: monthly updates = review/merge the automated
data PR or edit data/*.json only; design changes = styles.css and src/views/* only,
keeping all data-testids; npm test must be green before any merge; never commit to
main. Update README.md so its numbers come from the current data. Mark
ARCHITECTURE_PLAN.md as executed. Run the full suite, commit, push, open a PR into
main, and give me a checklist of what to verify on the live site.
```

**Review checklist:** read the new CLAUDE.md — it's the instruction set every future session follows; walk the live-site checklist on your phone.

---

## Afterwards — your monthly routine (about 2 minutes)

On the 1st of each month the workflow runs by itself and either does nothing (no changes) or opens a PR titled **MP Data Update - Month YYYY**. Open it and look at the change summary:

| What you see | What to do |
|---|---|
| 🟢 Routine only — photos, committees, contacts | Merge it. |
| 🟠 Roster change — an MP left or arrived | Skim it, merge it. Totals were recomputed and validated automatically. |
| 🟡 Board change — new President or Vice-President | Skim it, merge it. |
| ♻️ Stale alignment entry | Delete the named uuid from `data/alignment.json`, then merge. |
| 🔴 **ACTION REQUIRED — new non-affiliated MP** | **Don't merge yet.** The PR names the MP, the group they left, and the date. Decide which bloc they now vote with and add one entry to `data/alignment.json` — either `"votesWith": "<partyId>"` or add them to `unaligned`. Then merge. |

Only the 🔴 case needs a decision from you, and it only appears when an MP actually defects. If you're unsure which party someone joined, leave the PR open — the app keeps serving the last good data until you merge.

You can also run it any time from the Actions tab (**Run workflow**) instead of waiting for the 1st.

---

## Afterwards — how a future design upgrade works

Whenever you want a new look, paste this:

```
Redesign the app's visual design. You may change styles.css and src/views/* only.
Do not touch data/, src/data.js, src/lib/, or any data-testid attribute, and do not
change which seat count the UI displays (voting bloc, not registered). All Playwright
and unit tests must stay green — show me the full passing run and before/after
screenshots when done.
```

Green suite = parties, MP names, colors, links, menus, and the calculator are all intact, guaranteed by tests rather than by hope.

---

## Quick reference

| Phase | What | Risk | App changes? |
|------|------|------|--------------|
| 0 | Tag + automated snapshot + create `main` | none | no |
| 1 | Data into JSON + alignment overlay (you confirm blocs) | none | no |
| 2 | Tests with proven teeth + CI gate | none | no |
| 3 | Pure calculator module + unit tests | none | no |
| 4 | Vanilla rebuild | medium | **yes — review slowly** |
| 5 | Monthly API check fixed end-to-end | low | automation only |
| 6 | PWA/offline repair | low | offline+install |
| 7 | Docs + live verification | none | docs |

You can pause after any phase — 0–3 already give you rollback, clean data, and a regression net without touching the deployed app.
