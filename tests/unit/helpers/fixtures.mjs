/**
 * Shared fixtures for the unit tests.
 *
 * Two kinds, on purpose:
 *
 * - **Real data** (`loadData`) — `data/*.json` as committed. Tests that use it
 *   assert *relationships* ("the presets cover every aligned seat"), never
 *   today's literals, so they survive the next defection.
 * - **A tiny synthetic roster** (`tinyRoster`) — 10 MPs with numbers small
 *   enough to verify by hand. Boundary and semantics tests use this, so a
 *   failure points at the arithmetic rather than at the data.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), 'utf8'));
}

export function loadData() {
  return {
    parties: readJson('data/parties.json'),
    mps: readJson('data/mps.json'),
    alignment: readJson('data/alignment.json'),
    meta: readJson('data/meta.json'),
    board: readJson('data/board.json'),
  };
}

export { repoRoot };

/**
 * A hand-checkable roster: parties a=4, b=3, c=2, plus 1 independent.
 * Total 10 seats.
 */
export const tinyRoster = [
  { uuid: 'a1', name: 'A One', registeredPartyId: 'a', votingBlocPartyId: 'a', unaligned: false },
  { uuid: 'a2', name: 'A Two', registeredPartyId: 'a', votingBlocPartyId: 'a', unaligned: false },
  { uuid: 'a3', name: 'A Three', registeredPartyId: 'a', votingBlocPartyId: 'a', unaligned: false },
  { uuid: 'a4', name: 'A Four', registeredPartyId: 'a', votingBlocPartyId: 'a', unaligned: false },
  { uuid: 'b1', name: 'B One', registeredPartyId: 'b', votingBlocPartyId: 'b', unaligned: false },
  { uuid: 'b2', name: 'B Two', registeredPartyId: 'b', votingBlocPartyId: 'b', unaligned: false },
  { uuid: 'b3', name: 'B Three', registeredPartyId: 'b', votingBlocPartyId: 'b', unaligned: false },
  { uuid: 'c1', name: 'C One', registeredPartyId: 'c', votingBlocPartyId: 'c', unaligned: false },
  { uuid: 'c2', name: 'C Two', registeredPartyId: 'c', votingBlocPartyId: 'c', unaligned: false },
  { uuid: 'i1', name: 'I One', registeredPartyId: 'independent', votingBlocPartyId: 'independent', unaligned: true },
];

export const tinyParties = [
  { id: 'a', short: 'A', color: '#AAAAAA', textColor: '#000000', factionName: 'A Group' },
  { id: 'b', short: 'B', color: '#BBBBBB', textColor: '#FFFFFF', factionName: 'B Group' },
  { id: 'c', short: 'C', color: '#CCCCCC', textColor: '#FFFFFF', factionName: 'C Group' },
  { id: 'independent', short: 'Independent', color: '#808080', textColor: '#FFFFFF', factionName: 'Non-affiliated members' },
];

export const tinyAlignment = {
  blocs: { a: 'coalition', b: 'opposition', c: 'opposition' },
  defectors: {},
  unaligned: ['i1'],
};

/** Thresholds scaled to the 10-seat fixture, so boundaries are hand-checkable. */
export const tinyThresholds = {
  totalSeats: 10,
  simpleMajority: 6,
  threeFifths: 6,
  constitutionalMajority: 7,
  fourFifths: 8,
};
