/**
 * Desktop entry point — loads the data, paints the party palette, renders the
 * left rail, and switches between the three destinations.
 *
 * This is the desktop twin of `src/app.js`, and deliberately a twin rather than
 * a branch inside it: the two surfaces share the DATA and LOGIC layers and share
 * no view code at all (`USABILITY.md` §10.5). `src/data.js`, `src/lib/*` and
 * `src/dom.js` are reused exactly as the mobile app leaves them; everything this
 * surface draws lives in `src/views-desktop/` and `desktop.css`.
 *
 * ## State, and why some of it survives a view switch
 *
 * Each destination owns a slice of one object here. A slice outlives its view,
 * so coming back to Parliament finds the floor exactly as you left it. Two rules
 * cut across that:
 *
 * - Switching destinations closes any open seat popup (D1.2). A popup is a
 *   statement about the screen it was opened from.
 * - The Parliament highlight and the calculator's selection never meet (D2.9).
 *   They are separate slices, and nothing copies between them.
 *
 * `goToProfile` is the one path that writes another view's slice: a seat popup
 * or a Board row hands the Directory a member and clears the search, filter and
 * highlight on the way, so the Directory opens on that person and nothing else
 * (D2.6).
 */

import { loadData } from '../data.js';
import { el, icon, replace } from '../dom.js';
import { emptySelection } from '../lib/calculator.js';
import { buildGrid, loadSeating } from './seating.js';
import { formatUpdated, RAIL_ICONS } from './parts.js';
import renderParliament, { composition } from './parliament.js';
import renderDirectory from './directory.js';
import renderCalculator from './calculator.js';

const VIEWS = [
  {
    id: 'parliament',
    label: 'Parliament',
    title: 'Parliament',
    sub: 'Seating plan, voting-bloc composition and the Board',
    glyph: RAIL_ICONS.parliament,
    render: renderParliament,
  },
  {
    id: 'directory',
    label: 'Directory',
    title: 'Members of the Riigikogu',
    sub: 'All 101 members — search, filter by voting bloc, read a profile',
    glyph: RAIL_ICONS.directory,
    render: renderDirectory,
  },
  {
    id: 'calculator',
    label: 'Calculator',
    title: 'Coalition calculator',
    sub: 'Build a voting group and see which constitutional thresholds it clears',
    glyph: RAIL_ICONS.calculator,
    render: renderCalculator,
  },
];

/**
 * Publish every party colour as a CSS custom property — the join between
 * `data/parties.json` and `desktop.css`.
 *
 * The stylesheet refers to `--party-reform`, never to `#FFD700`, so a colour is
 * a data change and never a CSS edit, and a party that appears or disappears
 * needs no stylesheet at all. Both `textColor` and `color` are published because
 * a party's label colour is **content**: Reform seats stay black-on-yellow in
 * dark mode, and a theme token there would be wrong (`USABILITY.md` §10.5).
 *
 * Duplicated from `src/app.js` rather than imported: importing that module would
 * run the mobile app's `start()` and register the mobile service worker.
 */
function paintPalette(parties) {
  const root = document.documentElement.style;
  for (const party of parties) {
    root.setProperty(`--party-${party.id}`, party.color);
    root.setProperty(`--party-${party.id}-text`, party.textColor);
  }
}

function rail(active, onSelect) {
  return el('nav', { className: 'dk-rail', 'aria-label': 'Sections' }, [
    el('span', { className: 'dk-rail-badge', 'aria-hidden': 'true' }, ['XV']),
    ...VIEWS.map((view) => el('button', {
      type: 'button',
      className: 'dk-rail-item',
      'data-testid': `nav-${view.id}`,
      'data-active': String(view.id === active),
      'aria-current': view.id === active ? 'page' : null,
      onclick: () => onSelect(view.id),
    }, [
      icon(view.glyph, { size: 25, stroke: 1.9 }),
      el('span', { className: 'dk-rail-label' }, [view.label]),
    ])),
  ]);
}

async function start() {
  const app = document.getElementById('app');

  let data;
  let seating;
  try {
    [data, seating] = await Promise.all([loadData(), loadSeating()]);
  } catch (error) {
    replace(app, el('p', { className: 'boot boot-error' }, [
      `Could not load data/*.json — ${error.message}`,
    ]));
    return;
  }

  paintPalette(data.parties);
  const grid = buildGrid(seating, data);

  const state = {
    view: VIEWS[0].id,
    parliament: { highlight: [] },
    directory: { query: '', filter: 'bloc-all', selected: data.mps[0]?.uuid ?? null },
    calculator: { selection: emptySelection() },
  };

  const railSlot = el('div', { className: 'dk-rail-slot' });
  const headText = el('div', { className: 'dk-head-text' });
  const headAside = el('div', { className: 'dk-head-aside' });
  const main = el('main', { className: 'dk-main', id: 'view' });

  function show(id) {
    state.view = id;
    const view = VIEWS.find((v) => v.id === id);

    replace(headText,
      // Computed from meta.updatedAt, never typed. The retiring desktop app
      // carried a hand-written date above numbers that had moved on without it.
      el('p', { className: 'dk-kicker dk-provenance', 'data-testid': 'data-updated' }, [
        `XV Riigikogu · updated ${formatUpdated(data.meta.updatedAt)}`,
      ]),
      el('h1', { className: 'dk-title' }, [view.title]),
      el('p', { className: 'dk-subtitle' }, [view.sub]),
    );

    // The composition block belongs to Parliament and is drawn in the page
    // header there, where the mockups put it. The other two destinations own
    // their own headline figure and would be repeating themselves.
    replace(headAside, id === 'parliament' ? composition(data) : null);

    // Rendering the destination outright, rather than hiding one behind
    // another, is what makes "the active destination is the only one shown"
    // checkable: only its controls exist in the DOM at all (D1.2). It also
    // takes any open seat popup with it.
    replace(main, view.render({ data, grid, state, goToProfile }));
    replace(railSlot, rail(id, show));
    main.setAttribute('data-view', id);
    window.scrollTo(0, 0);
  }

  function goToProfile(uuid) {
    state.directory.selected = uuid;
    state.directory.query = '';
    state.directory.filter = 'bloc-all';
    state.parliament.highlight = [];
    show('directory');
  }

  replace(app,
    railSlot,
    el('div', { className: 'dk-page' }, [
      el('header', { className: 'dk-head' }, [headText, headAside]),
      main,
    ]),
  );

  show(state.view);
}

start();

/**
 * Register the service worker — the repository root's, the same one
 * `src/app.js` registers, and deliberately not a second one of this surface's
 * own (Phase 3 PR C, `USABILITY.md` §10.11).
 *
 * A worker's scope is capped by the directory its script is served from, so the
 * root worker's scope is the whole deployment — `/riigikogu-mobile/` in
 * production, `/` under the test server — and this directory is already inside
 * it. A `desktop/service-worker.js` would take the narrower, nested scope back
 * off it and give the two surfaces two caches of the same `data/*.json`, which
 * is a way to be offline with two different rosters.
 *
 * Failure is swallowed for the same reason as on mobile: the browser may block
 * workers (the suite does for every non-PWA spec), and an app that renders fine
 * online must not break because its offline support could not install.
 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('../../service-worker.js', import.meta.url)).catch(() => {});
  });
}
