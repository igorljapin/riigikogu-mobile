/**
 * Members tab — the 101-MP directory, its search and filters, and the MP
 * profile the Parliament tab's board rows and party sheet also open.
 *
 * Redesigned in Aug 2026 (`docs/redesign-2026-08/`, recorded in USABILITY.md §9):
 * a screen title, a 52px search field, a six-way single-select filter block, a
 * count line, and full-bleed 72px rows carrying the MP's photo. What did **not**
 * change is the thing that matters: an MP's party here is the party they
 * **vote** with, and the profile says so. A defector registered as
 * non-affiliated shows their real bloc, and an MP who joined nobody is labelled
 * `Unaligned` rather than being quietly filed under the opposition.
 *
 * Three places where the design bundle and the Usability Contract disagree, and
 * the contract wins (§9.3, and §7.3 for the rest):
 *
 * - Rows show the **photo with the initials circle as the fallback**, not
 *   initials alone (3.9). The initials are always painted underneath, so a row
 *   is legible before the photo arrives and offline, where it never does.
 * - The party badge reads `Independent`, not `Unaligned`: 3.1–3.5 identify a row
 *   by the party short name `data/parties.json` gives it.
 * - The search placeholder stays `Search MPs...` (1.3, 3.3).
 */

import { blocLabel, party, partyShort } from '../data.js';
import { closeButton, el, icon, ICONS, openOverlay, replace } from '../dom.js';

/** Glyphs only this screen draws; `dom.js` owns the shared set. */
const GLYPH = {
  clear: 'M6 6l12 12M18 6L6 18',
};

/**
 * The six filters, in the order the design lays them out: a four-way segmented
 * control over voting blocs, then two wider role toggles.
 *
 * Every label carries its own count, computed from the roster and never typed —
 * the label and the list it produces cannot drift apart (3.5).
 */
const FILTERS = [
  { id: 'all', row: 'bloc', label: 'All', match: () => true },
  { id: 'coalition', row: 'bloc', label: 'Coalition', match: (mp, data) => blocLabel(data, mp) === 'Coalition' },
  { id: 'opposition', row: 'bloc', label: 'Opposition', match: (mp, data) => blocLabel(data, mp) === 'Opposition' },
  { id: 'unaligned', row: 'bloc', label: 'Unaligned', match: (mp) => mp.unaligned === true },
  { id: 'chairs', row: 'role', label: 'Chairs & officers', match: (mp) => Boolean(mp.factionRole || mp.boardRole) },
  { id: 'usa', row: 'role', label: 'USA friendship group', match: (mp) => mp.usaFriendship === true },
];

/* ------------------------------------------------------------------ *
 * Shared row furniture — also used by the party sheet and the pickers
 * ------------------------------------------------------------------ */

/** "Anastassia Kovalenko-Kõlvart" → "AK". First and last initial, uppercased. */
export function initials(name) {
  const parts = String(name).split(/[\s-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.at(-1)?.[0] ?? '')).toUpperCase();
}

/**
 * The avatar every list row carries: the MP's photo over their initials on the
 * party colour (3.9).
 *
 * The initials are painted by CSS from `--initials`, not by a text node, for two
 * reasons. They are decoration — the name is right beside them — and a text node
 * here would join the row's accessible name and its `innerText`, which is how
 * the Usability Contract identifies a row.
 *
 * `data-avatar` starts at `initials` and flips to `photo` only when the image
 * actually loads, so it always describes what is on screen: photos are served
 * cross-origin by `api.riigikogu.ee` and are deliberately not cached, so offline
 * every row falls back (USABILITY.md §4).
 */
export function avatar(mp, { size = 'md', testid = null } = {}) {
  const letters = initials(mp.name);
  const node = el('span', {
    className: `avatar avatar-${size}`,
    'aria-hidden': 'true',
    'data-testid': testid,
    'data-avatar': 'initials',
    'data-initials': letters,
    style: `--initials:"${letters}";background:var(--party-${mp.votingBlocPartyId});color:var(--party-${mp.votingBlocPartyId}-text)`,
  });

  if (mp.photoUrl) {
    node.append(el('img', {
      className: 'avatar-photo',
      src: mp.photoUrl,
      alt: '',
      loading: 'lazy',
      onload: () => node.setAttribute('data-avatar', 'photo'),
      onerror: () => node.setAttribute('data-avatar', 'initials'),
    }));
  }
  return node;
}

/** The caption under a name in every list: office, else committee, else district. */
export function memberSub(mp) {
  const office = mp.boardRole ? mp.boardRole.replace(' of the Riigikogu', '') : mp.factionRole;
  return office ?? mp.committees[0]?.name ?? mp.district ?? '';
}

/**
 * The party short name on a solid party-colour badge.
 *
 * `Independent` stays `Independent` here rather than becoming the design's
 * `Unaligned`: 3.1–3.5 identify a member row by the party short name
 * `data/parties.json` gives it. The word "Unaligned" does appear — on the bloc
 * chip beside it, which is the question it actually answers.
 */
export function partyBadge(data, partyId, testid = null) {
  return el('span', {
    className: 'party-badge',
    'data-testid': testid,
    'data-party-id': partyId,
    style: `background:var(--party-${partyId});color:var(--party-${partyId}-text)`,
  }, [partyShort(data, partyId)]);
}

/** Name over caption — the middle column of every row in the app. */
export function nameBlock(mp, { nameClass = 'row-name', subClass = 'row-sub' } = {}) {
  const sub = memberSub(mp);
  return el('span', { className: 'row-text' }, [
    el('span', { className: nameClass }, [mp.name]),
    sub && el('span', { className: subClass }, [sub]),
  ]);
}

/* ------------------------------------------------------------------ *
 * MP profile — shared with the board rows and the party sheet
 * ------------------------------------------------------------------ */

/** "2026-08-10" → "Aug 2026". */
function monthYear(iso) {
  const date = new Date(iso);
  if (!iso || Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(date);
}

/**
 * The amber note for the MPs whose registered group and voting bloc disagree.
 * Built from `leftFaction`/`leftFactionDate` — both API-derived — so it stays
 * true after the next defection with nobody editing a string.
 */
function partyHistory(data, mp) {
  if (!mp.defector && !mp.unaligned) return null;

  const left = data.parties.find((p) => p.factionName === mp.leftFaction)?.short;
  const when = monthYear(mp.leftFactionDate);
  const departure = left && when ? `Left ${left} in ${when}` : 'Left their parliamentary group';

  return mp.defector
    ? `${departure} — registered non-affiliated, votes with ${partyShort(data, mp.defector.votesWith)}.`
    : `${departure} — no group, no whip. Counted in neither bloc.`;
}

/** One label/value row of the profile. */
function factRow(key, value) {
  return el('div', { className: 'fact-row' }, [
    el('span', { className: 'fact-key' }, [key]),
    el('span', { className: 'fact-value' }, Array.isArray(value) ? value : [value]),
  ]);
}

/**
 * The committee value: one `mp-committee` element per committee, exactly the
 * name `data/mps.json` gives it, with the role riding alongside rather than
 * inside — 3.7 asserts the pills read as the data does, and the design asks for
 * `Name (role)` joined by ` · `.
 */
function committeeValue(mp) {
  const nodes = [];
  mp.committees.forEach((committee, index) => {
    if (index > 0) nodes.push(' · ');
    nodes.push(el('span', { 'data-testid': 'mp-committee', className: 'committee-name' }, [committee.name]));
    if (committee.role && committee.role !== 'member') nodes.push(` (${committee.role})`);
  });
  return nodes;
}

/**
 * Open one MP's full-screen profile.
 *
 * Exported because the board rows and the party sheet open the very same
 * overlay; the bundle had two code paths rendering the same thing, and one of
 * them is how a detail like the external-link target goes missing in a redesign.
 */
export function openMpPopup(data, mp) {
  const overlay = openOverlay({ testid: 'mp-popup', label: mp.name });
  const bloc = blocLabel(data, mp);
  const history = partyHistory(data, mp);
  const office = mp.boardRole ?? mp.factionRole;

  replace(overlay.header, overlayChrome('Member', overlay.close, 'mp-popup-close'));

  const photo = avatar(mp, { size: 'xl' });
  const image = photo.querySelector('img');
  // The contract pins this element to the canonical API URL (3.7); the initials
  // behind it are what shows when that URL cannot be reached.
  if (image) image.setAttribute('data-testid', 'mp-photo');

  const facts = [
    office && factRow('Office', office),
    mp.district && factRow('District', mp.district),
    mp.committees.length > 0 && factRow('Committees', committeeValue(mp)),
    factRow('Registered', party(data, mp.registeredPartyId)?.nameEn ?? '—'),
    mp.usaFriendship && factRow('Groups', 'Estonia–USA Parliamentary Friendship Group'),
    mp.email && factRow('Email', mp.email),
  ].filter(Boolean);

  replace(overlay.body,
    el('div', { className: 'mp-detail' }, [
      el('div', { className: 'mp-detail-head' }, [
        photo,
        el('div', { className: 'mp-detail-identity' }, [
          // The name is the link the contract follows out to riigikogu.ee (3.6);
          // the footer button below repeats it as the design's explicit CTA.
          el('a', {
            className: 'mp-detail-name mp-profile-link',
            'data-testid': 'mp-profile-link',
            href: mp.profileUrl,
            target: '_blank',
            rel: 'noopener noreferrer',
          }, [mp.name]),
          el('div', { className: 'mp-detail-chips' }, [
            partyBadge(data, mp.votingBlocPartyId, 'mp-party'),
            el('span', {
              className: `bloc-chip bloc-${bloc.toLowerCase()}`,
              'data-testid': 'mp-bloc',
            }, [bloc]),
          ]),
        ]),
      ]),

      history && el('p', { className: 'note-card', 'data-testid': 'mp-party-history' }, [history]),

      el('div', { className: 'fact-rows' }, facts),

      el('a', {
        className: 'cta-link',
        href: mp.profileUrl,
        target: '_blank',
        rel: 'noopener noreferrer',
      }, ['Open riigikogu.ee profile']),
    ]),
  );

  return overlay;
}

/* ------------------------------------------------------------------ *
 * Overlay chrome
 * ------------------------------------------------------------------ */

/**
 * The header bar every full-screen overlay wears: an optional back arrow, the
 * kicker naming what you are looking at, and the `×` that dismisses it.
 *
 * The design draws the dismiss control as a chevron labelled `Back`. It is the
 * `×` here instead, and deliberately: the Usability Contract reaches every
 * overlay through a button whose accessible name is that character (§3, and
 * `tests/helpers/app.js`), and a back arrow that carried the word would also
 * become the first "MP" the picker's tests can see. Chrome carries no text.
 */
export function overlayChrome(kicker, close, closeTestid, back = null) {
  return [
    back,
    el('span', { className: 'overlay-kicker' }, [kicker]),
    closeButton(close, closeTestid),
  ];
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
    avatar(mp, { size: 'md', testid: 'mp-row-avatar' }),
    nameBlock(mp, { nameClass: 'mp-row-name', subClass: 'mp-row-sub' }),
    partyBadge(data, mp.votingBlocPartyId),
  ]);
}

export default function renderMembers(data) {
  let query = '';
  let filterId = 'all';

  const list = el('div', { className: 'mp-list' });
  const count = el('p', { className: 'mp-count', 'data-testid': 'mp-count' });
  const filterBlock = el('div', { className: 'filters' });

  const visible = () => {
    const needle = query.trim().toLowerCase();
    const filter = FILTERS.find((f) => f.id === filterId);
    return data.mps.filter((mp) => filter.match(mp, data) && mp.name.toLowerCase().includes(needle));
  };

  function paint() {
    const rows = visible();

    count.textContent = `${rows.length} member${rows.length === 1 ? '' : 's'}`;
    replace(list, rows.length === 0
      ? [el('p', { className: 'mp-empty' }, [`No member matches “${query.trim()}”.`])]
      : rows.map((mp) => mpRow(data, mp, (m) => openMpPopup(data, m))));

    // Single-select, always exactly one active (3.10). `data-active` is the
    // state; the classes only paint it.
    for (const button of filterBlock.querySelectorAll('[data-testid^="filter-"]')) {
      const active = button.dataset.testid === `filter-${filterId}`;
      button.setAttribute('data-active', String(active));
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-active', active);
    }
    clear.hidden = query.length === 0;
  }

  const search = el('input', {
    type: 'search',
    className: 'mp-search',
    'data-testid': 'mp-search',
    // Kept from the shipped app: 1.3 and 3.3 find the field by this placeholder.
    placeholder: 'Search MPs...',
    'aria-label': 'Search members',
    autocomplete: 'off',
    oninput: (event) => { query = event.target.value; paint(); },
  });

  const clear = el('button', {
    type: 'button',
    className: 'search-clear',
    'aria-label': 'Clear search',
    hidden: true,
    onclick: () => { search.value = ''; query = ''; paint(); search.focus(); },
  }, [icon(GLYPH.clear, { size: 15 })]);

  const filterButton = (filter) => el('button', {
    type: 'button',
    className: `filter filter-${filter.row}`,
    'data-testid': `filter-${filter.id}`,
    'data-active': 'false',
    'aria-pressed': 'false',
    onclick: () => { filterId = filter.id; paint(); },
  }, [
    el('span', { className: 'filter-label' }, [filter.label]),
    el('span', { className: 'filter-count' }, [`(${data.mps.filter((mp) => filter.match(mp, data)).length})`]),
  ]);

  replace(filterBlock,
    el('div', { className: 'segmented', role: 'group', 'aria-label': 'Voting bloc' },
      FILTERS.filter((f) => f.row === 'bloc').map(filterButton)),
    el('div', { className: 'filter-pair', role: 'group', 'aria-label': 'Role' },
      FILTERS.filter((f) => f.row === 'role').map(filterButton)),
  );

  paint();

  return el('div', { className: 'view view-members' }, [
    el('div', { className: 'screen-head' }, [
      el('h1', { className: 'screen-title' }, ['Members']),
      el('div', { className: 'search-wrap' }, [icon(ICONS.search, { size: 20 }), search, clear]),
    ]),
    filterBlock,
    count,
    list,
  ]);
}
