/**
 * Directory — all 101 members, the filters that narrow them, and the profile of
 * whichever one is selected.
 *
 * The filter model is the mockups' and it has one rule worth stating out loud:
 * the **bloc** control (All / Coalition / Opposition / Unaligned) and the two
 * **tag** filters (Chairs & officers, USA friendship group) are one
 * single-select, not two composable ones. Picking a tag filter replaces the bloc
 * filter rather than intersecting with it (D3.5) — "the chairs" is a list people
 * want whole, and "the coalition's chairs" is a question nobody asked. Search
 * *does* compose, with whichever of the six is active (D3.2).
 *
 * A member's party here is the party they **vote** with. The one place
 * registration surfaces is the note card and the Registered fact, and for a
 * member of no group the chip reads `Non-affiliated` rather than the party they
 * used to sit with (D3.8, D3.9).
 */

import { el, icon, ICONS, replace } from '../dom.js';
import { seatLabel, seatLocator } from './floor.js';
import {
  avatar,
  blocChip,
  blocOfMp,
  committeeLine,
  memberSub,
  officeOf,
  partyBadge,
  profilePartyLabel,
  registeredLabel,
  registrationNote,
  votesWithLabel,
} from './parts.js';

/**
 * The six filters. Every one of them is a predicate over the roster and nothing
 * else — no filter knows a name, a count or a party id it was told about.
 */
const FILTERS = [
  { id: 'bloc-all', testid: 'filter-bloc-all', row: 'bloc', label: 'All', match: () => true },
  { id: 'bloc-coalition', testid: 'filter-bloc-coalition', row: 'bloc', label: 'Coalition', match: (mp, data) => blocOfMp(data, mp) === 'coalition' },
  { id: 'bloc-opposition', testid: 'filter-bloc-opposition', row: 'bloc', label: 'Opposition', match: (mp, data) => blocOfMp(data, mp) === 'opposition' },
  { id: 'bloc-unaligned', testid: 'filter-bloc-unaligned', row: 'bloc', label: 'Unaligned', match: (mp) => mp.unaligned === true },
  { id: 'chairs', testid: 'filter-chairs', row: 'tag', label: 'Chairs & officers', match: (mp) => Boolean(mp.factionRole || mp.boardRole) },
  { id: 'usa', testid: 'filter-usa', row: 'tag', label: 'USA friendship group', match: (mp) => mp.usaFriendship === true },
];

/** One label/value tile of the profile's fact grid. */
function fact(label, value) {
  return el('div', {
    className: 'dk-fact',
    'data-testid': `mp-fact-${label.toLowerCase().replace(/\s+/g, '-')}`,
  }, [
    el('span', { className: 'dk-fact-key' }, [label]),
    el('span', { className: 'dk-fact-value' }, [value]),
  ]);
}

export default function renderDirectory(ctx) {
  const { data, state } = ctx;
  const own = state.directory;

  const list = el('div', { className: 'dk-mp-list' });
  const count = el('p', { className: 'dk-mp-count', 'data-testid': 'mp-result-count' });
  const profile = el('section', { className: 'dk-card dk-profile' });

  const visible = () => {
    const needle = own.query.trim().toLowerCase();
    const filter = FILTERS.find((f) => f.id === own.filter) ?? FILTERS[0];
    return data.mps.filter(
      (mp) => filter.match(mp, data) && mp.name.toLowerCase().includes(needle),
    );
  };

  /* ---- the profile pane ------------------------------------------- */

  function paintProfile() {
    const mp = data.mpsByUuid.get(own.selected) ?? data.mps[0];
    if (!mp) return;

    const note = registrationNote(data, mp);
    const office = officeOf(mp);

    replace(profile,
      el('div', { className: 'dk-profile-head' }, [
        avatar(mp, { size: 'xl' }),
        el('div', { className: 'dk-profile-identity' }, [
          el('h2', { className: 'dk-profile-name', 'data-testid': 'mp-profile-name' }, [mp.name]),
          el('div', { className: 'dk-profile-chips' }, [
            partyBadge(data, mp.votingBlocPartyId, {
              testid: 'mp-profile-party',
              label: profilePartyLabel(data, mp),
            }),
            blocChip(data, mp, { testid: 'mp-profile-bloc' }),
          ]),
        ]),
        el('a', {
          className: 'dk-profile-cta',
          'data-testid': 'mp-external-profile',
          href: mp.profileUrl,
          // riigikogu.ee is somebody else's site: a new tab, and never handed
          // a window handle back into this one (D3.7).
          target: '_blank',
          rel: 'noopener noreferrer',
        }, ['Open riigikogu.ee profile']),
      ]),

      // Present only where registration and vote disagree — which is what makes
      // it worth reading when it is there (D3.8).
      note && el('p', { className: 'dk-note', 'data-testid': 'mp-note' }, [note]),

      el('div', { className: 'dk-facts' }, [
        office && fact('Office', office),
        fact('District', mp.district ?? '—'),
        fact('Registered', data.partiesById.get(mp.registeredPartyId)?.nameEn
          ?? registeredLabel(data, mp.registeredPartyId)),
        fact('Committees', committeeLine(mp)),
        fact('Votes with', votesWithLabel(data, mp)),
        fact('Email', mp.email ?? '—'),
      ].filter(Boolean)),

      el('div', { className: 'dk-locator-block' }, [
        seatLocator(ctx, mp),
        el('div', { className: 'dk-locator-text' }, [
          el('span', { className: 'dk-kicker' }, ['Seat on the floor']),
          el('span', {}, [seatLabel(ctx.grid, mp)]),
        ]),
      ]),
    );
  }

  /* ---- the list ---------------------------------------------------- */

  function memberRow(mp) {
    return el('button', {
      type: 'button',
      className: 'dk-mp-row',
      'data-testid': `mp-row-${mp.uuid}`,
      'data-mp-uuid': mp.uuid,
      'data-party-id': mp.votingBlocPartyId,
      'data-selected': String(mp.uuid === own.selected),
      onclick: () => {
        own.selected = mp.uuid;
        paint();
      },
    }, [
      avatar(mp),
      el('span', { className: 'dk-mp-text' }, [
        el('span', { className: 'dk-mp-name', 'data-testid': 'mp-name' }, [mp.name]),
        el('span', { className: 'dk-mp-sub' }, [memberSub(mp)]),
      ]),
      partyBadge(data, mp.votingBlocPartyId),
    ]);
  }

  function paint() {
    const rows = visible();

    count.textContent = `${rows.length} member${rows.length === 1 ? '' : 's'}`;
    replace(list, rows.length === 0
      ? [el('p', { className: 'dk-mp-empty', 'data-testid': 'mp-empty' },
        [`No member matches “${own.query.trim()}”.`])]
      : rows.map(memberRow));

    // Single-select across all six: `data-active` is the state, the classes only
    // paint it. Exactly one is ever true (D3.4, D3.5).
    for (const button of filterButtons) {
      const active = button.dataset.filterId === own.filter;
      button.setAttribute('data-active', String(active));
      button.setAttribute('aria-pressed', String(active));
    }

    paintProfile();
  }

  /* ---- controls ---------------------------------------------------- */

  const search = el('input', {
    type: 'search',
    className: 'dk-search',
    'data-testid': 'mp-search',
    placeholder: `Search ${data.meta.totalSeats} members`,
    'aria-label': 'Search members',
    autocomplete: 'off',
    value: own.query,
    oninput: (event) => { own.query = event.target.value; paint(); },
  });

  const filterButtons = FILTERS.map((filter) => el('button', {
    type: 'button',
    className: `dk-filter dk-filter-${filter.row}`,
    'data-testid': filter.testid,
    'data-filter-id': filter.id,
    'data-active': 'false',
    'aria-pressed': 'false',
    onclick: () => {
      // A tag filter toggles back to `All` rather than to nothing: there is no
      // such thing as an empty filter here, only a wider one.
      own.filter = own.filter === filter.id && filter.row === 'tag' ? 'bloc-all' : filter.id;
      paint();
    },
  }, [
    el('span', { className: 'dk-filter-label' }, [filter.label]),
    el('span', { className: 'dk-filter-count' },
      [`(${data.mps.filter((mp) => filter.match(mp, data)).length})`]),
  ]));

  const byRow = (row) => filterButtons.filter((_, i) => FILTERS[i].row === row);

  paint();

  return el('div', { className: 'dk-view dk-view-directory' }, [
    el('section', { className: 'dk-card dk-list-pane' }, [
      el('div', { className: 'dk-search-wrap' }, [icon(ICONS.search, { size: 20 }), search]),
      el('div', { className: 'dk-segmented', role: 'group', 'aria-label': 'Voting bloc' }, byRow('bloc')),
      el('div', { className: 'dk-tag-filters', role: 'group', 'aria-label': 'Role' }, byRow('tag')),
      count,
      list,
    ]),
    profile,
  ]);
}
