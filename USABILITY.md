# The Usability Contract

> **What this is.** The list of things this app must always do, and the
> executable suite that proves it still does them. Phase 2 of
> `ARCHITECTURE_PLAN.md`.
>
> **Why it exists.** A redesign of this app has already failed once — commit
> `4dae72b "Restore original app from before the redesign"` — because design,
> data and logic are fused into one minified bundle, and nothing could tell
> anyone what had broken until a human noticed. This document plus
> `tests/` is that missing signal. From here on, *green suite* is the
> definition of "the app still works."
>
> **The rule.** Never merge a red suite. Not "usually", not "unless it's
> unrelated". That single rule is what makes every later phase — including a
> full rewrite of the UI in Phase 4 — safe.

| | |
|---|---|
| Written against | `index.html` @ `006467d`, the shipped minified bundle |
| Reference behaviour | `BEHAVIOR_SNAPSHOT.md` (Phase 0, measured not assumed) |
| Runner | Playwright 1.62 + Chromium, viewport 390×844 |
| Run it | `npm test` |
| CI | `.github/workflows/usability-tests.yml`, on every PR to `main` |

---

## 1. The features that must survive any change

Each row is a promise to the user. The right-hand column is where that promise
is enforced; a feature with no test in this table is not protected, and adding
one is part of the work that introduces it.

### Shell and navigation

| # | Must always be true | Enforced by |
|---|---|---|
| 1.1 | The page is titled `XV Riigikogu Dashboard` and the header names the parliament and its 101 members | `tier1/shell.spec.js` |
| 1.2 | Three tabs exist and are reachable: **Parliament**, **Members**, **Calculator** | `tier1/shell.spec.js` |
| 1.3 | Each tab shows its own content and hides the others | `tier1/shell.spec.js` |
| 1.4 | Loading the app and visiting every tab raises no uncaught JavaScript error | `tier1/shell.spec.js` |

### Parliament tab

| # | Must always be true | Enforced by |
|---|---|---|
| 2.1 | A coalition section and an opposition section are both shown, with the majority threshold stated | `tier1/parliament.spec.js` |
| 2.2 | The bloc totals account for all 101 seats — no seat is invented or lost | `tier1/parliament.spec.js` |
| 2.3 | The party chips sum to the section headings that contain them, and to 101 overall | `tier1/parliament.spec.js` |
| 2.4 | Every party is shown as a labelled, clickable chip carrying its seat count | `tier1/parliament.spec.js` |
| 2.5 | Tapping a party opens a member sheet whose stated size equals the chip's number | `tier1/parliament.spec.js` |
| 2.6 | The Board of the Riigikogu shows three officers, each opening that MP's profile | `tier1/parliament.spec.js` |
| 2.7 | Party colours are the canonical ones in `data/parties.json` | `tier2/parliament-data.spec.js` *(Phase 4)* |
| 2.8 | Headline numbers are **voting-bloc** counts, never registered counts | `tier2/parliament-data.spec.js` *(Phase 4)* |
| 2.9 | Unaligned MPs are a visible third bucket, never folded into a bloc | `tier2/parliament-data.spec.js` *(Phase 4)* |

### Members tab

| # | Must always be true | Enforced by |
|---|---|---|
| 3.1 | All 101 MPs are listed, and the "All" filter chip agrees with the row count | `tier1/members.spec.js` |
| 3.2 | Every row carries a real, distinct MP name and a party label | `tier1/members.spec.js` |
| 3.3 | Search narrows the list to rows that genuinely match, and clearing it restores all 101 | `tier1/members.spec.js` |
| 3.4 | A search with no matches empties the list without breaking the app | `tier1/members.spec.js` |
| 3.5 | Every filter chip yields exactly the number of rows its own label promises | `tier1/members.spec.js` |
| 3.6 | Tapping an MP opens a popup containing an external `riigikogu.ee` profile link | `tier1/members.spec.js` |
| 3.7 | Profile URLs, photo URLs and committee lists match `data/mps.json` | `tier2/roster-data.spec.js` *(Phase 4)* |
| 3.8 | Defectors show the party they vote with plus their party history; unaligned MPs are labelled unaligned | `tier2/roster-data.spec.js` *(Phase 4)* |

### Calculator

This is the part of the app that answers a question people act on — *will this
pass?* — so it gets the most coverage.

| # | Must always be true | Enforced by |
|---|---|---|
| 4.1 | Empty state reads `0 / 101` with no majority | `tier1/calculator.spec.js` |
| 4.2 | The party rows account for all 101 seats | `tier1/calculator.spec.js` |
| 4.3 | Selecting a party adds **exactly** the seat count that party displays | `tier1/calculator.spec.js` |
| 4.4 | Deselecting removes exactly what it added; selecting everything gives 101 | `tier1/calculator.spec.js` |
| 4.5 | The Coalition and Opposition presets each total the sum of the rows they select | `tier1/calculator.spec.js` |
| 4.6 | Coalition + Opposition together cover every seat | `tier1/calculator.spec.js` |
| 4.7 | **The 51 badge is inactive at 50 and active at 51**, and the verdict flips with it | `tier1/calculator.spec.js` |
| 4.8 | **The 68 badge is inactive at 67 and active at 68** | `tier1/calculator.spec.js` |
| 4.9 | A threshold above the current selection stays inactive | `tier1/calculator.spec.js` |
| 4.10 | Adding one individual MP adds exactly one seat | `tier1/calculator.spec.js` |
| 4.11 | Excluding one individual MP removes exactly one seat, reflected in that party's row | `tier1/calculator.spec.js` |
| 4.12 | Reset clears the selection **and** the individual adjustments | `tier1/calculator.spec.js` |
| 4.13 | The calculator uses voting-bloc counts, and unaligned MPs belong to no preset | `tier2/roster-data.spec.js` *(Phase 4)* |

### PWA

| # | Must always be true | Enforced by |
|---|---|---|
| 5.1 | The service worker registers without error | `pwa/offline.spec.js` — **`fixme`, see §4** |
| 5.2 | The precache paths match the path the app is served from | `pwa/offline.spec.js` — **`fixme`** |
| 5.3 | `manifest.json` `start_url` and `scope` match the deployment path | `pwa/offline.spec.js` — **`fixme`** |
| 5.4 | The app renders after going offline, calculator included | `pwa/offline.spec.js` — **`fixme`** |

---

## 2. How the suite is built, and why it can outlive a rewrite

```
tests/
  helpers/app.js              shared text/role selectors and readouts
  tier1/  shell · parliament · members · calculator     ← green now, green forever
  tier2/  parliament-data · roster-data                 ← skipped until Phase 4
  pwa/    offline                                       ← fixme until Phase 6
```

### Tier 1 — behaviour core

Runs against the **current minified bundle** and must keep running against the
Phase-4 rebuild without modification. Two design rules make that possible:

**Text and role selectors only.** The shipped bundle has no `data-testid` and no
ARIA beyond the implicit roles, so Tier 1 addresses the app the way a user does:
by the label on the button. It also means a Phase-4 rewrite that keeps the
labels keeps the tests.

*(One documented exception: the bundle's modal overlays carry no role, label or
id, so `helpers/app.js` scopes to them with a single CSS selector. It is
isolated in one function, `modal()`, and Phase 4 replaces it with
`[data-testid="modal-*"]`. That is the only structural coupling in Tier 1.)*

**Self-consistency, not fixtures.** No Tier-1 test hardcodes today's roster.
They compare numbers the app renders against other numbers the app renders:

- "selecting Reform adds exactly the number written on the Reform row"
- "the party chips sum to the section heading above them"
- "the USA filter returns exactly the count printed on the USA chip"
- "the sheet for a party says it has as many members as the chip claimed"

The threshold tests go further: they *derive* a route to one seat below 51 (and
below 68) from whatever seat counts the app is currently displaying, via a
subset-sum over the party rows, then step over the line with a single individual
MP. So the boundary is tested exactly, on any data vintage — today's 50→51
happens to run through Reform + Isamaa, but nothing in the test knows that.

This matters because the data underneath is *expected* to change. The deployed
bundle shows coalition 52; `data/meta.json` already says 50, and it will move
again. A suite pinned to 52 would be a suite that has to be rewritten every time
the truth changes, which is a suite people learn to ignore.

### Tier 2 — data-driven

Cross-checks the DOM against `data/*.json` using `data-testid` selectors: party
colours, seat counts, the 101-row roster, profile and photo URLs, defector and
unaligned classification, and the calculator's use of voting-bloc counts.

**Currently skipped**, and it has to be: the shipped bundle has no testids and
performs no runtime data loading at all — it contains no `fetch` and no
reference to `data/` (`ARCHITECTURE_PLAN.md` findings 1 and 2). Comparing it
against `data/*.json` would be comparing the app against data it has never read.
Phase 4 supplies both halves and un-skips the files by changing
`test.describe.skip` back to `test.describe`.

Until then these specs are the **written-down acceptance criteria for Phase 4**,
not dead code.

### PWA — `fixme`

See §4.

---

## 3. The `data-testid` contract

**This is the mechanism that makes future redesigns safe.** A redesign may
change any markup, any class, any layout, any colour — but it must keep these
attributes and keep the suite green. Phase 4 introduces them; every later change
inherits them.

| Area | `data-testid` | Notes |
|---|---|---|
| Navigation | `tab-parliament`, `tab-members`, `tab-calculator` | |
| Shell | `data-updated` | rendered from `meta.updatedAt` — replaces the hand-typed "Jan 2026" |
| Parliament | `party-chip-<id>` | `<id>` from `parties.json`: `reform`, `e200`, `sde`, `ekre`, `isamaa`, `center`, `independent` |
| | `bloc-total-coalition`, `bloc-total-opposition`, `bloc-total-unaligned` | the third one is new in Phase 4 |
| | `board-president`, `board-vice-president-1`, `board-vice-president-2` | each also carries `data-party-id` |
| | `party-sheet`, `party-sheet-member`, `party-sheet-close` | |
| Members | `mp-search`, `filter-all`, `filter-usa`, `filter-chairs` | |
| | `mp-row` | one per MP, each carrying `data-mp-uuid` |
| | `mp-popup`, `mp-photo`, `mp-profile-link`, `mp-popup-close` | |
| | `mp-party` (with `data-party-id`), `mp-bloc`, `mp-committee`, `mp-party-history` | |
| Calculator | `calc-total`, `calc-verdict` | |
| | `badge-threshold-51`, `-61`, `-68`, `-81` | |
| | `calc-party-row-<id>` | carries `data-selected="true|false"` |
| | `preset-coalition`, `preset-opposition`, `preset-reset` | |
| | `calc-add-mps`, `calc-exclude-mps` | |
| | `modal-add-mps`, `modal-exclude-mps` | replaces Tier 1's one structural selector |

---

## 4. Known-failing on purpose: the PWA specs

`tests/pwa/offline.spec.js` is written in full and marked `test.fixme`, because
the feature is broken in the shipped app and cannot pass:

> `service-worker.js` precaches `/riigikogu-dashboard/…` while the site is
> served from `/riigikogu-mobile/`. Registration fails outright. The Phase-0
> capture recorded the console error:
> `SW failed: TypeError: Cannot read properties of undefined (reading 'scope')`,
> alongside a 404 for the service worker itself.
>
> — `BEHAVIOR_SNAPSHOT.md` §9 defect 1; `ARCHITECTURE_PLAN.md` finding 6

**Offline mode does not work for anyone today.** Marking the specs `fixme`
records that as a known defect with an owner (Phase 6) rather than pretending
the suite covers it. Phase 6 fixes the paths and deletes the markers; the specs
must then pass for real.

---

## 5. Running it

```bash
npm ci
npx playwright install chromium     # skip in this sandbox — Chromium 1194 is pre-installed
npm test                            # whole suite; starts its own static server
npm run test:tier1                  # behaviour core only
npm run test:report                 # open the HTML report after a run
```

The config starts `python3 -m http.server 8099` from the repo root itself and
waits for it — there is no build step and nothing to compile. Locally it points
Chromium at the sandbox's pre-installed `/opt/pw-browsers/chromium`; on CI it
uses the build `npx playwright install` fetches. Override with
`PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

---

## 6. Proof that the suite has teeth

A test suite that cannot fail is worse than no suite, because it manufactures
confidence. Phase 2's acceptance criterion is therefore a deliberate sabotage
run, not just a green one.

The sabotage: a one-character-class change to the minified bundle's calculator,
turning the selection size into an off-by-one —

```js
u=s.size,c=u>=51            →   u=Math.max(0,s.size-1),c=u>=51
```

Results, all three runs on the same commit:

| Run | Command | Exit | Result |
|---|---|---|---|
| 1 — baseline | `npm run test:tier1` | 0 | **30 passed** |
| 2 — sabotaged calculator | `npm run test:tier1` | **1** | **10 failed**, 20 passed |
| 3 — restored | `npm run test:tier1` | 0 | **30 passed** |

The ten failures were exactly the calculator's arithmetic promises — 4.3–4.8,
4.9, 4.11 and 4.12 — including both threshold-boundary tests:

```
✘ the 51 (simple majority) badge flips exactly at the threshold
      Expected: 51   Received: 50
✘ the 68 (constitutional majority) badge flips exactly at the threshold
      Expected: 68   Received: 67
✘ Coalition and Opposition presets together cover every seat
      Expected: 101  Received: 99
```

The shell, members and parliament specs stayed green throughout, so the red
pointed at what actually broke instead of turning the whole board red.

Two calculator tests survived the sabotage, and it is worth being precise about
why rather than claiming total coverage: 4.1 (empty state) passes because
`Math.max(0, -1)` is still `0`, and 4.10 (adding one MP adds one seat) passes
because a constant offset cancels out of a delta. Both are caught by the tests
above; neither is a gap that lets a broken calculator ship.

After run 3 the bundle hashes to `ba061d24…cd1c` — the value
`BEHAVIOR_SNAPSHOT.md` records for production — confirming the sabotage left
nothing behind. Full output is in the Phase 2 pull request.

---

## 7. What to do when this suite goes red

1. **Do not merge.** Nothing about the change matters more than this.
2. Read which promise broke — the table in §1 maps every test to the user-facing
   behaviour it protects.
3. Fix the app. Changing the test is the right move only when the *contract*
   changed, which is a decision the repo owner makes, and it comes with an edit
   to §1 in the same PR.
4. A newly-added feature adds a row to §1 and a test in the same commit.
