import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addIndividualMp,
  calculate,
  emptySelection,
  excludeMp,
  presetSelection,
  seatsForSelection,
  selectParties,
  thresholdsMet,
} from '../../src/lib/calculator.js';
import { buildRoster } from '../../src/lib/factions.js';
import { loadData } from './helpers/fixtures.mjs';

/**
 * The three calculator scenarios recorded in `BEHAVIOR_SNAPSHOT.md` §4.1,
 * recomputed from `data/*.json`.
 *
 * The snapshot's own totals came from the shipped bundle, whose data is three
 * defections stale (§8.3). So these tests assert the **structure** of each
 * scenario against **current** data: every expected number is derived from
 * `meta.votingBloc`, never typed in. Where that lands somewhere different from
 * the snapshot, the delta is asserted explicitly and explained — those are the
 * numbers Phase 4 will visibly change, and this is where they are pinned down
 * before any UI depends on them.
 */

const { parties, mps, alignment, meta } = loadData();
const roster = buildRoster(mps, alignment);
const bloc = meta.votingBloc;

const mpsOfParty = (partyId) => roster.filter((mp) => mp.votingBlocPartyId === partyId);

test('S1 — the Coalition preset', () => {
  const selection = presetSelection('coalition', parties, alignment);
  const result = calculate(selection, roster, meta);

  const expected = bloc.reform + bloc.e200;
  assert.equal(result.seats, expected);
  assert.equal(result.seats, meta.coalitionSeats);

  // Snapshot recorded 52 / ✓ Majority. Reform 39→38 (Kiili, 2026-08-10) and
  // Eesti 200 13→12 (Stoicescu, 2026-08-09) put the government at 50 of 101 —
  // a minority government, and the single most consequential data change in
  // the whole rebuild.
  assert.equal(result.seats, 50);
  assert.equal(result.hasMajority, false);
  assert.equal(result.hasMajority, meta.coalitionHasMajority);

  const breakdown = result.breakdown;
  assert.equal(breakdown.reform.selected, breakdown.reform.total);
  assert.equal(breakdown.e200.selected, breakdown.e200.total);
  assert.equal(breakdown.sde.selected, 0);
});

test('S2 — the Opposition preset', () => {
  const selection = presetSelection('opposition', parties, alignment);
  const result = calculate(selection, roster, meta);

  const expected = bloc.sde + bloc.ekre + bloc.isamaa + bloc.center;
  assert.equal(result.seats, expected);
  assert.equal(result.seats, meta.oppositionSeats);
  assert.equal(result.hasMajority, false);

  // Snapshot recorded 49, which folded 6 party-less MPs into the opposition.
  // The preset now selects only parties with a declared bloc, so it reads 42
  // and the 9 unaligned MPs are counted by nobody. See §8.4 of the snapshot.
  assert.equal(result.seats, 42);
  assert.equal(result.breakdown.independent.selected, 0);
});

test('S1 + S2 leave the unaligned MPs to nobody', () => {
  const coalition = seatsForSelection(presetSelection('coalition', parties, alignment), roster);
  const opposition = seatsForSelection(presetSelection('opposition', parties, alignment), roster);

  // The shipped app's two presets summed to 101 because every independent was
  // pushed into the opposition. They now sum to 92, and the 9 missing seats are
  // the point: they have no whip and must be added one at a time, deliberately.
  assert.equal(coalition + opposition, 92);
  assert.equal(meta.totalSeats - (coalition + opposition), meta.unalignedSeats);
});

test('S3 — four parties, then one exclusion and one addition', () => {
  const fourParties = ['reform', 'e200', 'isamaa', 'sde'];
  let selection = selectParties(emptySelection(), fourParties);

  // Step-by-step, each delta exactly the party's own seat count.
  const steps = [];
  let running = emptySelection();
  for (const partyId of fourParties) {
    running = selectParties(running, [partyId]);
    steps.push(seatsForSelection(running, roster));
  }
  assert.deepEqual(steps, [
    bloc.reform,
    bloc.reform + bloc.e200,
    bloc.reform + bloc.e200 + bloc.isamaa,
    bloc.reform + bloc.e200 + bloc.isamaa + bloc.sde,
  ]);

  const base = bloc.reform + bloc.e200 + bloc.isamaa + bloc.sde;
  assert.equal(seatsForSelection(selection, roster), base);
  // Snapshot recorded 77; the three defections make it 75.
  assert.equal(base, 75);

  // Exclude one Reform MP → exactly one seat fewer.
  const reformMp = mpsOfParty('reform')[0];
  selection = excludeMp(selection, reformMp.uuid);
  assert.equal(seatsForSelection(selection, roster), base - 1);
  assert.equal(partyRow(selection, 'reform').selected, bloc.reform - 1);

  // Add one EKRE MP → exactly one seat back.
  const ekreMp = mpsOfParty('ekre')[0];
  selection = addIndividualMp(selection, ekreMp.uuid);
  assert.equal(seatsForSelection(selection, roster), base);
  assert.equal(partyRow(selection, 'ekre').selected, 1);

  // Thresholds met at 75: 51, 61 and 68 — but not 81.
  const met = thresholdsMet(seatsForSelection(selection, roster), meta).filter((t) => t.met).map((t) => t.seats);
  assert.deepEqual(met, [51, 61, 68]);

  function partyRow(sel, partyId) {
    return calculate(sel, roster, meta).breakdown[partyId];
  }
});

test('every scenario total is reproducible from the party rows the app shows', () => {
  // The self-consistency property the Tier-1 Playwright suite relies on: the
  // headline total always equals the sum of the per-party selected counts.
  const selections = [
    presetSelection('coalition', parties, alignment),
    presetSelection('opposition', parties, alignment),
    excludeMp(selectParties(emptySelection(), ['reform', 'e200', 'isamaa', 'sde']), mpsOfParty('reform')[0].uuid),
    addIndividualMp(selectParties(emptySelection(), ['reform']), mpsOfParty('ekre')[0].uuid),
  ];

  for (const selection of selections) {
    const result = calculate(selection, roster, meta);
    const summed = Object.values(result.breakdown).reduce((sum, row) => sum + row.selected, 0);
    assert.equal(result.seats, summed);
  }
});

test('selecting every party gives the whole chamber, unaligned included', () => {
  const selection = selectParties(emptySelection(), parties.map((party) => party.id));
  assert.equal(seatsForSelection(selection, roster), meta.totalSeats);
});
