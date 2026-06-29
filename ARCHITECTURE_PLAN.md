# Riigikogu Mobile — Architecture Rebuild & API-Check Plan

> **Status:** Approved plan, not yet executed.
> **Stack decision (locked):** Plain HTML + CSS + native ES modules. **No bundler, no framework, no build step.** The source *is* what ships.
> **Audience:** A future Claude Code session executing this plan end to end.
> **Golden rule:** Usability must be preserved at every step. Parties, MP names, party colors, clickable buttons/menus/links, tabs, board, and the **vote-calculator logic** must behave identically before and after. The Phase 2 regression tests are the enforcement mechanism — never merge a phase that makes them red.

---

## 0. Why this plan exists (context)

The current `index.html` (253 KB) is a **compiled, minified, symbol-mangled build artifact** (Tailwind CSS + a bundled React-like app, `<div id=root>`). Findings established during analysis:

1. **No source code is in the repo** — only the build output. The minified blob cannot be safely hand-edited.
2. **All data and all logic are baked into the blob.** Grep of the bundle found **no `fetch()`, no `.json`, no XHR** — every MP, faction, committee, board member, party color, seat count (52/49/51), and the entire vote calculator is hardcoded inside the minified JS.
3. **`data/*.json` is not read by the app.** It only feeds the monthly GitHub Action, whose output a human must then hand-apply to the un-editable blob. The loop is broken at the last step.
4. **`CLAUDE.md` is drifted:** it references `mp-data-scraped.json` (does not exist) and tells editors to modify "hardcoded JS objects" (minified, unsafe).
5. **A redesign already failed once** — git commit `4dae72b "Restore original app from before the redesign"` reverted the entire `redesign/chunk1..7` effort. This is the exact failure mode this plan prevents.
6. **The faction resolver is buggy.** `scripts/fetch_mp_data.py` takes `factions[0]` (the first, possibly expired, membership). Correct logic = the `FRAKTSIOON` faction whose `membership.endDate is null`. Verified against the live API:
   - Buggy `[0]`: 50 Non-affiliated, 25 Reform (wrong).
   - Corrected: Reform 37, Non-affiliated 18, Eesti 200 13, SDE 9, EKRE 9, Isamaa 8, Centre 7 = **101** (plausible).
7. **Service worker path bug:** `service-worker.js` caches `/riigikogu-dashboard/...` but the app is hosted at `/riigikogu-mobile/`.

### Target architecture

```
DATA LAYER      data/*.json  ── single source of truth, fetched at runtime
   │            (maintained by the monthly API-check workflow)
LOGIC LAYER     src/lib/*.js ── pure, framework-free, unit-tested (calculator, thresholds, faction map)
   │
VIEW LAYER      src/views/*.js + styles.css ── THE ONLY PART A REDESIGN TOUCHES
   │
USABILITY       tests/ (Playwright) ── locks every feature; blocks regressions in CI
CONTRACT
```

### Live API — verified working

```
GET https://api.riigikogu.ee/api/plenary-members?lang=EN
→ HTTP 200, ~427 KB, 101 members, access-control-allow-origin: *
```

Field map per member:

| App field      | API source                              |
|----------------|-----------------------------------------|
| `name`         | `fullName`                              |
| `uuid`         | `uuid`                                  |
| `photoUrl`     | `photo._links.download.href`            |
| `profileUrl`   | `WEB_BASE/{uuid}/{name-with-dashes}`    |
| `faction`      | `factions[]` where membership is current (see resolver) |
| `committees`   | `committees[]` where `membership.endDate is null` (name + role.value) |

---

## Execution rules for Claude Code

- Work on branch `claude/jolly-edison-ar6tjy` (or a child branch per phase). **Never commit to `main`.**
- Each phase is a **separate commit** (ideally a separate PR) and must leave the app working.
- **Do not start Phase 3+ until Phase 2 tests are green against the CURRENT app.** The tests must pass on the old blob first, proving they describe real behavior, then keep passing through the rewrite.
- After each phase: run the full test suite, update `CLAUDE.md`, and stop for human review before the next phase if it changes user-visible behavior.
- Honor existing `CLAUDE.md` critical rules where still valid: never alter the PWA contract casually, always use a feature branch, total MP count must equal 101.

---

## Phase 0 — Freeze the baseline (safety net) — NO app changes

**Goal:** Make rollback trivial and capture today's behavior before anything moves.

Steps:
1. `git tag v-stable-pre-rebuild` on the current `HEAD` of `main`; push the tag. This is the guaranteed rollback point.
2. Create `BEHAVIOR_SNAPSHOT.md` recording observed current behavior (manually verify in a browser):
   - Tabs that exist and their order.
   - Party list with the **exact hex colors** used (extract from the compiled CSS / computed styles).
   - Coalition vs opposition totals and the majority threshold shown.
   - Calculator outputs for 3 fixed scenarios (e.g. "Reform+Eesti200+SDE", "all parties", "single MP added") — record seat totals and which threshold badges light up.
   - List of every clickable element per tab (buttons, MP rows → profile links, menu items, bottom sheets).
3. Correct `CLAUDE.md` immediately to state reality: the app is currently an artifact-only blob; `data/*.json` is not yet wired to the app; `mp-data-scraped.json` does not exist. Mark the old "Monthly Update Procedure" as **deprecated, pending rebuild**.

**Acceptance:** Tag exists and is pushed; `BEHAVIOR_SNAPSHOT.md` committed; `CLAUDE.md` no longer describes nonexistent files.

---

## Phase 1 — Data layer (extract data to versioned JSON, runtime-read)

**Goal:** Make `data/*.json` the single source of truth, with a schema driven by the real API.

Steps:
1. Define and document the schema in `data/` (commit example files):
   - **`data/parties.json`** — array of `{ id, nameEn, nameEt, short, color, seats, bloc }` where `bloc ∈ {"coalition","opposition","none"}` and `color` is a hex string. This is the **canonical home of party colors** (extracted from the current compiled CSS during Phase 0).
   - **`data/mps.json`** — array of `{ name, uuid, photoUrl, profileUrl, partyId, faction, committees:[{name,role}], active }`. Extends the existing `mp_data_current.json`.
   - **`data/board.json`** — `{ president, vicePresidents:[...] }` with each `{ name, partyId, uuid }`.
   - **`data/meta.json`** — `{ totalSeats:101, coalitionSeats, oppositionSeats, simpleMajority:51, constitutionalMajority:68, updatedAt }`.
2. Add a `partyId` mapping table (faction full name → party id + color) in `data/parties.json` so MP factions resolve to a stable id and color. Cover all 7 current factions plus "Non-affiliated members".
3. Populate the JSON **once** from the live API (using the corrected resolver from Phase 5's script) **plus** party colors extracted from the existing bundle/CSS in Phase 0. Do not retype from memory.
4. **Validate:** assert `len(mps) == 101`; assert `sum(party.seats) == 101`; assert every `mp.partyId` exists in `parties.json`; assert `coalitionSeats + oppositionSeats == 101`.

**Acceptance:** All four JSON files exist, validate, and total to 101. No app behavior change yet (app still runs off the blob).

---

## Phase 2 — Usability contract + regression tests (the safety net)

**Goal:** Lock every feature with automated tests that pass against the CURRENT blob first, then guard the rewrite.

Steps:
1. Write `USABILITY.md`: an explicit, checkable list of features that must always work — tab set, MP directory + search/filter, party color coding, clickable profile links, board view, calculator (add/remove party, add/remove MP, simple + constitutional majority indicators), PWA install + offline.
2. Add **Playwright** tests under `tests/` (Playwright is framework-agnostic — it drives the rendered site, so the same tests survive the rewrite). Add a minimal `package.json` dev-dependency on `@playwright/test` and an `npm test` script. Tests:
   - `01-render.spec.js`: 101 MP entries render; each MP row links to its `profileUrl`.
   - `02-colors.spec.js`: each party's rendered color matches `data/parties.json`.
   - `03-tabs.spec.js`: all tabs from `USABILITY.md` are present and switch.
   - `04-calculator.spec.js`: for the 3 fixed scenarios from `BEHAVIOR_SNAPSHOT.md`, assert seat totals and which majority badges are active. **This is the test that prevents the calculator from silently breaking in a redesign.**
   - `05-pwa.spec.js`: manifest loads; service worker registers; offline navigation serves `offline.html`.
3. Run the suite against the **current** `index.html` and make it green (adjust selectors to the real DOM). Commit only when green.
4. Add a GitHub Actions workflow `.github/workflows/usability-tests.yml` running Playwright on every PR. **A red suite blocks merge.**

**Acceptance:** `npm test` green against the existing app; CI workflow runs on PRs and blocks on failure.

---

## Phase 3 — Vanilla source rewrite (decouple design from data/logic)

**Goal:** Replace the opaque blob with owned, plain-JS source that renders the SAME UI from the Phase 1 data and Phase 4 logic. No bundler.

Target file structure:
```
index.html            # small hand-written shell: <div id=app>, <script type="module" src="./src/app.js">
styles.css            # plain CSS; party colors as custom properties (--party-<id>)
src/
  app.js              # tab router + mount
  data.js             # fetch ./data/*.json at runtime, expose typed accessors
  lib/
    calculator.js     # pure vote/threshold logic (Phase 4)
    factions.js       # faction-name → partyId/color resolution
  views/
    parliament.js     # composition / coalition-opposition dashboard
    mps.js            # MP directory + search/filter
    calculator.js     # vote calculator UI (calls lib/calculator.js)
    board.js          # board of the Riigikogu
data/                 # parties.json, mps.json, board.json, meta.json (Phase 1)
```

Steps:
1. Build `index.html` as a minimal shell loading native ES modules (GitHub Pages serves them directly — no compile).
2. `src/data.js` fetches the committed `data/*.json` at load and caches it. (This is the wiring that was missing — the app finally reads its data files.)
3. **Drop compiled Tailwind.** Recreate only the styles actually used in `styles.css`, with party colors as CSS custom properties read conceptually from `parties.json`. This removes ~18 KB of utility-class soup and makes future restyling = editing variables.
4. Rebuild each tab in `src/views/*` to render from data — **matching the current UI 1:1** (this is the one-time cost of the vanilla choice).
5. Run Phase 2 tests continuously; the rewrite is "done" only when **all Phase 2 tests pass against the new source**, identical to how they passed against the blob.
6. Keep the old `index.html` blob in git history (and behind the `v-stable-pre-rebuild` tag) for rollback.

**Acceptance:** New vanilla app renders from `data/*.json`; all Phase 2 tests green; visual parity with `BEHAVIOR_SNAPSHOT.md`.

---

## Phase 4 — Pure logic layer (lock the calculator)

**Goal:** The vote math lives in one tested module the views call but never re-implement.

Steps:
1. Implement `src/lib/calculator.js` as pure functions: `seatsForSelection(parties, mps, selection)`, `hasSimpleMajority(seats)`, `hasConstitutionalMajority(seats)`, etc. No DOM, no globals.
2. Add unit tests `tests/unit/calculator.spec.js` covering majority boundaries (50/51, 67/68), party add/remove, individual MP add/remove, and the 3 snapshot scenarios.
3. The calculator view imports only from `lib/calculator.js`. A redesign can rewrite the view freely; the math is immune.

**Acceptance:** Unit tests green; `04-calculator.spec.js` still green; no calculator logic duplicated in any view.

---

## Phase 5 — Working monthly API check (close the loop)

**Goal:** The monthly check updates the JSON the app actually reads, via a reviewed PR. Architecture = **Option A (build/commit-time)**: the workflow updates `data/*.json` → opens PR → human reviews (party switches flagged) → merge → GitHub Pages redeploys. This preserves offline support and the human review gate for politically sensitive switches.

Steps:
1. **Fix the faction resolver** in `scripts/fetch_mp_data.py`. Replace the `factions[0]` logic with: among `m["factions"]`, select entries where `type.code == "FRAKTSIOON"` **and** `membership.endDate in (None, "")`; take the current one. (Verified to yield the correct 101-seat distribution.) Also parse current committees (`committees[]` where `membership.endDate is null`, capture `name` + `membership.role.value`).
2. Make `fetch_mp_data.py` write the **full app schema** (`data/mps.json` shape from Phase 1), not just the legacy fields. Have it also recompute party `seats` and coalition/opposition totals into `data/meta.json` and validate `== 101` (abort on mismatch — never emit bad data).
3. Update `scripts/compare_mp_data.py` to diff the new schema and to **explicitly flag party switches** (partyId changes) separately from joins/leaves/photo changes, so the PR body highlights politically significant changes for human review (per CLAUDE.md intent).
4. Update `.github/workflows/monthly-mp-check.yml`:
   - Keep `cron: '0 8 1 * *'` + `workflow_dispatch`.
   - On changes: write the new `data/*.json`, run validation, open a PR titled `MP Data Update - <Month YYYY>` targeting `main`, body generated by `generate_pr_body.py` with party switches called out.
   - Replace the deprecated `gh`-only path if needed; ensure it commits the **app-read** JSON files, not a throwaway report.
5. **Optional enhancement (not required):** add a client-side "refresh from API" that fetches the live endpoint (CORS is `*`) to show staleness, layered on top of committed JSON — but committed JSON remains the source of truth so offline + review gate are preserved.
6. Add `tests/unit/faction-resolver.spec.js` (or a Python test) asserting the resolver yields exactly 101 and the known 7-faction split, so the resolver bug can never silently return.

**Acceptance:** Running `python scripts/fetch_mp_data.py` locally produces valid 101-MP JSON in the app schema with correct factions; `compare` flags party switches; the workflow opens a reviewable PR; the app, after merge, shows the updated data.

---

## Phase 6 — PWA housekeeping

**Goal:** Make the PWA survive rebuilds and fix the path bug.

Steps:
1. Fix `service-worker.js`: change cached paths from `/riigikogu-dashboard/` to `/riigikogu-mobile/`.
2. Update the SW precache list to the new asset set: `index.html`, `styles.css`, `src/**/*.js`, `data/*.json`, `manifest.json`, icons, `offline.html`.
3. Bump the cache version constant so clients pick up the new app.
4. Confirm `manifest.json` `start_url`/`scope` match `/riigikogu-mobile/`.
5. `05-pwa.spec.js` must stay green (install + offline).

**Acceptance:** PWA installs, works offline serving cached app + data, and `05-pwa.spec.js` green.

---

## Phase 7 — Documentation & cutover

Steps:
1. Rewrite `CLAUDE.md` to describe the **new** architecture and a **safe** monthly procedure: "edit `data/*.json` only (or merge the automated PR); never touch `src/views` or `styles.css` for data changes; run `npm test` before merge."
2. Document in `CLAUDE.md` the redesign-safety guarantee: design changes touch only `styles.css` + `src/views/*`; `npm test` (Usability Contract) must stay green; data/logic layers are off-limits to design work.
3. Update `README.md` feature list with whatever the current data shows (composition has drifted from the README's older numbers — let the data drive it).
4. Final full-suite run; merge to `main`; verify the live GitHub Pages site.

**Acceptance:** Docs match reality; full suite green; live site verified.

---

## Sequencing, risk & rollback

- **Phases 0–2 are low-risk and deliver most of the safety** (rollback tag + data extracted + regression net). They do not modify the running app. Ship these first; they are valuable even if later phases are deferred.
- **Phases 3–4** are the larger lift but are gated by Phase 2 tests — every step is verifiable against the locked contract.
- **Phase 5** can run in parallel with 3–4 (it touches scripts/workflow, not the app), but its output only reaches users after Phase 3 wires the app to JSON.
- **Rollback at any point:** `git checkout v-stable-pre-rebuild -- index.html` restores the known-good blob.
- **Never** merge a phase with a red Usability Contract. That rule is what structurally prevents a repeat of commit `4dae72b`.

## Definition of done (whole project)

- App runs as plain HTML/CSS/ES modules, no bundler, source committed.
- All MP/party/board/calculator data comes from `data/*.json` at runtime.
- Vote calculator logic is a single pure, unit-tested module.
- Monthly API-check workflow opens a reviewable PR updating the app's real data, with correct factions and party-switch flagging.
- Playwright Usability Contract is green in CI and blocks regressions.
- PWA installs and works offline with corrected paths.
- A future design change requires touching only `styles.css` + `src/views/*`, with the test suite proving usability is preserved.
