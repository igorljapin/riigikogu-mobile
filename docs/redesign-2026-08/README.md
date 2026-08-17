# Handoff: Riigikogu mobile app redesign (Standing / Members / Calculator)

## Overview

A three-tab redesign of the `igorljapin/riigikogu-mobile` app (XV Riigikogu, 101 seats). It keeps the app's data model and three-bloc arithmetic but rebuilds the information architecture for one-handed mobile use: a **Standing** screen that answers "who can pass what", a search-first **Members** screen, and a **Calculator** for majority arithmetic with party- and member-level adjustments.

Target viewport: 402 × 874 (iPhone 14/15 logical size). Every interactive target is ≥ 44 px.

## About the Design Files

The files in this bundle are **design references created in HTML** — prototypes that show intended look and behaviour. They are not production code to copy. The task is to **recreate these designs inside the existing app** (`igorljapin/riigikogu-mobile`: vanilla JS views in `src/views/`, DOM helpers in `src/dom.js`, styling in `styles.css`), reusing its established patterns — its view module shape, its `data/*.json` loading via `src/data.js`, and its CSS conventions.

The prototypes are structured as a single component with a `tab` state and one full-screen detail overlay; the real app already splits views per file, so map each section of the prototype to the corresponding view module rather than porting the prototype's structure.

## Fidelity

**High-fidelity.** Colours, type sizes, weights, radii, spacing, and copy are final and should be matched. All values below are literal from the prototype. Interaction behaviour (what opens what, what recalculates) is also final; transition/animation styling is not specified and is left to the codebase's conventions.

## Data model (unchanged from the current app)

Reads `data/parties.json`, `data/mps.json`, `data/alignment.json`, `data/board.json`, `data/meta.json`.

- Roster = `mps` filtered to `active !== false`.
- For each MP: `votingBlocPartyId` = `alignment.defectors[uuid].votesWith` if the MP is a defector, else `registeredPartyId`. `unaligned` = `alignment.unaligned.includes(uuid)`.
- Bloc of a party = `alignment.blocs[partyId]` → `coalition` | `opposition` | undefined (→ Unaligned).
- Party seat count = number of roster MPs whose `votingBlocPartyId` is that party.
- Thresholds from `meta`: `simpleMajority` 51, `threeFifths` 61, `constitutionalMajority` 68, `fourFifths` 81, `totalSeats` 101.

## Screens / Views

### 1. Standing (default tab)

Purpose: the parliament's current arithmetic at a glance, then party detail.

Layout, top to bottom, in a vertically scrolling column:

1. **Header block** — padding `14px 20px 10px`.
   - Kicker: `XV RIIGIKOGU · UPDATED 12 AUG 2026`, monospace 600 12px/1, letter-spacing `.12em`, uppercase, colour `muted`. (Date is the data's update date.)
   - Figure row, `display:flex; align-items:baseline; gap:9px`: coalition seat count in 700 46px/1, letter-spacing `-0.035em`, colour `text`; beside it `of 101 coalition seats` in 600 16px/1.2, colour `muted`.
   - No verdict sentence (deliberately removed — the threshold marker below carries it).

2. **Seat chart** — padding `0 20px 22px`; wrapper has `position:relative; padding-top:18px` to make room for the marker label.
   - Stacked bar: `display:flex; height:34px; border-radius:8px; overflow:hidden; background: track`. Three segments in order coalition → unaligned → opposition, each `width: seats/101 * 100%`, colours `#2563eb` / `#94a3b8` / `#e11d48`.
   - Threshold marker: absolutely positioned at `left: 51/101 * 100%`, `top:0; bottom:0; width:2px; background: text`. Label `51-VOTE MAJORITY` sits at `top:0; left:5px`, `white-space:nowrap`, monospace 600 11px/1, letter-spacing `.04em`, colour `text`.
   - Legend row `display:flex; gap:18px; margin-top:12px`: `Coalition 50`, `Unaligned 9`, `Opposition 42` — each a 10×10 swatch (radius 3px) + 500 13px/1 label in `muted`.

3. **PARTIES BY VOTING BLOC** — section heading 600 13px/1, letter-spacing `.08em`, uppercase, `muted`, `margin-bottom:10px`; padding `0 20px`. Cards in a `flex column; gap:10px`, sorted by seat count descending.
   - Card = full-width button, `min-height:76px`, padding `14px 16px`, `border:1px solid line`, radius 16px, background `card`, text-align left, `flex column; gap:10px`.
   - Row: 14×32 party-colour bar (radius 5px) · name 600 17px/1.25 `text` · sub 400 13px/1.3 `muted` (`"Coalition · Estonian Reform Party"`; for the unaligned pseudo-party: name `Unaligned members`, sub `No group, no whip`) · seat number 700 26px/1, letter-spacing `-0.02em`.
   - Progress bar: full-width 6px track (`background: track`, radius 999px) with a party-colour fill at `seats/101 * 100%`.
   - Tap → party detail overlay.

4. **BOARD OF THE RIIGIKOGU** — same section heading style; padding `26px 20px 0`; rows `gap:8px`.
   - Row = button, `min-height:64px`, padding `12px 16px`, `1px solid line`, radius 16px, background `card`: 10×36 party-colour bar (radius 4px) · name 600 17px/1.25 · role 400 13px/1.3 `muted` · 20px chevron stroked in `muted` (stroke-width 2, round caps).
   - Tap → MP detail overlay.

### 2. Members

Purpose: find any of the 101 MPs fast, then read their profile.

1. **Title** `Members` — 700 32px/1.1, letter-spacing `-0.03em`, `margin-bottom:14px`; block padding `12px 20px 10px`.
2. **Search field** — height 52px, padding `0 16px`, radius 16px, background `card`, `1px solid line`, `flex; align-items:center; gap:10px`: 20px magnifier stroked `muted`; `input[type=search]` placeholder `Search 101 members`, 400 17px/1.3, transparent background, no border/outline; when non-empty, a 32px round clear button (`background: track`, `×` in `muted`). Filters by case-insensitive substring of `name`.
3. **Filters** — block `flex column; gap:8px; padding:10px 20px 12px`. Single-select across both rows.
   - Segmented control: `grid-template-columns:repeat(4,1fr); gap:3px; padding:3px; border-radius:13px; background: track`. Segments `All`, `Coalition`, `Opposition`, `Unaligned`, each height 38px, radius 10px, 600 13px/1. Active segment: background `card`, colour `text`, `box-shadow:0 1px 3px rgba(15,23,42,.14)`. Inactive: transparent, colour `muted`.
   - Second row: `grid-template-columns:1fr 1fr; gap:8px` with `Chairs & officers` and `USA friendship group`, height 40px, radius 11px, `1px solid line`, background `card`, 600 13px/1. Active: background `hero`, colour `#fff`, border `hero`, `aria-pressed="true"`.
   - Predicates: All → everyone; Coalition/Opposition → bloc of `votingBlocPartyId`; Unaligned → `mp.unaligned`; Chairs & officers → `factionRole || boardRole`; USA friendship group → `usaFriendship === true`.
4. **Count line** — `"101 members"` (singular `member`), 500 13px/1, `muted`, padding `0 20px 8px`.
5. **Member rows** — full-bleed buttons, `min-height:72px`, padding `10px 20px`, `border-top:1px solid line`, background `card`, `gap:14px`:
   - 48px circle with the MP's initials (first + last name initial, uppercase), 700 16px/1, background party colour, colour party `textColor`. **Initials, not photos, in the list** — photos appear only on the profile.
   - Name 600 17px/1.3 `text`; sub 400 14px/1.35 `muted` = board role (with `" of the Riigikogu"` stripped) ?? faction role ?? first committee name ?? district.
   - Right: party short badge, padding `5px 10px`, radius 8px, 700 12px/1.2, background party colour, colour party `textColor`; `Independent` renders as `Unaligned`.
   - Empty state: `No member matches “<query>”.` centred, 400 16px/1.4, `muted`, padding 40px 20px.

### 3. Calculator (tab label "Calculator", screen title "Majority calculator")

Purpose: build a hypothetical voting group and see which thresholds it clears.

1. **Title** `Majority calculator` — 700 32px/1.1, letter-spacing `-0.03em`, `margin-bottom:16px`.
2. **Hero card** — padding `20px 18px 18px`, radius 22px, background `hero`, colour `#fff`.
   - Seat total 700 56px/0.9, letter-spacing `-0.04em`; to its right, right-aligned verdict 600 16px/1.3: `Passes ordinary legislation` in `#4ade80` when ≥51, otherwise `<n> short of 51` in `rgba(255,255,255,.72)`.
   - Threshold track: `position:relative; height:44px; margin-top:20px`. Base bar `left:0; right:0; top:14px; height:14px; radius:999px; background:rgba(255,255,255,.14)`; fill same geometry, width `seats/101 * 100%`, colour `#4ade80` when ≥51 else `#9333ea`. Four marks at 51/61/68/81 (`left: need/101*100%`, `translateX(-50%)`): 2×28px tick plus label in monospace 600 11px/1 — reached: tick `rgba(255,255,255,.9)`, label `#fff`; unreached: `rgba(255,255,255,.22)` / `rgba(255,255,255,.5)`.
   - Hint 500 15px/1.4 `rgba(255,255,255,.72)`, `margin-top:14px`: `Tap parties below, or start from a preset.` at 0 seats; else `<n> more seat(s) reaches <next threshold>.`; else `Clears every constitutional threshold.`
3. **Presets** — `flex; gap:8px; padding:14px 20px 0`: `Coalition`, `Opposition`, `Clear`, each `flex:1`, height 48px, radius 14px, `1px solid line`, background `card`, 600 15px/1 (`Clear` in `muted`). Each resets `added`/`excluded` and sets `parties` accordingly.
4. **TAP A PARTY IN OR OUT** — section heading style as above; `grid-template-columns:1fr 1fr; gap:10px`.
   - Card = single toggle button, `min-height:96px`, padding 14px, `border:2px solid`, radius 18px, `flex column; gap:6px`, `aria-pressed` reflecting count>0. Contents: 12×12 party swatch (radius 4px) + party short 600 15px/1.2; below, count 700 30px/1 (letter-spacing `-0.03em`) and `of <total>` 500 13px/1.2 in `muted`, baseline-aligned with `gap:6px`.
   - Active (count > 0): border party colour, background `card`, count colour `text`. Inactive: border `line`, background transparent, count colour `muted`.
   - Tapping toggles the whole party in or out; toggling off also clears that party's `excluded` entries, toggling on clears its `added` entries. **No ± steppers** — member-level changes belong to the two buttons below.
5. **Add / Exclude buttons** — `flex column; gap:8px; padding:16px 20px 0`. Each row: `min-height:60px`, padding `10px 16px`, `1px solid line`, radius 15px, background `card`; 32px rounded square icon (radius 10px) — `+` on `#dcfce7`/`#15803d`, `−` on `#fee2e2`/`#b91c1c`, 700 17px/1; title 600 16px/1.25 `text`; sub 400 13px/1.3 `muted`; trailing 20px chevron in `muted`.
   - `Add individual MPs` / `From non-selected parties`.
   - `Exclude MPs` / `Select parties first` when no party selected, otherwise `From selected parties`.
6. **NAMED ADJUSTMENTS** (only when any individual add/exclude exists) — rows `min-height:56px`, padding `8px 14px`, `1px solid line`, radius 14px, background `card`, `gap:12px`: 30px badge (radius 9px, 700 13px/1) `−1` on `#fee2e2`/`#b91c1c` or `+1` on `#dcfce7`/`#15803d`; name 600 15px/1.25; note 400 13px/1.3 `muted` — `Held out of <Party>` / `Votes with <Party>`; `Undo` button height 40px, padding `0 14px`, radius 11px, transparent, `1px solid line`, 600 14px/1 `muted`. Excluded MPs list before added MPs.

### Full-screen detail overlay (shared)

Replaces the bottom sheet of the current app. `position:absolute; inset:0; z-index:5`, background `bg`, `flex column`.

- Header bar: `flex:0 0 auto`, padding `62px 16px 12px` (clears the status bar), background `card`, `border-bottom:1px solid line`. Back button height 44px with a 22px chevron + the word `Back` in 600 16px/1 `text`; beside it a kicker in 600 16px/1 `muted` — `Member`, `Voting bloc`, `Add individual MPs`, or `Exclude MPs`.
- Body: `flex:1; overflow-y:auto; padding:0 20px 40px`.

**MP profile** — 88px photo (radius 26px, `object-fit:cover`, party-colour fallback background) beside name 700 25px/1.15 and two chips (party in party colour, bloc in `track` with colour `muted`, or `#b45309` when Unaligned); both chips padding `6px 11px`, radius 9px, 13px. If the MP left their group: a note card, padding `14px 16px`, radius 14px, `1px solid warnLine`, background `warnBg`, colour `warnText`, 500 14px/1.45 — e.g. `Left EKRE in Mar 2024 — registered non-affiliated, votes with Reform.` / `… — no group, no whip. Counted in neither bloc.` Then fact rows (`1px solid line`, radius 14px, padding `14px 16px`, `gap:14px`): label column `flex:0 0 96px`, 600 12px/1.3, uppercase, letter-spacing `.06em`, `muted`; value 500 15px/1.4 `text`. Keys in order: Office (if any), District, Committees (`Name (role)` joined by ` · `, role omitted when `member`), Registered, Groups (if `usaFriendship`), Email. Footer link `Open riigikogu.ee profile` — height 52px, radius 15px, background `hero`, `#fff`, 600 16px/1, opens `profileUrl` in a new tab.

**Party detail** — title 700 28px/1.12 (`Unaligned members` for the pseudo-party, else `nameEn`), sub 500 15px/1.4 `muted`: `<n> votes · <Bloc> · registered <meta.registered[id]>` (the `registered` clause is omitted for unaligned). Then member rows: `min-height:68px`, `border-top:1px solid line`, 44px initials circle, name 600 16px/1.3, sub 400 13px/1.35, 20px chevron. Tap → MP profile (overlay swaps in place).

**MP picker (two steps)** — opened by the Add / Exclude buttons.
- Step 1, party list: title = `Add individual MPs` / `Exclude MPs`; sub = `Pick a party, then the members who vote with your bloc.` / `Pick a party, then the members to hold out of the count.` Rows (`min-height:68px`, padding `10px 14px`, `1px solid line`, radius 15px, background `card`): 14×38 party bar (radius 5px), party short, sub `<n> available to add` / `<n> available to exclude`, trailing `›` in `muted`. Parties with zero available members are omitted, order matches the Standing sort.
- Step 2, member list: title = party short; sub = `Tap a member to add them to the count.` / `Tap a member to hold them out of the count.` Rows as above but with a 44px initials circle and a trailing action pill (`min-width:36px; height:36px; padding:0 11px; radius:11px; 700 14px/1`): `+1` on `#dcfce7`/`#15803d` or `−1` on `#fee2e2`/`#b91c1c`. Tapping a member applies the change immediately and stays on the list (that MP disappears from the pool and appears under Named adjustments).
- Back from step 2 returns to the party list; back from step 1 closes the overlay.
- Empty states, 400 15px/1.45 `muted`, centred, padding `34px 4px`: `Nobody left in this party.` / `Every party is already selected.` / `Select a party first.`
- Add pool = MPs whose party is **not** selected and who are not already added. Exclude pool = MPs whose party **is** selected and who are not already excluded.

### Tab bar

`flex:0 0 auto`, `grid-template-columns:repeat(3,1fr)`, height 72px, background `card`, `border-top:1px solid line`, `margin-bottom:34px` (home-indicator area). Each tab: icon over label, `gap:5px`, label 600 12px/1. Active colour `#9333ea`, inactive `muted`. Icons are 25px `viewBox="0 0 24 24"`, `fill:none`, `stroke:currentColor`, stroke-width 1.9, round caps/joins, single `<path>`:

- Standing (hemicycle with seat ticks): `M3 20h18M4 20a8 8 0 0 1 16 0M8 20v-3.4M12 20v-4.6M16 20v-3.4`
- Members (two figures): `M9.5 5.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6M3.5 19.5a6 6 0 0 1 12 0M15.5 6.2a2.6 2.6 0 0 1 0 5.2M17 19.5a5 5 0 0 0-2.4-4.3`
- Calculator: `M5 2.5h14v19H5zM8.5 6.5h7M9 12h.01M12 12h.01M15 12h.01M9 16.5h.01M12 16.5h.01M15 16.5h.01`

Switching tabs closes any open overlay.

## Interactions & Behavior

- Tab switch: `tab = id`, `detail = null`.
- Standing: party card → party overlay; board row → MP overlay.
- Members: search input filters live; filter selection is single-select; row → MP overlay.
- Calculator: party card toggles the party; presets replace the whole selection; Add/Exclude open the picker; Named adjustments `Undo` removes one uuid from `added`/`excluded`. Seat total, verdict, fill width, marks, and hint all recompute from `sel` on every change.
- Overlay back: MP picker step 2 → step 1; everything else → close.
- No animations are specified; use the codebase's existing transition conventions. Nothing depends on hover (touch target design), so hover styling is optional.

## State Management

```
tab:    'standing' | 'members' | 'majority'      // 'majority' is the Calculator tab id
query:  string                                    // members search
filter: 'all' | 'coalition' | 'opposition' | 'unaligned' | 'chairs' | 'usa'
detail: null
      | { kind: 'mp', uuid }
      | { kind: 'party', partyId }
      | { kind: 'picker', add: boolean, partyId: string | null }
sel:    { parties: string[], added: uuid[], excluded: uuid[] }
```

Derived: `seats = roster.filter(mp => sel.parties.includes(mp.votingBlocPartyId) && !sel.excluded.includes(mp.uuid)).length + roster.filter(mp => !sel.parties.includes(mp.votingBlocPartyId) && sel.added.includes(mp.uuid)).length`.

Data is fetched once on mount (`Promise.all` over the five JSON files) and needs no refetch.

## Design Tokens

Light / dark:

| Token | Light | Dark |
|---|---|---|
| bg | `#f4f6f8` | `#080d16` |
| card | `#ffffff` | `#131b29` |
| text | `#0f172a` | `#f6f8fb` |
| muted | `#64748b` | `#93a1b8` |
| line | `#e4e9ef` | `#233046` |
| track | `#eef1f5` | `#1d283b` |
| hero | `#0f172a` | `#1b2536` |
| warnBg | `#fffbeb` | `#2a2213` |
| warnLine | `#fcd34d` | `#6b5117` |
| warnText | `#92400e` | `#f5cf7a` |

Fixed accents (same in both themes): coalition `#2563eb`, opposition `#e11d48`, unaligned `#94a3b8`, active tab / calculator fill `#9333ea`, pass green `#4ade80`, add `#dcfce7` on `#15803d`, remove `#fee2e2` on `#b91c1c`, unaligned bloc text `#b45309`. Party colours and their `textColor` come from `data/parties.json`.

Spacing: 20px screen gutter; section gaps 8 / 10 / 14 / 16 / 22 / 26px. Radii: 8, 9, 10, 11, 13, 14, 15, 16, 18, 22, 26px, 50%/999px for pills. Type: system UI stack (`-apple-system, system-ui, sans-serif`) for everything except kickers and threshold labels, which use the monospace stack (`ui-monospace, SFMono-Regular, Menlo, monospace`). Sizes used: 11, 12, 13, 14, 15, 16, 17, 19, 25, 26, 28, 30, 32, 46, 56px. Only one shadow in the design: `0 1px 3px rgba(15,23,42,.14)` on the active segmented-control segment. Minimum touch target 44px.

## Assets

- MP photos: `photoUrl` from `data/mps.json` (riigikogu.ee) — profile only, never in lists.
- All icons are inline SVG paths given above; no icon library or image assets are needed.
- No new fonts.

## Screenshots

`screenshots/` (each 402×874 at 2×):

| File | Shows |
|---|---|
| `01-standing-light.png` | Standing tab, light |
| `02-members-light.png` | Members tab with segmented filters |
| `03-calculator-light.png` | Calculator tab, empty selection |
| `04-standing-dark.png` | Standing tab, dark theme |
| `05-picker-step1-parties.png` | Add individual MPs — party list |
| `06-picker-step2-members.png` | Add individual MPs — member list with +1 pills |
| `07-mp-profile.png` | MP profile overlay |
| `08-party-detail.png` | Party detail overlay |

## Files

- `RKNewScreen.dc.html` — the redesign, all three tabs plus the detail overlay; light/dark via a `theme` prop, entry tab via `initialTab`.
- `Riigikogu Redesign.dc.html` — the presentation page that mounts the four frames (Standing, Members, Calculator, Standing dark).
- `RKCurrentScreen.dc.html`, `Riigikogu Current.dc.html` — faithful recreation of the app as it is today, for before/after comparison.
- `data/` — the five JSON files copied from the repo (`igorljapin/riigikogu-mobile`, branch `main`).

Open `Riigikogu Redesign.dc.html` in a browser to see all frames; they are live and interactive.
