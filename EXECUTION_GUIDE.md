# How to Execute the Architecture Plan — Copy-Paste Guide

This is your simple guide. For each phase below, **copy the prompt block and paste it to Claude Code.** Do them in order. Wait for one phase to finish (and review it) before starting the next.

The full technical detail lives in `ARCHITECTURE_PLAN.md` — each prompt tells Claude to follow it.

---

## Before you start (one time)

- Work happens on branch `claude/jolly-edison-ar6tjy`.
- After each phase, Claude will commit, push, and the change shows up in PR #18.
- **Golden rule:** never accept a phase if the tests (added in Phase 2) go red. That is what protects all your usability.
- Do phases **in order**. Phases 0, 1, 2 are safe and don't change the app — start there.

---

## Phase 0 — Safety net (no app changes)

> Copy this:

```
Execute Phase 0 of ARCHITECTURE_PLAN.md on branch claude/jolly-edison-ar6tjy.
Create the rollback git tag, write BEHAVIOR_SNAPSHOT.md documenting the current
app's tabs, party colors (exact hex), seat totals, and 3 vote-calculator
scenarios, and correct CLAUDE.md to describe reality. Do not change any app code.
Commit and push when done, and tell me what the rollback tag is called.
```

**You get:** a rollback point and a record of how the app behaves today. ✅ Safe.

---

## Phase 1 — Data layer (no visible app change)

> Copy this:

```
Execute Phase 1 of ARCHITECTURE_PLAN.md on branch claude/jolly-edison-ar6tjy.
Create data/parties.json, data/mps.json, data/board.json, data/meta.json using
the real Riigikogu API and the party colors captured in Phase 0. Validate that
there are exactly 101 MPs, party seats sum to 101, and every MP's partyId exists.
Do not change the running app yet. Commit, push, and show me the validation output.
```

**You get:** all data in clean JSON files. The app still runs off the old blob. ✅ Safe.

---

## Phase 2 — Usability tests (the safety net)

> Copy this:

```
Execute Phase 2 of ARCHITECTURE_PLAN.md on branch claude/jolly-edison-ar6tjy.
Write USABILITY.md and add Playwright tests under tests/ that verify the CURRENT
app: 101 MPs render with profile links, party colors match data/parties.json,
all tabs work, the vote calculator gives the right totals and majority badges for
the 3 snapshot scenarios, and the PWA installs/works offline. Make the tests pass
against the current app, add the CI workflow that blocks merges on failure, then
commit and push. Show me the passing test run.
```

**You get:** automated tests that lock every feature. **After this point, you are protected.** ✅ Safe.

---

## Phase 3 — Vanilla rebuild (the big one)

> Copy this:

```
Execute Phase 3 of ARCHITECTURE_PLAN.md on branch claude/jolly-edison-ar6tjy.
Rebuild the app as plain HTML + CSS + native ES modules (no bundler, no framework)
that reads data/*.json at runtime, matching the current UI 1:1. Use the file
structure in the plan (index.html shell, styles.css, src/app.js, src/data.js,
src/views/*). The rebuild is only done when ALL Phase 2 Playwright tests pass
against the new app exactly as they did against the old one. Keep the old index.html
recoverable via the Phase 0 tag. Commit, push, and show me the full test run.
```

**You get:** an app you fully own, with design separated from data. ⚠️ Review carefully — compare against `BEHAVIOR_SNAPSHOT.md`.

---

## Phase 4 — Lock the calculator

> Copy this:

```
Execute Phase 4 of ARCHITECTURE_PLAN.md on branch claude/jolly-edison-ar6tjy.
Move all vote/threshold math into a single pure module src/lib/calculator.js with
unit tests covering the 50/51 and 67/68 boundaries, party add/remove, and MP
add/remove. Make the calculator view use only that module (no duplicated math).
Run all tests, commit, push, and show me the results.
```

**You get:** the calculator math in one tested place that a future redesign can't break.

---

## Phase 5 — Working monthly API check

> Copy this:

```
Execute Phase 5 of ARCHITECTURE_PLAN.md on branch claude/jolly-edison-ar6tjy.
Fix the faction resolver in scripts/fetch_mp_data.py (use the current FRAKTSIOON
membership where endDate is null, not factions[0]) and make it write the full app
JSON schema plus recomputed seat totals, aborting if the count isn't 101. Update
compare_mp_data.py to flag party switches separately, and update the monthly
workflow to open a reviewable PR that updates the JSON the app actually reads.
Add a test asserting the resolver returns 101 MPs with the correct 7-faction split.
Run it once locally to prove it works, commit, push, and show me the output.
```

**You get:** the monthly check now updates the live app's data (via a PR you approve), with correct parties.

---

## Phase 6 — PWA cleanup

> Copy this:

```
Execute Phase 6 of ARCHITECTURE_PLAN.md on branch claude/jolly-edison-ar6tjy.
Fix the service worker paths (/riigikogu-dashboard/ -> /riigikogu-mobile/), update
the precache list to the new files, bump the cache version, and confirm manifest.json
scope/start_url. Keep the PWA Playwright test green. Commit, push, and show results.
```

**You get:** offline mode and install working correctly with the new files.

---

## Phase 7 — Docs & go live

> Copy this:

```
Execute Phase 7 of ARCHITECTURE_PLAN.md on branch claude/jolly-edison-ar6tjy.
Rewrite CLAUDE.md to describe the new architecture and the safe monthly update
procedure (edit data/*.json only; never touch src/views or styles.css for data).
Update README.md from the current data. Run the full test suite. Commit, push, and
give me a final summary plus what to verify on the live site before merging.
```

**You get:** docs that match reality and a final green build ready to merge.

---

## After it's all done — how future design changes work

When you want a new design later, just tell Claude:

```
Redesign the app's look (styles.css and src/views/* only). Do not touch the data
files, src/data.js, or src/lib/. All Phase 2 Playwright usability tests must stay
green. Show me the test run when done.
```

If the tests stay green, your parties, MP names, colors, buttons, menus, and vote
calculator are all guaranteed intact — no matter how the design changes.

---

## Quick reference

| Phase | What it does | Risk | Changes the app? |
|------|--------------|------|------------------|
| 0 | Rollback tag + behavior snapshot | None | No |
| 1 | Data into JSON files | None | No |
| 2 | Usability tests (the safety net) | None | No |
| 3 | Vanilla rebuild | Medium | Yes — review closely |
| 4 | Pure calculator module | Low | Internal only |
| 5 | Working monthly API check | Low | Adds automation |
| 6 | PWA cleanup | Low | Offline/install |
| 7 | Docs + go live | None | Docs only |

**Tip:** You can safely stop after Phase 2 and already be far better protected than today.
