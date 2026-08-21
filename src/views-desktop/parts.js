/**
 * Shared furniture for the three desktop views — the small pieces that would
 * otherwise be written three times and drift twice.
 *
 * Nothing here does arithmetic. Every seat number the desktop surface shows
 * comes from `src/lib/` and `src/data.js`, both reused untouched; these are
 * labels, chips and initials.
 *
 * One naming rule is load-bearing and lives here so it cannot be forgotten in a
 * view: **a member's party is the party they vote with**. The word for the
 * party-less bucket is `Unaligned` in lists and on the floor, and
 * `Non-affiliated` on a profile — the first names the bloc they count toward
 * (none), the second names their registration, which is the question a profile
 * answers (`USABILITY.md` §10.3, D3.9).
 */

import { blocLabel, partyShort, votingBlocSeats } from '../data.js';
import { el } from '../dom.js';
import { INDEPENDENT_PARTY_ID } from '../lib/factions.js';

/** The short label for a party in a list, on a chip, or on a seat tooltip. */
export function shortOf(data, partyId) {
  return partyId === INDEPENDENT_PARTY_ID ? 'Unaligned' : partyShort(data, partyId);
}

/** A party's display name where there is room for it. */
export function longOf(data, partyId) {
  if (partyId === INDEPENDENT_PARTY_ID) return 'No group, no whip';
  return data.partiesById.get(partyId)?.nameEn ?? partyId;
}

/** `'coalition' | 'opposition' | 'unaligned'` — the bucket an MP's vote counts toward. */
export function blocOfMp(data, mp) {
  return blocLabel(data, mp).toLowerCase();
}

/** "Anastassia Kovalenko-Kõlvart" → "AK". First and last initial, uppercased. */
export function initials(name) {
  const parts = String(name).split(/[\s-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.at(-1)?.[0] ?? '')).toUpperCase();
}

/**
 * The initials disc every row and profile wears, on the member's voting-bloc
 * party colour.
 *
 * Photos are deliberately not here yet: they are part of the approved design and
 * arrive with it in PR B. The initials are what the mockups show as the
 * fallback, and they are what works offline, where `api.riigikogu.ee` never
 * answers (`USABILITY.md` §4).
 */
export function avatar(mp, { size = 'md' } = {}) {
  return el('span', {
    className: `dk-avatar dk-avatar-${size}`,
    'aria-hidden': 'true',
    'data-party-id': mp.votingBlocPartyId,
    style: `background:var(--party-${mp.votingBlocPartyId});color:var(--party-${mp.votingBlocPartyId}-text)`,
  }, [initials(mp.name)]);
}

/** The party short name on a solid party-colour badge. */
export function partyBadge(data, partyId, { testid = null, label = null } = {}) {
  return el('span', {
    className: 'dk-party-badge',
    'data-testid': testid,
    'data-party-id': partyId,
    style: `background:var(--party-${partyId});color:var(--party-${partyId}-text)`,
  }, [label ?? shortOf(data, partyId)]);
}

/** `Coalition` / `Opposition` / `Unaligned`, tinted by bloc rather than by party. */
export function blocChip(data, mp, { testid = null } = {}) {
  const bloc = blocOfMp(data, mp);
  return el('span', {
    className: `dk-bloc-chip dk-bloc-${bloc}`,
    'data-testid': testid,
    'data-bloc': bloc,
  }, [blocLabel(data, mp)]);
}

/** The caption under a name in every list: office, else committee, else district. */
export function memberSub(mp) {
  if (mp.boardRole) return mp.boardRole.replace(' of the Riigikogu', '');
  if (mp.factionRole) return mp.factionRole;
  return mp.committees?.[0]?.name ?? mp.district ?? '';
}

/** The office an MP holds, if any — Board first, then the office in their group. */
export function officeOf(mp) {
  return mp.boardRole ?? mp.factionRole ?? null;
}

/** `[{name, role}]` → `"Finance Committee · Legal Affairs Committee (Chairman)"`. */
export function committeeLine(mp) {
  const names = (mp.committees ?? []).map(
    (c) => c.name + (c.role && c.role !== 'member' ? ` (${c.role})` : ''),
  );
  return names.length > 0 ? names.join(' · ') : '—';
}

/** "2026-08-10" → "Aug 2026". */
export function monthYear(iso) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(date);
}

/** "2026-08-12T11:12:59Z" → "12 Aug 2026". */
export function formatUpdated(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(date);
}

/**
 * The amber note an MP's registration earns when it disagrees with their vote.
 *
 * Two sources, never invented: a defector's own `note` from `alignment.json`,
 * and `leftFaction` / `leftFactionDate` from the API for someone who joined
 * nobody. An MP whose registration and vote agree gets no note at all — that is
 * what makes the note mean something (D3.8).
 *
 * @returns {string|null}
 */
export function registrationNote(data, mp) {
  if (mp.defector) {
    return `${mp.defector.note} — registered non-affiliated, counted with `
      + `${shortOf(data, mp.votingBlocPartyId)} in bloc arithmetic.`;
  }
  if (mp.unaligned && mp.leftFaction) {
    const left = data.parties.find((p) => p.factionName === mp.leftFaction)?.short
      ?? String(mp.leftFaction).replace(' Parliamentary Group', '');
    const when = monthYear(mp.leftFactionDate);
    return `Left ${left}${when ? ` in ${when}` : ''} — no group, no whip. `
      + 'Counted in neither bloc.';
  }
  return null;
}

/**
 * What a profile's party chip says.
 *
 * `Non-affiliated` for a member of no group — never the party they used to sit
 * with, which is the one thing a reader must not be told here (D3.9).
 */
export function profilePartyLabel(data, mp) {
  return mp.unaligned ? 'Non-affiliated' : shortOf(data, mp.votingBlocPartyId);
}

/**
 * What a **registration** is called, wherever one is named — the tooltip's
 * "registered …", the popup's role line, the profile's Registered fact.
 *
 * `Non-affiliated` and not `Unaligned`, and the difference is not cosmetic:
 * `Unaligned` is the name of a *bloc* (or rather of belonging to none), and
 * "registered Unaligned" states a bloc where the reader is being told a
 * registration. The registry's own word is the right one.
 */
export function registeredLabel(data, partyId) {
  return partyId === INDEPENDENT_PARTY_ID ? 'Non-affiliated' : partyShort(data, partyId);
}

/**
 * The profile's `Votes with` fact.
 *
 * The three states, said plainly. A member of no group votes with **nobody**:
 * their registration and their voting bloc are both `independent`, so a naive
 * "are these two equal" test calls that `Own group` and tells the reader they
 * are whipped by a group they walked out of (`data/README.md`, the third row of
 * the three-state table).
 */
export function votesWithLabel(data, mp) {
  if (mp.unaligned) return 'Nobody — no group, no whip';
  if (mp.votingBlocPartyId !== mp.registeredPartyId) {
    return `${shortOf(data, mp.votingBlocPartyId)} (defected)`;
  }
  return 'Own group';
}

/** Parties in the order the desktop lists them: largest voting bloc first. */
export function partiesBySize(data) {
  return [...data.parties].sort(
    (a, b) => votingBlocSeats(data, b.id) - votingBlocSeats(data, a.id),
  );
}
