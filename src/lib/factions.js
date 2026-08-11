/**
 * Faction / party resolution — pure, no DOM, no globals, no I/O.
 *
 * This module owns exactly one hard question: **which party's votes does this
 * MP's vote go with?** The answer is not the same as "which parliamentary group
 * is this MP registered in", and conflating the two is the single biggest
 * correctness risk in the app (`ARCHITECTURE_PLAN.md` §2, `data/README.md`).
 *
 * Under the Rules of Procedure §40–42 an MP who leaves a parliamentary group may
 * never join another for the rest of the term. A defector who joins a new party
 * is therefore *registered* non-affiliated forever while *voting* with their new
 * group. Both counts are correct; they answer different questions:
 *
 *   registeredPartyId  → procedural facts (speaking time, committee entitlements)
 *   votingBlocPartyId  → majority arithmetic (the calculator, "will this pass")
 *
 * The three-state model, from `data/alignment.json`:
 *
 *   | state              | votes with          | in a bloc? |
 *   |--------------------|---------------------|------------|
 *   | in a group         | their own party     | yes        |
 *   | `defectors`        | `votesWith`         | yes        |
 *   | `unaligned`        | nobody              | **never**  |
 *
 * `unaligned` MPs have no whip and no common position. They are surfaced under
 * the `independent` party id so the UI can list and individually select them,
 * but `blocOf('independent')` is `null`, so no preset and no bloc total ever
 * sweeps them up. That is deliberate: as of 2026-08-11 there are 9 of them and
 * the government holds 50 of 101, so silently attributing them would manufacture
 * a majority that does not exist.
 */

/** The party id used for MPs who belong to no parliamentary group. */
export const INDEPENDENT_PARTY_ID = 'independent';

/** @returns {Map<string, object>} parties keyed by id */
export function indexParties(parties) {
  return new Map(parties.map((party) => [party.id, party]));
}

/** @returns {object|null} */
export function partyById(parties, partyId) {
  return parties.find((party) => party.id === partyId) ?? null;
}

/**
 * Resolve an API faction string (e.g. "Isamaa Parliamentary Group") to a party.
 * Matching is on the exact `factionName` recorded in `data/parties.json` — the
 * API's own string, including its typographic apostrophes.
 *
 * @returns {object|null} null when the faction is unknown, which callers should
 *   treat as a data error rather than silently bucketing the MP somewhere.
 */
export function partyByFactionName(parties, factionName) {
  if (!factionName) return null;
  return parties.find((party) => party.factionName === factionName) ?? null;
}

/** @returns {string} hex colour, or the independent grey for an unknown id */
export function partyColor(parties, partyId) {
  return partyById(parties, partyId)?.color ?? partyById(parties, INDEPENDENT_PARTY_ID)?.color ?? '#808080';
}

/** @returns {string} contrasting label colour for `partyId` */
export function partyTextColor(parties, partyId) {
  return partyById(parties, partyId)?.textColor ?? '#FFFFFF';
}

/** True when this MP belongs to no parliamentary group. */
export function isUnaligned(mp, alignment) {
  return alignment.unaligned.includes(mp.uuid);
}

/** The defector record for this MP, or null. */
export function defectorRecord(mp, alignment) {
  return alignment.defectors[mp.uuid] ?? null;
}

/**
 * The party whose bloc this MP's vote counts toward.
 *
 * Precedence is defector → unaligned → registered, and it matters: a defector is
 * registered non-affiliated, so checking `registeredPartyId` first would file
 * all eleven of them under `independent` and hand the blocs eleven fewer votes
 * than they have.
 *
 * @returns {string} a party id; `independent` for MPs in no bloc
 */
export function votingBlocPartyId(mp, alignment) {
  const defector = defectorRecord(mp, alignment);
  if (defector) return defector.votesWith;
  if (isUnaligned(mp, alignment)) return INDEPENDENT_PARTY_ID;
  return mp.registeredPartyId;
}

/**
 * Join `mps.json` against the `alignment.json` overlay into the flat roster the
 * calculator works from. This is the `parties` + `mps` join that
 * `ARCHITECTURE_PLAN.md` §3 refers to; every seat number in the app derives from
 * it, so it is computed once, here, rather than re-derived per view.
 *
 * @returns {Array<{uuid,name,registeredPartyId,votingBlocPartyId,unaligned}>}
 */
export function buildRoster(mps, alignment) {
  return mps
    .filter((mp) => mp.active !== false)
    .map((mp) => ({
      uuid: mp.uuid,
      name: mp.name,
      registeredPartyId: mp.registeredPartyId,
      votingBlocPartyId: votingBlocPartyId(mp, alignment),
      unaligned: isUnaligned(mp, alignment),
    }));
}

/**
 * Seat totals under both counts.
 *
 * @returns {{registered: Record<string, number>, votingBloc: Record<string, number>, unaligned: number, total: number}}
 */
export function seatCounts(roster) {
  const registered = {};
  const votingBloc = {};
  for (const mp of roster) {
    registered[mp.registeredPartyId] = (registered[mp.registeredPartyId] ?? 0) + 1;
    votingBloc[mp.votingBlocPartyId] = (votingBloc[mp.votingBlocPartyId] ?? 0) + 1;
  }
  return {
    registered,
    votingBloc,
    unaligned: roster.filter((mp) => mp.unaligned).length,
    total: roster.length,
  };
}

/**
 * Which bloc a party sits in.
 *
 * @returns {'coalition'|'opposition'|null} null means *no bloc* — the correct
 *   answer for `independent`, and never a reason to pick one.
 */
export function blocOf(partyId, alignment) {
  return alignment.blocs[partyId] ?? null;
}

/** @returns {string[]} party ids in `bloc`, in `parties.json` order */
export function partiesInBloc(parties, alignment, bloc) {
  return parties.filter((party) => blocOf(party.id, alignment) === bloc).map((party) => party.id);
}

/** Seats held by a bloc, under the voting-bloc count. */
export function blocSeats(roster, alignment, bloc) {
  return roster.filter((mp) => blocOf(mp.votingBlocPartyId, alignment) === bloc).length;
}
