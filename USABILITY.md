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
| 2.5 | Tapping a party opens a member sheet whose stated size equals the chip's number | `tier1/parliament.spec.js` |
| 2.6 | The Board of the Riigikogu shows three officers, each opening that MP's profile | `tier1/parliament.spec.js` |
| 2.7 | Party colours are the canonical ones in `data/parties.json` | `tier2/parliament-data.spec.js` |
| 2.8 | Headline numbers are **voting-bloc** counts, never registered counts | `tier2/parliament-data.spec.js` |
| 2.9 | Unaligned MPs are a visible third bucket, never folded into a bloc | `tier2/parliament-data.spec.js` |
| 2.10 | The staleness label is rendered from `meta.updatedAt`, never hand-typed | `tier2/parliament-data.spec.js` |

### Members tab

| # | Must always be true | Enforced by |
|---|---|---|
| 3.1 | All 101 MPs are listed, and the "All" filter chip agrees with the row count | `tier1/members.spec.js` |
| 3.2 | Every row carries a real, distinct MP name and a party label | `tier1/members.spec.js` |
| 3.3 | Search narrows the list to rows that genuinely match, and clearing it restores all 101 | `tier1/members.spec.js` |
| 3.4 | A search with no matches empties the list without breaking the app | `tier1/members.spec.js` |
| 3.5 | Every filter chip yields exactly the number of rows its own label promises | `tier1/members.spec.js` |
| 3.6 | Tapping an MP opens a popup containing an external `riigikogu.ee` profile link | `tier1/members.spec.js` |
| 3.7 | Profile URLs, photo URLs and committee lists match `data/mps.json` | `tier2/roster-data.spec.js` |
| 3.8 | Defectors show the party they vote with plus their party history; unaligned MPs are labelled unaligned | `tier2/roster-data.spec.js` |

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
| | `party-sheet`, `party-sheet-member`, `party-sheet-close` | members carry `data-mp-uuid` |
| Members | `mp-search`, `filter-all`, `filter-usa`, `filter-chairs` | |
| | `mp-row` | one per MP, each carrying `data-mp-uuid` and `data-party-id` |
| | `mp-popup`, `mp-photo`, `mp-profile-link`, `mp-popup-close` | |
| | `mp-party` (with `data-party-id`), `mp-bloc`, `mp-committee`, `mp-party-history` | `mp-committee` is one pill per committee |
| Calculator | `calc-total`, `calc-verdict` | |
| | `badge-threshold-51`, `-61`, `-68`, `-81` | each carries `data-met="true\|false"` |
| | `calc-party-row-<id>` | carries `data-selected="true\|false"` |
| | `preset-coalition`, `preset-opposition`, `preset-reset` | |
| | `calc-add-mps`, `calc-exclude-mps` | |
| | `modal-add-mps`, `modal-exclude-mps` | replaces Tier 1's one structural selector |
| | `modal-add-mps-close`, `modal-exclude-mps-close`, `picker-back` | picker chrome |
| | `picker-party` (with `data-party-id`), `picker-mp` (with `data-mp-uuid`) | the two picker steps |
| | `adjust-chip-add`, `adjust-chip-exclude` | one per individual adjustment; click to undo |
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
