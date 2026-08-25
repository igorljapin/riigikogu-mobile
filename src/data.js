/**
 * The data layer's runtime half.
 *
 * Everything the app displays is fetched from `data/*.json` here, once, and
 * joined into the shapes the views need. No view fetches, and no view derives a
 * seat number of its own — that is what keeps a data update a pure data change
 * (ARCHITECTURE_PLAN.md §2, `data/README.md`).
 *
 * The deployed bundle this replaces performed **no** runtime loading at all:
 * every MP, colour and total was baked into minified JavaScript, which is why
 * the app sat three defections stale with no way to fix it short of a rebuild.
 */

import {
  buildRoster,
  defectorRecord,
  indexParties,
  isUnaligned,
  partyById,
  votingBlocPartyId,
} from './lib/factions.js';

const FILES = ['parties', 'mps', 'alignment', 'board', 'meta'];

/** Resolve `data/x.json` against this module, so the app works under any base path. */
function dataUrl(name) {
  return new URL(`../data/${name}.json`, import.meta.url);
}

/**
 * The `<img src>` for an MP's portrait, or `null` for a member who has none.
 *
 * `mps.json` records the portrait as a repo-relative path (`assets/mps/<uuid>.webp`),
 * which is the one form that says nothing about where the app is mounted;
 * resolving it here — against this module, exactly as `dataUrl` resolves the
 * JSON — is what makes the same string correct at `/riigikogu-mobile/` for the
 * mobile shell, at `/riigikogu-mobile/desktop/` for the desktop one, and at `/`
 * under the test server.
 *
 * The portraits are the app's own files. Until August 2026 they were hotlinked
 * from `api.riigikogu.ee`, whose file URLs rotate — two thirds of them were
 * dead within a fortnight of the last data build — and which rate-limits the
 * hundred-image burst a roster paints. `scripts/fetch_mp_photos.mjs` has the
 * full account.
 */
export function photoSrc(mp) {
  return mp.photo ? new URL(`../${mp.photo}`, import.meta.url).href : null;
}

async function fetchJson(name) {
  const response = await fetch(dataUrl(name), { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`data/${name}.json: HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * The roster the views render: every field of `mps.json` plus the three things
 * only the alignment overlay can answer.
 *
 * `votingBlocPartyId` is the party whose bloc this MP's vote counts toward, and
 * it is what every headline number in the app is built from. `registeredPartyId`
 * is kept alongside it — never instead of it — for procedural facts.
 */
function enrich(mps, alignment) {
  // buildRoster is the canonical join; re-deriving it here would be a second
  // implementation of the rule that matters most.
  const canonical = new Map(buildRoster(mps, alignment).map((mp) => [mp.uuid, mp]));

  return mps
    .filter((mp) => mp.active !== false)
    .map((mp) => ({
      ...mp,
      votingBlocPartyId: canonical.get(mp.uuid)?.votingBlocPartyId ?? votingBlocPartyId(mp, alignment),
      unaligned: isUnaligned(mp, alignment),
      defector: defectorRecord(mp, alignment),
    }));
}

let cache = null;

/**
 * Load and join every data file. Cached — repeated calls are free, and the
 * views can ask for the data rather than having it threaded through them.
 *
 * @returns {Promise<{parties, partiesById, mps, mpsByUuid, alignment, board, meta, roster}>}
 */
export async function loadData() {
  if (cache) return cache;

  const [parties, mps, alignment, board, meta] = await Promise.all(FILES.map(fetchJson));
  const roster = enrich(mps, alignment);

  cache = {
    parties,
    partiesById: indexParties(parties),
    mps: roster,
    mpsByUuid: new Map(roster.map((mp) => [mp.uuid, mp])),
    alignment,
    board,
    meta,
    /** The flat roster `src/lib/calculator.js` counts over. */
    roster,
  };
  return cache;
}

/** Reset the cache. Only used by tests and the dev console. */
export function clearCache() {
  cache = null;
}

/* ------------------------------------------------------------------ *
 * Typed accessors — small, so a view never reaches into a raw record
 * ------------------------------------------------------------------ */

/** @returns {object|null} the party record for `partyId` */
export function party(data, partyId) {
  return data.partiesById.get(partyId) ?? partyById(data.parties, partyId);
}

/** The short label the UI shows for a party ("Reform", "Eesti 200", "Independent"). */
export function partyShort(data, partyId) {
  return party(data, partyId)?.short ?? partyId;
}

/** Every MP whose vote counts toward `partyId`, in roster order. */
export function mpsInVotingBloc(data, partyId) {
  return data.mps.filter((mp) => mp.votingBlocPartyId === partyId);
}

/** Voting-bloc seats for `partyId` — the count every headline number uses. */
export function votingBlocSeats(data, partyId) {
  return mpsInVotingBloc(data, partyId).length;
}

/**
 * The three buckets the Parliament tab shows, in display order.
 *
 * `unaligned` is a real bucket, not a rounding of the other two. The bundle had
 * only Coalition and Opposition and filed every independent under Opposition,
 * which credited the opposition with 9 votes it does not have
 * (BEHAVIOR_SNAPSHOT.md §8.4).
 */
export function buckets(data) {
  const { blocs } = data.alignment;
  const of = (bloc) => data.parties.filter((p) => (blocs[p.id] ?? null) === bloc);

  return [
    { id: 'coalition', label: 'Coalition', parties: of('coalition'), seats: data.meta.coalitionSeats },
    { id: 'opposition', label: 'Opposition', parties: of('opposition'), seats: data.meta.oppositionSeats },
    { id: 'unaligned', label: 'Unaligned', parties: of(null), seats: data.meta.unalignedSeats },
  ];
}

/** `'Coalition'`, `'Opposition'` or `'Unaligned'` — what an MP's popup states. */
export function blocLabel(data, mp) {
  const bloc = data.alignment.blocs[mp.votingBlocPartyId] ?? null;
  if (bloc === 'coalition') return 'Coalition';
  if (bloc === 'opposition') return 'Opposition';
  return 'Unaligned';
}
