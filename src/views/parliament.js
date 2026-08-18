/**
 * Parliament tab — who holds how many seats, and who can pass what.
 *
 * Every number here is a **voting-bloc** count. That is the distinction the
 * whole data model exists to preserve: the API's registered figures answer
 * procedural questions (speaking time, committee entitlements), and this screen
 * answers a different one — will this pass. Reform reads 38 here and 36 in the
 * registry, and both are correct (`data/README.md`).
 *
 * There are **three** buckets, not two. The bundle had two and filed all nine
 * party-less MPs under Opposition, which credited the opposition with nine votes
 * that have no whip behind them (`BEHAVIOR_SNAPSHOT.md` §8.4). They have their
 * own section here and belong to no bloc.
 *
 * The Aug-2026 redesign (USABILITY.md §9) replaced the stat tiles with the
 * headline figure and a proportional seat chart, and the coloured chips with
 * full-width party cards. Two things the design bundle proposed and the contract
 * did not take:
 *
 * - The tab is **Parliament**, not "Standing" (§9.3).
 * - The bloc sections keep their `Coalition (50 seats)` headings, and the chart
 *   keeps a written majority threshold. 2.1–2.3 are promises about what the
 *   screen states, not about how it is laid out, and the design's single sorted
 *   list would have dropped both.
 */

import { buckets, mpsInVotingBloc, votingBlocSeats } from '../data.js';
import { el, icon, ICONS, openOverlay, replace } from '../dom.js';
import { INDEPENDENT_PARTY_ID } from '../lib/factions.js';
import renderBoard from './board.js';
import { avatar, nameBlock, openMpPopup, overlayChrome } from './mps.js';

/** The party-less group is a bucket, not a party: it is named for what it is. */
function partyTitle(partyRecord) {
  return partyRecord.id === INDEPENDENT_PARTY_ID ? 'Unaligned members' : partyRecord.short;
}

function partySubtitle(partyRecord, blocLabelText) {
  return partyRecord.id === INDEPENDENT_PARTY_ID
    ? 'No group, no whip'
    : `${blocLabelText} · ${partyRecord.nameEn}`;
}

/** Which bucket a party sits in, as the label the UI prints. */
function blocLabelOf(data, partyId) {
  return buckets(data).find((b) => b.parties.some((p) => p.id === partyId))?.label ?? 'Unaligned';
}

/* ------------------------------------------------------------------ *
 * Party sheet — every MP whose vote counts toward one party
 * ------------------------------------------------------------------ */

/**
 * The overlay a party card opens. Full-screen since the redesign (§9.1, 2.5) —
 * the promise is unchanged: the count it states is the count the card claimed.
 *
 * Its rows are tappable now, and open the MP's profile *in place of* this
 * overlay rather than on top of it, so exactly one overlay is ever open — and
 * the profile carries a back arrow that brings this list back (2.14).
 */
function openPartySheet(data, partyRecord) {
  const members = mpsInVotingBloc(data, partyRecord.id);
  const overlay = openOverlay({ testid: 'party-sheet', label: partyTitle(partyRecord) });
  const registered = data.meta.registered?.[partyRecord.id];

  const subtitle = [
    // "38 members" is the phrase 2.5 checks against the card's own number.
    `${members.length} members`,
    blocLabelOf(data, partyRecord.id),
    partyRecord.id !== INDEPENDENT_PARTY_ID && registered !== undefined && `registered ${registered}`,
  ].filter(Boolean).join(' · ');

  replace(overlay.header, overlayChrome('Voting bloc', overlay.close, 'party-sheet-close'));

  replace(overlay.body,
    el('div', { className: 'detail-head' }, [
      el('h2', { className: 'detail-title' }, [
        partyRecord.id === INDEPENDENT_PARTY_ID ? partyTitle(partyRecord) : partyRecord.nameEn,
      ]),
      el('p', { className: 'detail-sub' }, [subtitle]),
    ]),

    el('div', { className: 'member-list' }, members.map((mp) => el('button', {
      type: 'button',
      className: 'member-row',
      'data-testid': 'party-sheet-member',
      'data-mp-uuid': mp.uuid,
      // Swap this sheet for the profile, and hand the profile a way back to it.
      onclick: () => {
        overlay.close();
        openMpPopup(data, mp, { onBack: () => openPartySheet(data, partyRecord) });
      },
    }, [
      avatar(mp, { size: 'sm' }),
      nameBlock(mp),
      icon(ICONS.chevron, { size: 20 }),
    ]))),
  );
}

/* ------------------------------------------------------------------ *
 * The tab
 * ------------------------------------------------------------------ */

/**
 * One party card.
 *
 * The seat count is the party-coloured element the contract calls the "chip"
 * (2.4, 2.7): it carries the testid, the canonical colour and its contrasting
 * text colour, and it is the first thing in the card's reading order so the
 * card announces "38 Reform …". CSS moves it to the right of the row, where the
 * design puts the figure.
 */
function partyCard(data, partyRecord, blocLabelText) {
  const seats = votingBlocSeats(data, partyRecord.id);
  const share = (seats / data.meta.totalSeats) * 100;

  return el('button', {
    type: 'button',
    className: 'party-card',
    'data-party-id': partyRecord.id,
    onclick: () => openPartySheet(data, partyRecord),
  }, [
    el('span', { className: 'party-card-row' }, [
      el('span', {
        className: 'party-card-seats',
        'data-testid': `party-chip-${partyRecord.id}`,
        'data-party-id': partyRecord.id,
        style: `background:var(--party-${partyRecord.id});color:var(--party-${partyRecord.id}-text)`,
      }, [String(seats)]),
      el('span', { className: 'row-text' }, [
        el('span', { className: 'party-card-name' }, [partyTitle(partyRecord)]),
        el('span', { className: 'party-card-sub' }, [partySubtitle(partyRecord, blocLabelText)]),
      ]),
    ]),
    el('span', { className: 'party-card-track', 'aria-hidden': 'true' }, [
      el('span', {
        className: 'party-card-fill',
        style: `width:${share}%;background:var(--party-${partyRecord.id})`,
      }),
    ]),
  ]);
}

/** One bloc: its heading, and its parties largest first. */
function blocSection(data, bucket) {
  const ordered = [...bucket.parties].sort(
    (a, b) => votingBlocSeats(data, b.id) - votingBlocSeats(data, a.id),
  );

  return el('section', { className: `bloc-section bloc-${bucket.id}` }, [
    el('h3', {
      className: 'bloc-heading',
      'data-testid': `bloc-heading-${bucket.id}`,
    }, [`${bucket.label} (${bucket.seats} seats)`]),
    el('div', { className: 'party-cards' }, ordered.map((p) => partyCard(data, p, bucket.label))),
  ]);
}

/**
 * The stacked seat chart: coalition → unaligned → opposition, each segment as
 * wide as its share of the house, with the majority marker positioned from
 * `meta.simpleMajority` (2.11, 2.12). Nothing here is a literal.
 */
function seatChart(data, groups) {
  const { meta } = data;
  const order = ['coalition', 'unaligned', 'opposition'];
  const byId = Object.fromEntries(groups.map((b) => [b.id, b]));
  const share = (seats) => `${(seats / meta.totalSeats) * 100}%`;

  const bar = el('div', {
    className: 'seat-bar',
    role: 'img',
    'aria-label': groups.map((b) => `${b.label} ${b.seats}`).join(', ')
      + ` of ${meta.totalSeats} seats`,
  }, order.map((id) => el('span', {
    className: `seat-segment seat-${id}`,
    'data-testid': `seat-chart-segment-${id}`,
    'data-seats': String(byId[id].seats),
    style: `width:${share(byId[id].seats)}`,
  })));

  const marker = el('span', {
    className: 'seat-marker',
    'data-testid': 'seat-chart-marker',
    'data-threshold': String(meta.simpleMajority),
    style: `left:${share(meta.simpleMajority)}`,
  }, [
    el('span', { className: 'seat-marker-label' }, [`${meta.simpleMajority}-vote majority`]),
  ]);

  const legend = el('div', { className: 'seat-legend' }, order.map((id) => el('span', {
    className: 'legend-item',
    'data-testid': `seat-chart-legend-${id}`,
  }, [
    el('span', { className: `legend-swatch seat-${id}`, 'aria-hidden': 'true' }),
    el('span', { className: 'legend-label' }, [byId[id].label]),
    el('span', { className: 'legend-value', 'data-testid': `bloc-total-${id}` }, [String(byId[id].seats)]),
  ])));

  return el('div', { className: 'seat-chart-block' }, [
    el('div', {
      className: 'seat-chart',
      'data-testid': 'seat-chart',
      'data-total': String(meta.totalSeats),
    }, [bar, marker]),
    legend,
    el('p', { className: 'seat-caption' }, [`Majority threshold: ${meta.simpleMajority} seats`]),
  ]);
}

export default function renderParliament(data) {
  const { meta } = data;
  const groups = buckets(data);
  const coalition = groups.find((b) => b.id === 'coalition');

  return el('div', { className: 'view view-parliament' }, [
    el('div', { className: 'standing-head' }, [
      el('span', { className: 'standing-figure' }, [String(coalition.seats)]),
      el('span', { className: 'standing-of' }, [`of ${meta.totalSeats} coalition seats`]),
    ]),

    seatChart(data, groups),

    el('section', { className: 'floor' }, [
      el('h2', { className: 'section-heading' }, ['Parliament Floor']),
      ...groups.map((b) => blocSection(data, b)),
    ]),

    renderBoard(data),
  ]);
}
