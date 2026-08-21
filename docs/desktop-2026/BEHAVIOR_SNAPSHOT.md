# Behavior Snapshot — riigikogu-desktop

Captured 2026-08-19, Phase 0 of `DESIGN_AND_MERGE_PLAN.md`. This is a record
of what the deployed app (https://igorljapin.github.io/riigikogu-desktop/)
does today, before any redesign or merge work begins. It is the parity
checklist for Phase 3 (desktop view layer implementation in
`riigikogu-mobile`). No app files were changed to produce this document.

Screenshots referenced below live in `snapshot/`, captured with Playwright/
Chromium at a 1920×1080 viewport against the live GitHub Pages deployment.

## Page structure (top to bottom)

1. **Header** — building icon + "XV Riigikogu" title; subtitle "Estonian
   Parliament • 101 Members • Term 2023–2027"; a data-freshness line
   ("Data current as of \<Month Year\>") that is patched at runtime (see
   "Data freshness label" below).
2. **Session Hall Seating Plan** (left, main column) — the 101-seat grid,
   the "BOARD OF THE RIIGIKOGU" toggle, and below the grid a horizontal
   party-color legend bar plus "Coalition: N seats" / "Opposition: N seats"
   totals.
3. **Coalition vs Opposition** panel (right sidebar) — clickable
   "Coalition: N" / "Opposition: N" pills that filter the seating grid, a
   majority-threshold slider (marked at 51/101), and two seat-count cards
   breaking each side down by party with a "✓ Has majority" / equivalent
   indicator.
4. **Tab strip**: "Party Breakdown" (default) / "All Members".
5. **Party Breakdown tab** — a card grid of all 7 parties, each showing
   seat count, full party name, and a colored accent bar; clicking a card
   filters the seating grid to that party.
6. **All Members tab** — full alphabetical roster (101 MPs) with a search
   box ("Search MPs by name or party..."), two additional filter toggles
   ("🇺🇸 Estonia-USA Friendship Group", "Faction Chairmen"), and per-row
   party color dot, name, party, and Coalition/Opposition tag.
7. **Footer** — "XV Riigikogu Interactive Dashboard • Data: \<Month Year\>"
   and "Coalition since March 2025: Estonian Reform Party + Estonia 200".

## Interactive features inventoried

| Feature | Screenshot | Notes |
|---|---|---|
| Parliament view, initial load | `01-parliament-view-fold.png`, `02-parliament-view-fullpage.png` | Default state |
| All Members tab | `03-all-members-tab.png` | Full 101-row alphabetical list |
| Party filter (click a party card) | `04-party-filter-reform.png` | Dims non-matching seats, shows "Showing: \<Party\> ✕" chip |
| Board of the Riigikogu (expand) | `05-board-of-riigikogu.png` | Shows President + First/Second Vice-President as 3 cards above the grid |
| Coalition filter | `06-coalition-filter.png` | Dims opposition seats |
| Opposition filter | `07-opposition-filter.png` | Dims coalition seats |
| MP popup (click a seat) | `08-mp-popup.png` | Bottom-right card: photo, name, party, Coalition/Opposition tag, committees, party full name |
| Vote Calculator, active selection | `09-vote-calculator-selection.png` | Opened via "Vote Calculator" button; "Current Coalition (52)" quick-select shown; live threshold badges (1/2+1, 3/5, 2/3, 4/5) and a majority bar |
| Seat hover state | `10-seat-hover-state.png` | Hover shows a small dark tooltip (name, party, role/faction role) *and* scale/shadow on the seat tile |
| Estonia-USA Friendship Group filter | `11-usa-friendship-toggle.png` | All Members tab toggle; filters roster + seating grid to the 33 group members (flag icon) |
| Faction Chairmen filter | `12-faction-chairmen-toggle.png` | All Members tab toggle; filters to the 6 faction chairmen |
| MP search | `13-mp-search-results.png` | Live-filters the All Members list as you type |

## Desktop-only features (no mobile equivalent found in this repo's scope)

- **Session Hall Seating Plan** — a 12×10 visual seating grid grouped by
  party block (not the real semicircular chamber layout — see Assumptions).
  This is the one dataset this repo has that mobile does not; harvested
  into `data/seating.json`.
- **Board of the Riigikogu** toggle — surfaces President + two
  Vice-Presidents as dedicated cards.
- **Estonia-USA Friendship Group** filter/badge.
- **Faction Chairmen** filter/badge (distinct from party chairmen — see
  Assumptions).
- **Vote Calculator** — interactive coalition builder with four
  constitutional-threshold quick buttons (simple majority 1/2+1,
  3/5, 2/3, 4/5) and an "Add/Remove Individual MPs" affordance (not
  screenshotted individually — opens a sub-picker from the calculator
  panel).
- Per-MP **committee membership** list, shown only in the click popup.

## Data freshness label (behavioral quirk worth flagging)

The header/footer "Data current as of / Data: \<Month Year\>" text is not
static. An inline script at the bottom of `index.html` fetches
`data/mp_data_current.json` at runtime, computes the max `fetched_at`
timestamp across all 101 records, and live-patches any text node matching
`/Data current as of \w+ \d{4}/` or `/• Data: \w+ \d{4}/`. On this
snapshot date, `data/mp_data_current.json`'s freshest `fetched_at` is
2026-03-28, so the page renders "March 2026" even though the string
literally baked into the minified bundle (visible in view-source before
the patch runs) is "January 2026". **The seating grid, party colors, and
coalition math are NOT affected by this script** — they come entirely from
the `eV`/party-metadata constants baked into the JS bundle at build time,
which is a separate, stale snapshot (see Assumptions).

## Other observed behavior

- Closing the MP popup: only the explicit "✕" button closes it — pressing
  `Escape` does **not** close it (confirmed: the popup remained open
  through several subsequent screenshots after an `Escape` keypress).
- No dark mode / theme toggle exists anywhere in the bundle.
- No console errors or failed requests were observed across any of the
  captured interactions.
- PWA: `service-worker.js` uses a network-first strategy
  (`CACHE_NAME = 'riigikogu-desktop-v1'`), pre-caching only `./index.html`
  and `./manifest.json`.

## Assumptions

Recorded per the task's instruction to flag every assumption made about
ambiguous seat data.

1. **Seating grid is a visual party-block grid, not the real chamber
   diagram.** The live grid is **10 rows × 12 columns** (confirmed via the
   rendered DOM's `grid-template-columns`, which lists 12 tracks, and its
   flat 120-child order) — 120 slots, 101 filled, 19 `null` gaps — where
   each *column pair* is visually grouped by party (columns 0–1 EKRE, 2–3
   Isamaa, 4–7 Reform, 6–7 overlap into Eesti 200 lower in the grid, 8–9
   Center/Reform mix, 10–11 SDE/Independent mix; see the horizontal party
   legend bar rendered directly under the grid for the authoritative
   left-to-right order: EKRE, Isamaa, Reform, Eesti 200, Center, SDE).
   The source bundle's `eV` JS constant is a **column-major** array —
   `eV[col][row]`, 12 outer arrays of 10 — the opposite of what its
   nesting suggests at a glance; this was verified by diffing a naive
   row-major flatten against the live DOM's child order, which only
   matched once column-major indexing was used. The `null` gaps do not
   correspond to real empty chamber seats — they read as layout padding
   so each party's block renders as a rectangle. `data/seating.json`
   therefore records **grid position** (`row` 0–9, `col` 0–11) as authored
   in the bundle, not a physical semicircle coordinate. Phase 1/3 should
   treat this as "the current app's grid layout," not as ground truth for
   a real chamber floor plan.
2. **Party/faction fields were deliberately NOT carried into
   `seating.json`.** Per the task's constraint, the `party` field on each
   MP object in the bundle is treated as stale (the bundle's coalition
   math still shows Reform+Eesti 200 = 52 with "✓ Has majority," which
   predates the 2026-08-09 Stoicescu and 2026-08-10 Kiili defections
   referenced in `DESIGN_AND_MERGE_PLAN.md`). Only `row`/`seat`/`name` were
   extracted. `name` is included solely as a human-readable cross-check
   for the join, not as an authoritative data field — mobile's own
   `data/*.json` roster should remain the source of truth for names too
   once merged.
3. **uuid join is unambiguous.** All 101 MP `profileUrl` values in the
   bundle contain a `/saadik/<uuid>/` segment. Every uuid is unique (no
   collisions), and cross-checking against `mp-data-scraped.json` and
   `data/mp_data_current.json` (both committed in this repo) produced
   **zero mismatches and zero missing entries** across all three sources.
   Confidence in the join is high.
4. **"Board of the Riigikogu" (3 people) vs. "Faction Chairmen" (6
   people) are two distinct, non-overlapping concepts** in this codebase,
   both worth carrying into any amended contract:
   - Board = `role` field values `"President of the Riigikogu"`,
     `"First Vice-President"`, `"Second Vice-President"` on individual MP
     objects (Lauri Hussar/Eesti 200, Toomas Kivimägi/Reform, Arvo
     Aller/EKRE at capture time).
   - Faction Chairmen = a separate hardcoded name list (one per
     represented party: Toomas Uibo, Lauri Laats, Martin Helme, Lauri
     Läänemets, Õnne Pillak, Helir-Valdor Seeder at capture time),
     matched by name rather than uuid in the bundle's own logic. This
     repo's data does not need to be corrected for this — it's flagged
     for whoever writes the mobile `USABILITY.md` desktop section in
     Phase 2, since a name-based join is fragile if a chairman changes.
   - Neither of these were carried into `data/seating.json`, which is
     scoped to seat position only per the task instructions.
5. **`data/seating.json` is explicitly a draft.** It captures the grid
   position as currently authored in the live bundle on 2026-08-19. If
   Phase 1/3 decide to move to a physically accurate chamber layout
   instead of reusing this grid, this file's `row`/`seat` values should be
   treated as a starting point, not a spec.

## Extraction method (for reproducibility)

`data/seating.json` was produced by locating the `eV` array literal inside
`index.html` (a minified React/Parcel bundle with no separate source
files), converting its JS-object-literal syntax to strict JSON (quoting
bare keys, expanding minifier shorthand `!0`/`!1` to `true`/`false`), and
walking the resulting 12×10 nested array **as `eV[col][row]`** (column-major
— see Assumption 1). For each non-null cell, the `/saadik/<uuid>/` segment
was extracted from `profileUrl` via regex and used as the top-level key.
No party, committee, or role fields were copied over, per the task's scope
constraint. The column-major orientation was confirmed by extracting the
live page's `.grid.gap-[3px]` container (`grid-template-columns`: 12
tracks; 120 flat children in DOM order) via Playwright and diffing its
first 24 child names against both a row-major and a column-major flatten
of the parsed `eV` data — only the column-major flatten matched.
