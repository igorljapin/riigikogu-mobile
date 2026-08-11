/**
 * Vote calculator — pure, no DOM, no globals, no I/O.
 *
 * Every function here is a total function of its arguments and returns new
 * values; nothing mutates its input. That is what makes the arithmetic testable
 * without a browser, and what lets Phase 4's view layer be replaced wholesale
 * without touching the maths.
 *
 * ## Semantics, as measured from the shipped app
 *
 * `BEHAVIOR_SNAPSHOT.md` §4 records the behaviour this module reproduces. The
 * selection is a set union, built in this order:
 *
 *   1. every MP whose party is selected, **unless** individually excluded
 *   2. plus every individually added MP
 *
 * and the total is the **size of that set** — never a sum of party counts. The
 * distinction matters at the edges: an MP who is both excluded and individually
 * added is counted once, and counted (step 2 runs after step 1). That matches
 * the shipped bundle exactly; the UI's two pickers make the state unreachable in
 * practice (the add picker offers only non-selected parties, the exclude picker
 * only selected ones), but the function is defined for it rather than throwing.
 *
 * Two deliberate improvements on the shipped implementation:
 *
 * - **Keyed by uuid, not by name.** The bundle builds its set from MP *names*,
 *   which silently merges any two MPs who ever share one. 101 distinct names
 *   makes that latent today; uuid makes it impossible.
 * - **Unaligned MPs belong to no preset.** See `presetSelection`.
 */

import { blocOf, partiesInBloc } from './factions.js';

/**
 * Riigikogu voting thresholds. Defaults are the constitutional constants; pass
 * `data/meta.json` to drive them from the data layer instead of these literals.
 */
export const DEFAULT_THRESHOLDS = Object.freeze({
  totalSeats: 101,
  simpleMajority: 51,
  threeFifths: 61,
  constitutionalMajority: 68,
  fourFifths: 81,
});

/** The four cards the calculator lights up, in display order. */
export const THRESHOLD_KEYS = Object.freeze([
  { key: 'simpleMajority', label: '1/2+1' },
  { key: 'threeFifths', label: '3/5' },
  { key: 'constitutionalMajority', label: '2/3' },
  { key: 'fourFifths', label: '4/5' },
]);

/* ------------------------------------------------------------------ *
 * Selection state — immutable
 * ------------------------------------------------------------------ */

/**
 * @typedef {{parties: string[], added: string[], excluded: string[]}} Selection
 *   `parties` holds party ids; `added` and `excluded` hold MP uuids. Plain
 *   arrays rather than Sets so a selection is directly serialisable (a future
 *   "share this scenario" link costs nothing).
 */

/** @returns {Selection} */
export function emptySelection() {
  return { parties: [], added: [], excluded: [] };
}

/** Alias for `emptySelection`, matching the app's `Reset` control. */
export function reset() {
  return emptySelection();
}

function withoutValue(list, value) {
  return list.filter((item) => item !== value);
}

function withValue(list, value) {
  return list.includes(value) ? list : [...list, value];
}

/** Toggle a whole party on or off. @returns {Selection} */
export function toggleParty(selection, partyId) {
  return {
    ...selection,
    parties: selection.parties.includes(partyId)
      ? withoutValue(selection.parties, partyId)
      : withValue(selection.parties, partyId),
  };
}

/** @returns {Selection} */
export function selectParty(selection, partyId) {
  return { ...selection, parties: withValue(selection.parties, partyId) };
}

/** @returns {Selection} */
export function deselectParty(selection, partyId) {
  return { ...selection, parties: withoutValue(selection.parties, partyId) };
}

/** Select several parties at once. @returns {Selection} */
export function selectParties(selection, partyIds) {
  return partyIds.reduce(selectParty, selection);
}

/** Add one MP individually, from a party that is not selected. @returns {Selection} */
export function addIndividualMp(selection, uuid) {
  return { ...selection, added: withValue(selection.added, uuid) };
}

/** Undo `addIndividualMp`. @returns {Selection} */
export function removeIndividualMp(selection, uuid) {
  return { ...selection, added: withoutValue(selection.added, uuid) };
}

/** Exclude one MP from an otherwise-selected party. @returns {Selection} */
export function excludeMp(selection, uuid) {
  return { ...selection, excluded: withValue(selection.excluded, uuid) };
}

/** Undo `excludeMp`. @returns {Selection} */
export function includeMp(selection, uuid) {
  return { ...selection, excluded: withoutValue(selection.excluded, uuid) };
}

/** True when nothing at all is selected. */
export function isEmptySelection(selection) {
  return (
    selection.parties.length === 0 && selection.added.length === 0 && selection.excluded.length === 0
  );
}

/* ------------------------------------------------------------------ *
 * Counting
 * ------------------------------------------------------------------ */

/**
 * The uuids of every MP the selection currently counts.
 * @returns {string[]} in roster order, no duplicates
 */
export function selectedMpUuids(selection, roster) {
  const parties = new Set(selection.parties);
  const added = new Set(selection.added);
  const excluded = new Set(selection.excluded);

  return roster
    .filter((mp) => (parties.has(mp.votingBlocPartyId) && !excluded.has(mp.uuid)) || added.has(mp.uuid))
    .map((mp) => mp.uuid);
}

/**
 * Seats a selection commands — the headline number.
 *
 * Deliberately the size of the selected-MP set, not a sum of party totals, so
 * individual additions and exclusions cannot double-count.
 *
 * @returns {number}
 */
export function seatsForSelection(selection, roster) {
  return selectedMpUuids(selection, roster).length;
}

/**
 * Per-party `selected/total`, matching the calculator's party rows.
 *
 * Individually added MPs count toward *their own* party's row even when that
 * party is not selected — verified against the shipped app, where adding one
 * Eesti 200 MP with only Reform selected renders `Eesti 200 1/13`.
 *
 * @returns {Record<string, {selected: number, total: number}>}
 */
export function partyBreakdown(selection, roster) {
  const selected = new Set(selectedMpUuids(selection, roster));
  const breakdown = {};
  for (const mp of roster) {
    const row = (breakdown[mp.votingBlocPartyId] ??= { selected: 0, total: 0 });
    row.total += 1;
    if (selected.has(mp.uuid)) row.selected += 1;
  }
  return breakdown;
}

/**
 * MPs eligible for the "Add Individual MPs" picker — those in non-selected
 * parties, per `BEHAVIOR_SNAPSHOT.md` §4.2.
 */
export function addableMps(selection, roster) {
  const parties = new Set(selection.parties);
  const added = new Set(selection.added);
  return roster.filter((mp) => !parties.has(mp.votingBlocPartyId) && !added.has(mp.uuid));
}

/**
 * MPs eligible for the "Exclude MPs" picker — those in selected parties.
 */
export function excludableMps(selection, roster) {
  const parties = new Set(selection.parties);
  const excluded = new Set(selection.excluded);
  return roster.filter((mp) => parties.has(mp.votingBlocPartyId) && !excluded.has(mp.uuid));
}

/* ------------------------------------------------------------------ *
 * Thresholds
 * ------------------------------------------------------------------ */

/** ≥ 51 of 101. */
export function hasSimpleMajority(seats, thresholds = DEFAULT_THRESHOLDS) {
  return seats >= thresholds.simpleMajority;
}

/** ≥ 68 of 101 — the two-thirds needed to amend the Constitution. */
export function hasConstitutionalMajority(seats, thresholds = DEFAULT_THRESHOLDS) {
  return seats >= thresholds.constitutionalMajority;
}

/** ≥ 61 of 101. */
export function hasThreeFifths(seats, thresholds = DEFAULT_THRESHOLDS) {
  return seats >= thresholds.threeFifths;
}

/** ≥ 81 of 101. */
export function hasFourFifths(seats, thresholds = DEFAULT_THRESHOLDS) {
  return seats >= thresholds.fourFifths;
}

/**
 * Every threshold card's state at once.
 * @returns {Array<{key: string, label: string, seats: number, met: boolean}>}
 */
export function thresholdsMet(seats, thresholds = DEFAULT_THRESHOLDS) {
  return THRESHOLD_KEYS.map(({ key, label }) => ({
    key,
    label,
    seats: thresholds[key],
    met: seats >= thresholds[key],
  }));
}

/* ------------------------------------------------------------------ *
 * Presets
 * ------------------------------------------------------------------ */

/**
 * The `Coalition` / `Opposition` preset buttons.
 *
 * **This is the one place Phase 3 knowingly departs from the shipped app**, and
 * it is a correction, not a regression. The bundle has two buckets and files
 * every independent under Opposition, so its `Opposition` preset selects 49
 * seats including 6 MPs who have no whip. With 9 party-less MPs today, that
 * silently credits the opposition with 9 votes it does not have
 * (`BEHAVIOR_SNAPSHOT.md` §8.4, and the erratum at the top of
 * `ARCHITECTURE_PLAN.md`).
 *
 * Here the presets are driven by `alignment.json`'s `blocs`, so they select only
 * parties with a declared bloc. `independent` has none and is never swept in —
 * the user can still add those MPs individually, one informed click at a time,
 * which is exactly how their votes actually work.
 *
 * Consequence to expect: `coalition + opposition === totalSeats - unaligned`,
 * not `totalSeats`.
 *
 * @param {'coalition'|'opposition'} bloc
 * @returns {Selection}
 */
export function presetSelection(bloc, parties, alignment) {
  return selectParties(emptySelection(), partiesInBloc(parties, alignment, bloc));
}

/**
 * Full calculator state for a selection — everything a view needs to render,
 * computed in one pass so a view never does arithmetic of its own.
 */
export function calculate(selection, roster, thresholds = DEFAULT_THRESHOLDS) {
  const seats = seatsForSelection(selection, roster);
  return {
    seats,
    totalSeats: thresholds.totalSeats,
    hasMajority: hasSimpleMajority(seats, thresholds),
    thresholds: thresholdsMet(seats, thresholds),
    breakdown: partyBreakdown(selection, roster),
  };
}

export { blocOf };
