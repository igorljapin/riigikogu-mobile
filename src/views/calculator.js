/**
 * Calculator tab — "does this combination pass?"
 *
 * This view renders state and nothing else. Every seat number, every threshold
 * verdict and every eligibility list comes from `src/lib/calculator.js`, which
 * is pure, unit-tested and has no idea a DOM exists. The Aug-2026 redesign
 * rewrote every line below without touching a single sum — which is the property
 * the Phase-4 architecture was built for.
 *
 * Two things worth stating plainly, because they are what the three-state data
 * model buys:
 *
 * - The counts are **voting bloc**, not registered. Selecting Reform adds 38,
 *   the number of MPs who vote with Reform, not the 36 registered to its group.
 * - The `Coalition` and `Opposition` presets sweep up only parties with a
 *   declared bloc, so the nine unaligned MPs are never swept into either.
 *   Coalition + Opposition is therefore 92, not 101 — you can still add any of
 *   those nine individually, which is exactly how their votes actually work.
 *
 * Where the design bundle and the Usability Contract disagree, the contract wins
 * (§7.3): the headline reads `0 / 101` and the verdict still says "No majority"
 * (4.1), with the design's shortfall added after it (4.17); the reset button is
 * `Reset`, not "Clear"; the party cards read `0/38` rather than "0 of 38"; and
 * the opener stays `Add Individual MPs`. Everything else is the design as drawn.
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
import { mpsInVotingBloc, partyShort } from '../data.js';
import { el, icon, ICONS, openOverlay, replace } from '../dom.js';
import { INDEPENDENT_PARTY_ID } from '../lib/factions.js';
import { avatar, nameBlock, overlayBack, overlayChrome } from './mps.js';

/** Glyphs this screen draws; `dom.js` owns the shared set. */
const GLYPH = {
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
};

export default function renderCalculator(data) {
  const { meta, parties, roster } = data;
  const thresholds = {
    totalSeats: meta.totalSeats,
    simpleMajority: meta.simpleMajority,
    threeFifths: meta.threeFifths,
    constitutionalMajority: meta.constitutionalMajority,
    fourFifths: meta.fourFifths,
  };

  /** Parties largest first, the order the Parliament tab and the picker use. */
  const ordered = [...parties].sort(
    (a, b) => mpsInVotingBloc(data, b.id).length - mpsInVotingBloc(data, a.id).length,
  );

  let selection = emptySelection();

  /* -------------------------------------------------------------- *
   * The hero readout
   * -------------------------------------------------------------- */

  const total = el('div', { className: 'calc-total', 'data-testid': 'calc-total' });
  const verdict = el('div', { className: 'calc-verdict', 'data-testid': 'calc-verdict' });
  const hint = el('p', { className: 'calc-hint' });
  const track = el('div', { className: 'calc-track' });
  const cards = el('div', { className: 'calc-cards' });
  const adjustments = el('div', { className: 'adjustments' });
  const excludeSub = el('span', { className: 'row-sub' });

  const fill = el('span', { className: 'calc-fill', 'data-testid': 'calc-fill' });
  const base = el('span', { className: 'calc-track-base', 'aria-hidden': 'true' });

  function paintHero(state) {
    const seats = state.seats;
    const short = meta.simpleMajority - seats;

    // One element, two text pieces: `0 / 101` is what 4.1 reads, and the
    // denominator must not be an element of its own — a bare "51" here would be
    // indistinguishable from the 51 on the threshold mark below it.
    replace(total, String(seats), el('span', { className: 'calc-total-of' }, [` / ${state.totalSeats}`]));

    verdict.textContent = state.hasMajority
      ? '✓ Majority · passes ordinary legislation'
      : `✗ No majority · ${short} short of ${meta.simpleMajority}`;
    verdict.className = `calc-verdict ${state.hasMajority ? 'is-majority' : 'is-minority'}`;

    fill.setAttribute('data-seats', String(seats));
    fill.setAttribute('data-total', String(state.totalSeats));
    fill.setAttribute('style', `width:${(seats / state.totalSeats) * 100}%`);
    fill.classList.toggle('is-majority', state.hasMajority);

    replace(track, base, fill, ...state.thresholds.map((t) => el('span', {
      className: 'calc-mark',
      'data-testid': `badge-threshold-${t.seats}`,
      'data-met': String(t.met),
      style: `left:${(t.seats / state.totalSeats) * 100}%`,
      title: `${t.label} — ${t.seats} seats`,
    }, [
      el('span', { className: 'calc-mark-tick', 'aria-hidden': 'true' }),
      el('span', { className: 'calc-mark-label' }, [String(t.seats)]),
    ])));

    const next = state.thresholds.find((t) => !t.met);
    const gap = next ? next.seats - seats : 0;
    hint.textContent = seats === 0
      ? 'Tap parties below, or start from a preset.'
      : next
        ? `${gap} more seat${gap === 1 ? '' : 's'} reaches ${next.seats}.`
        : 'Clears every constitutional threshold.';
  }

  /* -------------------------------------------------------------- *
   * Party cards
   * -------------------------------------------------------------- */

  /**
   * Tapping a card takes the whole party in or out. Taking it out also drops
   * that party's individual exclusions, and taking it in absorbs its individual
   * additions, so no adjustment can outlive the state it described.
   */
  function togglePartyCard(partyRecord) {
    const wasSelected = selection.parties.includes(partyRecord.id);
    const uuids = mpsInVotingBloc(data, partyRecord.id).map((mp) => mp.uuid);

    selection = toggleParty(selection, partyRecord.id);
    selection = wasSelected
      ? uuids.reduce((sel, uuid) => includeMp(sel, uuid), selection)
      : uuids.reduce((sel, uuid) => removeIndividualMp(sel, uuid), selection);
    paint();
  }

  function paintCards(state) {
    replace(cards, ordered.map((p) => {
      const row = state.breakdown[p.id] ?? { selected: 0, total: 0 };
      const isSelected = selection.parties.includes(p.id);

      return el('button', {
        type: 'button',
        className: 'calc-card',
        'data-testid': `calc-party-row-${p.id}`,
        'data-party-id': p.id,
        'data-selected': String(isSelected),
        'data-active': String(row.selected > 0),
        'aria-pressed': String(isSelected),
        style: `--card-accent:var(--party-${p.id})`,
        onclick: () => togglePartyCard(p),
      }, [
        el('span', { className: 'calc-card-head' }, [
          el('span', { className: 'calc-swatch', 'aria-hidden': 'true', style: `background:var(--party-${p.id})` }),
          el('span', { className: 'calc-card-short' }, [p.short]),
        ]),
        // "0/38" in one inline run: 4.3 and 4.11 read the row by that shape.
        el('span', { className: 'calc-card-count' }, [
          String(row.selected),
          el('span', { className: 'calc-card-of' }, [`/${row.total}`]),
        ]),
      ]);
    }));
  }

  /* -------------------------------------------------------------- *
   * Named adjustments
   * -------------------------------------------------------------- */

  function adjustmentRow(mp, kind) {
    const isAdd = kind === 'add';
    const undo = isAdd
      ? () => { selection = removeIndividualMp(selection, mp.uuid); paint(); }
      : () => { selection = includeMp(selection, mp.uuid); paint(); };

    return el('div', {
      className: `adjust-row adjust-${kind}`,
      'data-testid': `adjust-chip-${kind}`,
      'data-mp-uuid': mp.uuid,
    }, [
      el('span', { className: 'adjust-badge', 'aria-hidden': 'true' }, [isAdd ? '+1' : '−1']),
      el('span', { className: 'row-text' }, [
        el('span', { className: 'adjust-name' }, [mp.name]),
        el('span', { className: 'row-sub' }, [
          isAdd
            ? `Votes with ${partyShort(data, mp.votingBlocPartyId)}`
            : `Held out of ${partyShort(data, mp.votingBlocPartyId)}`,
        ]),
      ]),
      // Undo is its own control now, not the whole row (§9.1).
      el('button', {
        type: 'button',
        className: 'adjust-undo',
        'data-testid': 'adjust-undo',
        'data-mp-uuid': mp.uuid,
        title: `Undo — ${mp.name}`,
        onclick: undo,
      }, ['Undo']),
    ]);
  }

  function paintAdjustments() {
    const added = roster.filter((mp) => selection.added.includes(mp.uuid));
    const excluded = roster.filter((mp) => selection.excluded.includes(mp.uuid));

    if (added.length === 0 && excluded.length === 0) {
      replace(adjustments);
      return;
    }
    replace(adjustments,
      el('h2', { className: 'section-heading' }, ['Named adjustments']),
      el('div', { className: 'adjust-rows' }, [
        ...excluded.map((mp) => adjustmentRow(mp, 'exclude')),
        ...added.map((mp) => adjustmentRow(mp, 'add')),
      ]),
    );
  }

  function paint() {
    const state = calculate(selection, roster, thresholds);
    paintHero(state);
    paintCards(state);
    excludeSub.textContent = selection.parties.length === 0
      ? 'Select parties first'
      : 'From selected parties';
    paintAdjustments();
  }

  /* -------------------------------------------------------------- *
   * The two-step pickers
   * -------------------------------------------------------------- */

  /**
   * Both pickers are the same widget with different verbs, so they are one
   * function. Step 1 lists the eligible parties with how many MPs each still
   * offers; step 2 lists that party's MPs. Choosing an MP does not close the
   * overlay — you usually want more than one, and the MP you chose leaves the
   * pool as they appear under Named adjustments (4.16).
   */
  function openPicker(kind) {
    const isAdd = kind === 'add';
    const testid = isAdd ? 'modal-add-mps' : 'modal-exclude-mps';
    // Title case is the contract's (`Add Individual MPs` is how 4.10 and 4.16
    // find the opener); the design bundle sets it in sentence case.
    const title = isAdd ? 'Add Individual MPs' : 'Exclude MPs';
    const verb = isAdd ? 'available to add' : 'available to exclude';
    const eligible = () => (isAdd ? addableMps(selection, roster) : excludableMps(selection, roster));

    const overlay = openOverlay({ testid, label: title });
    let partyId = null;

    const back = overlayBack(() => { partyId = null; paintPicker(); }, 'picker-back');

    const head = el('div', { className: 'detail-head' });
    const list = el('div', { className: 'picker-list' });

    function paintPicker() {
      const pool = eligible();
      replace(overlay.header, overlayChrome(title, overlay.close, `${testid}-close`, partyId ? back : null));

      if (partyId === null) {
        const groups = ordered
          .map((p) => ({ party: p, count: pool.filter((mp) => mp.votingBlocPartyId === p.id).length }))
          .filter((g) => g.count > 0);

        replace(head,
          el('h2', { className: 'detail-title' }, [title]),
          el('p', { className: 'detail-sub' }, [isAdd
            ? 'Pick a party, then the members who vote with your bloc.'
            : 'Pick a party, then the members to hold out of the count.']),
        );

        replace(list, groups.length === 0
          ? [el('p', { className: 'picker-empty' }, [isAdd ? 'Every party is already selected.' : 'Select a party first.'])]
          : groups.map((g) => el('button', {
            type: 'button',
            className: 'picker-row picker-party',
            'data-testid': 'picker-party',
            'data-party-id': g.party.id,
            onclick: () => { partyId = g.party.id; paintPicker(); },
          }, [
            el('span', {
              className: 'picker-bar',
              'aria-hidden': 'true',
              style: `background:var(--party-${g.party.id})`,
            }),
            el('span', { className: 'row-text' }, [
              el('span', { className: 'row-name' }, [
                g.party.id === INDEPENDENT_PARTY_ID ? 'Unaligned members' : g.party.short,
              ]),
              el('span', { className: 'row-sub' }, [`${g.count} ${verb}`]),
            ]),
            icon(ICONS.chevron, { size: 20 }),
          ])));
        return;
      }

      const members = pool.filter((mp) => mp.votingBlocPartyId === partyId);
      replace(head,
        el('h2', { className: 'detail-title' }, [
          partyId === INDEPENDENT_PARTY_ID ? 'Unaligned members' : partyShort(data, partyId),
        ]),
        el('p', { className: 'detail-sub' }, [isAdd
          ? 'Tap a member to add them to the count.'
          : 'Tap a member to hold them out of the count.']),
      );

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
          avatar(mp, { size: 'sm' }),
          nameBlock(mp),
          el('span', { className: `picker-action picker-action-${kind}` }, [isAdd ? '+1' : '−1']),
        ])));
    }

    replace(overlay.body, head, list);
    paintPicker();
  }

  /* -------------------------------------------------------------- *
   * Assembly
   * -------------------------------------------------------------- */

  const presets = el('div', { className: 'presets' }, [
    el('button', {
      type: 'button', className: 'preset', 'data-testid': 'preset-coalition',
      onclick: () => { selection = presetSelection('coalition', parties, data.alignment); paint(); },
    }, ['Coalition']),
    el('button', {
      type: 'button', className: 'preset', 'data-testid': 'preset-opposition',
      onclick: () => { selection = presetSelection('opposition', parties, data.alignment); paint(); },
    }, ['Opposition']),
    el('button', {
      type: 'button', className: 'preset preset-reset', 'data-testid': 'preset-reset',
      onclick: () => { selection = emptySelection(); paint(); },
    }, ['Reset']),
  ]);

  const opener = (testid, glyph, kind, title, sub) => el('button', {
    type: 'button',
    className: `opener opener-${kind}`,
    'data-testid': testid,
    onclick: () => openPicker(kind),
  }, [
    el('span', { className: `opener-icon opener-icon-${kind}`, 'aria-hidden': 'true' }, [icon(glyph, { size: 17 })]),
    el('span', { className: 'row-text' }, [
      el('span', { className: 'row-name' }, [title]),
      sub,
    ]),
    icon(ICONS.chevron, { size: 20 }),
  ]);

  const openers = el('div', { className: 'openers' }, [
    opener('calc-add-mps', GLYPH.plus, 'add', 'Add Individual MPs',
      el('span', { className: 'row-sub' }, ['From non-selected parties'])),
    opener('calc-exclude-mps', GLYPH.minus, 'exclude', 'Exclude MPs', excludeSub),
  ]);

  paint();

  return el('div', { className: 'view view-calculator' }, [
    el('h1', { className: 'screen-title' }, ['Majority calculator']),

    el('div', { className: 'calc-hero' }, [
      el('div', { className: 'calc-hero-top' }, [total, verdict]),
      track,
      hint,
    ]),

    presets,
    el('h2', { className: 'section-heading' }, ['Select Parties']),
    cards,
    openers,
    adjustments,
  ]);
}
