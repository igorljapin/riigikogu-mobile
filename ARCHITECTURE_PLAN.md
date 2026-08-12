# Riigikogu Mobile — Architecture Rebuild & API-Check Plan (v3)

> # ✅ EXECUTED — historical record, not a to-do list
>
> **All seven phases have landed** (Phase 0 on 2026-08-11; Phases 1–7 on
> 2026-08-12). This document is kept because it records *why* the app is shaped
> the way it is, what was measured rather than assumed, and which of its
> predictions turned out wrong. **It is not a plan anyone should still be
> executing**, and several of its numbers were already stale when the phase that
> used them ran — each such case is flagged in the phase's outcome table below.
>
> | Phase | | Landed | Outcome |
> |---|---|---|---|
> | 0 | Baseline, snapshot & repo repair | 2026-08-11 | [table](#phase-0-outcome-2026-08-11) |
> | 1 | Data layer | 2026-08-12 | `data/*.json` is the single source of truth; see `data/README.md` |
> | 2 | Usability Contract | 2026-08-12 | `USABILITY.md` + `tests/`, CI on every PR |
> | 3 | Pure logic layer | 2026-08-12 | `src/lib/calculator.js`, `src/lib/factions.js` |
> | 4 | Vanilla UI rebuild | 2026-08-12 | The bundle is gone; source is what ships |
> | 5 | Monthly API check | 2026-08-12 | [table](#phase-5-outcome-2026-08-12) — one owner checkbox outstanding |
> | 6 | PWA repair | 2026-08-12 | [table](#phase-6-outcome-2026-08-12) |
> | 7 | Docs & cutover | 2026-08-12 | [table](#phase-7-outcome-2026-08-12) |
>
> **Two items remain, and neither can be done from inside the repository:**
> flipping the default branch to `main` (Settings → Branches) and allowing
> GitHub Actions to open pull requests (Settings → Actions → General → Workflow
> permissions). Both are owner actions.
>
> **For how to work on this repo now, read `CLAUDE.md`** — not this file.
>
> ---
>
> **Original status line:** Phase 0 executed 2026-08-11. Phases 1–7 outstanding. v3 supersedes v2 after analysing the official API repo (`riigikogu-kantselei/api`) and probing every relevant endpoint.
>
> ### ⚠️ Erratum (2026-08-11) — the "coalition stays 52" assumption is dead
>
> **Two defections after v3 was written have turned the government into a minority
> government. Any Phase-1 or Phase-4 gate that asserts coalition = 52 will now
> reject correct data.** Grigore-Kalev Stoicescu left Eesti 200 on 2026-08-09 and
> Meelis Kiili left Reform on 2026-08-10. Together with Varro Vooglaid
> (EKRE, 2026-05-14) the deployed app is **three** defections stale, not one.
>
> | | v3 assumed | Verified 2026-08-11 |
> |---|---|---|
> | Reform (voting bloc) | 39 | **38** |
> | Eesti 200 (voting bloc) | 13 | **12** |
> | EKRE (voting bloc) | 9 | 9 |
> | Party-less unaffiliated | 7 | **9** |
> | **Coalition** | **52** | **50 — no majority** |
>
> Consequences for the phases that follow:
> - **§2 "Data parity"** and **Phase 1 step 3** must be read as: the rebuild
>   reproduces SDE 14, Isamaa 11 and Center 8 exactly, and *legitimately* changes
>   Reform 39→38, Eesti 200 13→12, EKRE 10→9, Independent 6→9, coalition 52→50.
>   Only a deviation from *those* numbers is a bug.
> - **`alignment.json` needs a real third state.** The current app has two buckets
>   and files every independent under Opposition. With 9 party-less MPs who have
>   no whip, that silently hands the opposition 9 votes it does not have. The
>   `unaligned` list must be modelled and surfaced in the UI, not folded into a bloc.
> - **The API lags reality.** On 2026-08-11 it had recorded Kiili's departure but
>   not Stoicescu's. Phase 5's job must not assume the registry is instantaneous.
>
> Full evidence: `BEHAVIOR_SNAPSHOT.md` §8.
>
> ### ⚠️ Correction to v2 — read this first
>
> **v2 stated that the deployed app's baked data is "the 2023 composition, ~2 years stale." That was wrong, and the plan built on it was wrong in a way that would have broken the app.**
>
> The bundle's hardcoded values are `Reform 39 (coalition), Eesti 200 13 (coalition), SDE 14, EKRE 10, Isamaa 11, Center 8, Independent 6` — coalition 52 of 101. That is **not** the 2023 election result (which was Reform 37, EKRE 17, Centre 16, Eesti 200 14, SDE 9, Isamaa 8). It is a **voting-bloc** count that was accurate until **14 May 2026**, when Varro Vooglaid left the EKRE group (EKRE 10 → 9, unaffiliated 6 → 7). The deployed app is **one defection stale, not two years.**
>
> **Why this matters architecturally:** the API reports **registered faction membership**, which is a *different number* from the voting bloc the app displays and the calculator uses. Blindly replacing the app's numbers with API values — as v2's Phase 1 instructed — would show coalition 50 instead of 52 and SDE 9 instead of 14. v3 introduces the alignment overlay (§4) to model both counts correctly.
> **Stack decision (locked):** Plain HTML + CSS + native ES modules. **No bundler, no framework, no build step.** The source *is* what ships.
> **Audience:** A Claude Code session executing one phase at a time via `EXECUTION_GUIDE.md`.
> **Golden rule:** Usability is preserved at every step — parties, MP names, party colors, clickable buttons/menus/links, tabs, board, and the vote-calculator logic. The Usability Contract (Phase 2) enforces this; never merge a phase with a red suite.

---

## 1. Verified findings (evidence, not assumptions)

All of the following were verified against the actual repo and live API:

1. **`index.html` is a compiled, minified artifact with no source in the repo.** 253 KB; Tailwind-compiled CSS + a minified bundled app mounting into `<div id=root>`. Cannot be safely hand-edited.
2. **Zero runtime data loading.** The bundle contains no `fetch()`, no `.json` reference, no XHR. All MPs, factions, committees, board, colors, and calculator logic are baked in.
3. **The deployed data is voting-bloc data, one defection stale** (see the correction box above). Bundle: Reform 39, SDE 14, Eesti 200 13, Isamaa 11, EKRE 10, Center 8, Independent 6; coalition 52. Current truth: EKRE 9, unaffiliated 7 (Vooglaid, 14 May 2026). The API's *registered* counts are a different measure entirely: Reform 37, Non-affiliated 18, Eesti 200 13, SDE 9, EKRE 9, Isamaa 8, Centre 7.

   **Party colors are already extractable from the bundle** (use these in Phase 1, do not re-invent):
   `Reform #FFD700` (black text), `Eesti 200 #00AEEF`, `SDE #E4002B`, `EKRE #8B4513`, `Isamaa #0072BC`, `Center #007438`, `Independent #808080`.
4. **The monthly workflow is broken three times over:**
   - a) Its `git add data/mp_data_fetched.json` fails with exit 1 — that path is in `.gitignore` (verified by simulation).
   - b) Its `gh pr create --base main` fails — **the repo has no `main` branch** (default branch is `claude/setup-pwa-structure-R7z8d`).
   - c) Even if (a) and (b) worked, the app never reads the data it updates (finding 2).
5. **Faction-resolver bug.** `scripts/fetch_mp_data.py` takes `factions[0]` — the first (possibly expired) membership. Naive parse yields 50 "Non-affiliated" / 25 Reform (wrong). Correct rule — the `FRAKTSIOON` entry whose `membership.endDate is null` — yields the plausible 101-seat split in finding 3.
6. **Service-worker path bug.** `service-worker.js` precaches `/riigikogu-dashboard/...` but the app is hosted at `/riigikogu-mobile/`. Offline mode cannot currently work. Consequence for testing: a PWA test **cannot** be green before this is fixed (Phase 6) — it is marked expected-fail until then.
7. **`CLAUDE.md` is drifted:** references `mp-data-scraped.json` and `data/change_report.json` (neither exists), instructs editing "hardcoded JS objects" in a minified file, and targets the nonexistent `main`.
8. **A redesign already failed once** (commit `4dae72b "Restore original app from before the redesign"`), because design, data, and logic are fused — the exact failure this plan prevents.
9. **Live API verified:** `GET https://api.riigikogu.ee/api/plenary-members?lang=EN` → HTTP 200, ~427 KB, 101 members, `access-control-allow-origin: *`.

---

## 1b. Official API survey (`github.com/riigikogu-kantselei/api`)

The Chancellery's repo documents only `/api/votings` and `/api/votings/{uuid}`, licensed **CC BY-SA 3.0**, data reliable from 2012 onward, no file downloads. Everything else below was found by probing the live service; treat undocumented endpoints as **best-effort** and guard them accordingly.

| Endpoint | Status | Returns | Use for |
|---|---|---|---|
| `/api/plenary-members?lang=EN` | ✅ 200, 101 records | full MP objects | roster, photos, factions, committees, contacts, district |
| `/api/usergroups?lang=EN` | ✅ 200, 347 groups | all groups incl. historical | authoritative faction & committee lists |
| `/api/usergroups/{uuid}?lang=EN` | ✅ 200 | group + `members[]` with `membership.role`/`jobTitle` | **Board of the Riigikogu**, committee rosters |
| `/api/votings?startDate=&endDate=&lang=EN` | ✅ 200 | sittings + votes | future feature, out of scope for monthly |
| `/api/factions`, `/api/committees` | ❌ 404 | — | do **not** use; filter `/usergroups` by `type.code` instead |

Useful `usergroups` type codes: `FRAKTSIOON` (faction — 7 active), `ALALINE_KOMISJON` (standing committee — 11 active), plus select committees, committees of investigation, delegations, and `Board of the Riigikogu`.

`?includeInactive=true` on `plenary-members` changes nothing (still 101) — do not rely on it to detect departures; diff the roster instead.

### API field map

| App field    | API source                                                              |
|--------------|-------------------------------------------------------------------------|
| `name`       | `fullName`                                                              |
| `uuid`       | `uuid`                                                                  |
| `photoUrl`   | `photo._links.download.href`                                            |
| `profileUrl` | `WEB_BASE/{uuid}/{name-with-dashes}`                                    |
| `faction`    | `factions[]` entry with `type.code=="FRAKTSIOON"` and `membership.endDate==null` |
| `committees` | `committees[]` entries with `membership.endDate==null` (name + `membership.role.value`) |
| `boardRole`  | `plenaryMembership.jobTitle.value` — verified to yield exactly one President, one First and one Second Vice-President |
| `district`   | `electoralDistrictHistory[]` entry whose `membership` == current convocation (15) |
| `email`, `phone`, `gender`, `dateOfBirth`, `parliamentSeniority` | same-named fields — present for 101/101 |

---

## 1c. What can be updated automatically each month — and what cannot

This is the core question this plan answers. The split is driven by one fact: **the API knows registered faction membership, and nothing about a defector's new political home.**

### Tier A — fully automatic (API is authoritative, zero human judgement)

Verified present and complete for all 101 members:

1. **Roster** — arrivals, departures, and substitutions (diff by `uuid`).
2. **Names** (`fullName`).
3. **Photos** (`photo._links.download.href`) — the current bundle uses stale `wpcms` thumbnail URLs; the API download links are the durable form.
4. **Profile links** (derived from uuid + name slug).
5. **Registered faction** — the 7 active `FRAKTSIOON` groups + "Non-affiliated members".
6. **Committee memberships and roles** — 92 members, 11 Chairmen, 11 Deputy Chairmen across the 11 standing committees; select/investigation committees also available.
7. **Board of the Riigikogu** — currently Lauri Hussar (President), Toomas Kivimägi (First VP), **Arvo Aller (Second VP, since 2024-07-15)**. Note the API is *more current than most secondary sources here* — several references still list Seeder, who last held a Board office in 2023.
8. **Contact details** — email, phone.
9. **Electoral district**, **parliamentary seniority**, convocation membership number.
10. **The faction and committee catalogues themselves** (names, uuids) — so a renamed or newly formed committee is picked up without a code change.

### Tier B — detected automatically, decided by a human

11. **Voting-bloc alignment of the 18 non-affiliated MPs.** Under the Rules of Procedure §40–42, an MP who leaves a parliamentary group **may never join another** for the rest of the term — so a defector who joins a new party is registered as non-affiliated forever while voting with their new group. The API therefore reports 18 non-affiliated; the political reality is 11 of them vote with a party and 7 with no one.

    The job **can** detect, with no human input: *who* newly became non-affiliated, *when*, and *which faction they left* (verified — it correctly surfaces Vooglaid leaving EKRE on 2026-05-14, and all 17 earlier cases with dates). It **cannot** determine which party they joined. That single fact is what the human supplies.

12. **Coalition / opposition bloc per party** — political, changes when a government changes.
13. **Party colours** — a design decision; stable, and already captured (finding 3).

### Tier C — out of scope for the monthly job

14. **Voting records** (`/api/votings`) — a genuinely valuable future feature (per-MP roll-call), but a separate dataset and a separate UI. Deliberately not part of the monthly roster update.
15. **Party membership outside parliament** — not in this API at all.

**Net result:** roughly 95% of the app's data maintains itself. The recurring human task shrinks to *"a new MP became non-affiliated — which bloc do they vote with?"*, which arises only when someone actually defects (roughly a handful of times per term).

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

### The dual-count model (new in v3 — the key design decision)

Every party carries **two seat numbers**, and conflating them is the single biggest correctness risk in this app:

| Count | Source | Meaning | Used for |
|---|---|---|---|
| `registeredSeats` | 100% API, auto-updated | Formal parliamentary group size | Procedural facts: speaking time, committee entitlements, anything quoted as an official Riigikogu figure |
| `votingBlocSeats` | API + `alignment.json` overlay | Group size **plus** defectors who vote with it | **Majority arithmetic — the vote calculator, coalition/opposition totals, "will this pass"** |

Today: coalition = **52** voting-bloc (Reform 39 + Eesti 200 13) but **50** registered. The app has always displayed voting-bloc numbers, and must continue to — the calculator is meaningless otherwise.

`data/alignment.json` is the **only hand-maintained data file**, keyed by MP uuid:

```jsonc
{
  "blocs": { "reform": "coalition", "e200": "coalition", "sde": "opposition", "…": "…" },
  "defectors": {
    "<uuid>": { "votesWith": "sde", "since": "2024-01-05", "note": "left Centre Jan 2024" }
  },
  "unaligned": ["<uuid>", "…"]
}
```

Rules enforced by the validator: every non-affiliated MP appears in exactly one of `defectors` / `unaligned`; `registeredSeats` sums to 101; `votingBlocSeats` sums to 101. The UI labels which count it is showing wherever both could be meant.

**Two parity concepts — kept separate on purpose:**
- **Behavior parity** (required): same tabs, same clickable elements, same flows, same calculator rules. Locked by tests.
- **Data parity** (near-total, deliberately): because the deployed numbers are voting-bloc figures only one defection behind, the rebuild should reproduce them almost exactly. The **only** expected change is EKRE 10 → 9 and unaffiliated 6 → 7 (Vooglaid, 14 May 2026); coalition stays 52. **If Phase 4 produces any other change to a headline number, that is a bug, not fresh data** — most likely registered counts leaking into a voting-bloc display.

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

### Phase 0 outcome (2026-08-11)

| Step | Result |
|---|---|
| Rollback ref at `291ba1e` | ⚠️ Created as **branch** `v-stable-pre-rebuild`, not a tag. The session's GitHub credentials return 403 on `git-receive-pack` for `refs/tags/*`, and the proxy blocks `POST /git/refs`; no create-tag tool is available. Functionally equivalent for `git checkout v-stable-pre-rebuild -- index.html …`. Owner can promote it to a real tag locally. |
| `BEHAVIOR_SNAPSHOT.md` + `snapshot/` | ✅ 19 screenshots, all three tabs, MP popup, party sheet, calculator scenarios |
| `main` branch created from default HEAD | ✅ at `291ba1e` |
| Default branch flipped to `main` | ⛔ **owner action** — Settings → Branches. Now urgent: Pages already deploys from `main`, so anything merged to the old default branch never ships. |
| Pages source confirmed | ✅ **Deploy from a branch → `main` / `(root)`.** `main` is the production branch; every merge to it deploys. Verified live bytes == `index.html@291ba1e`. See `BEHAVIOR_SNAPSHOT.md` §0. |
| Retarget PR #18 | ➖ **not applicable.** PR #18 was merged 2026-07-22, before this phase ran; a merged PR cannot be retargeted. No open PRs existed at Phase 0 time. |
| `CLAUDE.md` corrected | ✅ dead file references removed; old procedure moved to `docs/DEPRECATED_MONTHLY_PROCEDURE.md` |

---

## Phase 1 — Data layer (fresh, validated, canonical)

**Goal:** `data/*.json` becomes the single source of truth, populated from the live API with the corrected resolver.

1. Schema (documented in `data/README.md`):
   - `data/parties.json` — `{ id, nameEn, nameEt, short, color, textColor, factionName }` per party plus the "Independent/Non-affiliated" group. **Colours are the hex values in finding 3** (they match the deployed app — do not invent new ones). `factionName` is the exact API faction string, used for matching.
   - `data/mps.json` — `{ name, uuid, photoUrl, profileUrl, faction, registeredPartyId, committees:[{name,role}], boardRole, district, active }` — **100% API-derived, regenerated wholesale each month.**
   - `data/alignment.json` — the **curated overlay** (§4): `blocs`, `defectors`, `unaligned`. `blocs` and `defectors` are hand-maintained and never overwritten by the job. The job may **append** a new uuid to `unaligned` (safe-default rule below) and flag stale entries, but never invents a `votesWith`.
   - `data/board.json` — derived from the API (`plenaryMembership.jobTitle`), so President/VPs auto-update.
   - `data/meta.json` — `{ totalSeats:101, simpleMajority:51, constitutionalMajority:68, registered:{...}, votingBloc:{...}, coalitionSeats, oppositionSeats, updatedAt }` — **all seat totals computed**, never hand-typed.
2. Populate from the live API using the corrected faction resolver. Seed `alignment.json` with the **11 current defectors and 9 unaligned MPs**; the resolver's "who is non-affiliated and which faction did they leave" output (verified working) gives the candidate list, and the owner confirms each mapping in PR review.
3. Sanity gate: the resulting **voting-bloc numbers must reproduce the deployed app's for the parties no defection has touched** — SDE 14, Isamaa 11, Center 8 — while showing the four verified deltas: Reform 39→**38**, Eesti 200 13→**12**, EKRE 10→**9**, Independent 6→**9**, coalition 52→**50**. Any *other* mismatch means the overlay is wrong — investigate before proceeding. (Supersedes the pre-erratum gate that expected coalition 52.)
4. `scripts/validate_data.py` (reused by every later phase and the monthly job): exactly 101 MPs; every faction maps to a known party; **`registeredSeats` sums to 101**; **`votingBlocSeats` sums to 101**; every non-affiliated MP is in exactly one of `defectors`/`unaligned`; coalition+opposition+unaligned == 101; photo/profile URLs well-formed.

### The safe-default rule (amended 2026-08-11)

**A newly non-affiliated MP is classified `unaligned` automatically. This is not a
placeholder awaiting a human ruling — it is the factually correct state.** An MP who
has left a parliamentary group has no group, no whip and no common position, and
under §40–42 cannot join another. `unaligned` describes that exactly.

The state machine, and who drives each transition:

| Event | Action | Human needed? |
|---|---|---|
| MP leaves a group | → `unaligned`; both seat counts recomputed; ships | **No** |
| MP later joins a party | stays `unaligned` until the owner says otherwise | Optional enrichment |
| uuid in `alignment.json` is no longer non-affiliated | flagged for removal | No |

Why this ordering matters: it makes the pipeline **safe by construction**. The only
possible error is *understating* a bloc by one seat; the job can never manufacture a
majority that does not exist. Given the coalition must now assemble majorities vote
by vote, that asymmetry is the whole point. The alternative — holding the data until
a human rules — is what left the deployed app three defections stale, because a
blocking decision that nobody makes blocks the 95% that needed no judgement too.

The owner's input becomes an **optional upgrade** (`unaligned` → `defector`), never a
gate. If it never happens, the published numbers stay conservative and defensible.

**Acceptance:** JSON committed, validator green, voting-bloc sanity gate passes, owner confirms the bloc and defector mappings in review.

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

1. Fix `scripts/fetch_mp_data.py`: corrected faction resolver; parse current committees **and roles**; derive `board.json` from `plenaryMembership.jobTitle`; refresh the faction/committee catalogues from `/usergroups`; output the **full Phase-1 schema** and recompute both seat counts in `meta.json`; abort non-zero on any validation failure — never emit bad data. **Writes only the `unaligned` list in `alignment.json`, append-only; never `blocs`, never `defectors`, never a `votesWith`.**
2. Fix `scripts/compare_mp_data.py` for the new schema. Classify changes into:
   - **🔵 NEW NON-AFFILIATED MP — handled automatically, no merge gate.** An MP left a faction. The job adds their uuid to `alignment.json` as `unaligned` (see the safe-default rule in Phase 1) and recomputes both seat counts. The PR names them, the faction and the date, states the resulting bloc arithmetic, and adds: *"Classified `unaligned` — correct as of today. If they join a party later, change this entry to `votesWith: <party>`; until then the voting-bloc totals deliberately exclude them from every bloc."* **The PR is mergeable as-is.** This is the one place the job writes to `alignment.json`, and it only ever writes the conservative value.
   - **🟠 Roster change** — MP joined or left parliament (substitutions when a member becomes a minister).
   - **🟡 Board change** — President/Vice-President changed.
   - **🟢 Routine** — committee moves, photo, contact, district changes.
   - **♻️ Stale alignment** — a uuid in `alignment.json` that is no longer non-affiliated (rejoined or left parliament) → prompt removal.
3. Fix `.github/workflows/monthly-mp-check.yml`:
   - Remove the gitignore conflict (fetched data goes to a non-ignored working path, or the ignore rule is dropped — the report/diff is what gets committed).
   - `--base main` (which now exists).
   - **Run `validate_data.py` + the unit tests inside the workflow before opening the PR** — required because PRs created with `GITHUB_TOKEN` do **not** trigger other workflows (GitHub Actions limitation), so the Phase-2 CI will not run on the bot's PR automatically. Validation must therefore happen in-job. (Alternative if desired later: a PAT/App token so CI triggers normally.)
   - PR title `MP Data Update - <Month YYYY>`, body from `generate_pr_body.py` with party switches called out.
4. Resolver regression tests against a committed fixture of the raw API payload: 101 MPs; registered split Reform 37 / Non-affiliated 18 / E200 13 / SDE 9 / EKRE 9 / Isamaa 8 / Centre 7; board = Hussar / Kivimägi / Aller; 11 committee Chairmen and 11 Deputy Chairmen. Locks out the `factions[0]` class of bug permanently.
5. **Resilience** (the API is a third party and only `/votings` is contractually documented): on non-200, malformed payload, or a member count outside 95–105, the job **fails loudly and changes nothing** — never publishes a partial roster. Retry with backoff before giving up.
6. The app shows "Data updated <date>" from `meta.updatedAt`, so staleness is visible to users.

**Acceptance:** local dry-run produces valid JSON and a correct, correctly-classified change report; `workflow_dispatch` opens a well-formed PR against `main`; merging it visibly updates the deployed app; a simulated defection is auto-classified `unaligned`, produces the 🔵 block, recomputes both seat counts, and leaves the PR mergeable without human input.

### Phase 5 outcome (2026-08-12)

| Step | Result |
|---|---|
| `fetch_mp_data.py` rewritten | ✅ imports `build_data.py`'s resolvers rather than re-implementing them; full schema, both counts, catalogues from `/usergroups`; stages → validates → publishes, so a failed run leaves `data/` untouched |
| `compare_mp_data.py` five categories | ✅ 🔴 action required / 🟠 roster / 🟡 board / 🟢 routine / ♻️ stale, written as a report the PR body renders |
| Resilience | ✅ non-200, malformed payload, count outside 95–105, unknown or **renamed** faction, unlisted committee, board ≠ 3 — all abort non-zero, publishing nothing. Retries with backoff |
| Workflow repaired | ✅ commits `data/*.json` (nothing gitignored — the report is an artifact), `--base main`, validation + unit + resolver suites run in-job before the PR |
| Resolver regression tests | ✅ 23 tests against a frozen 2026-08-12 capture in `tests/fixtures/` |
| `workflow_dispatch` end to end | ⚠️ run 31593950236: fetch, classify, validate, resolver + unit suites, commit and push all green; `gh pr create` refused — **"GitHub Actions is not permitted to create or approve pull requests"**. That is a repository setting (Settings → Actions → General → Workflow permissions), **owner action**, like the Phase 0 default-branch flip. The step now fails with that instruction and a compare link instead of a bare GraphQL error |
| Deployed-app effect of a merge | ➖ not verified here — no data changed on the day, so nothing user-visible to observe. The mechanism is the same one Phase 4 shipped: the app reads `data/*.json` at runtime |

**One deliberate deviation from §5.2.** The plan had the job classify a new
defection `unaligned` itself and merge unattended (🔵, no merge gate). The
executing instruction was the stricter one — *"It must NEVER write
`data/alignment.json`"* — so the job writes no overlay at all: the MP is counted
toward **no bloc** (identical arithmetic to the safe default) and surfaced as
🔴 **ACTION REQUIRED** in a **draft** PR naming them, the group they left and the
date. The conservative-by-construction property is preserved; what is lost is
the unattended merge, and what is gained is that the curated file has exactly one
author. `build_data.py`, hand-run, still applies the safe default.

**Two plan numbers were stale by the time this ran.** §5.4 specifies the fixture
assertions as "registered split Reform 37 / Non-affiliated 18 … 11 Chairmen and
11 Deputy Chairmen". The capture shows **Reform 36 / Non-affiliated 20 / E200 12**
(the erratum's three defections, plus Kiili and Stoicescu) and **10** standing-
committee Chairmen — the National Defence Committee chair fell vacant on
2026-08-10 when Stoicescu left it. The tests assert what the fixture contains.

---

## Phase 6 — PWA repair

1. `service-worker.js`: paths `/riigikogu-dashboard/` → `/riigikogu-mobile/`; precache list = `index.html`, `styles.css`, `src/**/*.js`, `data/*.json`, `manifest.json`, icons, `offline.html`; bump cache version.
2. Verify `manifest.json` `start_url`/`scope` match `/riigikogu-mobile/`.
3. Un-`fixme` the PWA spec; it must now pass (install + offline serving cached app **and data**).

**Acceptance:** PWA spec green; manual check on the live site after merge: install prompt + airplane-mode reload works.

### Phase 6 outcome (2026-08-12)

| Step | Result |
|---|---|
| Paths fixed | ✅ but **not** by swapping one absolute prefix for another. Every precache entry is now **relative**, resolving against the worker's own URL — correct at `/riigikogu-mobile/` in production *and* at `/` where the suite serves the repo root. An absolute list would have kept the specs unrunnable |
| Precache list | ✅ shell, `offline.html`, `manifest.json`, `styles.css`, all 9 ES modules, the 5 `data/*.json` files the app reads, 4 icons. `catalogues.json` excluded — the monthly job writes it, nothing reads it |
| Cache version | ✅ `riigikogu-dashboard-v2` → `riigikogu-mobile-v3`, so activate evicts the bundle-era entries |
| `manifest.json` | ✅ `start_url` `/riigikogu-dashboard/` → `/riigikogu-mobile/`, and `scope` **added** — it was absent entirely |
| PWA specs | ✅ all five `fixme` markers removed; **54 passed, 0 skipped** (was 49 + 5 skipped) |
| Teeth proven | ✅ reinstating the `/riigikogu-dashboard/` entries turns 4 of 5 red, including registration and both offline tests |
| Live-site check | ➖ **owner action** — install prompt and airplane-mode reload on a real phone, after merge |

Two fixes beyond the letter of the plan, both causes of the original bug rather
than the bug itself:

- **Install no longer swallows its own failure.** The old worker ended
  `cache.addAll()` with `.catch(console.error)`, so a precache that 404'd every
  entry still "installed". That is how a broken PWA survived unnoticed; a
  rejected install now fails registration, where the spec sees it.
- **The background revalidate is caught.** Cache-first with a stale-while-
  revalidate refresh means the network fetch rejects on every offline hit; that
  rejection is now handled instead of surfacing as an unhandled rejection.

**Known limitation:** MP photos are served by `api.riigikogu.ee`. The worker
ignores cross-origin requests, so offline the roster renders with placeholders.
Caching them would mean ~100 opaque responses of unknown size in the same cache
as the app — deliberately not done.

---

## Phase 7 — Docs & cutover

1. Rewrite `CLAUDE.md`: new architecture; monthly procedure = "review/merge the automated data PR (or edit `data/*.json` by hand); **never** touch `src/views` or `styles.css` for data changes; `npm test` must be green"; the redesign-safety rule (testids + green suite); rule: never commit to `main` directly.
2. Update `README.md` from current data (numbers driven by `data/*.json`, not prose).
3. Retire the drifted artifacts of this plan itself: mark `ARCHITECTURE_PLAN.md` executed, keep as historical record.
4. Full suite; final PR; verify the live GitHub Pages site against `USABILITY.md`.

**Acceptance:** docs match reality; live site verified; owner sign-off.

### Phase 7 outcome (2026-08-12)

| Step | Result |
|---|---|
| `CLAUDE.md` rewritten | ✅ Reorganised around the four layers rather than the rebuild's progress. Leads with the two rules that follow from the layering — a data change touches `data/*.json` only, a design change touches `styles.css` + `src/views/*` only and keeps every `data-testid` — then the six critical rules (never commit to `main`; never merge a red suite), the dual-count model, and both update paths: review/merge the automated PR, or `build_data.py` → `validate_data.py` → `npm test` → PR. The "mid-rebuild" framing is gone |
| `README.md` updated from current data | ✅ Every number now traces to `data/*.json`: the dual-count table (registered vs voting bloc, both summing to 101), coalition 50 · opposition 42 · unaligned 9, the Board, all four thresholds from `meta.json`, and the roster aggregates. Was showing coalition 52, "Second Vice-President: Jüri Ratas", "Constitutional Majority 61", and "Framework: React with Tailwind CSS · Build: Vite" — all four wrong |
| Plan marked executed | ✅ This box, this table, and the stale line in *Definition of done* corrected |
| Full suite | ✅ **64 unit + 23 resolver + 54 Playwright = 141, all green**, 0 skipped |
| Live-site verification | ➖ **owner action** — the PR carries the checklist. Pages serves `main`, and this branch is not merged yet, so the live site still predates the check |

**One thing this phase deliberately did not do.** §7.2 says the README's numbers
should be "driven by `data/*.json`, not prose", which could be read as generating
the file. It is not generated: a README that only a script may edit is a README
nobody edits. Instead every figure is transcribed from `data/*.json` with its
source and date stated inline, and the reader is pointed at the app — which
renders the live values and its own `updatedAt` — for anything current. The
failure mode §7.2 was aimed at is a README that contradicts the app; a dated
snapshot that names its source does not.

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
- All data read at runtime from `data/*.json`. Both counts modelled: registered (API) and voting bloc (API + `alignment.json`); the calculator uses voting bloc. ~~coalition reads 52~~ — **superseded by the erratum at the top of this file**: the coalition is 50 of 101 and has been a minority government since 2026-08-10. The app reads whatever `meta.json` says; no total is written into this repo by hand.
- Calculator = one pure, unit-tested module.
- Monthly workflow runs end-to-end: correct factions, committees, board, validation in-job, reviewed PR against `main`, merge → live update — with defections auto-classified `unaligned` — never silently mis-counted, never blocking the merge, and never added to a bloc without an explicit human upgrade.
- Tier A data (roster, names, photos, links, factions, committees + roles, board, contacts, district) maintains itself with no human input.
- Usability Contract green in CI; `data-testid` contract documented.
- PWA installs and works offline on correct paths.
- A future redesign touches only `styles.css` + `src/views/*`, keeps the testids, and ships only with a green suite.
