import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INDEPENDENT_PARTY_ID,
  blocOf,
  blocSeats,
  buildRoster,
  defectorRecord,
  indexParties,
  isUnaligned,
  partiesInBloc,
  partyByFactionName,
  partyById,
  partyColor,
  partyTextColor,
  seatCounts,
  votingBlocPartyId,
} from '../../src/lib/factions.js';
import { loadData, tinyAlignment, tinyParties } from './helpers/fixtures.mjs';

const { parties, mps, alignment, meta } = loadData();
const roster = buildRoster(mps, alignment);

/* ================================================================== *
 * Party lookup
 * ================================================================== */

test('parties resolve by id and by their exact API faction name', () => {
  assert.equal(partyById(parties, 'reform').short, 'Reform');
  assert.equal(partyById(parties, 'nope'), null);

  for (const party of parties) {
    assert.equal(partyByFactionName(parties, party.factionName).id, party.id);
  }
  assert.equal(partyByFactionName(parties, 'Some Other Group'), null);
  assert.equal(partyByFactionName(parties, null), null);
});

test('every faction string in mps.json resolves to a known party', () => {
  for (const mp of mps) {
    assert.notEqual(
      partyByFactionName(parties, mp.faction),
      null,
      `unmapped faction "${mp.faction}" for ${mp.name}`,
    );
  }
});

test('faction matching is exact, including the API typographic apostrophe', () => {
  // EKRE's API string uses U+2019, not an ASCII apostrophe. A loose match here
  // would quietly file nine MPs as non-affiliated.
  const ekre = partyById(parties, 'ekre');
  assert.ok(ekre.factionName.includes('’'), 'fixture no longer covers the apostrophe case');
  assert.equal(partyByFactionName(parties, ekre.factionName).id, 'ekre');
  assert.equal(partyByFactionName(parties, ekre.factionName.replace('’', "'")), null);
});

test('colours come from the catalogue, with a grey fallback', () => {
  assert.equal(partyColor(parties, 'reform'), '#FFD700');
  assert.equal(partyTextColor(parties, 'reform'), '#000000');
  assert.equal(partyTextColor(parties, 'sde'), '#FFFFFF');
  assert.equal(partyColor(parties, 'nonexistent'), '#808080');
});

test('indexParties keys every party exactly once', () => {
  const index = indexParties(parties);
  assert.equal(index.size, parties.length);
  assert.equal(index.get('e200').short, 'Eesti 200');
});

/* ================================================================== *
 * The dual count — the core of this module
 * ================================================================== */

test('an MP in a group votes with their own party', () => {
  const inGroup = mps.find((mp) => mp.registeredPartyId !== INDEPENDENT_PARTY_ID);
  assert.equal(votingBlocPartyId(inGroup, alignment), inGroup.registeredPartyId);
});

test('a defector votes with the party they joined, not the group they left', () => {
  for (const [uuid, defector] of Object.entries(alignment.defectors)) {
    const mp = mps.find((m) => m.uuid === uuid);
    assert.ok(mp, `defector ${defector.name} is not in the roster`);

    // Registered non-affiliated…
    assert.equal(mp.registeredPartyId, INDEPENDENT_PARTY_ID, `${defector.name} is not registered non-affiliated`);
    // …but voting with their new party.
    assert.equal(votingBlocPartyId(mp, alignment), defector.votesWith);
    assert.notEqual(votingBlocPartyId(mp, alignment), INDEPENDENT_PARTY_ID);
  }
});

test('defector precedence beats registered party — the eleven are not filed as independent', () => {
  const defectorCount = Object.keys(alignment.defectors).length;
  const attributed = roster.filter(
    (mp) => mp.registeredPartyId === INDEPENDENT_PARTY_ID && mp.votingBlocPartyId !== INDEPENDENT_PARTY_ID,
  );
  assert.equal(attributed.length, defectorCount);
});

test('an unaligned MP votes with nobody and belongs to no bloc', () => {
  for (const uuid of alignment.unaligned) {
    const mp = mps.find((m) => m.uuid === uuid);
    assert.ok(mp, `unaligned uuid ${uuid} is not in the roster`);
    assert.equal(isUnaligned(mp, alignment), true);
    assert.equal(defectorRecord(mp, alignment), null);
    assert.equal(votingBlocPartyId(mp, alignment), INDEPENDENT_PARTY_ID);
    assert.equal(blocOf(votingBlocPartyId(mp, alignment), alignment), null);
  }
});

test('independent has no bloc, so nothing can sweep unaligned MPs into one', () => {
  assert.equal(blocOf(INDEPENDENT_PARTY_ID, alignment), null);
  assert.equal(partiesInBloc(parties, alignment, 'coalition').includes(INDEPENDENT_PARTY_ID), false);
  assert.equal(partiesInBloc(parties, alignment, 'opposition').includes(INDEPENDENT_PARTY_ID), false);
});

test('every non-affiliated MP is classified exactly once', () => {
  const nonAffiliated = mps.filter((mp) => mp.registeredPartyId === INDEPENDENT_PARTY_ID);
  for (const mp of nonAffiliated) {
    const isDefector = Boolean(alignment.defectors[mp.uuid]);
    const unaligned = alignment.unaligned.includes(mp.uuid);
    assert.equal(
      Number(isDefector) + Number(unaligned),
      1,
      `${mp.name} is classified ${Number(isDefector) + Number(unaligned)} times`,
    );
  }
});

/* ================================================================== *
 * Roster and seat arithmetic
 * ================================================================== */

test('the roster is the full chamber, with unique uuids', () => {
  assert.equal(roster.length, meta.totalSeats);
  assert.equal(new Set(roster.map((mp) => mp.uuid)).size, meta.totalSeats);
});

test('both seat counts are recomputed from the roster and match meta.json', () => {
  const counts = seatCounts(roster);

  assert.deepEqual(counts.registered, meta.registered);

  // meta.json names the no-bloc bucket "unaligned"; the roster uses the party
  // id "independent" so the UI has something to render and select.
  const votingBloc = { ...counts.votingBloc };
  votingBloc.unaligned = votingBloc[INDEPENDENT_PARTY_ID];
  delete votingBloc[INDEPENDENT_PARTY_ID];
  assert.deepEqual(votingBloc, meta.votingBloc);
});

test('both counts sum to 101 — independently of meta.json', () => {
  const counts = seatCounts(roster);
  const sum = (record) => Object.values(record).reduce((a, b) => a + b, 0);

  assert.equal(sum(counts.registered), 101);
  assert.equal(sum(counts.votingBloc), 101);
  assert.equal(counts.total, 101);
});

test('the two counts genuinely differ — this is not an identity function', () => {
  const counts = seatCounts(roster);
  assert.notDeepEqual(counts.registered, counts.votingBloc);
  assert.ok(counts.registered.reform < counts.votingBloc.reform);
  assert.ok(counts.registered.sde < counts.votingBloc.sde);
});

test('bloc seats add up to the chamber, unaligned included as its own bucket', () => {
  const coalition = blocSeats(roster, alignment, 'coalition');
  const opposition = blocSeats(roster, alignment, 'opposition');
  const unaligned = roster.filter((mp) => blocOf(mp.votingBlocPartyId, alignment) === null).length;

  assert.equal(coalition, meta.coalitionSeats);
  assert.equal(opposition, meta.oppositionSeats);
  assert.equal(unaligned, meta.unalignedSeats);
  assert.equal(coalition + opposition + unaligned, meta.totalSeats);
});

test('the unaligned bucket is not empty, so the third state is load-bearing', () => {
  assert.ok(meta.unalignedSeats > 0);
  assert.equal(alignment.unaligned.length, meta.unalignedSeats);
});

test('buildRoster drops inactive MPs', () => {
  const withInactive = [...mps, { ...mps[0], uuid: 'gone', name: 'Former Member', active: false }];
  assert.equal(buildRoster(withInactive, alignment).length, meta.totalSeats);
});

test('the tiny fixture resolves through the same code path', () => {
  assert.deepEqual(partiesInBloc(tinyParties, tinyAlignment, 'coalition'), ['a']);
  assert.deepEqual(partiesInBloc(tinyParties, tinyAlignment, 'opposition'), ['b', 'c']);
  assert.equal(blocOf('independent', tinyAlignment), null);
});
