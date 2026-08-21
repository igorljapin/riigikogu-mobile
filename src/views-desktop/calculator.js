/**
 * Coalition calculator — build a voting group on the floor plan and see which
 * constitutional thresholds it clears.
 *
 * **No arithmetic lives here.** Every number on this screen comes from
 * `src/lib/calculator.js`, reused untouched and shared with the mobile app: the
 * selection algebra, the seat count, the thresholds. This file is the desktop
 * design's way of driving that module and nothing more, which is what makes a
 * redesign of this screen safe (`USABILITY.md` §10.5).
 *
 * ## The selection model, and why it is not 101 booleans
 *
 * A selection is `{parties, added, excluded}` — parties as the base, plus named
 * adjustments on top (D4.4). A flat set of members cannot express "the
 * coalition, minus this one member" in a way that survives deselecting and
 * reselecting the party: the moment you re-add Reform, a flat set has forgotten
 * that you were holding one of its members out. Deselecting a party therefore
 * clears **its own** adjustments and no others.
 *
 * That shape is already what `src/lib/calculator.js` speaks, which is not a
 * coincidence — the mobile app reached the same conclusion from its two pickers.
 * The desktop design reaches it from clicking a seat.
 *
 * ## The presets and the nine members they never touch
 *
 * `Coalition` and `Opposition` select the parties `alignment.json` puts in that
 * bloc. Nobody who belongs to no group is ever swept in by either (D4.10) —
 * they have no whip and no common position, and with the government at 50 of
 * 101 a preset that quietly counted them would manufacture a majority that does
 * not exist.
 *
 * ## Two states on a party card, and why they are not one
 *
 * `data-active` says the party is *selected* — it is the base of the selection,
 * and it is what D4.2 and D4.6 are written about. `data-counting` says some of
 * its members are *in the count*, which is a different sentence: a member added
 * individually puts their party into the count without selecting it, and a
 * party whose every member is held out is selected while contributing nothing.
 *
 * The artboards need the second: the Unaligned card is lit there with one
 * member counted and the party unselected. They never draw the other corner —
 * selected, nothing counted — so `desktop.css` lights the card on either, which
 * reproduces every frame the artboards do draw and keeps that corner from
 * looking like a card you have not touched. Only `data-active` is the
 * contract's (`USABILITY.md` §10.9); `data-counting` is this file's own.
 */

import {
  addIndividualMp,
  calculate,
  emptySelection,
  excludeMp,
  includeMp,
  presetSelection,
  removeIndividualMp,
  selectedMpUuids,
  toggleParty,
} from '../lib/calculator.js';
import { el, replace } from '../dom.js';
import { votingBlocSeats } from '../data.js';
import { createFloor, SEAT_STATE } from './floor.js';
import { partiesBySize, shortOf } from './parts.js';

/**
 * The four constitutional thresholds, each with what it buys. The **numbers**
 * come from `data/meta.json` via `src/lib/calculator.js`; only the prose is
 * here, because prose is not arithmetic (D4.11).
 */
const THRESHOLD_NOTES = Object.freeze({
  simpleMajority: 'Ordinary legislation',
  threeFifths: 'Constitution, 2nd route',
  constitutionalMajority: 'Constitutional amendment',
  fourFifths: 'Urgent amendment',
});

export default function renderCalculator(ctx) {
  const { data, state } = ctx;
  const { meta } = data;
  const parties = partiesBySize(data);
  const share = (seats) => `${((seats / meta.totalSeats) * 100).toFixed(3)}%`;

  const selection = () => state.calculator.selection;
  const set = (next) => { state.calculator.selection = next; paint(); };

  /** Members of one party, by the party they **vote** with. */
  const membersOf = (partyId) => data.mps.filter((mp) => mp.votingBlocPartyId === partyId);

  /* ---- the floor -------------------------------------------------- */

  let counted = new Set();

  const floor = createFloor(ctx, {
    prefix: 'calc-seat-',
    stateOf: (mp) => {
      if (counted.has(mp.uuid)) return SEAT_STATE.counted;
      return selection().excluded.includes(mp.uuid) ? SEAT_STATE.held : SEAT_STATE.dimmed;
    },
    onSelect: (mp) => {
      const current = selection();
      const inSelectedParty = current.parties.includes(mp.votingBlocPartyId);
      // One click, two meanings, and the party decides which: a seat inside a
      // selected party can only be *held out* of it, and a seat outside one can
      // only be *added*. That is what keeps the two lists from contradicting.
      if (inSelectedParty) {
        set(current.excluded.includes(mp.uuid)
          ? includeMp(current, mp.uuid)
          : excludeMp(current, mp.uuid));
      } else {
        set(current.added.includes(mp.uuid)
          ? removeIndividualMp(current, mp.uuid)
          : addIndividualMp(current, mp.uuid));
      }
    },
  });

  /* ---- the hero --------------------------------------------------- */

  const total = el('span', {
    className: 'dk-calc-total',
    'data-testid': 'calc-total',
    'data-total': String(meta.totalSeats),
  });
  const verdict = el('p', { className: 'dk-calc-verdict', 'data-testid': 'calc-verdict' });
  const hint = el('p', { className: 'dk-calc-hint', 'data-testid': 'calc-hint' });
  const selectedChip = el('span', { className: 'dk-calc-chip' });

  // The mobile hero's threshold track at desktop width: the selection as a
  // length, with the four constitutional marks standing on it.
  const trackFill = el('span', { className: 'dk-track-fill' });
  const trackMarks = el('div', { className: 'dk-track-marks' });
  const track = el('div', { className: 'dk-track', 'aria-hidden': 'true' }, [
    el('span', { className: 'dk-track-rail' }),
    trackFill,
    trackMarks,
  ]);

  const thresholdChips = el('div', { className: 'dk-thresholds' });

  /* ---- presets ----------------------------------------------------- */

  const preset = (bloc, label) => el('button', {
    type: 'button',
    className: 'dk-preset',
    'data-testid': `calc-preset-${bloc}`,
    // A preset is a fresh start, not an addition: it resets the adjustments
    // too, so what you get is exactly the bloc as `alignment.json` records it.
    onclick: () => set(presetSelection(bloc, data.parties, data.alignment)),
  }, [label]);

  const clearButton = el('button', {
    type: 'button',
    className: 'dk-preset dk-preset-clear',
    'data-testid': 'calc-clear',
    onclick: () => set(emptySelection()),
  }, ['Clear']);

  /* ---- party cards -------------------------------------------------- */

  const partyCards = parties.map((party) => el('button', {
    type: 'button',
    className: 'dk-calc-party',
    'data-testid': `calc-party-${party.id}`,
    'data-party-id': party.id,
    'data-active': 'false',
    'data-counting': 'false',
    'aria-pressed': 'false',
    style: `--party:var(--party-${party.id})`,
    onclick: () => {
      const current = selection();
      const turningOn = !current.parties.includes(party.id);
      const ids = new Set(membersOf(party.id).map((mp) => mp.uuid));
      const next = toggleParty(current, party.id);
      // Both halves touch this party's adjustments and nobody else's (D4.4):
      // turning it on absorbs its members into the base, so they stop being
      // named additions; turning it off drops the hold-outs that only meant
      // anything while it was on.
      set({
        ...next,
        added: turningOn ? next.added.filter((uuid) => !ids.has(uuid)) : next.added,
        excluded: turningOn ? next.excluded : next.excluded.filter((uuid) => !ids.has(uuid)),
      });
    },
  }, [
    el('span', { className: 'dk-calc-party-head' }, [
      el('span', { className: 'dk-party-swatch', 'aria-hidden': 'true' }),
      el('span', { className: 'dk-calc-party-name' }, [shortOf(data, party.id)]),
    ]),
    el('span', { className: 'dk-calc-party-count' }, [
      el('span', { className: 'dk-calc-party-selected', 'data-testid': `calc-party-count-${party.id}` }, ['0']),
      el('span', { className: 'dk-calc-party-total' }, [`of ${votingBlocSeats(data, party.id)}`]),
    ]),
  ]));

  /* ---- named adjustments -------------------------------------------- */

  const adjustments = el('div', { className: 'dk-adjustments' });

  function adjustmentRow(mp, kind) {
    const added = kind === 'added';
    return el('div', {
      className: 'dk-adjustment',
      'data-testid': `calc-adjustment-${mp.uuid}`,
      'data-kind': kind,
    }, [
      el('span', { className: 'dk-adjustment-badge' }, [added ? '+1' : '−1']),
      el('span', { className: 'dk-adjustment-text' }, [
        el('span', { className: 'dk-adjustment-name' }, [mp.name]),
        el('span', { className: 'dk-adjustment-note' }, [
          added
            ? `Votes with the group · ${shortOf(data, mp.votingBlocPartyId)}`
            : `Held out of ${shortOf(data, mp.votingBlocPartyId)}`,
        ]),
      ]),
      el('button', {
        type: 'button',
        className: 'dk-adjustment-undo',
        'data-testid': `calc-adjustment-undo-${mp.uuid}`,
        'aria-label': `Undo ${mp.name}`,
        onclick: () => set(added
          ? removeIndividualMp(selection(), mp.uuid)
          : includeMp(selection(), mp.uuid)),
      }, ['Undo']),
    ]);
  }

  /* ---- painting ------------------------------------------------------ */

  function paint() {
    const current = selection();
    // meta.json drives the thresholds — the module's own constants are only a
    // fallback for a caller that has no data layer (D4.11).
    const result = calculate(current, data.mps, meta);
    counted = new Set(selectedMpUuids(current, data.mps));

    floor.repaint();

    total.textContent = String(result.seats);
    total.setAttribute('data-seats', String(result.seats));
    selectedChip.textContent = `${result.seats} of ${meta.totalSeats} selected`;

    verdict.textContent = result.hasMajority
      ? 'Passes ordinary legislation'
      : `${meta.simpleMajority - result.seats} short of ${meta.simpleMajority}`;
    verdict.setAttribute('data-met', String(result.hasMajority));

    trackFill.style.width = share(result.seats);
    trackFill.setAttribute('data-met', String(result.hasMajority));

    replace(trackMarks, ...result.thresholds.map((t) => el('span', {
      className: 'dk-track-mark',
      'data-met': String(t.met),
      'data-threshold': String(t.seats),
      style: `left:${share(t.seats)}`,
    }, [
      el('span', { className: 'dk-track-tick' }),
      el('span', { className: 'dk-track-figure' }, [String(t.seats)]),
    ])));

    const next = result.thresholds.find((t) => !t.met);
    const gap = next ? next.seats - result.seats : 0;
    hint.textContent = result.seats === 0
      ? 'Pick parties below, or click seats on the floor plan.'
      : next
        ? `${gap} more seat${gap === 1 ? '' : 's'} reach${gap === 1 ? 'es' : ''} ${next.label} (${next.seats}).`
        : 'Clears every constitutional threshold.';

    replace(thresholdChips, ...result.thresholds.map((t) => el('div', {
      className: 'dk-threshold',
      // The number in the testid is the value from meta.json, not a literal
      // typed here: a threshold that moved would move this hook with it.
      'data-testid': `calc-threshold-${t.seats}`,
      'data-met': String(t.met),
      'data-threshold': String(t.seats),
    }, [
      el('span', { className: 'dk-threshold-fraction' }, [t.label]),
      el('span', { className: 'dk-threshold-note' }, [
        `${t.met ? '✓' : '✕'} ${t.seats} · ${THRESHOLD_NOTES[t.key]}`,
      ]),
    ])));

    for (const card of partyCards) {
      const partyId = card.dataset.partyId;
      const inCount = membersOf(partyId).filter((mp) => counted.has(mp.uuid)).length;
      const selected = current.parties.includes(partyId);
      card.setAttribute('data-active', String(selected));
      card.setAttribute('data-counting', String(inCount > 0));
      card.setAttribute('aria-pressed', String(selected));
      card.querySelector(`[data-testid="calc-party-count-${partyId}"]`).textContent = String(inCount);
    }

    const rows = [
      ...current.excluded.map((uuid) => [data.mpsByUuid.get(uuid), 'excluded']),
      ...current.added.map((uuid) => [data.mpsByUuid.get(uuid), 'added']),
    ].filter(([mp]) => mp);

    replace(adjustments, rows.length === 0
      ? el('p', { className: 'dk-adjustments-empty', 'data-testid': 'calc-adjustments-empty' }, [
        'Click a seat on the floor plan to add a member from a non-selected party, '
        + "or hold a selected party's member out of the count.",
      ])
      : rows.map(([mp, kind]) => adjustmentRow(mp, kind)));
  }

  paint();

  return el('div', { className: 'dk-view dk-view-calculator' }, [
    el('section', { className: 'dk-card dk-floor-card' }, [
      el('div', { className: 'dk-card-head' }, [
        el('div', {}, [
          el('h2', { className: 'dk-card-title' }, ['Session hall seating plan']),
          el('p', { className: 'dk-card-sub' },
            ['Click any seat to add that member to the count, or hold them out of it']),
        ]),
        selectedChip,
      ]),
      floor.node,
      el('div', { className: 'dk-seat-key' }, [
        el('span', { className: 'dk-key' }, [
          el('span', { className: 'dk-key-swatch', 'data-seat-state': 'counted', 'aria-hidden': 'true' }),
          'in the count',
        ]),
        el('span', { className: 'dk-key' }, [
          el('span', { className: 'dk-key-swatch', 'data-seat-state': 'dimmed', 'aria-hidden': 'true' }),
          'not counted',
        ]),
        el('span', { className: 'dk-key' }, [
          el('span', { className: 'dk-key-swatch', 'data-seat-state': 'held', 'aria-hidden': 'true' }),
          'held out of a selected party',
        ]),
      ]),
    ]),

    el('div', { className: 'dk-side' }, [
      el('section', { className: 'dk-hero' }, [
        el('div', { className: 'dk-hero-head' }, [total, verdict]),
        track,
        thresholdChips,
        hint,
      ]),

      el('div', { className: 'dk-presets' }, [
        preset('coalition', 'Coalition'),
        preset('opposition', 'Opposition'),
        clearButton,
      ]),

      el('section', { className: 'dk-block' }, [
        el('h2', { className: 'dk-kicker dk-block-title' }, ['Tap a party in or out']),
        el('div', { className: 'dk-calc-parties' }, partyCards),
      ]),

      el('section', { className: 'dk-block' }, [
        el('h2', { className: 'dk-kicker dk-block-title' }, ['Named adjustments']),
        adjustments,
      ]),
    ]),
  ]);
}
