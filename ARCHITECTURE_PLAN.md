# Riigikogu Mobile — Architecture Rebuild & API-Check Plan (v2)

> **Status:** Approved plan, not yet executed. v2 supersedes the v1 plan after a critical review.
> **Stack decision (locked):** Plain HTML + CSS + native ES modules. **No bundler, no framework, no build step.** The source *is* what ships.
> **Audience:** A Claude Code session executing one phase at a time via `EXECUTION_GUIDE.md`.
> **Golden rule:** Usability is preserved at every step — parties, MP names, party colors, clickable buttons/menus/links, tabs, board, and the vote-calculator logic. The Usability Contract (Phase 2) enforces this; never merge a phase with a red suite.

---

## 1. Verified findings (evidence, not assumptions)

All of the following were verified against the actual repo and live API:

1. **`index.html` is a compiled, minified artifact with no source in the repo.** 253 KB; Tailwind-compiled CSS + a minified bundled app mounting into `<div id=root>`. Cannot be safely hand-edited.
2. **Zero runtime data loading.** The bundle contains no `fetch()`, no `.json` reference, no XHR. All MPs, factions, committees, board, colors, and calculator logic are baked in.
3. **The deployed data is ~2 years stale.** The bundle hardcodes `seats:39/14/13/11/10/8/6` (the 2023 composition: Reform 39, SDE 14 …). The live API today returns: **Reform 37, Non-affiliated 18, Eesti 200 13, SDE 9, EKRE 9, Isamaa 8, Centre 7 = 101.** The rebuild must ship *fresh* data, not reproduce stale numbers.
4. **The monthly workflow is broken three times over:**
   - a) Its `git add data/mp_data_fetched.json` fails with exit 1 — that path is in `.gitignore` (verified by simulation).
   - b) Its `gh pr create --base main` fails — **the repo has no `main` branch** (default branch is `claude/setup-pwa-structure-R7z8d`).
   - c) Even if (a) and (b) worked, the app never reads the data it updates (finding 2).
5. **Faction-resolver bug.** `scripts/fetch_mp_data.py` takes `factions[0]` — the first (possibly expired) membership. Naive parse yields 50 "Non-affiliated" / 25 Reform (wrong). Correct rule — the `FRAKTSIOON` entry whose `membership.endDate is null` — yields the plausible 101-seat split in finding 3.
6. **Service-worker path bug.** `service-worker.js` precaches `/riigikogu-dashboard/...` but the app is hosted at `/riigikogu-mobile/`. Offline mode cannot currently work. Consequence for testing: a PWA test **cannot** be green before this is fixed (Phase 6) — it is marked expected-fail until then.
7. **`CLAUDE.md` is drifted:** references `mp-data-scraped.json` and `data/change_report.json` (neither exists), instructs editing "hardcoded JS objects" in a minified file, and targets the nonexistent `main`.
8. **A redesign already failed once** (commit `4dae72b "Restore original app from before the redesign"`), because design, data, and logic are fused — the exact failure this plan prevents.
9. **Live API verified:** `GET https://api.riigikogu.ee/api/plenary-members?lang=EN` → HTTP 200, ~427 KB, 101 members, `access-control-allow-origin: *`.

### API field map

| App field    | API source                                                              |
|--------------|-------------------------------------------------------------------------|
| `name`       | `fullName`                                                              |
| `uuid`       | `uuid`                                                                  |
| `photoUrl`   | `photo._links.download.href`                                            |
| `profileUrl` | `WEB_BASE/{uuid}/{name-with-dashes}`                                    |
| `faction`    | `factions[]` entry with `type.code=="FRAKTSIOON"` and `membership.endDate==null` |
| `committees` | `committees[]` entries with `membership.endDate==null` (name + `membership.role.value`) |

---

## 2. Target architecture

```
DATA LAYER      data/*.json  ── single source of truth, fetched by the app at runtime,
   │                            maintained by the monthly API-check workflow via reviewed PRs
LOGIC LAYER     src/lib/*.js ── pure, framework-free, unit-tested (calculator, thresholds, faction map)
   │
VIEW LAYER      src/views/*.js + styles.css ── THE ONLY LAYER A REDESIGN EVER TOUCHES
   │
USABILITY       tests/ (Playwright + unit) ── locks every feature; CI blocks regressions
CONTRACT
```

**Two parity concepts — kept separate on purpose:**
- **Behavior parity** (required): same tabs, same clickable elements, same flows, same calculator rules. Locked by tests.
- **Data parity** (explicitly NOT required): the rebuild ships *current* API data, not the stale 2023 numbers. Composition changes are flagged in the PR for human review (party changes are politically significant).

**Stable-ID contract:** every interactive/meaningful element in the new app carries a `data-testid` (e.g. `tab-calculator`, `mp-row`, `party-chip-ref`, `calc-total`, `badge-majority`). These IDs are the permanent anchor points of the Usability Contract. **A future redesign may change any markup, style, or layout — but must keep the `data-testid`s.** That is the mechanism that makes redesigns safe forever.

---

## 3. Execution rules

- Phase 0 establishes a real `main` branch. **Every later phase = its own branch off `main` + its own PR into `main`.** Never commit directly to `main`.
- Each phase must leave the repo in a working, shippable state.
- Tests: Tier-1 must stay green from Phase 2 onward; Tier-2 activates in Phase 4. A red suite blocks merge — no exceptions.
- Every phase ends with: run full test suite, commit, push, open PR, report results with evidence (test output / screenshots).
- Claude drives verification itself with the pre-installed Chromium + Playwright — the human's job is reviewing PRs, not manual browser testing.

### Test strategy (resolves v1's circular dependencies)

- **Tier 1 — behavior core (runs on the OLD app now, and the new app forever):** text/role-based Playwright selectors only (tab names, MP names, visible totals) since the old DOM has no testids. Calculator tests are **self-consistency** checks — e.g. "tap party X → total increases by the seat count the app itself displays for X; majority badge activates iff total ≥ 51" — so they hold regardless of data vintage.
- **Tier 2 — data-driven extended (new app only, from Phase 4):** uses `data-testid` + cross-checks the DOM against `data/*.json` (party colors, 101 rows, profile links, seat sums).
- **Unit tests (from Phase 3):** pure calculator math — boundaries 50/51 and 67/68, party/MP add & remove.
- **PWA test:** written in Phase 2 but marked expected-fail (`test.fixme`) until Phase 6 fixes the service worker.
- Local serving for tests: any static server (e.g. `python3 -m http.server`) from repo root.

---

## Phase 0 — Baseline, snapshot & repo repair

**Goal:** rollback point, automated behavior record, and a sane default branch. No app changes.

1. Tag the current default-branch HEAD: `git tag v-stable-pre-rebuild` + push the tag.
2. **Automated characterization** (Claude, with local Playwright/Chromium against the current `index.html`):
   - Screenshot every tab and key interaction (MP popup, calculator with selections).
   - Extract: tab names, all party names + their **rendered hex colors** (computed styles), displayed seat totals, the full list of clickable elements per tab, and the calculator's behavior for 3 scenarios.
   - Write it all to `BEHAVIOR_SNAPSHOT.md` + `snapshot/` screenshots. Note explicitly which displayed numbers are stale (vs. live API).
3. **Repo repair:**
   - Create branch `main` from the current default branch HEAD (via API/MCP).
   - Ask the owner to flip the default branch to `main` in GitHub Settings → Branches (one click; cannot be done via available tooling), and to confirm **GitHub Pages source** (Settings → Pages) so we know what deploys the live site.
   - Retarget PR #18 to `main`.
4. Correct `CLAUDE.md` minimally: mark the old procedure deprecated, remove references to nonexistent files, note the artifact-only state and this plan.

**Acceptance:** tag pushed; `BEHAVIOR_SNAPSHOT.md` + screenshots committed; `main` exists and is default; Pages source confirmed; `CLAUDE.md` no longer lies.

---

## Phase 1 — Data layer (fresh, validated, canonical)

**Goal:** `data/*.json` becomes the single source of truth, populated from the live API with the corrected resolver.

1. Schema (documented in `data/README.md`):
   - `data/parties.json` — `{ id, nameEn, nameEt, short, color, bloc }` per party incl. a "Non-affiliated" group. `bloc ∈ {"coalition","opposition","none"}`. **Colors** come from Phase 0's extraction; **bloc assignments are editorial** — proposed by Claude from current government composition, confirmed by the owner in PR review. Includes the faction-name → partyId map for all current faction names.
   - `data/mps.json` — `{ name, uuid, photoUrl, profileUrl, partyId, faction, committees:[{name,role}], active }`.
   - `data/board.json` — president + vice-presidents `{ name, partyId, uuid }` (from the API usergroups / verified sources).
   - `data/meta.json` — `{ totalSeats:101, simpleMajority:51, constitutionalMajority:68, coalitionSeats, oppositionSeats, updatedAt }` (seat totals **computed**, never hand-typed).
2. Populate from the live API using the corrected faction resolver. Editorial extras baked in the old bundle (per-MP notes, flags) are carried into an optional curated `data/notes.json` only if the current UI displays them (per `BEHAVIOR_SNAPSHOT.md`).
3. `scripts/validate_data.py`: exactly 101 MPs; every `partyId` resolves; per-party seat sums match; `coalition+opposition+none == 101`; all photo/profile URLs well-formed. Wire it so later phases and the monthly workflow reuse it.

**Acceptance:** JSON files committed, validator passes, PR review confirms bloc assignments and flags the composition drift vs. the old app.

---

## Phase 2 — Usability Contract (tests before any rewrite)

**Goal:** executable safety net, green on the CURRENT app.

1. `USABILITY.md`: the feature list that must survive any change — tabs, MP directory + search/filter, party color coding, profile links, board view, calculator (add/remove party, add/remove MP, 51/68 badges), PWA install + offline (post-Phase-6).
2. Playwright **Tier-1** suite per the test strategy above; green against the current blob served locally. PWA spec written but `fixme`-marked (documented reason: pre-existing SW path bug).
3. **Tier-2** specs written but skipped until Phase 4 (they need testids + runtime JSON).
4. CI workflow `.github/workflows/usability-tests.yml`: runs the suite on every PR to `main`; red blocks merge.
5. `package.json`: `@playwright/test` devDependency + `npm test`. Use the pre-installed Chromium (`executablePath` respected via `PLAYWRIGHT_BROWSERS_PATH`) — no browser download in CI beyond the standard Playwright action.

**Acceptance:** Tier-1 green on the current app locally AND in CI; the suite demonstrably fails if a tab or the calculator is broken (prove with a deliberate temporary sabotage run, then revert).

---

## Phase 3 — Pure logic layer (before any UI work)

**Goal:** the math exists, tested, before views depend on it.

1. `src/lib/calculator.js` — pure functions, no DOM/globals: `seatsForSelection(selection, parties, mps)`, `hasSimpleMajority(n)`, `hasConstitutionalMajority(n)`, add/remove party/MP semantics (an individually-removed MP subtracts from their selected party; matching current app behavior per snapshot).
2. `src/lib/factions.js` — faction-name → partyId/color resolution (same mapping as `parties.json`).
3. Unit tests (Node's built-in `node:test` runner — zero new dependencies): majority boundaries 50/51 and 67/68, add/remove semantics, the 3 snapshot scenarios recomputed from `data/*.json`.

**Acceptance:** unit tests green in CI; no UI changed yet; module is import-ready for Phase 4.

---

## Phase 4 — Vanilla UI rebuild

**Goal:** replace the blob with owned source rendering the same UX from data + lib.

```
index.html            # small hand-written shell: <div id=app>, <script type="module" src="./src/app.js">
styles.css            # plain CSS; party colors as custom properties (--party-<id>) set from parties.json at load
src/
  app.js              # tab router + mount
  data.js             # fetch ./data/*.json, cache, typed accessors
  lib/                # from Phase 3 (untouched)
  views/
    parliament.js     # composition dashboard (coalition/opposition from meta.json)
    mps.js            # directory + search/filter + profile links + photos
    calculator.js     # calculator UI — imports ONLY src/lib/calculator.js
    board.js          # board of the Riigikogu
```

1. Build views matching `BEHAVIOR_SNAPSHOT.md` behavior 1:1 (flows, clickables, badges) — with **current** data. Every interactive element gets its `data-testid` (documented list in `USABILITY.md`).
2. Drop compiled Tailwind; recreate only used styles in `styles.css`.
3. Un-skip Tier-2 tests. **Done when Tier-1 + Tier-2 + unit tests are all green.**
4. Attach before/after screenshots (Phase 0 snapshots vs. new app) to the PR for human visual review; PR description flags every data difference (stale → current) explicitly.
5. Old blob remains recoverable via `v-stable-pre-rebuild`.

**Acceptance:** full suite green in CI; screenshot review approved by owner; rollback path documented in PR.

---

## Phase 5 — Monthly API check, repaired end-to-end

**Goal:** the monthly job updates the JSON the app actually reads, via a reviewed PR — and actually runs.

1. Fix `scripts/fetch_mp_data.py`: corrected faction resolver; parse current committees; output the **full Phase-1 schema** (`mps.json` + recomputed `meta.json` seat totals); abort (non-zero) on any validation failure — never emit bad data. Reuse `validate_data.py`.
2. Fix `scripts/compare_mp_data.py` for the new schema; classify changes: **party switches (flagged prominently — politically significant)**, joins, departures, photo/committee changes.
3. Fix `.github/workflows/monthly-mp-check.yml`:
   - Remove the gitignore conflict (fetched data goes to a non-ignored working path, or the ignore rule is dropped — the report/diff is what gets committed).
   - `--base main` (which now exists).
   - **Run `validate_data.py` + the unit tests inside the workflow before opening the PR** — required because PRs created with `GITHUB_TOKEN` do **not** trigger other workflows (GitHub Actions limitation), so the Phase-2 CI will not run on the bot's PR automatically. Validation must therefore happen in-job. (Alternative if desired later: a PAT/App token so CI triggers normally.)
   - PR title `MP Data Update - <Month YYYY>`, body from `generate_pr_body.py` with party switches called out.
4. Resolver regression test: asserts 101 MPs and a sane faction split from a fixture of the raw API payload (so the `factions[0]` class of bug can never return silently).
5. Optional (nice-to-have): the app shows "Data updated <date>" from `meta.updatedAt`.

**Acceptance:** local dry-run produces valid JSON and a correct change report; `workflow_dispatch` run opens a well-formed PR against `main`; merging it visibly updates the deployed app.

---

## Phase 6 — PWA repair

1. `service-worker.js`: paths `/riigikogu-dashboard/` → `/riigikogu-mobile/`; precache list = `index.html`, `styles.css`, `src/**/*.js`, `data/*.json`, `manifest.json`, icons, `offline.html`; bump cache version.
2. Verify `manifest.json` `start_url`/`scope` match `/riigikogu-mobile/`.
3. Un-`fixme` the PWA spec; it must now pass (install + offline serving cached app **and data**).

**Acceptance:** PWA spec green; manual check on the live site after merge: install prompt + airplane-mode reload works.

---

## Phase 7 — Docs & cutover

1. Rewrite `CLAUDE.md`: new architecture; monthly procedure = "review/merge the automated data PR (or edit `data/*.json` by hand); **never** touch `src/views` or `styles.css` for data changes; `npm test` must be green"; the redesign-safety rule (testids + green suite); rule: never commit to `main` directly.
2. Update `README.md` from current data (numbers driven by `data/*.json`, not prose).
3. Retire the drifted artifacts of this plan itself: mark `ARCHITECTURE_PLAN.md` executed, keep as historical record.
4. Full suite; final PR; verify the live GitHub Pages site against `USABILITY.md`.

**Acceptance:** docs match reality; live site verified; owner sign-off.

---

## Sequencing, risk & rollback

| Phase | Risk | Touches running app? | Depends on |
|-------|------|----------------------|------------|
| 0 | none | no | — |
| 1 | none | no | 0 (colors, snapshot) |
| 2 | none | no | 0, 1 |
| 3 | none | no | 1 |
| 4 | **medium** | **yes** | 2, 3 |
| 5 | low | no (automation) | 1 (+4 for user-visible effect) |
| 6 | low | offline/install | 4 |
| 7 | none | docs | all |

- Phases 0–3 are pure safety and can all merge without changing the deployed app. Phase 5 can proceed in parallel with 3–4.
- **Rollback at any point:** `git checkout v-stable-pre-rebuild -- index.html service-worker.js manifest.json` restores the known-good app.
- **Never merge a red suite.** That single rule is what structurally prevents a repeat of `4dae72b`.

## Definition of done

- App = plain HTML/CSS/ES modules, source committed, no build step.
- All data read at runtime from `data/*.json`; deployed composition matches the live Riigikogu API (currently: Reform 37, NA 18, E200 13, SDE 9, EKRE 9, Isamaa 8, Centre 7).
- Calculator = one pure, unit-tested module.
- Monthly workflow runs end-to-end: correct factions, validation in-job, reviewed PR against `main`, merge → live update.
- Usability Contract green in CI; `data-testid` contract documented.
- PWA installs and works offline on correct paths.
- A future redesign touches only `styles.css` + `src/views/*`, keeps the testids, and ships only with a green suite.
