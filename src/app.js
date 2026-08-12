/**
 * App entry point — loads the data, paints the party palette, renders the
 * shell, and switches between the three tabs.
 *
 * It owns no arithmetic and no markup beyond the shell: every number comes from
 * `src/lib/`, every screen from `src/views/`. That separation is the whole
 * reason this file is thirty lines of routing rather than a bundle.
 */

import { loadData } from './data.js';
import { closeAllOverlays, el, icon, ICONS, replace } from './dom.js';
import renderParliament from './views/parliament.js';
import renderMembers from './views/mps.js';
import renderCalculator from './views/calculator.js';

const TABS = [
  { id: 'parliament', label: 'Parliament', glyph: ICONS.building, render: renderParliament },
  { id: 'members', label: 'Members', glyph: ICONS.users, render: renderMembers },
  { id: 'calculator', label: 'Calculator', glyph: ICONS.calculator, render: renderCalculator },
];

/**
 * Publish every party colour as a CSS custom property.
 *
 * This is the join between `data/parties.json` and `styles.css`: the stylesheet
 * refers to `--party-reform`, never to `#FFD700`, so a colour is a data change
 * and not a stylesheet edit — and a party that appears or disappears needs no
 * CSS at all.
 */
function paintPalette(parties) {
  const root = document.documentElement.style;
  for (const p of parties) {
    root.setProperty(`--party-${p.id}`, p.color);
    root.setProperty(`--party-${p.id}-text`, p.textColor);
  }
}

/** "2026-08-12T11:12:59Z" → "12 Aug 2026". */
function formatUpdated(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  }).format(date);
}

function header(data) {
  return el('header', { className: 'app-header' }, [
    el('h1', { className: 'app-title' }, ['XV Riigikogu']),
    el('p', { className: 'app-subtitle' }, [
      `Estonian Parliament • ${data.meta.totalSeats} MPs • `,
      // The bundle hand-typed "Jan 2026" here and nothing ever recomputed it.
      el('span', { 'data-testid': 'data-updated' }, [`Updated ${formatUpdated(data.meta.updatedAt)}`]),
    ]),
  ]);
}

function nav(active, onSelect) {
  return el('nav', { className: 'tab-bar', 'aria-label': 'Sections' },
    TABS.map((t) => el('button', {
      type: 'button',
      className: `tab${t.id === active ? ' is-active' : ''}`,
      'data-testid': `tab-${t.id}`,
      'aria-current': t.id === active ? 'page' : null,
      onclick: () => onSelect(t.id),
    }, [icon(t.glyph, { size: 22 }), el('span', { className: 'tab-label' }, [t.label])])),
  );
}

async function start() {
  const app = document.getElementById('app');

  let data;
  try {
    data = await loadData();
  } catch (error) {
    replace(app, el('p', { className: 'boot boot-error' }, [
      `Could not load data/*.json — ${error.message}`,
    ]));
    return;
  }

  paintPalette(data.parties);

  const view = el('main', { className: 'app-main', id: 'view' });
  const tabBar = el('div', { className: 'tab-bar-slot' });
  replace(app, header(data), view, tabBar);

  /**
   * Tab switching replaces the view's contents outright rather than hiding one
   * screen behind another, so only the active tab's controls exist in the DOM.
   * The bundle did the same; the Usability Contract asserts it
   * ("each tab shows its own content and hides the others").
   */
  function show(id) {
    // Overlays belong to the tab that opened them.
    closeAllOverlays();
    replace(view, TABS.find((t) => t.id === id).render(data));
    replace(tabBar, nav(id, show));
    window.scrollTo(0, 0);
  }

  show(TABS[0].id);
}

start();

/**
 * The service worker is Phase 6's. Registering it here keeps the app's shape
 * unchanged from the bundle's — the precache paths in `service-worker.js` still
 * point at `/riigikogu-dashboard/`, so installation fails and offline mode does
 * not work, exactly as `BEHAVIOR_SNAPSHOT.md` §9 records. The PWA specs stay
 * `fixme` until that file is fixed.
 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('../service-worker.js', import.meta.url)).catch(() => {});
  });
}
