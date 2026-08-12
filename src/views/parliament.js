/**
 * Parliament tab — who holds how many seats, and who can pass what.
 *
 * Every number here is a **voting-bloc** count. That is the distinction the
 * whole data model exists to preserve: the API's registered figures answer
 * procedural questions (speaking time, committee entitlements), and this screen
 * answers a different one — will this pass. Reform reads 38 here and 36 in the
 * registry, and both are correct (`data/README.md`).
 *
 * The one deliberate departure from the shipped app: there are **three**
 * buckets. The bundle had two and filed all nine party-less MPs under
 * Opposition, which credited the opposition with nine votes that have no whip
 * behind them (`BEHAVIOR_SNAPSHOT.md` §8.4). They now have their own section and
 * belong to no bloc.
 */

import { buckets, mpsInVotingBloc, votingBlocSeats } from '../data.js';
import { closeButton, el, openOverlay, replace } from '../dom.js';
import renderBoard from './board.js';

/** The Parliament chip abbreviates the non-affiliated group; the rest do not. */
const CHIP_LABELS = { independent: 'Indep.' };

function chipLabel(partyRecord) {
  return CHIP_LABELS[partyRecord.id] ?? partyRecord.short;
}

/* ------------------------------------------------------------------ *
 * Party sheet
 * ------------------------------------------------------------------ */

/**
 * The overlay a party chip opens: everyone whose vote counts toward that party,
 * with the office they hold captioned beside their name.
 *
 * Names are not individually clickable — that is the shipped behaviour, and the
 * Members tab is where an MP's detail lives.
 */
function openPartySheet(data, partyRecord) {
  const members = mpsInVotingBloc(data, partyRecord.id);
  const overlay = openOverlay({ testid: 'party-sheet', label: partyRecord.short });

  replace(overlay.header,
    el('div', { className: 'party-sheet-title' }, [
      el('span', {
        className: 'party-badge',
        style: `background:var(--party-${partyRecord.id});color:var(--party-${partyRecord.id}-text)`,
      }, [partyRecord.short]),
      el('span', { className: 'party-sheet-count' }, [`${members.length} members`]),
    ]),
    closeButton(overlay.close, 'party-sheet-close'),
  );

  replace(overlay.body,
    el('div', { className: 'party-sheet-list' }, members.map((mp) => el('div', {
      className: 'party-sheet-member',
      'data-testid': 'party-sheet-member',
      'data-mp-uuid': mp.uuid,
    }, [
      el('span', { className: 'party-sheet-name' }, [mp.usaFriendship ? `${mp.name} 🇺🇸` : mp.name]),
      officeCaption(mp) && el('span', { className: 'party-sheet-role' }, [officeCaption(mp)]),
    ]))),
  );
}

/** `Faction Chairman`, `First Vice-President`, … or nothing. */
function officeCaption(mp) {
  if (mp.boardRole) return mp.boardRole.replace(' of the Riigikogu', '');
  return mp.factionRole ?? null;
}

/* ------------------------------------------------------------------ *
 * The tab
 * ------------------------------------------------------------------ */

function partyChip(data, partyRecord, size) {
  const seats = votingBlocSeats(data, partyRecord.id);
  return el('button', {
    type: 'button',
    className: `party-chip party-chip-${size}`,
    'data-testid': `party-chip-${partyRecord.id}`,
    'data-party-id': partyRecord.id,
    style: `background:var(--party-${partyRecord.id});color:var(--party-${partyRecord.id}-text)`,
    onclick: () => openPartySheet(data, partyRecord),
  }, [
    el('span', { className: 'party-chip-seats' }, [String(seats)]),
    el('span', { className: 'party-chip-name' }, [chipLabel(partyRecord)]),
  ]);
}

function blocSection(data, bucket) {
  // Coalition chips render larger than the rest, as in the shipped app.
  const size = bucket.id === 'coalition' ? 'lg' : 'sm';
  return el('section', { className: `bloc-section bloc-${bucket.id}` }, [
    el('h3', {
      className: 'bloc-heading',
      'data-testid': `bloc-heading-${bucket.id}`,
    }, [`${bucket.label} (${bucket.seats} seats)`]),
    el('div', { className: 'party-chips' }, bucket.parties.map((p) => partyChip(data, p, size))),
  ]);
}

function statTile(bucket) {
  return el('div', { className: `stat stat-${bucket.id}` }, [
    el('div', { className: 'stat-number', 'data-testid': `bloc-total-${bucket.id}` }, [String(bucket.seats)]),
    el('div', { className: 'stat-label' }, [bucket.label]),
  ]);
}

export default function renderParliament(data) {
  const { meta } = data;
  const groups = buckets(data);
  const [coalition, opposition, unaligned] = groups;

  const bar = el('div', { className: 'majority-bar', role: 'img',
    'aria-label': `Coalition ${coalition.seats}, opposition ${opposition.seats}, unaligned ${unaligned.seats} of ${meta.totalSeats} seats` },
    groups.map((b) => el('span', {
      className: `majority-bar-part majority-bar-${b.id}`,
      style: `width:${(b.seats / meta.totalSeats) * 100}%`,
    })),
  );

  return el('div', { className: 'view view-parliament' }, [
    el('div', { className: 'stats-row' }, groups.map(statTile)),

    el('div', { className: 'majority-card' }, [
      bar,
      el('p', { className: 'majority-caption' }, [`Majority threshold: ${meta.simpleMajority} seats`]),
    ]),

    el('div', { className: 'floor-intro' }, [
      el('h2', { className: 'floor-heading' }, ['Parliament Floor']),
      el('p', { className: 'floor-subtitle' }, ['Tap a party to see its members']),
    ]),

    ...groups.map((b) => blocSection(data, b)),

    renderBoard(data),
  ]);
}
