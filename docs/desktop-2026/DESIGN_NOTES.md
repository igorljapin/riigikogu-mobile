# Phase 1 design notes — desktop artboards

Companion to the six approved mockups in this directory. Everything here is a
decision the artboards make that `DESIGN_AND_MERGE_PLAN.md` does not already
contain. Phase 3 should treat these as the intended behaviour; anything not
listed here and not visible in the mockups is genuinely open, and per the
Phase 3 kickoff rules should be raised as a PR-body question rather than
invented.

See `README.md` for the file manifest and `INTERACTIONS.md` for the element-by-
element inventory. The clickable prototype in `prototype/` is the authoritative
version of everything described below.

## Artboards

| File | View | Theme |
|---|---|---|
| `mockups/01-parliament-light.png` | Parliament | light |
| `mockups/02-directory-light.png` | MP directory | light |
| `mockups/03-calculator-light.png` | Coalition calculator | light |
| `mockups/04-parliament-dark.png` | Parliament | dark |
| `mockups/05-directory-dark.png` | MP directory | dark |
| `mockups/06-calculator-dark.png` | Coalition calculator | dark |

All six are 1920×1080. Light and dark are the same markup with only theme
tokens swapped.

## Structure

- **Left icon rail, 104px**, three destinations: Parliament, Directory,
  Calculator. Active item takes the `track` token as its background and the
  accent token as its icon/label colour.
- **Page padding** 26px top / 34px sides; **card radius** 20px; card gap 20px.
  These are the mobile radii and the mobile 20px spacing family at desktop
  density, not new values.
- Parliament and Calculator share one **1108px-wide** floor-plan card so the
  seating grid is pixel-identical between the two views.

## Seating grid

- Renders `data/seating.json`'s 10 rows × 12 columns; 101 of the 120 cells are
  occupied, the rest render as empty (`display:none`) placeholders that keep
  the grid rigid.
- Tile is 54px tall, 7px radius, two-line name at 9px/1.2. **9px is below the
  minimum type size the mobile contract sets for body copy** — it is accepted
  here because the tile name is a redundant label (the tooltip and the profile
  carry the same information accessibly), not the only path to it. If Phase 3
  wants to avoid shipping 9px text, the tweak `showSeatNames` in the design
  component turns tiles into colour-only and nothing else in the layout moves.
- Tiles are filled with the party the member **votes with**, not the party they
  are registered under. Members whose registration differs carry a 9px dot in
  the top-right in their *registered* party's colour. This is the defector
  annotation; it is the only place registration is visible on the floor.
- Hover shows a single tooltip positioned from the hovered cell's row/column.
  There is deliberately one tooltip node for the whole grid, not 101.

## Parliament view

- Header carries the mobile Standing block widened to 780px: coalition figure,
  stacked bloc bar, a 51-vote marker line, bloc legend.
- **Party legend under the grid is a party key, not a column key** — one chip
  per party (swatch, short name, seat count), ordered coalition → unaligned →
  opposition. An earlier version showed per-column party mixes; it was rejected
  as unreadable, and it silently omitted any party that did not dominate a
  column.
- **Party rows and legend chips are both toggles that highlight that party's
  members on the floor**, using the calculator's selection treatment: selected
  parties' seats take a 2px ring, everything else drops to 32% opacity.
  Multi-select is supported and additive. The caption under the grid reports
  the highlighted total. A Clear control sits in the section header; it
  **always occupies its space** and only toggles visibility, so selecting a
  party does not reflow the list.
- Highlight state and calculator selection state are separate. Entering the
  calculator does not inherit a Parliament highlight.
- Board of the Riigikogu rows navigate to that member's Directory profile.

## MP directory

- Two panes: 660px filter/list pane, flexible profile pane.
- Filters are the mobile set — search by name, a four-way bloc segmented
  control (All / Coalition / Opposition / Unaligned), and two mutually
  exclusive tag filters (Chairs & officers, USA friendship group). The tag
  filters replace rather than compose with the bloc filter.
- List rows are 68px with a 44px initials avatar, a party badge, and a 3px
  accent left border on the selected row.
- Profile pane is the mobile full-screen profile relaid: avatar, party and bloc
  chips, an optional note card, a fact grid, and a seat locator that echoes the
  floor grid with the member's own cell filled.
- The note card appears for members whose registration differs from their
  voting bloc (defectors, sourced from `alignment.json`'s note) and for
  unaligned members who left a faction (sourced from `leftFaction` /
  `leftFactionDate`). Unaligned members' party chip reads **Non-affiliated**,
  not their former party.

## Coalition calculator

- Picker docks beside the floor plan, matching today's app. Seat states:
  counted (ring), not counted (32% opacity), and held out of an otherwise
  selected party (red ring).
- Selection is modelled as **parties + named adjustments**, not a flat set of
  101 booleans: selecting a party selects its members, and individual seats are
  then added to or held out of that base. Named adjustments are listed with
  ±1 badges and individual Undo. Deselecting a party clears its own
  adjustments only.
- Hero card keeps the mobile 56px total and threshold track, and adds one chip
  per constitutional threshold: 51 (1/2+1, ordinary legislation), 61 (3/5,
  constitution second route), 68 (2/3, constitutional amendment), 81 (4/5,
  urgent amendment). Cleared thresholds turn green; the hint line names the
  next threshold and the gap to it.
- Presets: Coalition, Opposition, Clear. Presets reset adjustments.

## Theming

- Party colours come from `parties.json` and are **identical in both themes** —
  they are content. Reform seats stay black-on-yellow in dark; the per-party
  `textColor` from `parties.json` is what makes that work and must not be
  replaced with a theme token.
- Dark values used: page `#080d16`, card `#131b29`, text `#f6f8fb`, muted
  `#93a1b8`, line `#233046`, track `#1d283b`, hero `#1b2536`, warn trio
  `#2a2213` / `#6b5117` / `#f5cf7a`.
- `hero` is the one token whose *feel* differs between themes — near-black in
  light, a lifted slate in dark — because a near-black card on a near-black
  page disappears.

## Data the mockups were built on

The mobile handoff's `data/*.json` at 2026-08-12 (coalition 50, opposition 42,
unaligned 9) joined to the Phase 0 `data/seating.json`. The join is clean:
101 seats, 101 active MPs, no orphans in either direction. The desktop repo's
bundle party data was not used, per Phase 0's instruction.

## Known gaps, deliberately not designed

- No committee view, no voting-record view, no search over anything but MP
  names — none are in the Phase 1 scope in the plan.
- Photos load from `api.riigikogu.ee` and fall back to initials. In the design
  component they are background images rather than `<img>` so a failed load
  degrades silently; the mockups show the initials fallback because that host
  is not reachable from the design canvas.
- Responsive behaviour below 1920 is not designed. The artboards are a fixed
  1920×1080 target as the plan specifies.
