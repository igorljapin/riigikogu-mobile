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
| Now enforced against | the Phase-4 rebuild — plain HTML + CSS + ES modules |
| Reference behaviour | `BEHAVIOR_SNAPSHOT.md` (Phase 0, measured not assumed) |
| Runner | Playwright 1.62 + Chromium, viewport 390×844 |
| Run it | `npm test` |
| CI | `.github/workflows/usability-tests.yml`, on every PR to `main` |

> **Phase 4 (2026-08-12): Tier 2 is live.** The rebuild supplies both halves Tier
> 2 was waiting on — `data-testid` hooks and runtime loading of `data/*.json` —
> so `tests/tier2/` is no longer skipped. Two Tier-1 assertions changed with it,
> because the *contract* changed and not just the markup; both are called out
> inline below and in §8.

> **Redesign amendment (2026-08-17): the contract moved first, on purpose.**
> This document was amended **before** any redesign code was written, so the
> implementation has a fixed target instead of a moving one. The changes are
> owner-approved and listed in §9; the new and changed testids are in §3.
> Everything not listed in §9 is unchanged and must stay green **as it is** —
> in particular the redesign does not touch `data/`, `src/data.js` or
> `src/lib/`, and no seat count may be hardcoded anywhere.
>
> **Three things the redesign proposed and the owner declined or altered.**
> Recorded here because a future session reading the design bundle will
> otherwise "fix" the app back towards it:
>
> | Design proposed | Decision |
> |---|---|
> | Rename the Parliament tab to **Standing**, calculator tab id to `majority` | **Declined.** Tab names and ids stay `Parliament` / `Members` / `Calculator`. |
> | **Initials circles** in member rows; photos only on the profile | **Altered.** Rows show the MP photo, with the initials circle as the fallback when it is absent or fails to load (see 3.9). |
> | Header kicker reading `UPDATED 12 AUG 2026` | **Declined as written.** That date is a literal in the prototype. The label renders from `meta.updatedAt` — already required by 2.10. |

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
| 2.2 | The bloc totals account for all 101 seats — no seat is invented or lost — **however many blocs there are** | `tier1/parliament.spec.js` |
| 2.3 | The party chips sum to the section headings that contain them, and to 101 overall | `tier1/parliament.spec.js` |
| 2.4 | Every party is shown as a labelled, clickable chip carrying its seat count | `tier1/parliament.spec.js` |
| 2.5 | Tapping a party opens a member list whose stated size equals the chip's number — **as a full-screen overlay** (was a bottom sheet; §9) | `tier1/parliament.spec.js` |
| 2.6 | The Board of the Riigikogu shows three officers, each opening that MP's profile | `tier1/parliament.spec.js` |
| 2.7 | Party colours are the canonical ones in `data/parties.json` | `tier2/parliament-data.spec.js` |
| 2.8 | Headline numbers are **voting-bloc** counts, never registered counts | `tier2/parliament-data.spec.js` |
| 2.9 | Unaligned MPs are a visible third bucket, never folded into a bloc | `tier2/parliament-data.spec.js` |
| 2.10 | The staleness label is rendered from `meta.updatedAt`, never hand-typed | `tier2/parliament-data.spec.js` |
| 2.11 | **New.** The seat chart shows the three blocs in proportion, its segments sum to 101, and each segment's width matches its bloc's share | `tier2/parliament-data.spec.js` |
| 2.12 | **New.** The chart carries a majority marker positioned from `meta.simpleMajority`, not from a literal | `tier2/parliament-data.spec.js` |
| 2.13 | **New.** The chart legend states all three bloc totals, and they agree with the bloc headings (2.2) | `tier1/parliament.spec.js` |
| 2.14 | **New.** An MP opened from a party's member list can get back to that list — the profile carries a back control, and one opened from anywhere else does not | `tier1/parliament.spec.js` |

### Members tab

| # | Must always be true | Enforced by |
|---|---|---|
| 3.1 | All 101 MPs are listed, and the "All" filter chip agrees with the row count | `tier1/members.spec.js` |
| 3.2 | Every row carries a real, distinct MP name and a party label | `tier1/members.spec.js` |
| 3.3 | Search narrows the list to rows that genuinely match, and clearing it restores all 101 | `tier1/members.spec.js` |
| 3.4 | A search with no matches empties the list without breaking the app | `tier1/members.spec.js` |
| 3.5 | Every filter yields exactly the number of rows its own label promises — **now including the Coalition, Opposition and Unaligned segments** (§9) | `tier1/members.spec.js` |
| 3.6 | Tapping an MP opens a popup containing an external `riigikogu.ee` profile link | `tier1/members.spec.js` |
| 3.7 | Profile URLs, photo URLs and committee lists match `data/mps.json` | `tier2/roster-data.spec.js` |
| 3.8 | Defectors show the party they vote with plus their party history; unaligned MPs are labelled unaligned | `tier2/roster-data.spec.js` |
| 3.9 | **New.** Every row carries an avatar: the MP's photo where `photoUrl` resolves, and their initials on the party colour where it does not — so the list stays legible offline (§9) | `tier1/members.spec.js`, `tier2/roster-data.spec.js` |
| 3.10 | **New.** Filtering is single-select: choosing one filter clears the others, and there is always exactly one active | `tier1/members.spec.js` |

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
| 4.6 | Coalition + Opposition together cover every **aligned** seat, none twice | `tier1/calculator.spec.js` |
| 4.7 | **The 51 badge is inactive at 50 and active at 51**, and the verdict flips with it | `tier1/calculator.spec.js` |
| 4.8 | **The 68 badge is inactive at 67 and active at 68** | `tier1/calculator.spec.js` |
| 4.9 | A threshold above the current selection stays inactive | `tier1/calculator.spec.js` |
| 4.10 | Adding one individual MP adds exactly one seat | `tier1/calculator.spec.js` |
| 4.11 | Excluding one individual MP removes exactly one seat, reflected in that party's row | `tier1/calculator.spec.js` |
| 4.12 | Reset clears the selection **and** the individual adjustments | `tier1/calculator.spec.js` |
| 4.13 | The calculator uses voting-bloc counts, and unaligned MPs belong to no preset | `tier2/roster-data.spec.js` |
| 4.14 | The threshold badges read their values from `meta.json`, not from literals | `tier2/roster-data.spec.js` |
| 4.15 | **New.** Every individual add or exclude appears as a named adjustment row identifying the MP, and its **Undo** control reverses exactly that one adjustment | `tier1/calculator.spec.js` |
| 4.16 | **New.** The picker offers only eligible MPs — to add, those in unselected parties; to exclude, those in selected parties — and an MP leaves the pool once adjusted | `tier1/calculator.spec.js` |
| 4.17 | **New.** The seat total's progress fill is proportional to `total / meta.totalSeats`, and the verdict states the shortfall to `meta.simpleMajority` when it is not met | `tier2/roster-data.spec.js` |

### PWA

| # | Must always be true | Enforced by |
|---|---|---|
| 5.1 | The service worker registers without error | `pwa/offline.spec.js` |
| 5.2 | The precache entries resolve under the path the app is served from, and cover `data/*.json` | `pwa/offline.spec.js` |
| 5.3 | `manifest.json` `start_url` and `scope` match the deployment path | `pwa/offline.spec.js` |
| 5.4 | The app renders after going offline | `pwa/offline.spec.js` |
| 5.5 | The calculator works offline, from cached data | `pwa/offline.spec.js` |

---

## 2. How the suite is built, and why it can outlive a rewrite

```
tests/
  helpers/app.js              shared text/role selectors and readouts
  tier1/  shell · parliament · members · calculator     ← green now, green forever
  tier2/  parliament-data · roster-data                 ← live since Phase 4
  pwa/    offline                                       ← live since Phase 6
```

### Tier 1 — behaviour core

Runs against the **current minified bundle** and must keep running against the
Phase-4 rebuild without modification. Two design rules make that possible:

**Text and role selectors only.** The shipped bundle has no `data-testid` and no
ARIA beyond the implicit roles, so Tier 1 addresses the app the way a user does:
by the label on the button. It also means a Phase-4 rewrite that keeps the
labels keeps the tests.

*(One documented exception: an overlay has no user-visible handle of its own to
scope to. It is isolated in one function, `modal()`. Against the bundle that
meant a raw Tailwind class (`div.fixed.inset-0`); since Phase 4 it is
`[data-overlay]`, the marker every overlay carries alongside its own testid.
Still the only structural coupling in Tier 1 — but now part of the contract
below rather than a detail borrowed from a stylesheet.)*

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

**Live since Phase 4.** It could not run before: the shipped bundle had no
testids and performed no runtime data loading at all — no `fetch`, no reference
to `data/` (`ARCHITECTURE_PLAN.md` findings 1 and 2) — so comparing it against
`data/*.json` would have been comparing the app against data it never read. The
rebuild supplies both halves, and the specs were un-skipped in the same commit.

They had been written as the acceptance criteria for Phase 4, and they were used
that way: the rebuild is what had to change to make them pass, not the specs.
One exception, and it is mechanical rather than substantive — the committee
assertion moved from `toContainText` to the array form of `toHaveText`, because
`mp-committee` resolves to one pill per committee and Playwright's single-element
form throws strict-mode on that. The array form asserts strictly more: exactly
these committees, in `data/mps.json` order, and no extras.

### PWA

Live since Phase 6 — see §4. These are the only specs that allow service
workers; everything else blocks them, so a cached roster can never make a
data-driven assertion lie.

---

## 3. The `data-testid` contract

**This is the mechanism that makes future redesigns safe.** A redesign may
change any markup, any class, any layout, any colour — but it must keep these
attributes and keep the suite green. Phase 4 introduces them; every later change
inherits them.

Introduced in Phase 4 and shipping now. `<id>` is always a party id from
`parties.json`: `reform`, `e200`, `sde`, `ekre`, `isamaa`, `center`,
`independent`.

| Area | `data-testid` | Notes |
|---|---|---|
| Navigation | `tab-parliament`, `tab-members`, `tab-calculator` | |
| Shell | `data-updated` | rendered from `meta.updatedAt` — replaces the hand-typed "Jan 2026" |
| Parliament | `party-chip-<id>` | also carries `data-party-id` |
| | `bloc-total-coalition`, `bloc-total-opposition`, `bloc-total-unaligned` | the third one is new in Phase 4 |
| | `bloc-heading-coalition`, `-opposition`, `-unaligned` | the "Coalition (50 seats)" section headings |
| | `board-president`, `board-vice-president-1`, `board-vice-president-2` | each also carries `data-party-id` |
| | `party-sheet`, `party-sheet-member`, `party-sheet-close` | members carry `data-mp-uuid`. **Names kept deliberately** though the sheet is now a full-screen overlay — renaming them would churn every spec for a pure presentation change |
| | `seat-chart` **(new)** | carries `data-total` |
| | `seat-chart-segment-coalition`, `-opposition`, `-unaligned` **(new)** | each carries `data-seats` |
| | `seat-chart-marker` **(new)** | carries `data-threshold`, sourced from `meta.simpleMajority` |
| | `seat-chart-legend-coalition`, `-opposition`, `-unaligned` **(new)** | |
| Members | `mp-search`, `filter-all`, `filter-usa`, `filter-chairs` | |
| | `filter-coalition`, `filter-opposition`, `filter-unaligned` **(new)** | the bloc segmented control; all six filters carry `data-active="true\|false"` |
| | `mp-row` | one per MP, each carrying `data-mp-uuid` and `data-party-id` |
| | `mp-row-avatar` **(new)** | one per row; carries `data-avatar="photo\|initials"` so 3.9 is checkable either way |
| | `mp-count` **(new)** | the "101 members" line |
| | `mp-popup`, `mp-photo`, `mp-profile-link`, `mp-popup-close` | |
| | `mp-popup-back` **(new)** | present **only** when the profile was opened from the party sheet — it returns there (2.14). Icon-only, like `picker-back` |
| | `mp-party` (with `data-party-id`), `mp-bloc`, `mp-committee`, `mp-party-history` | `mp-committee` is one pill per committee |
| Calculator | `calc-total`, `calc-verdict` | |
| | `badge-threshold-51`, `-61`, `-68`, `-81` | each carries `data-met="true\|false"` |
| | `calc-party-row-<id>` | carries `data-selected="true\|false"` |
| | `preset-coalition`, `preset-opposition`, `preset-reset` | |
| | `calc-add-mps`, `calc-exclude-mps` | |
| | `modal-add-mps`, `modal-exclude-mps` | replaces Tier 1's one structural selector |
| | `modal-add-mps-close`, `modal-exclude-mps-close`, `picker-back` | picker chrome |
| | `picker-party` (with `data-party-id`), `picker-mp` (with `data-mp-uuid`) | the two picker steps |
| | `adjust-chip-add`, `adjust-chip-exclude` | one per individual adjustment, each carrying `data-mp-uuid`. **Behaviour change:** undo now lives on a dedicated child `adjust-undo` button rather than the whole chip being clickable (§9) |
| | `adjust-undo` **(new)** | one per adjustment row; carries `data-mp-uuid` |
| | `calc-fill` **(new)** | carries `data-seats` and `data-total` for 4.17 |
| Every overlay | `data-overlay` | in addition to its own testid — party sheet, MP popup, both pickers |

Two rules that go with the table, both load-bearing for the tests above:

- **An overlay is removed from the DOM when closed**, never merely hidden. That
  is what makes "the sheet closed" checkable, and it keeps exactly one `×`
  reachable at a time.
- **Icons are `aria-hidden`, and chrome buttons carry no text.** A decorative
  glyph that leaked into a button's accessible name would change what Tier 1's
  text selectors see; the picker's back arrow deliberately has an `aria-label`
  and no text content for the same reason.

---

## 4. The PWA specs: from `fixme` to enforced

Phase 2 wrote `tests/pwa/offline.spec.js` in full and marked every test
`test.fixme` — a bug report the runner would start enforcing the day the bug was
fixed, rather than a gap pretended away:

> `service-worker.js` precaches `/riigikogu-dashboard/…` while the site is
> served from `/riigikogu-mobile/`. Registration fails outright. The Phase-0
> capture recorded the console error:
> `SW failed: TypeError: Cannot read properties of undefined (reading 'scope')`,
> alongside a 404 for the service worker itself.
>
> — `BEHAVIOR_SNAPSHOT.md` §9 defect 1; `ARCHITECTURE_PLAN.md` finding 6

**Phase 6 fixed it and removed the markers. All five pass for real.** The worker
now precaches the Phase-4 layout — shell, every ES module, and the five
`data/*.json` files the app reads — with **relative** entries that resolve
against the worker's own URL, so one list is correct at `/riigikogu-mobile/` in
production and at `/` under the test server. Install is no longer allowed to
swallow a failed `addAll()`.

The specs were proven to have teeth the way Phase 2's were: reinstating the
`/riigikogu-dashboard/` paths turns 4 of the 5 red, including registration and
both offline tests.

MP photos are the one thing that does not work offline — they are served by
`api.riigikogu.ee`, and the worker leaves cross-origin requests alone. The
roster falls back to its placeholders.

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

### Re-proved against the Phase-4 rebuild

A suite that had teeth against the old bundle has to be shown to still have them
against its replacement — otherwise "green" after a full rewrite means only that
the tests found nothing to hold on to. Two sabotages, one per tier, each
targeting the failure mode that tier exists to catch.

**Sabotage A — the same off-by-one, now in `src/lib/calculator.js`:**

```js
return selectedMpUuids(selection, roster).length;
  →   return Math.max(0, selectedMpUuids(selection, roster).length - 1);
```

`npm run test:tier1` → **10 failed, 20 passed** — the identical ten tests the
bundle's sabotage broke, including both threshold boundaries. Restored: 30
passed.

**Sabotage B — registered counts leaking into a voting-bloc display**, the
specific error `ARCHITECTURE_PLAN.md` §2 names as the biggest correctness risk
in the app. One line in `src/data.js`:

```js
votingBlocPartyId: canonical.get(mp.uuid)?.votingBlocPartyId ?? …
  →   votingBlocPartyId: mp.registeredPartyId,
```

Tier 1 stays **green** — every number is still self-consistent, the app is just
answering the wrong question. Tier 2 goes **7 failed, 12 passed**:

```
✘ every party chip shows its voting-bloc seat count, not the registered one
✘ the registered counts are NOT what the headline chips display
✘ tapping a party chip lists exactly that party voting bloc
✘ defectors show the party they vote with, and their party history
✘ each party row offers exactly its voting-bloc seat count
✘ the Coalition preset selects exactly the coalition bloc from alignment.json
✘ unaligned MPs belong to no preset
```

That split is the point of having two tiers. Tier 1 cannot catch B — a
consistently wrong app is still consistent — and Tier 2 is what stands between
this dashboard and quietly publishing Reform 36 as though it were the number
that decides a vote.

---

## 7. What to do when this suite goes red

1. **Do not merge.** Nothing about the change matters more than this.
2. Read which promise broke — the table in §1 maps every test to the user-facing
   behaviour it protects.
3. Fix the app. Changing the test is the right move only when the *contract*
   changed, which is a decision the repo owner makes, and it comes with an edit
   to §1 in the same PR.
4. A newly-added feature adds a row to §1 and a test in the same commit.

---

## 8. Contract changes, and why

Changing a test is only legitimate when the *promise* changed, not when the app
stopped keeping it (§7.3). Phase 4 changed two, both for the same reason: **the
parliament now has three buckets, not two.**

| # | Was | Is | Why |
|---|---|---|---|
| 2.2 | coalition + opposition == 101 | *every* bloc section sums to 101 | The nine MPs who left a group and joined no party have their own section. The promise — no seat invented or lost — is unchanged; only the assumption that there are exactly two blocs is gone. |
| 4.6 | Coalition preset + Opposition preset == 101 | == 101 − unaligned | No preset may claim an MP who has no whip. The bundle's Opposition preset did, silently crediting the opposition with nine votes (`BEHAVIOR_SNAPSHOT.md` §8.4). |

Both tests still read their numbers off the app rather than hardcoding today's
roster, so neither needs revisiting when the next defection lands. Nothing else
in §1 changed: every other promise the bundle kept, the rebuild keeps.

---

## 9. The 2026-08 redesign amendment

Source: a high-fidelity, three-tab redesign handoff written against this
codebase, shipped in Aug 2026. It reused the data model unchanged, so **no
promise about data, arithmetic or blocs moves here.** What follows is the
complete set of changes; anything not on this list is unchanged and must stay
green as it is.

> **This section is the record.** The handoff bundle it came from was deleted
> once the redesign shipped — it lives in git history and nowhere else, which is
> the point: a prototype kept alongside the app is a second source of truth, and
> its `data/*.json` copies were a 12 Aug snapshot that could be mistaken for the
> live `data/`. Read §9 for what the redesign decided; read the app for what it
> does.

The rule from §8 still governs: a test may change only because the *promise*
changed. Each row below states which.

### 9.1 Changed promises

| # | Was | Is | Why it is legitimate |
|---|---|---|---|
| 2.5 | Party members open in a **bottom sheet** | …in a **full-screen overlay** | Presentation only. The promise — tapping a party reveals its members, and the count matches the chip — is untouched. The `party-sheet*` testids keep their names so the change costs no test churn. |
| 3.5 | Filters are All / USA friendship / Chairs | …plus **Coalition, Opposition, Unaligned** segments | The filter set grew. The promise — every filter yields exactly the count its label claims — is unchanged and now covers six filters instead of three. |
| `adjust-chip-*` | The whole chip is the undo target | Undo is a dedicated **`adjust-undo`** button inside the row | The design replaces compact chips with named rows carrying an explicit control. The promise — one adjustment, reversible in one tap — is unchanged; only what you tap moves. |

### 9.2 Added promises

New surface, so new coverage. None of these relaxes anything.

| # | Promise |
|---|---|
| 2.11 | The seat chart's segments are proportional and sum to 101 |
| 2.12 | Its majority marker is positioned from `meta.simpleMajority` |
| 2.13 | Its legend agrees with the bloc headings |
| 3.9 | Every member row has an avatar — photo, or initials when the photo is unavailable |
| 3.10 | Filtering is single-select, always exactly one active |
| 4.15 | Every individual adjustment is named and individually undoable |
| 4.16 | The picker offers only eligible MPs, and an adjusted MP leaves the pool |
| 4.17 | The calculator's fill is proportional and its verdict states the shortfall |

### 9.3 Explicitly declined

Recorded so a later session reading the design bundle does not "correct" the app
towards it:

| Design proposed | Decision | Consequence |
|---|---|---|
| Parliament tab renamed **Standing**; calculator tab id `majority` | **Declined** | 1.2 unchanged; `tab-parliament` / `tab-members` / `tab-calculator` keep their ids |
| **Initials only** in member rows, photos on the profile | **Altered** — photo first, initials as fallback | 3.9 as written; the fallback also covers the known offline gap (photos are cross-origin and uncached) |
| Header kicker `UPDATED 12 AUG 2026` | **Declined as a literal** | 2.10 already forbids it; the label renders from `meta.updatedAt` |
| The bundle's `data/*.json` copies (a 12 Aug snapshot) | **Not used** | The repo's live `data/` is authoritative; the monthly job has since moved it |

### 9.4 Out of scope for the redesign

Unchanged and not to be touched: `data/`, `src/data.js`, `src/lib/`, the seat
arithmetic, the three-bloc model, and every §1 promise not listed in 9.1–9.2.
No seat count, threshold or date may be hardcoded in a view — all of them come
from `data/*.json`, which is what 2.8, 2.10, 4.14 and 4.17 exist to enforce.

### 9.5 What shipped kept from the app, and what holds it there

Written when the redesign landed. 9.3 records what the *owner* declined; this
records where the **contract** declined, which is §7.3 working as intended: the
design bundle calls its copy final, and for each line below a promise in §1 was
older and won. Every one of them is load-bearing — change the copy and the named
test goes red, which is the signal, not the obstacle.

| Design bundle | Shipped | Held by |
|---|---|---|
| Placeholder `Search 101 members` | `Search MPs...` | 1.3, 3.3 |
| Preset `Clear` | `Reset` | 4.12 |
| Opener `Add individual MPs` | `Add Individual MPs` | 4.10, 4.16 |
| Hero shows the seat total alone | `0 / 101`, denominator set small | 4.1 |
| Verdict `Passes ordinary legislation` / `<n> short of 51` | `✓ Majority · passes ordinary legislation` / `✗ No majority · <n> short of 51` — one line carrying both | 4.1 states the verdict, 4.17 the shortfall |
| Calculator cards `0 of 38` | `0/38` | 4.3, 4.11 |
| One sorted party list on Standing | the same cards, under the three bloc headings | 2.1, 2.2, 2.3 |
| Section headings `Parties by voting bloc`, `Tap a party in or out` | `Parliament Floor`, `Select Parties` | 1.3, 2.1 |
| Member badge `Unaligned` for the non-affiliated | `Independent`, the `parties.json` short — the bloc chip beside it says Unaligned | 3.1–3.5 |
| Party card in `card` white, the figure in `text` | the seat count on a **party-colour** badge, first in reading order and last in the layout | 2.4, 2.7 |
| Overlay chrome: a chevron labelled `Back` | icon-only back arrow, and `×` to dismiss | §3 ("chrome buttons carry no text"), 2.5, 3.6 |
| `XV RIIGIKOGU · UPDATED 12 AUG 2026` inside the Standing view | the app header, styled as that kicker, rendering `meta.updatedAt` | 1.1, 2.10 — and `src/app.js` is not a file a design change may touch |
| New tab glyphs (hemicycle, two figures) | the existing glyphs at the design's size and stroke | the paths live in `src/dom.js`, outside the redesign layer |

Two additions the design does not draw, both there to keep a promise checkable:
the threshold marks carry a pill behind the label, because 4.7 and 4.8 compare a
met badge against an unmet one; and the seat chart states
`Majority threshold: 51 seats` below its legend, because 2.1 asks the screen to
say it in words.

---

## 10. The 2026 desktop surface

> **Contract first, same reason as §9.** A second view layer — a desktop
> surface reading the same `data/*.json` this contract already governs — has an
> approved Phase 1 design (Claude Design canvas, 1920×1080, light + dark) built
> on the mobile redesign's tokens. This section fixes its promises and
> `data-testid` table **before** Phase 3 writes a line of `src/views-desktop/`,
> exactly as PR #30 fixed the mobile redesign's contract before implementation.
>
> Handoff: `docs/desktop-2026/` — the six approved mockups, a clickable
> prototype (`prototype/riigikogu-desktop-standalone.html`, no server needed),
> `DESIGN_NOTES.md`, `INTERACTIONS.md`, the retiring `riigikogu-desktop` app's
> `BEHAVIOR_SNAPSHOT.md`, and `DESIGN_AND_MERGE_PLAN.md`, which governs all of
> it. That directory is deleted once the desktop surface ships — git history
> keeps it, same as the mobile handoff (§9's note).
>
> **Not yet implemented.** No `src/views-desktop/`, `desktop.css` or
> `desktop/index.html` exist yet. Every "Enforced by" cell below names the
> Phase-3 test file that will enforce it; until that file exists, the row is a
> promise, not a protection. Nothing in §1–§9 changes: the desktop surface is a
> new view over the unchanged DATA and LOGIC layers (10.5), and every existing
> mobile promise stays exactly as it is.

### 10.1 Global — left rail

| # | Must always be true | Enforced by |
|---|---|---|
| D1.1 | Three destinations exist and are reachable: Parliament, Directory, Calculator | `tier1/desktop/shell.spec.js` |
| D1.2 | The active destination is the only one shown; switching away closes any open seat popup | `tier1/desktop/shell.spec.js` |
| D1.3 | Loading the app and visiting every destination raises no uncaught JavaScript error | `tier1/desktop/shell.spec.js` |

| Area | `data-testid` | Notes |
|---|---|---|
| Rail | `nav-parliament`, `nav-directory`, `nav-calculator` | |

### 10.2 Parliament view

| # | Must always be true | Enforced by |
|---|---|---|
| D2.1 | The 101-seat floor renders `data/seating.json` joined to the roster; every occupied seat resolves to a real MP and no seat is invented or lost | `tier2/desktop/seating-data.spec.js` |
| D2.2 | A seat is filled with the party the member **votes with**, never the party they are registered under (10.5) | `tier2/desktop/seating-data.spec.js` |
| D2.3 | A member whose registration differs from their voting bloc carries a defector marker in their *registered* party's colour; members with no such difference carry none | `tier2/desktop/seating-data.spec.js` |
| D2.4 | Hovering a seat shows that seat's tooltip only, from one shared tooltip node | `tier1/desktop/parliament.spec.js` |
| D2.5 | Clicking a seat opens that member's profile popup; the popup's close control dismisses it and the overlay is removed from the DOM, not merely hidden (§3's overlay rule) | `tier1/desktop/parliament.spec.js` |
| D2.6 | "Open full profile" navigates to the Directory with that member selected, and clears any active search, filter or party highlight | `tier1/desktop/parliament.spec.js` |
| D2.7 | Toggling a party (row or legend chip) highlights that party's seats on the floor; toggling is additive across parties and the two controls share one highlight state | `tier1/desktop/parliament.spec.js` |
| D2.8 | Clear removes every highlight, always occupies its space, and never reflows the party list when it appears or disappears | `tier1/desktop/parliament.spec.js` |
| D2.9 | Highlight state and the calculator's selection state are independent — neither view's state carries into the other | `tier1/desktop/parliament.spec.js` |
| D2.10 | The Board of the Riigikogu shows three officers, each navigating to that member's Directory profile | `tier1/desktop/parliament.spec.js` |

| Area | `data-testid` | Notes |
|---|---|---|
| Parliament | `seat-<mpUuid>` | one per occupied cell |
| | `seat-tooltip` | one shared node for the whole grid |
| | `seat-popup-close`, `seat-popup-open-profile` | |
| | `party-row-<partyId>`, `party-chip-<partyId>` | both toggle the same highlight state |
| | `party-highlight-clear` | |
| | `board-row-<mpUuid>` | ×3 |

### 10.3 MP directory

| # | Must always be true | Enforced by |
|---|---|---|
| D3.1 | All 101 MPs are listed and the result count agrees with the row count | `tier1/desktop/directory.spec.js` |
| D3.2 | Search filters by name, case-insensitive, and composes with the active bloc filter | `tier1/desktop/directory.spec.js` |
| D3.3 | A search with no matches shows the empty state quoting the query, without breaking the app | `tier1/desktop/directory.spec.js` |
| D3.4 | The bloc segmented control (All / Coalition / Opposition / Unaligned) is mutually exclusive | `tier1/desktop/directory.spec.js` |
| D3.5 | Chairs & officers and the USA friendship group filters each **replace** the bloc filter rather than composing with it | `tier1/desktop/directory.spec.js` |
| D3.6 | Selecting a member fills the profile pane and marks the row selected | `tier1/desktop/directory.spec.js` |
| D3.7 | "Open riigikogu.ee profile" is an external link, opens a new tab, and carries `rel="noopener"` | `tier1/desktop/directory.spec.js` |
| D3.8 | A note card appears for defectors (from `alignment.json`'s note) and for unaligned members who left a faction (from `leftFaction` / `leftFactionDate`), and is absent otherwise | `tier2/desktop/roster-data.spec.js` |
| D3.9 | An unaligned member's party chip reads **Non-affiliated**, never their former party; the bloc chip is coloured by bloc | `tier2/desktop/roster-data.spec.js` |
| D3.10 | The seat locator marks the selected member's own cell on a mini floor grid | `tier1/desktop/directory.spec.js` |

| Area | `data-testid` | Notes |
|---|---|---|
| Directory | `mp-search` | |
| | `filter-bloc-all`, `-coalition`, `-opposition`, `-unaligned` | |
| | `filter-chairs`, `filter-usa` | replace, not compose, with the bloc filter |
| | `mp-result-count` | |
| | `mp-row-<mpUuid>` | |
| | `mp-empty` | |
| | `mp-external-profile` | |
| | `mp-note` | present only per D3.8 |
| | `mp-seat-locator` | |

### 10.4 Coalition calculator

| # | Must always be true | Enforced by |
|---|---|---|
| D4.1 | Empty state totals 0 of 101 with no threshold met | `tier1/desktop/calculator.spec.js` |
| D4.2 | Selecting a party card adds exactly that party's member count as the base; deselecting removes exactly what it added | `tier1/desktop/calculator.spec.js` |
| D4.3 | Clicking a seat adds it to the count, or holds it out if its party is already selected | `tier1/desktop/calculator.spec.js` |
| D4.4 | The selection model is parties plus named adjustments, not 101 independent booleans — deselecting a party clears **only its own** adjustments | `tier1/desktop/calculator.spec.js` |
| D4.5 | The Coalition and Opposition presets each select every party in that bloc and reset all adjustments | `tier1/desktop/calculator.spec.js` |
| D4.6 | Clear empties the selection and every adjustment | `tier1/desktop/calculator.spec.js` |
| D4.7 | Each of the four threshold chips (51, 61, 68, 81) is inactive below its number and active at or above it | `tier1/desktop/calculator.spec.js` |
| D4.8 | The verdict line and the hint line track the current total: which threshold is next unmet, and the gap to it | `tier1/desktop/calculator.spec.js` |
| D4.9 | Every individual add or hold-out appears as a named adjustment row with a ±1 badge, and its Undo control reverses exactly that one adjustment | `tier1/desktop/calculator.spec.js` |
| D4.10 | The calculator uses voting-bloc counts; no unaligned MP belongs to either preset (10.5) | `tier2/desktop/roster-data.spec.js` |
| D4.11 | The four threshold values are read from `meta.json`, never hardcoded | `tier2/desktop/roster-data.spec.js` |

| Area | `data-testid` | Notes |
|---|---|---|
| Calculator | `calc-seat-<mpUuid>` | |
| | `calc-party-<partyId>` | |
| | `calc-preset-coalition`, `calc-preset-opposition`, `calc-clear` | |
| | `calc-total`, `calc-verdict`, `calc-hint` | |
| | `calc-threshold-51`, `-61`, `-68`, `-81` | each carries `data-met="true\|false"` |
| | `calc-adjustment-<mpUuid>`, `calc-adjustment-undo-<mpUuid>` | |
| | `calc-adjustments-empty` | |

### 10.5 Shared with the mobile contract, restated for clarity, not changed

The desktop surface reads the same `data/*.json` and reuses `src/lib/calculator.js`
and `src/lib/factions.js` untouched (Phase 3 scope, `DESIGN_AND_MERGE_PLAN.md`).
No promise about seat arithmetic is introduced here; these already govern both
surfaces and continue to:

- Headline and calculator numbers are **voting-bloc** counts, never registered
  counts (2.8, 4.13).
- Unaligned MPs are a visible third bucket, never folded into a bloc (2.9, D4.10).
- Party colours are the canonical ones in `data/parties.json`, and each party's
  `textColor` is content, identical in both themes — never a theme token (2.7).
- No seat count, threshold or date is hardcoded in a view; all of it comes from
  `data/*.json` (2.10, 4.14, D4.11).

### 10.6 New in the data layer

`data/seating.json`, keyed by MP uuid, is the one dataset the desktop surface
needs that mobile's `data/` does not already have — the 10×12 grid position of
each of the 101 seats, harvested from the retiring `riigikogu-desktop` app
(`BEHAVIOR_SNAPSHOT.md` §"Desktop-only features"). Phase 3 PR A adds it to
`data/` with a validation rule in `scripts/validate_data.py` and a "who writes
what" entry in `data/README.md`; it does not exist there yet — the copy in
`docs/desktop-2026/data/` and `docs/desktop-2026/seating.json` is the Phase 0/1
draft, not the live file.

### 10.7 Explicitly declined or altered from the retiring desktop app

Recorded so a later session reading `riigikogu-desktop`'s `BEHAVIOR_SNAPSHOT.md`
does not "restore" behaviour the redesign deliberately dropped:

| Retiring app had | Desktop surface | Why |
|---|---|---|
| Party filter dims non-matching seats and shows one active filter at a time | Multi-select, additive party highlight (D2.7) | The redesign's highlight model replaces the single-party filter; matches the calculator's own selection treatment |
| No dark mode | Light and dark, sharing mobile's tokens | The desktop surface adopts the mobile redesign's theming (Phase 1 goal 1) |
| Seating grid party colours from a stale, pre-2026-08-09 bundle constant | Seat fill from the live `data/parties.json`, joined by uuid | The stale bundle is the reason this merge exists (`DESIGN_AND_MERGE_PLAN.md`, "Why merge at all") |
| Escape does not close the MP popup | Not specified by the mockups; Phase 3 should follow the mobile app's overlay convention unless a reviewer says otherwise | Raised here rather than invented, per the Phase 3 kickoff rule |

### 10.8 Out of scope for Phase 2

Unaffected by this amendment: `data/` (until Phase 3 PR A adds `seating.json`),
`src/`, `styles.css`, `service-worker.js`, and every §1–§9 promise. This section
records a design and a contract; it ships no code.
