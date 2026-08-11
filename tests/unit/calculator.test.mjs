import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_THRESHOLDS,
  addIndividualMp,
  addableMps,
  calculate,
  deselectParty,
  emptySelection,
  excludableMps,
  excludeMp,
  hasConstitutionalMajority,
  hasSimpleMajority,
  includeMp,
  isEmptySelection,
  partyBreakdown,
  presetSelection,
  removeIndividualMp,
  reset,
  seatsForSelection,
  selectParties,
  selectedMpUuids,
  thresholdsMet,
  toggleParty,
} from '../../src/lib/calculator.js';
import { buildRoster } from '../../src/lib/factions.js';
import { loadData, tinyAlignment, tinyParties, tinyRoster, tinyThresholds } from './helpers/fixtures.mjs';

const { parties, mps, alignment, meta } = loadData();
const roster = buildRoster(mps, alignment);

/* ================================================================== *
 * Selection state
 * ================================================================== */

test('an empty selection commands no seats', () => {
  const selection = emptySelection();
  assert.equal(isEmptySelection(selection), true);
  assert.equal(seatsForSelection(selection, tinyRoster), 0);
  assert.equal(hasSimpleMajority(0, tinyThresholds), false);
});

test('selections are immutable — no function mutates its input', () => {
  const original = emptySelection();
  const snapshot = JSON.stringify(original);

  toggleParty(original, 'a');
  addIndividualMp(original, 'b1');
  excludeMp(original, 'a1');
  selectParties(original, ['a', 'b']);

  assert.equal(JSON.stringify(original), snapshot);
});

/* ================================================================== *
 * Party add / remove
 * ================================================================== */

test('selecting a party adds exactly that party seat count', () => {
  let selection = emptySelection();
  assert.equal(seatsForSelection(selection, tinyRoster), 0);

  selection = toggleParty(selection, 'a');
  assert.equal(seatsForSelection(selection, tinyRoster), 4);

  selection = toggleParty(selection, 'b');
  assert.equal(seatsForSelection(selection, tinyRoster), 7);

  selection = toggleParty(selection, 'c');
  assert.equal(seatsForSelection(selection, tinyRoster), 9);
});

test('deselecting a party removes exactly the seats it added', () => {
  let selection = selectParties(emptySelection(), ['a', 'b', 'c']);
  assert.equal(seatsForSelection(selection, tinyRoster), 9);

  selection = toggleParty(selection, 'b');
  assert.equal(seatsForSelection(selection, tinyRoster), 6);

  selection = deselectParty(selection, 'a');
  assert.equal(seatsForSelection(selection, tinyRoster), 2);

  selection = deselectParty(selection, 'c');
  assert.equal(seatsForSelection(selection, tinyRoster), 0);
});

test('toggling the same party twice is a no-op', () => {
  const once = toggleParty(emptySelection(), 'a');
  const twice = toggleParty(once, 'a');
  assert.equal(seatsForSelection(twice, tinyRoster), 0);
  assert.deepEqual(twice.parties, []);
});

test('selecting every party selects the whole chamber', () => {
  const selection = selectParties(emptySelection(), tinyParties.map((p) => p.id));
  assert.equal(seatsForSelection(selection, tinyRoster), tinyRoster.length);
});

test('the total is a set size, so a party cannot be counted twice', () => {
  const selection = selectParties(emptySelection(), ['a', 'a', 'a']);
  assert.equal(seatsForSelection(selection, tinyRoster), 4);
});

/* ================================================================== *
 * Individual MP add / remove
 * ================================================================== */

test('adding an individual MP adds exactly one seat', () => {
  let selection = toggleParty(emptySelection(), 'a');
  assert.equal(seatsForSelection(selection, tinyRoster), 4);

  selection = addIndividualMp(selection, 'b1');
  assert.equal(seatsForSelection(selection, tinyRoster), 5);

  selection = addIndividualMp(selection, 'b2');
  assert.equal(seatsForSelection(selection, tinyRoster), 6);
});

test('removing an individually added MP removes exactly one seat', () => {
  let selection = addIndividualMp(addIndividualMp(toggleParty(emptySelection(), 'a'), 'b1'), 'b2');
  assert.equal(seatsForSelection(selection, tinyRoster), 6);

  selection = removeIndividualMp(selection, 'b1');
  assert.equal(seatsForSelection(selection, tinyRoster), 5);
});

test('excluding an MP removes exactly one seat', () => {
  let selection = toggleParty(emptySelection(), 'a');
  selection = excludeMp(selection, 'a1');
  assert.equal(seatsForSelection(selection, tinyRoster), 3);

  selection = excludeMp(selection, 'a2');
  assert.equal(seatsForSelection(selection, tinyRoster), 2);
});

test('re-including an excluded MP restores the seat', () => {
  let selection = excludeMp(toggleParty(emptySelection(), 'a'), 'a1');
  assert.equal(seatsForSelection(selection, tinyRoster), 3);

  selection = includeMp(selection, 'a1');
  assert.equal(seatsForSelection(selection, tinyRoster), 4);
});

test('adding the same MP twice adds one seat, not two', () => {
  const selection = addIndividualMp(addIndividualMp(emptySelection(), 'b1'), 'b1');
  assert.equal(seatsForSelection(selection, tinyRoster), 1);
});

test('excluding an MP whose party is not selected changes nothing', () => {
  const selection = excludeMp(toggleParty(emptySelection(), 'a'), 'b1');
  assert.equal(seatsForSelection(selection, tinyRoster), 4);
});

test('an MP both excluded and individually added is counted — matching the shipped app', () => {
  // The bundle adds individuals after applying exclusions, so the add wins.
  // The UI cannot reach this state (its two pickers offer disjoint sets), but
  // the function is defined for it rather than throwing.
  let selection = toggleParty(emptySelection(), 'a');
  selection = excludeMp(selection, 'a1');
  assert.equal(seatsForSelection(selection, tinyRoster), 3);

  selection = addIndividualMp(selection, 'a1');
  assert.equal(seatsForSelection(selection, tinyRoster), 4);
});

test('Reset clears parties, additions and exclusions together', () => {
  let selection = selectParties(emptySelection(), ['a', 'b']);
  selection = excludeMp(selection, 'a1');
  selection = addIndividualMp(selection, 'c1');
  assert.notEqual(seatsForSelection(selection, tinyRoster), 0);

  const cleared = reset();
  assert.equal(isEmptySelection(cleared), true);
  assert.equal(seatsForSelection(cleared, tinyRoster), 0);
});

/* ================================================================== *
 * Party breakdown and pickers
 * ================================================================== */

test('the party breakdown reports selected/total per party', () => {
  const selection = excludeMp(toggleParty(emptySelection(), 'a'), 'a1');
  const breakdown = partyBreakdown(selection, tinyRoster);

  assert.deepEqual(breakdown.a, { selected: 3, total: 4 });
  assert.deepEqual(breakdown.b, { selected: 0, total: 3 });
  assert.deepEqual(breakdown.c, { selected: 0, total: 2 });
});

test('an individually added MP counts toward their own party row', () => {
  // Verified against the shipped app: with only Reform selected, adding one
  // Eesti 200 MP renders "Eesti 200 1/13".
  const selection = addIndividualMp(toggleParty(emptySelection(), 'a'), 'b1');
  const breakdown = partyBreakdown(selection, tinyRoster);

  assert.deepEqual(breakdown.a, { selected: 4, total: 4 });
  assert.deepEqual(breakdown.b, { selected: 1, total: 3 });
});

test('breakdown totals always sum to the full chamber', () => {
  const breakdown = partyBreakdown(selectParties(emptySelection(), ['a']), roster);
  const total = Object.values(breakdown).reduce((sum, row) => sum + row.total, 0);
  assert.equal(total, meta.totalSeats);
});

test('the add picker offers only non-selected parties; the exclude picker only selected ones', () => {
  const selection = toggleParty(emptySelection(), 'a');

  const addable = addableMps(selection, tinyRoster);
  assert.equal(addable.length, 6);
  assert.equal(addable.some((mp) => mp.votingBlocPartyId === 'a'), false);

  const excludable = excludableMps(selection, tinyRoster);
  assert.equal(excludable.length, 4);
  assert.equal(excludable.every((mp) => mp.votingBlocPartyId === 'a'), true);
});

test('pickers do not re-offer an MP already added or excluded', () => {
  let selection = toggleParty(emptySelection(), 'a');
  selection = excludeMp(selection, 'a1');
  selection = addIndividualMp(selection, 'b1');

  assert.equal(excludableMps(selection, tinyRoster).some((mp) => mp.uuid === 'a1'), false);
  assert.equal(addableMps(selection, tinyRoster).some((mp) => mp.uuid === 'b1'), false);
});

/* ================================================================== *
 * Thresholds — the boundaries that matter
 * ================================================================== */

/** Build a selection of exactly `n` seats by adding MPs individually. */
function selectionOfExactly(n) {
  return roster.slice(0, n).reduce((selection, mp) => addIndividualMp(selection, mp.uuid), emptySelection());
}

test('the simple-majority boundary is 50 → false, 51 → true', () => {
  const fifty = selectionOfExactly(50);
  assert.equal(seatsForSelection(fifty, roster), 50);
  assert.equal(hasSimpleMajority(50), false);
  assert.equal(calculate(fifty, roster).hasMajority, false);

  const fiftyOne = selectionOfExactly(51);
  assert.equal(seatsForSelection(fiftyOne, roster), 51);
  assert.equal(hasSimpleMajority(51), true);
  assert.equal(calculate(fiftyOne, roster).hasMajority, true);
});

test('the constitutional-majority boundary is 67 → false, 68 → true', () => {
  const sixtySeven = selectionOfExactly(67);
  assert.equal(seatsForSelection(sixtySeven, roster), 67);
  assert.equal(hasConstitutionalMajority(67), false);

  const sixtyEight = selectionOfExactly(68);
  assert.equal(seatsForSelection(sixtyEight, roster), 68);
  assert.equal(hasConstitutionalMajority(68), true);
});

test('half the chamber is not a majority — 50 of 101 fails, and 50.5 does not exist', () => {
  assert.equal(hasSimpleMajority(Math.floor(DEFAULT_THRESHOLDS.totalSeats / 2)), false);
  assert.equal(hasSimpleMajority(DEFAULT_THRESHOLDS.simpleMajority), true);
});

test('every threshold flips exactly at its own value and nowhere else', () => {
  for (const { key, seats } of thresholdsMet(0)) {
    assert.equal(thresholdsMet(seats - 1).find((t) => t.key === key).met, false, `${key} met at ${seats - 1}`);
    assert.equal(thresholdsMet(seats).find((t) => t.key === key).met, true, `${key} not met at ${seats}`);
  }
});

test('thresholds accumulate — 68 seats meets 51, 61 and 68 but not 81', () => {
  const met = thresholdsMet(68).filter((t) => t.met).map((t) => t.seats);
  assert.deepEqual(met, [51, 61, 68]);
});

test('thresholds can be driven from meta.json instead of the built-in constants', () => {
  assert.equal(hasSimpleMajority(meta.simpleMajority - 1, meta), false);
  assert.equal(hasSimpleMajority(meta.simpleMajority, meta), true);
  assert.equal(hasConstitutionalMajority(meta.constitutionalMajority - 1, meta), false);
  assert.equal(hasConstitutionalMajority(meta.constitutionalMajority, meta), true);

  // The literals in the module and the data layer must agree.
  assert.equal(meta.simpleMajority, DEFAULT_THRESHOLDS.simpleMajority);
  assert.equal(meta.constitutionalMajority, DEFAULT_THRESHOLDS.constitutionalMajority);
  assert.equal(meta.totalSeats, DEFAULT_THRESHOLDS.totalSeats);
});

test('the tiny fixture confirms boundaries are not hardcoded to 101-seat values', () => {
  const six = tinyRoster.slice(0, 6).reduce((s, mp) => addIndividualMp(s, mp.uuid), emptySelection());
  assert.equal(seatsForSelection(six, tinyRoster), 6);
  assert.equal(hasSimpleMajority(5, tinyThresholds), false);
  assert.equal(hasSimpleMajority(6, tinyThresholds), true);
});

/* ================================================================== *
 * Presets
 * ================================================================== */

test('presets select whole blocs from alignment.json', () => {
  const coalition = presetSelection('coalition', tinyParties, tinyAlignment);
  assert.deepEqual(coalition.parties, ['a']);
  assert.equal(seatsForSelection(coalition, tinyRoster), 4);

  const opposition = presetSelection('opposition', tinyParties, tinyAlignment);
  assert.deepEqual(opposition.parties, ['b', 'c']);
  assert.equal(seatsForSelection(opposition, tinyRoster), 5);
});

test('no preset ever selects an unaligned MP', () => {
  for (const bloc of ['coalition', 'opposition']) {
    const selection = presetSelection(bloc, parties, alignment);
    const selected = new Set(selectedMpUuids(selection, roster));
    for (const uuid of alignment.unaligned) {
      assert.equal(selected.has(uuid), false, `${bloc} preset swept in unaligned MP ${uuid}`);
    }
  }
});

test('coalition + opposition covers every seat except the unaligned ones', () => {
  const coalition = seatsForSelection(presetSelection('coalition', parties, alignment), roster);
  const opposition = seatsForSelection(presetSelection('opposition', parties, alignment), roster);

  assert.equal(coalition + opposition, meta.totalSeats - meta.unalignedSeats);
  assert.equal(coalition, meta.coalitionSeats);
  assert.equal(opposition, meta.oppositionSeats);
});

test('the coalition verdict computed here agrees with meta.json', () => {
  const seats = seatsForSelection(presetSelection('coalition', parties, alignment), roster);
  assert.equal(hasSimpleMajority(seats, meta), meta.coalitionHasMajority);
});
