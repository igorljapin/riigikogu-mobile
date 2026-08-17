/**
 * Board of the Riigikogu — the President and the two Vice-Presidents.
 *
 * Rendered inside the Parliament tab, from `data/board.json`, which
 * `build_data.py` derives from `plenaryMembership.jobTitle`. Nothing here knows
 * a name: when the Riigikogu elects a new Board the monthly job updates the
 * JSON and this panel follows.
 *
 * Each row carries its holder's party colour and opens that MP's profile — the
 * same overlay the Members tab opens, not a second implementation.
 *
 * The redesign turned three cramped tiles into three full-width rows. The role
 * still comes first in the reading order, ahead of the name, because that is
 * what the row announces ("Pres. of the Riigikogu Lauri Hussar", 2.6); CSS puts
 * the name on top, where the design wants it.
 */

import { el, icon, ICONS } from '../dom.js';
import { openMpPopup } from './mps.js';

/**
 * The compact labels the board rows show, in Board order. The strings are the
 * shipped app's (`BEHAVIOR_SNAPSHOT.md` §2) and are part of the behaviour this
 * rebuild reproduces; `board.json` carries the full official titles.
 */
const SLOTS = [
  { testid: 'board-president', label: 'Pres. of the Riigikogu' },
  { testid: 'board-vice-president-1', label: 'First V-Pres.' },
  { testid: 'board-vice-president-2', label: 'Second V-Pres.' },
];

export default function renderBoard(data) {
  const officers = SLOTS.map((slot, index) => {
    const officer = data.board[index];
    if (!officer) return null;
    const mp = data.mpsByUuid.get(officer.uuid);

    return el('button', {
      type: 'button',
      className: 'board-row',
      'data-testid': slot.testid,
      // The party id is the officer's *registered* party: this is a procedural
      // office, not a voting-bloc fact.
      'data-party-id': officer.partyId,
      onclick: () => mp && openMpPopup(data, mp),
    }, [
      el('span', {
        className: 'board-bar',
        'aria-hidden': 'true',
        style: `background:var(--party-${officer.partyId})`,
      }),
      el('span', { className: 'row-text' }, [
        el('span', { className: 'board-role' }, [slot.label]),
        el('span', { className: 'board-name' }, [officer.name]),
      ]),
      icon(ICONS.chevron, { size: 20 }),
    ]);
  });

  return el('section', { className: 'board' }, [
    el('h2', { className: 'section-heading' }, ['Board of the Riigikogu']),
    el('div', { className: 'board-rows' }, officers),
  ]);
}
