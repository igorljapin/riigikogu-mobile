# Interactive inventory + suggested test IDs

Every interactive element in the Phase 1 desktop design, with the behaviour it
promises and a suggested `data-testid`. Intended as raw material for the
Phase 2 usability contract and the Phase 3 test harness.

`—` in the testid column means the element is decorative or a duplicate route
to a listed behaviour and does not need its own hook.

## Global — left rail

| Element | Behaviour | Suggested testid |
|---|---|---|
| Parliament / Directory / Calculator buttons | Switch view. Active item takes the `track` background and `accent` foreground. Switching away closes any open seat popup. | `nav-parliament`, `nav-directory`, `nav-calculator` |
| Theme button (rail footer) | Prototype-only affordance for reviewing both themes. In the real app theme follows the OS. | — |
| XV badge | Decorative. | — |

## Parliament view

| Element | Behaviour | Suggested testid |
|---|---|---|
| Seat tile (×101) | Hover shows the tooltip; click opens the profile popup for that member. | `seat-{mpUuid}` |
| Seat tooltip | Name, the party the member votes with, bloc, and any office. For a defector also names the registered party. One tooltip node for the whole grid. | `seat-tooltip` |
| Defector dot on a tile | Not interactive. Present only when registration differs from voting bloc; filled with the *registered* party's colour. | — |
| Seat popup — close | Dismisses. | `seat-popup-close` |
| Seat popup — "Open full profile ›" | Navigates to Directory with that MP selected, clearing search, filters and any party highlight. | `seat-popup-open-profile` |
| Party row in "Parties by voting bloc" | Toggles that party's highlight on the floor. Additive: multiple parties may be highlighted. Selected row takes a party-coloured border. | `party-row-{partyId}` |
| Party legend chip under the grid | Same toggle as the party row, same state. | `party-chip-{partyId}` |
| Clear (section header) | Clears all highlights. **Always occupies its space**; only visibility toggles, so the list must not reflow when it appears. | `party-highlight-clear` |
| Board row (×3) | Navigates to that member's Directory profile. | `board-row-{mpUuid}` |

Highlight treatment, which must match the calculator's selection treatment
exactly: highlighted seats take a 2px ring in the `text` token, all other seats
drop to 32% opacity. The caption under the grid reports the highlighted total.

Highlight state and calculator selection state are independent — entering the
calculator does not inherit a Parliament highlight, and vice versa.

## MP directory

| Element | Behaviour | Suggested testid |
|---|---|---|
| Search field | Filters by name, case-insensitive substring. Composes with the active filter. | `mp-search` |
| Bloc segmented control | All / Coalition / Opposition / Unaligned. Mutually exclusive. | `filter-bloc-{all\|coalition\|opposition\|unaligned}` |
| Chairs & officers | Members with a faction role or a Board role. **Replaces** the bloc filter rather than composing with it. | `filter-chairs` |
| USA friendship group | Members with `usaFriendship: true`. Same replace-not-compose rule. | `filter-usa` |
| Result count line | Reports the filtered count. | `mp-result-count` |
| Member row | Selects that MP into the profile pane. Selected row takes a 3px accent left border and the `track` background. | `mp-row-{mpUuid}` |
| Empty state | Shown when no member matches; quotes the query. | `mp-empty` |
| "Open riigikogu.ee profile" | External link, new tab, `rel="noopener"`. | `mp-external-profile` |
| Note card | Appears for defectors (text from `alignment.json`'s note) and for unaligned members who left a faction (from `leftFaction` / `leftFactionDate`). Absent otherwise. | `mp-note` |
| Seat locator | Mini floor grid with the member's own cell filled; not interactive. | `mp-seat-locator` |

Unaligned members' party chip reads **Non-affiliated**, never their former
party. The bloc chip is coloured by bloc: coalition, opposition, or the
unaligned amber.

## Coalition calculator

| Element | Behaviour | Suggested testid |
|---|---|---|
| Seat tile (×101) | Click adds the member to the count, or holds them out if their party is selected. Hover tooltip as on Parliament. | `calc-seat-{mpUuid}` |
| Party card (×7) | Toggles the whole party in or out. Deselecting a party also clears **its own** named adjustments and no others. | `calc-party-{partyId}` |
| Coalition / Opposition presets | Select every party in that bloc; reset all adjustments. | `calc-preset-coalition`, `calc-preset-opposition` |
| Clear | Empties the selection and all adjustments. | `calc-clear` |
| Hero total | Seat count of the current selection. | `calc-total` |
| Verdict line | "Passes ordinary legislation" at ≥51, otherwise "N short of 51". | `calc-verdict` |
| Threshold chip (×4) | 51 (1/2+1, ordinary legislation), 61 (3/5, constitution second route), 68 (2/3, constitutional amendment), 81 (4/5, urgent amendment). Cleared chips turn green and are marked ✓. | `calc-threshold-{51\|61\|68\|81}` |
| Hint line | Names the next unmet threshold and the gap to it; at 81+ says every threshold is cleared. | `calc-hint` |
| Named adjustment row | One per individual add or hold-out, with a ±1 badge. | `calc-adjustment-{mpUuid}` |
| Adjustment Undo | Reverts that one adjustment. | `calc-adjustment-undo-{mpUuid}` |
| Empty adjustments hint | Shown when there are no adjustments. | `calc-adjustments-empty` |

Seat states: **counted** takes a ring in the `text` token; **not counted**
drops to 32% opacity; **held out of an otherwise selected party** takes a ring
in the remove-red token.

The selection model is *parties plus named adjustments*, not 101 independent
booleans. Selecting a party selects its members as a base; individual seats are
then added to or held out of that base. This matters for Phase 3: the state
shape should be `{parties[], added[], excluded[]}`, because a flat set cannot
express "the coalition, minus this one member" in a way that survives
deselecting and reselecting the party.

## Behaviours with no visible control

- Every count in the design derives from the party a member **votes with**, not
  the party they are registered under. Registration surfaces in exactly three
  places: the defector dot on the floor, the tooltip, and the profile's
  Registered / Votes with facts.
- Photos load from `api.riigikogu.ee` and degrade to an initials avatar. In the
  prototype they are background images so a failed load simply doesn't paint;
  an `<img>` with an `onError` handler was tried first and fired unreliably.
- Empty cells in the 10×12 grid (19 of 120) render as invisible placeholders so
  the grid geometry stays rigid.
