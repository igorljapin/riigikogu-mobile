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

/**
 * The three rail glyphs, which the mobile `ICONS` set has no equivalent for —
 * the artboards draw a session-hall dome, not the mobile app's office block.
 *
 * They live here rather than in `src/dom.js` because that module is the mobile
 * app's and is reused untouched (`USABILITY.md` §10.5); `icon()` itself is what
 * is shared. Everything else the desktop surface draws — the chevron and the
 * search glass — is already in `ICONS` and is imported from there.
 */
export const RAIL_ICONS = Object.freeze({
  parliament: 'M3 20h18M4 20a8 8 0 0 1 16 0M8 20v-3.4M12 20v-4.6M16 20v-3.4',
  directory: 'M9.5 5.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6M3.5 19.5a6 6 0 0 1 12 0'
    + 'M15.5 6.2a2.6 2.6 0 0 1 0 5.2M17 19.5a5 5 0 0 0-2.4-4.3',
  calculator: 'M5 2.5h14v19H5zM8.5 6.5h7M9 12h.01M12 12h.01M15 12h.01'
    + 'M9 16.5h.01M12 16.5h.01M15 16.5h.01',
});

/** The short label for a party in a list, on a chip, or on a seat tooltip. */
export function shortOf(data, partyId) {
  return partyId === INDEPENDENT_PARTY_ID ? 'Unaligned' : partyShort(data, partyId);
}

/**
 * The line under a party's name in "Parties by voting bloc": which side it sits
 * on, and what it is called in full.
 *
 * The party-less bucket gets neither, because it has neither — `No group, no
 * whip` is the whole fact about it, and naming a bloc there would file nine
 * members under a side that has never spoken for them.
 */
export function partySubLine(data, partyId) {
  if (partyId === INDEPENDENT_PARTY_ID) return 'No group, no whip';
  const bloc = data.alignment.blocs[partyId] ?? null;
  const side = bloc ? bloc.charAt(0).toUpperCase() + bloc.slice(1) : 'Unaligned';
  return `${side} · ${data.partiesById.get(partyId)?.nameEn ?? partyId}`;
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
 * The disc — or rounded square — every row, popup and profile wears: the
 * member's photo over their initials, on the party colour they vote with.
 *
 * The initials are painted by CSS from `--initials` rather than by a text node,
 * the same choice `src/views/mps.js` makes on the mobile side and for the same
 * reason: they are decoration, the name is right beside them, and a text node
 * here would join the row's accessible name and its `innerText`.
 *
 * `data-avatar` starts at `initials` and flips to `photo` only once the image
 * has actually loaded, so the attribute always describes what is on screen.
 * That matters more here than anywhere: the photos are served cross-origin by
 * `api.riigikogu.ee` and are deliberately not cached, so offline every avatar
 * falls back to the letters (`USABILITY.md` §4, and `DESIGN_NOTES.md`, which
 * is why the artboards were captured showing the fallback).
 *
 * `eager` is for the avatars already on screen when a list paints; the rest
 * stay lazy so a fresh list does not fetch a hundred portraits at once.
 */
export function avatar(mp, { size = 'md', eager = false } = {}) {
  const letters = initials(mp.name);
  const node = el('span', {
    className: `dk-avatar dk-avatar-${size}`,
    'aria-hidden': 'true',
    'data-avatar': 'initials',
    'data-party-id': mp.votingBlocPartyId,
    style: `--initials:"${letters}";`
      + `background:var(--party-${mp.votingBlocPartyId});`
      + `color:var(--party-${mp.votingBlocPartyId}-text)`,
  });

  if (mp.photoUrl) {
    node.append(el('img', {
      className: 'dk-avatar-photo',
      src: mp.photoUrl,
      alt: '',
      loading: eager ? 'eager' : 'lazy',
      fetchpriority: eager ? 'high' : 'auto',
      decoding: 'async',
      onload: () => node.setAttribute('data-avatar', 'photo'),
      onerror: () => node.setAttribute('data-avatar', 'initials'),
    }));
  }
  return node;
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

/** Where a bloc sits in the legend: government, then the whipless, then the rest. */
const BLOC_ORDER = Object.freeze({ coalition: 0, unaligned: 1, opposition: 2 });

/**
 * Parties in the order the legend under the floor plan reads them: coalition,
 * then the party-less, then opposition, each group largest first.
 *
 * The legend is a key to the room, so it is ordered the way the room is
 * argued about. The side card's list is ordered by size instead — a different
 * question, deliberately answered differently.
 */
export function partiesByBloc(data) {
  const rank = (partyId) => (partyId === INDEPENDENT_PARTY_ID
    ? BLOC_ORDER.unaligned
    : BLOC_ORDER[data.alignment.blocs[partyId] ?? 'unaligned']);

  return partiesBySize(data).sort((a, b) => rank(a.id) - rank(b.id));
}
