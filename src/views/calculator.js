/**
 * Calculator tab — "does this combination pass?"
 *
 * This view renders state and nothing else. Every seat number, every threshold
 * verdict and every eligibility list comes from `src/lib/calculator.js`, which
 * is pure, unit-tested and has no idea a DOM exists. A redesign can rewrite
 * every line below without touching a single sum.
 *
 * Two properties worth stating plainly, because they are what the whole
 * three-state data model buys:
 *
 * - The counts are **voting bloc**, not registered. Selecting Reform adds 38,
 *   the number of MPs who vote with Reform, not the 36 registered to its group.
 * - The `Coalition` and `Opposition` presets sweep up only parties with a
 *   declared bloc, so the nine unaligned MPs are never swept into either.
 *   Coalition + Opposition is therefore 92, not 101 — you can still add any of
 *   those nine individually, which is exactly how their votes actually work.
 */

import {
  addIndividualMp,
  addableMps,
  calculate,
  emptySelection,
  excludableMps,
  excludeMp,
  includeMp,
  presetSelection,
  removeIndividualMp,
  toggleParty,
} from '../lib/calculator.js';
import { partyShort } from '../data.js';
import { closeButton, el, icon, ICONS, openOverlay, replace } from '../dom.js';

const THRESHOLD_CARDS = [
  { key: 'simpleMajority', label: '1/2+1' },
  { key: 'threeFifths', label: '3/5' },
  { key: 'constitutionalMajority', label: '2/3' },
  { key: 'fourFifths', label: '4/5' },
];

export default function renderCalculator(data) {
  const { meta, parties, roster } = data;
  const thresholds = {
    totalSeats: meta.totalSeats,
    simpleMajority: meta.simpleMajority,
    threeFifths: meta.threeFifths,
    constitutionalMajority: meta.constitutionalMajority,
    fourFifths: meta.fourFifths,
  };

  let selection = emptySelection();

  /* -------------------------------------------------------------- *
   * Readout
   * -------------------------------------------------------------- */

  // One text node, not a number in its own element: a bare "51" here would be
  // indistinguishable from the 51 on the threshold card below it.
  const total = el('div', { className: 'calc-total', 'data-testid': 'calc-total' });
  const verdict = el('div', { className: 'calc-verdict', 'data-testid': 'calc-verdict' });
  const cards = el('div', { className: 'thresholds' });
  const partyRows = el('div', { className: 'calc-party-rows' });
  const adjustments = el('div', { className: 'adjustments' });
  const excludeSub = el('span', { className: 'picker-open-sub' });

  function paint() {
    const state = calculate(selection, roster, thresholds);

    total.textContent = `${state.seats}/ ${state.totalSeats}`;
    verdict.textContent = state.hasMajority ? '✓ Majority' : '✗ No majority';
    verdict.className = `calc-verdict ${state.hasMajority ? 'is-majority' : 'is-minority'}`;

    replace(cards, state.thresholds.map((t) => el('div', {
      className: `threshold threshold-${t.seats}${t.met ? ' is-met' : ''}`,
      'data-testid': `badge-threshold-${t.seats}`,
      'data-met': String(t.met),
    }, [
      el('div', { className: 'threshold-seats' }, [String(t.seats)]),
      el('div', { className: 'threshold-label' }, [t.label]),
    ])));

    replace(partyRows, parties.map((p) => {
      const row = state.breakdown[p.id] ?? { selected: 0, total: 0 };
      const isSelected = selection.parties.includes(p.id);
      const removed = roster.filter((mp) => mp.votingBlocPartyId === p.id && selection.excluded.includes(mp.uuid)).length;
      const extra = roster.filter((mp) => mp.votingBlocPartyId === p.id && selection.added.includes(mp.uuid)).length;

      return el('button', {
        type: 'button',
        className: `calc-party-row${isSelected ? ' is-selected' : ''}`,
        'data-testid': `calc-party-row-${p.id}`,
        'data-party-id': p.id,
        'data-selected': String(isSelected),
        onclick: () => { selection = toggleParty(selection, p.id); paint(); },
      }, [
        el('span', { className: 'calc-swatch', style: `background:var(--party-${p.id})`, 'aria-hidden': 'true' }),
        el('span', { className: 'calc-party-name' }, [p.short]),
        el('span', { className: 'calc-party-count' }, [`${row.selected}/${row.total}`]),
        isSelected && removed > 0 && el('span', { className: 'calc-adjust is-minus' }, [`-${removed}`]),
        !isSelected && extra > 0 && el('span', { className: 'calc-adjust is-plus' }, [`+${extra}`]),
      ]);
    }));

    excludeSub.textContent = selection.parties.length === 0 ? 'Select parties first' : 'From selected parties';
    paintAdjustments();
  }

  /* -------------------------------------------------------------- *
   * Individual adjustments
   * -------------------------------------------------------------- */

  function chip(mp, kind) {
    const undo = kind === 'add'
      ? () => { selection = removeIndividualMp(selection, mp.uuid); paint(); }
      : () => { selection = includeMp(selection, mp.uuid); paint(); };

    return el('button', {
      type: 'button',
      className: `adjust-chip adjust-${kind}`,
      'data-testid': `adjust-chip-${kind}`,
      'data-mp-uuid': mp.uuid,
      title: `Undo — ${mp.name}`,
      onclick: undo,
    }, [`${kind === 'add' ? '+1' : '-1'} ${mp.name.split(/\s+/).pop()}`]);
  }

  function paintAdjustments() {
    const added = roster.filter((mp) => selection.added.includes(mp.uuid));
    const excluded = roster.filter((mp) => selection.excluded.includes(mp.uuid));

    if (added.length === 0 && excluded.length === 0) {
      replace(adjustments);
      return;
    }
    replace(adjustments,
      el('p', { className: 'adjustments-heading' }, ['Individual Adjustments']),
      el('div', { className: 'adjustment-chips' }, [
        ...excluded.map((mp) => chip(mp, 'exclude')),
        ...added.map((mp) => chip(mp, 'add')),
      ]),
    );
  }

  /* -------------------------------------------------------------- *
   * The two-step pickers
   * -------------------------------------------------------------- */

  /**
   * Both pickers are the same widget with different verbs, so they are one
   * function. Step 1 lists the eligible parties with how many MPs each still
   * offers; step 2 lists that party's MPs. Choosing an MP does not close the
   * sheet — you usually want more than one.
   */
  function openPicker(kind) {
    const isAdd = kind === 'add';
    const testid = isAdd ? 'modal-add-mps' : 'modal-exclude-mps';
    const title = isAdd ? 'Add Individual MPs' : 'Exclude MPs';
    const verb = isAdd ? 'available to add' : 'available to exclude';
    const eligible = () => (isAdd ? addableMps(selection, roster) : excludableMps(selection, roster));

    const overlay = openOverlay({ testid, label: title });
    let partyId = null;

    // The back control carries no text on purpose: it is chrome, and the MP
    // list below it is what a picker's buttons are supposed to be.
    const back = el('button', {
      type: 'button',
      className: 'picker-back',
      'aria-label': 'Back',
      'data-testid': 'picker-back',
      onclick: () => { partyId = null; paintPicker(); },
    }, [icon(ICONS.back, { size: 18 })]);

    const heading = el('h3', { className: 'picker-title' }, [title]);
    const list = el('div', { className: 'picker-list' });

    function paintPicker() {
      const pool = eligible();
      replace(overlay.header, partyId ? back : null, heading, closeButton(overlay.close, `${testid}-close`));

      if (partyId === null) {
        const groups = parties
          .map((p) => ({ party: p, count: pool.filter((mp) => mp.votingBlocPartyId === p.id).length }))
          .filter((g) => g.count > 0);

        heading.textContent = title;
        replace(list, groups.length === 0
          ? [el('p', { className: 'picker-empty' }, [isAdd ? 'Every party is already selected.' : 'Select a party first.'])]
          : groups.map((g) => el('button', {
            type: 'button',
            className: 'picker-row picker-party',
            'data-testid': 'picker-party',
            'data-party-id': g.party.id,
            onclick: () => { partyId = g.party.id; paintPicker(); },
          }, [
            el('span', { className: 'calc-swatch', style: `background:var(--party-${g.party.id})`, 'aria-hidden': 'true' }),
            el('span', { className: 'picker-row-name' }, [g.party.short]),
            el('span', { className: 'picker-row-meta' }, [`${g.count} ${verb}`]),
          ])));
        return;
      }

      const members = pool.filter((mp) => mp.votingBlocPartyId === partyId);
      heading.textContent = partyShort(data, partyId);
      replace(list, members.length === 0
        ? [el('p', { className: 'picker-empty' }, ['Nobody left in this party.'])]
        : members.map((mp) => el('button', {
          type: 'button',
          className: 'picker-row picker-mp',
          'data-testid': 'picker-mp',
          'data-mp-uuid': mp.uuid,
          onclick: () => {
            selection = isAdd ? addIndividualMp(selection, mp.uuid) : excludeMp(selection, mp.uuid);
            paint();
            paintPicker();
          },
        }, [
          el('span', { className: 'picker-row-name' }, [mp.name]),
          el('span', { className: 'picker-row-meta' }, [partyShort(data, mp.votingBlocPartyId)]),
        ])));
    }

    replace(overlay.body, list);
    paintPicker();
  }

  /* -------------------------------------------------------------- *
   * Assembly
   * -------------------------------------------------------------- */

  const presets = el('div', { className: 'presets' }, [
    el('button', {
      type: 'button', className: 'preset preset-coalition', 'data-testid': 'preset-coalition',
      onclick: () => { selection = presetSelection('coalition', parties, data.alignment); paint(); },
    }, ['Coalition']),
    el('button', {
      type: 'button', className: 'preset preset-opposition', 'data-testid': 'preset-opposition',
      onclick: () => { selection = presetSelection('opposition', parties, data.alignment); paint(); },
    }, ['Opposition']),
    el('button', {
      type: 'button', className: 'preset preset-reset', 'data-testid': 'preset-reset',
      onclick: () => { selection = emptySelection(); paint(); },
    }, ['Reset']),
  ]);

  const pickerButtons = el('div', { className: 'picker-openers' }, [
    el('button', {
      type: 'button', className: 'picker-open', 'data-testid': 'calc-add-mps',
      onclick: () => openPicker('add'),
    }, [
      el('span', { className: 'picker-open-title' }, ['Add Individual MPs']),
      el('span', { className: 'picker-open-sub' }, ['From non-selected parties']),
    ]),
    el('button', {
      type: 'button', className: 'picker-open', 'data-testid': 'calc-exclude-mps',
      onclick: () => openPicker('exclude'),
    }, [
      el('span', { className: 'picker-open-title' }, ['Exclude MPs']),
      excludeSub,
    ]),
  ]);

  paint();

  return el('div', { className: 'view view-calculator' }, [
    el('div', { className: 'calc-readout' }, [total, verdict]),
    cards,
    presets,
    el('h2', { className: 'section-heading' }, ['Select Parties']),
    partyRows,
    pickerButtons,
    adjustments,
  ]);
}
