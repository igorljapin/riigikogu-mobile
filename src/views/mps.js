/**
 * Members tab — the 101-MP directory, its search and filters, and the MP popup
 * that the Parliament tab's board buttons also open.
 *
 * Reproduces `BEHAVIOR_SNAPSHOT.md` §3 one for one: a live-filtering search box,
 * three filter chips whose labels carry their own counts, one row per MP with a
 * party-coloured dot, and a bottom sheet whose name is an external link to
 * riigikogu.ee.
 *
 * The one thing that is not a reproduction: an MP's party here is the party
 * they **vote** with, and the popup says so. A defector registered as
 * non-affiliated shows their real bloc, and an MP who joined nobody is labelled
 * `Unaligned` rather than being quietly filed under the opposition.
 */

import { blocLabel, party, partyShort } from '../data.js';
import { closeButton, el, icon, ICONS, openOverlay, replace } from '../dom.js';

const USA_FLAG = '🇺🇸';

const FILTERS = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'usa', label: `${USA_FLAG} USA`, match: (mp) => mp.usaFriendship === true },
  { id: 'chairs', label: 'Chairs', match: (mp) => mp.factionRole === 'Faction Chairman' },
];

/** A small disc in the MP's voting-bloc colour. */
export function partyDot(partyId) {
  return el('span', {
    className: 'party-dot',
    style: `background:var(--party-${partyId})`,
    'aria-hidden': 'true',
  });
}

/** "2026-08-10" → "Aug 2026". */
function monthYear(iso) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(date);
}

/**
 * The amber "Party History" line, for the MPs whose registered group and voting
 * bloc disagree. Built from `leftFaction`/`leftFactionDate` — both API-derived —
 * so it stays true after the next defection with nobody editing a string.
 */
function partyHistory(data, mp) {
  if (!mp.defector && !mp.unaligned) return null;

  const left = data.parties.find((p) => p.factionName === mp.leftFaction)?.short;
  const when = monthYear(mp.leftFactionDate);
  const departure = left && when ? `Left ${left} in ${when}` : 'Left their parliamentary group';

  return mp.defector
    ? `• ${departure} and now votes with ${partyShort(data, mp.defector.votesWith)}`
    : `• ${departure} and remains unaffiliated`;
}

/* ------------------------------------------------------------------ *
 * MP popup — shared with the Parliament tab's board buttons
 * ------------------------------------------------------------------ */

/**
 * Open the bottom sheet for one MP.
 *
 * Exported because the Board of the Riigikogu opens the very same popup; the
 * bundle had two code paths rendering the same thing, and one of them is how a
 * detail like the external-link target goes missing in a redesign.
 */
export function openMpPopup(data, mp) {
  const overlay = openOverlay({ testid: 'mp-popup', label: mp.name });
  const partyRecord = party(data, mp.votingBlocPartyId);
  const role = mp.boardRole ?? mp.factionRole;
  const history = partyHistory(data, mp);

  replace(overlay.header, closeButton(overlay.close, 'mp-popup-close'));

  const photo = el('img', {
    className: 'mp-photo',
    'data-testid': 'mp-photo',
    src: mp.photoUrl,
    alt: '',
    loading: 'lazy',
    // The party-coloured disc shows through whenever the photo does not load —
    // the same fallback the bundle had, without ever rewriting `src`, which the
    // data contract pins to the canonical API URL.
    style: `background:var(--party-${mp.votingBlocPartyId})`,
  });

  replace(overlay.body,
    el('div', { className: 'mp-popup-top' }, [
      photo,
      el('div', { className: 'mp-popup-identity' }, [
        el('a', {
          className: 'mp-profile-link',
          'data-testid': 'mp-profile-link',
          href: mp.profileUrl,
          target: '_blank',
          rel: 'noopener noreferrer',
        }, [mp.name]),
        el('div', { className: 'mp-popup-badges' }, [
          el('span', {
            className: 'party-badge',
            'data-testid': 'mp-party',
            'data-party-id': mp.votingBlocPartyId,
            style: `background:var(--party-${mp.votingBlocPartyId});color:var(--party-${mp.votingBlocPartyId}-text)`,
          }, [partyRecord?.short ?? mp.votingBlocPartyId]),
          el('span', {
            className: `bloc-badge bloc-${blocLabel(data, mp).toLowerCase()}`,
            'data-testid': 'mp-bloc',
          }, [blocLabel(data, mp)]),
        ]),
      ]),
    ]),

    role && el('p', { className: 'mp-popup-role' }, [
      el('span', { className: 'mp-popup-key' }, ['Role: ']), role,
    ]),

    mp.committees.length > 0 && el('div', { className: 'mp-popup-section' }, [
      el('p', { className: 'mp-popup-key' }, ['Committees:']),
      el('div', { className: 'committee-pills' }, mp.committees.map((c) => el('span', {
        className: 'committee-pill',
        'data-testid': 'mp-committee',
        // The role rides along as a tooltip rather than in the pill's text, so
        // the pill reads exactly as `data/mps.json` names the committee.
        title: c.role === 'member' ? c.name : `${c.name} — ${c.role}`,
      }, [c.name]))),
    ]),

    history && el('div', { className: 'mp-popup-section' }, [
      el('p', { className: 'mp-popup-key' }, ['Party History:']),
      el('p', { className: 'party-history', 'data-testid': 'mp-party-history' }, [history]),
    ]),
  );

  return overlay;
}

/* ------------------------------------------------------------------ *
 * The directory
 * ------------------------------------------------------------------ */

function mpRow(data, mp, onOpen) {
  return el('button', {
    type: 'button',
    className: 'mp-row',
    'data-testid': 'mp-row',
    'data-mp-uuid': mp.uuid,
    'data-party-id': mp.votingBlocPartyId,
    onclick: () => onOpen(mp),
  }, [
    el('div', { className: 'mp-row-text' }, [
      el('div', { className: 'mp-row-name' }, [mp.usaFriendship ? `${mp.name} ${USA_FLAG}` : mp.name]),
      el('div', { className: 'mp-row-party' }, [partyDot(mp.votingBlocPartyId), partyShort(data, mp.votingBlocPartyId)]),
    ]),
    icon(ICONS.chevron, { size: 18 }),
  ]);
}

export default function renderMembers(data) {
  let query = '';
  let filterId = 'all';

  const list = el('div', { className: 'mp-list' });
  const empty = el('p', { className: 'mp-empty' }, ['No MP matches that search.']);
  const chipRow = el('div', { className: 'filter-chips' });

  const visible = () => {
    const needle = query.trim().toLowerCase();
    const filter = FILTERS.find((f) => f.id === filterId);
    return data.mps.filter((mp) => filter.match(mp) && mp.name.toLowerCase().includes(needle));
  };

  function paint() {
    const rows = visible();
    replace(list, rows.length === 0 ? [empty] : rows.map((mp) => mpRow(data, mp, (m) => openMpPopup(data, m))));
    for (const chip of chipRow.children) {
      chip.classList.toggle('is-active', chip.dataset.testid === `filter-${filterId}`);
    }
  }

  const search = el('input', {
    type: 'search',
    className: 'mp-search',
    'data-testid': 'mp-search',
    placeholder: 'Search MPs...',
    'aria-label': 'Search MPs',
    autocomplete: 'off',
    oninput: (event) => { query = event.target.value; paint(); },
  });

  // Chip counts are computed from the roster, never typed — the label and the
  // list it produces cannot drift apart.
  replace(chipRow, FILTERS.map((f) => el('button', {
    type: 'button',
    className: 'filter-chip',
    'data-testid': `filter-${f.id}`,
    onclick: () => { filterId = f.id; paint(); },
  }, [`${f.label} (${data.mps.filter(f.match).length})`])));

  paint();

  return el('div', { className: 'view view-members' }, [
    el('div', { className: 'search-wrap' }, [icon(ICONS.search, { size: 18 }), search]),
    chipRow,
    list,
  ]);
}
