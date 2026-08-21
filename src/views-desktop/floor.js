/**
 * The session-hall floor plan — the one component Parliament and the Calculator
 * both render, so the grid is identical between them and a seat cannot mean two
 * different things on two screens.
 *
 * What differs between the two views is only *state*: Parliament lights seats by
 * party highlight, the Calculator by whether a member is counted. Both are
 * expressed as a single `data-seat-state` attribute per tile, which is what the
 * Usability Contract's tests read and what `desktop.css` paints. Keeping the
 * state in an attribute rather than in a class is deliberate: PR B rewrites
 * every rule in that stylesheet, and none of those rewrites may change what a
 * test observes (`USABILITY.md` §10, and the `4dae72b` lesson in `CLAUDE.md`).
 *
 * Two things every caller inherits:
 *
 * - **Colour is the party a member votes with**, never the party they are
 *   registered under (D2.2). Registration appears in exactly one place on the
 *   floor: the defector dot, in the *registered* party's colour (D2.3).
 * - **One tooltip node for the whole grid** (D2.4). 101 tooltips is 101 nodes
 *   the browser lays out to show at most one of.
 */

import { el, replace } from '../dom.js';
import { blocOfMp, registeredLabel, shortOf } from './parts.js';

/**
 * Seat states, as the contract describes them:
 *
 * | value         | Parliament                     | Calculator                    |
 * |---------------|--------------------------------|-------------------------------|
 * | `default`     | nothing highlighted            | —                             |
 * | `highlighted` | this party is highlighted      | —                             |
 * | `dimmed`      | some other party is            | not counted                   |
 * | `counted`     | —                              | in the count                  |
 * | `held`        | —                              | held out of a selected party  |
 */
export const SEAT_STATE = Object.freeze({
  default: 'default',
  highlighted: 'highlighted',
  dimmed: 'dimmed',
  counted: 'counted',
  held: 'held',
});

/** What the shared tooltip says about one member. */
function tooltipLines(data, mp) {
  const votesWith = shortOf(data, mp.votingBlocPartyId);
  const bloc = blocOfMp(data, mp);
  const blocWord = bloc.charAt(0).toUpperCase() + bloc.slice(1);

  // A defector is the one member whose two parties disagree, so they are the
  // one member whose tooltip has to name both. The second half is a
  // *registration*, so it takes the registry's word — `Non-affiliated`, never
  // the bloc word `Unaligned`.
  const party = mp.defector
    ? `Votes with ${votesWith} · registered ${registeredLabel(data, mp.registeredPartyId)}`
    : votesWith;

  const office = mp.boardRole
    ? mp.boardRole.replace(' of the Riigikogu', '')
    : mp.factionRole;

  return [mp.name, [party, blocWord, office].filter(Boolean).join(' · ')];
}

/**
 * Build a floor plan.
 *
 * @param {object} ctx            `{ data, grid }`
 * @param {object} options
 * @param {string} options.prefix `seat-` on Parliament, `calc-seat-` on the Calculator
 * @param {(mp: object) => string} options.stateOf  the tile's `data-seat-state`
 * @param {(mp: object) => void} options.onSelect   click handler for an occupied tile
 * @returns {{node: HTMLElement, repaint: () => void}} `repaint` re-reads
 *   `stateOf` for every tile without rebuilding the grid — the calculator calls
 *   it on every click, and rebuilding 120 nodes per click would throw away the
 *   hovered tile mid-hover.
 */
export function createFloor({ data, grid }, { prefix, stateOf, onSelect }) {
  const tiles = [];
  const tooltip = el('div', {
    className: 'dk-seat-tooltip',
    'data-testid': 'seat-tooltip',
    role: 'tooltip',
    hidden: true,
  });

  const showTooltip = (mp) => {
    const [name, sub] = tooltipLines(data, mp);
    replace(tooltip,
      el('span', { className: 'dk-tooltip-name' }, [name]),
      el('span', { className: 'dk-tooltip-sub' }, [sub]),
    );
    // Positioned from the tile's own cell so one node can serve the whole grid.
    const seat = grid.seatOf(mp.uuid);
    if (seat) {
      tooltip.style.setProperty('--seat-row', String(seat.row));
      tooltip.style.setProperty('--seat-col', String(seat.col));
    }
    tooltip.hidden = false;
  };

  const cells = grid.cells.map(({ row, col, mp }) => {
    if (!mp) {
      // Kept, not skipped: 19 of the 120 cells are empty and the remaining 101
      // must not reflow into a solid block that no longer matches the room.
      return el('span', {
        className: 'dk-seat dk-seat-empty',
        'aria-hidden': 'true',
        'data-empty': 'true',
      });
    }

    const tile = el('button', {
      type: 'button',
      className: 'dk-seat',
      'data-testid': `${prefix}${mp.uuid}`,
      'data-mp-uuid': mp.uuid,
      'data-party-id': mp.votingBlocPartyId,
      'data-bloc': blocOfMp(data, mp),
      'data-row': String(row),
      'data-col': String(col),
      'data-seat-state': stateOf(mp),
      // The floor is a picture; the name beside the tile is 9px and decorative,
      // so the accessible name has to carry what the tooltip shows.
      'aria-label': tooltipLines(data, mp).join(' — '),
      style: `background:var(--party-${mp.votingBlocPartyId});color:var(--party-${mp.votingBlocPartyId}-text)`,
      onclick: () => onSelect(mp),
      onmouseenter: () => showTooltip(mp),
      onmouseleave: () => { tooltip.hidden = true; },
      onfocus: () => showTooltip(mp),
      onblur: () => { tooltip.hidden = true; },
    }, [
      el('span', { className: 'dk-seat-name' }, [mp.name]),
      // Present only where registration and vote disagree, in the *registered*
      // party's colour — the only place the floor shows registration at all.
      mp.defector && el('span', {
        className: 'dk-seat-defector',
        'data-testid': `seat-defector-${mp.uuid}`,
        'aria-hidden': 'true',
        'data-party-id': mp.registeredPartyId,
        style: `background:var(--party-${mp.registeredPartyId})`,
      }),
    ]);

    tiles.push({ mp, tile });
    return tile;
  });

  const node = el('div', {
    className: 'dk-floor',
    style: `--floor-cols:${grid.cols};--floor-rows:${grid.rows}`,
  }, [
    // The hook is on the grid itself, not on a wrapper: a spec that counts its
    // children is then counting cells, without reaching for a class name that
    // PR B is free to rename.
    el('div', {
      className: 'dk-floor-grid',
      'data-testid': 'floor-grid',
      'data-rows': String(grid.rows),
      'data-cols': String(grid.cols),
    }, cells),
    tooltip,
  ]);

  return {
    node,
    repaint() {
      for (const { mp, tile } of tiles) tile.setAttribute('data-seat-state', stateOf(mp));
    },
  };
}

/**
 * The mini floor plan on a member's profile: the same geometry, every cell
 * inert, and exactly one of them theirs (D3.10).
 */
export function seatLocator({ grid }, mp) {
  const seat = grid.seatOf(mp.uuid);

  return el('div', {
    className: 'dk-locator',
    'data-testid': 'mp-seat-locator',
    'data-rows': String(grid.rows),
    'data-cols': String(grid.cols),
    'data-seat': seat ? `${seat.row}:${seat.col}` : 'none',
    role: 'img',
    'aria-label': seat
      ? `Seat: row ${seat.row + 1}, column ${seat.col + 1} of the ${grid.rows} × ${grid.cols} floor grid`
      : 'No seat recorded',
    style: `--floor-cols:${grid.cols};--floor-rows:${grid.rows}`,
  }, grid.cells.map((cell) => {
    const self = cell.mp?.uuid === mp.uuid;
    return el('span', {
      className: 'dk-locator-cell',
      'data-self': self ? 'true' : null,
      'data-empty': cell.mp ? null : 'true',
      style: self
        ? `background:var(--party-${mp.votingBlocPartyId})`
        : null,
    });
  }));
}

/** "Row 8, column 9 of the 10 × 12 floor grid", or the honest alternative. */
export function seatLabel(grid, mp) {
  const seat = grid.seatOf(mp.uuid);
  return seat
    ? `Row ${seat.row + 1}, column ${seat.col + 1} of the ${grid.rows} × ${grid.cols} floor grid`
    : 'No seat recorded';
}
