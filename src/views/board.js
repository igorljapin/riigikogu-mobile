/**
 * Board of the Riigikogu — the President and the two Vice-Presidents.
 *
 * Rendered inside the Parliament tab, from `data/board.json`, which
 * `build_data.py` derives from `plenaryMembership.jobTitle`. Nothing here knows
 * a name: when the Riigikogu elects a new Board the monthly job updates the
 * JSON and this panel follows.
 *
 * Each button is tinted with its holder's party colour and opens that MP's
 * popup — the same popup the Members tab opens, not a second implementation.
 */

import { party } from '../data.js';
import { el } from '../dom.js';
import { openMpPopup } from './mps.js';

/** `#00AEEF` at 19 % — the tint the shipped board buttons rendered. */
function tint(hex, alpha = 0.19) {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * The compact labels the board buttons show, in Board order. The strings are
 * the shipped app's (`BEHAVIOR_SNAPSHOT.md` §2) and are part of the behaviour
 * this rebuild reproduces; `board.json` carries the full official titles.
 */
const SLOTS = [
  { testid: 'board-president', label: 'Pres. of the Riigikogu' },
  { testid: 'board-vice-president-1', label: 'First V-Pres.' },
  { testid: 'board-vice-president-2', label: 'Second V-Pres.' },
];

/** Surname only — what fits on a third of a 390 px screen. */
function surname(fullName) {
  return fullName.split(/\s+/).pop();
}

export default function renderBoard(data) {
  const officers = SLOTS.map((slot, index) => {
    const officer = data.board[index];
    if (!officer) return null;
    const mp = data.mpsByUuid.get(officer.uuid);

    return el('button', {
      type: 'button',
      className: 'board-officer',
      'data-testid': slot.testid,
      // The party id is the officer's *registered* party: this is a procedural
      // office, not a voting-bloc fact.
      'data-party-id': officer.partyId,
      style: `background:${tint(party(data, officer.partyId)?.color ?? '#808080')}`,
      onclick: () => mp && openMpPopup(data, mp),
    }, [
      el('span', { className: 'board-role' }, [slot.label]),
      el('span', { className: 'board-name' }, [surname(officer.name)]),
    ]);
  });

  return el('section', { className: 'board' }, [
    el('h2', { className: 'board-heading' }, ['Board of the Riigikogu']),
    el('div', { className: 'board-officers' }, officers),
  ]);
}
