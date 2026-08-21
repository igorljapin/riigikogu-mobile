/**
 * Parliament — the session-hall floor plan, the composition of the house by
 * voting bloc, and the Board.
 *
 * Every number on this screen is a **voting-bloc** count, and there are three
 * buckets rather than two: the nine members who belong to no group have no whip
 * and are counted toward neither side (`data/README.md`, `USABILITY.md` §10.5).
 * That is not a presentational choice — the retiring desktop app filed all of
 * them under Opposition and credited it with nine votes it does not have, which
 * is one of the reasons this surface exists.
 *
 * The party highlight is new with the Aug-2026 desktop design (D2.7–D2.9). Two
 * controls drive it — the rows in "Parties by voting bloc" and the legend chips
 * under the grid — and they share **one** piece of state, so a party lit from
 * one control reads as lit on the other. It is additive across parties, and it
 * is emphatically not the calculator's selection: the two states never meet
 * (D2.9), because "show me where SDE sits" and "would SDE's votes pass this" are
 * different questions.
 */

import { buckets, votingBlocSeats } from '../data.js';
import { el, icon, ICONS, replace } from '../dom.js';
import { createFloor, SEAT_STATE } from './floor.js';
import { longOf, partiesBySize, registeredLabel, shortOf } from './parts.js';

/* ------------------------------------------------------------------ *
 * Composition — the header figure and the stacked bloc bar
 * ------------------------------------------------------------------ */

function composition(data) {
  const { meta } = data;
  const groups = buckets(data);
  const coalition = groups.find((b) => b.id === 'coalition');
  const order = ['coalition', 'unaligned', 'opposition'];
  const byId = Object.fromEntries(groups.map((b) => [b.id, b]));
  const share = (seats) => `${(seats / meta.totalSeats) * 100}%`;

  return el('div', { className: 'dk-composition' }, [
    el('p', { className: 'dk-standing' }, [
      el('span', { className: 'dk-standing-figure', 'data-testid': 'coalition-total' },
        [String(coalition.seats)]),
      el('span', { className: 'dk-standing-of' }, [`of ${meta.totalSeats} coalition seats`]),
    ]),

    el('div', {
      className: 'dk-bloc-bar',
      'data-testid': 'bloc-bar',
      'data-total': String(meta.totalSeats),
      role: 'img',
      'aria-label': `${groups.map((b) => `${b.label} ${b.seats}`).join(', ')} of ${meta.totalSeats} seats`,
    }, [
      ...order.map((id) => el('span', {
        className: `dk-bloc-segment dk-bloc-${id}`,
        'data-testid': `bloc-segment-${id}`,
        'data-seats': String(byId[id].seats),
        style: `width:${share(byId[id].seats)}`,
      })),
      // Positioned from meta.simpleMajority. Nothing on this screen is a literal.
      el('span', {
        className: 'dk-majority-marker',
        'data-testid': 'majority-marker',
        'data-threshold': String(meta.simpleMajority),
        style: `left:${share(meta.simpleMajority)}`,
      }, [el('span', { className: 'dk-majority-label' }, [`${meta.simpleMajority}-vote majority`])]),
    ]),

    el('div', { className: 'dk-bloc-legend' }, order.map((id) => el('span', {
      className: 'dk-bloc-legend-item',
    }, [
      el('span', { className: `dk-swatch dk-bloc-${id}`, 'aria-hidden': 'true' }),
      el('span', {}, [byId[id].label]),
      el('span', { className: 'dk-legend-value', 'data-testid': `bloc-total-${id}` },
        [String(byId[id].seats)]),
    ]))),
  ]);
}

/* ------------------------------------------------------------------ *
 * The view
 * ------------------------------------------------------------------ */

export default function renderParliament(ctx) {
  const { data, grid, state, goToProfile } = ctx;
  const parties = partiesBySize(data);

  /** The one highlight state both controls read and write (D2.7). */
  const lit = () => state.parliament.highlight;
  const isLit = (partyId) => lit().includes(partyId);

  function toggleParty(partyId) {
    state.parliament.highlight = isLit(partyId)
      ? lit().filter((id) => id !== partyId)
      : [...lit(), partyId];
    // A highlight is a statement about the whole floor; leaving one seat's
    // popup open on top of it would contradict it.
    closePopup();
    repaint();
  }

  /* ---- the floor ------------------------------------------------- */

  const floor = createFloor(ctx, {
    prefix: 'seat-',
    stateOf: (mp) => {
      if (lit().length === 0) return SEAT_STATE.default;
      return isLit(mp.votingBlocPartyId) ? SEAT_STATE.highlighted : SEAT_STATE.dimmed;
    },
    onSelect: (mp) => openPopup(mp),
  });

  const caption = el('p', { className: 'dk-floor-caption', 'data-testid': 'floor-caption' });

  /* ---- the seat popup -------------------------------------------- */

  const popupSlot = el('div', { className: 'dk-popup-slot' });

  function closePopup() {
    // Removed from the DOM, never hidden: that is what lets a test assert an
    // overlay is *gone*, and it keeps exactly one close control reachable
    // (USABILITY.md §3, restated for this surface by D2.5).
    replace(popupSlot);
  }

  function openPopup(mp) {
    const office = mp.boardRole ?? mp.factionRole
      ?? (mp.defector
        // `Non-affiliated`, not `Unaligned`: this line states a registration,
        // and `Unaligned` is the name of a bloc.
        ? `Registered ${registeredLabel(data, mp.registeredPartyId)} · votes with ${shortOf(data, mp.votingBlocPartyId)}`
        : 'Member');

    replace(popupSlot, el('div', {
      className: 'dk-popup',
      'data-testid': 'seat-popup',
      'data-overlay': 'true',
      'data-mp-uuid': mp.uuid,
      role: 'dialog',
      'aria-label': mp.name,
    }, [
      el('div', { className: 'dk-popup-head' }, [
        el('span', { className: 'dk-popup-name', 'data-testid': 'seat-popup-name' }, [mp.name]),
        el('button', {
          type: 'button',
          className: 'dk-popup-close',
          'data-testid': 'seat-popup-close',
          'aria-label': `Close ${mp.name}`,
          onclick: closePopup,
        }, ['×']),
      ]),
      el('p', { className: 'dk-popup-role' }, [office]),
      el('p', { className: 'dk-popup-committees' }, [
        (mp.committees ?? []).map((c) => c.name).join(' · ') || '—',
      ]),
      el('p', { className: 'dk-popup-district' }, [mp.district ?? '—']),
      el('button', {
        type: 'button',
        className: 'dk-popup-cta',
        'data-testid': 'seat-popup-open-profile',
        // Leaves the floor behind entirely: search, filter and highlight all
        // reset, so the Directory opens on this member and nothing else (D2.6).
        onclick: () => goToProfile(mp.uuid),
      }, ['Open full profile', icon(ICONS.chevron, { size: 17 })]),
    ]));
  }

  /* ---- parties by voting bloc ------------------------------------ */

  const clear = el('button', {
    type: 'button',
    className: 'dk-clear',
    'data-testid': 'party-highlight-clear',
    onclick: () => {
      state.parliament.highlight = [];
      closePopup();
      repaint();
    },
  }, ['Clear']);

  const partyRows = parties.map((party) => el('button', {
    type: 'button',
    className: 'dk-party-row',
    'data-testid': `party-row-${party.id}`,
    'data-party-id': party.id,
    'data-active': 'false',
    'aria-pressed': 'false',
    onclick: () => toggleParty(party.id),
  }, [
    el('span', { className: 'dk-party-swatch', 'aria-hidden': 'true', style: `background:var(--party-${party.id})` }),
    el('span', { className: 'dk-party-text' }, [
      el('span', { className: 'dk-party-name' }, [
        party.id === 'independent' ? 'Unaligned members' : party.short,
      ]),
      el('span', { className: 'dk-party-sub' }, [longOf(data, party.id)]),
    ]),
    el('span', { className: 'dk-party-seats' }, [String(votingBlocSeats(data, party.id))]),
  ]));

  const legendChips = parties.map((party) => el('button', {
    type: 'button',
    className: 'dk-party-chip',
    'data-testid': `party-chip-${party.id}`,
    'data-party-id': party.id,
    'data-active': 'false',
    'aria-pressed': 'false',
    onclick: () => toggleParty(party.id),
  }, [
    el('span', { className: 'dk-party-swatch', 'aria-hidden': 'true', style: `background:var(--party-${party.id})` }),
    el('span', {}, [shortOf(data, party.id)]),
    el('span', { className: 'dk-chip-seats' }, [String(votingBlocSeats(data, party.id))]),
  ]));

  /* ---- the Board -------------------------------------------------- */

  const boardRows = data.board.map((officer) => el('button', {
    type: 'button',
    className: 'dk-board-row',
    'data-testid': `board-row-${officer.uuid}`,
    // The officer's *registered* party: a Board seat is a procedural office,
    // not a statement about how they vote.
    'data-party-id': officer.partyId,
    onclick: () => goToProfile(officer.uuid),
  }, [
    el('span', { className: 'dk-board-bar', 'aria-hidden': 'true', style: `background:var(--party-${officer.partyId})` }),
    el('span', { className: 'dk-board-text' }, [
      el('span', { className: 'dk-board-name' }, [officer.name]),
      el('span', { className: 'dk-board-role' }, [officer.role]),
    ]),
    icon(ICONS.chevron, { size: 18 }),
  ]));

  /* ---- painting --------------------------------------------------- */

  function repaint() {
    floor.repaint();

    for (const button of [...partyRows, ...legendChips]) {
      const active = isLit(button.dataset.partyId);
      button.setAttribute('data-active', String(active));
      button.setAttribute('aria-pressed', String(active));
    }

    const highlighted = lit();
    // Visibility only, never presence: `Clear` keeps its box whether or not it
    // is showing, so lighting a party cannot reflow the list under the cursor
    // (D2.8).
    clear.setAttribute('data-visible', String(highlighted.length > 0));

    caption.textContent = highlighted.length === 0
      ? 'Click a party to highlight its members on the floor. '
        + 'Tiles are coloured by the party a member votes with.'
      : `${highlighted.map((id) => shortOf(data, id)).join(' + ')} — `
        + `${highlighted.reduce((n, id) => n + votingBlocSeats(data, id), 0)} `
        + `of ${data.meta.totalSeats} seats highlighted`;
  }

  repaint();

  return el('div', { className: 'dk-view dk-view-parliament' }, [
    el('section', { className: 'dk-card dk-floor-card' }, [
      el('div', { className: 'dk-card-head' }, [
        el('div', {}, [
          el('h2', { className: 'dk-card-title' }, ['Session hall seating plan']),
          el('p', { className: 'dk-card-sub' }, ['Layout from riigikogu.ee · coloured by voting bloc party']),
        ]),
        el('p', { className: 'dk-floor-key' }, [
          el('span', { className: 'dk-key-dot', 'aria-hidden': 'true' }),
          'registered elsewhere · hover a seat, click for the profile',
        ]),
      ]),
      floor.node,
      el('div', { className: 'dk-legend' }, legendChips),
      caption,
      popupSlot,
    ]),

    el('div', { className: 'dk-side' }, [
      el('section', { className: 'dk-card' }, [
        el('div', { className: 'dk-card-head' }, [
          el('h2', { className: 'dk-card-title dk-kicker' }, ['Parties by voting bloc']),
          clear,
        ]),
        el('div', { className: 'dk-party-rows' }, partyRows),
      ]),

      el('section', { className: 'dk-card' }, [
        el('h2', { className: 'dk-card-title dk-kicker' }, ['Board of the Riigikogu']),
        el('div', { className: 'dk-board-rows' }, boardRows),
      ]),
    ]),
  ]);
}

export { composition };
