/**
 * Service worker for the XV Riigikogu dashboard — **both surfaces**.
 *
 * Since Phase 3 PR C it also covers the desktop surface at `desktop/`. One
 * worker, not two: a worker's scope is capped by the directory its script is
 * served from, so this one's scope is the whole deployment and already contains
 * `desktop/`. A nested `desktop/service-worker.js` would win inside that
 * directory and hold its own copy of `data/*.json`, which is a way to be
 * offline with two different rosters. The desktop shell registers *this* file
 * (`src/views-desktop/app.js`), and `USABILITY.md` §10.11 records the decision.
 *
 * Phase 6 of ARCHITECTURE_PLAN.md. The previous version precached
 * `/riigikogu-dashboard/index.html` and four other absolute paths under a
 * directory that does not exist — the site is served from
 * `https://igorljapin.github.io/riigikogu-mobile/`. Every entry 404'd,
 * `cache.addAll()` rejected, install failed, and the failure was swallowed by a
 * `.catch(console.error)`. Offline mode has never worked for anyone.
 *
 * Two changes stop that recurring:
 *
 * 1. **Every precache entry is relative** and resolves against this worker's own
 *    URL. That is correct under `/riigikogu-mobile/` in production *and* under
 *    `/` when the suite serves the repo root — one list, no environment
 *    switching, and no absolute path to drift out of date again.
 * 2. **Install is allowed to fail loudly.** A rejected `addAll()` now fails
 *    registration instead of being logged and forgotten, so the PWA spec sees it.
 */

// Bumped whenever the precache list changes, or whenever what those files
// contain changes: activate deletes every cache whose name is not this one, so
// a bump is what evicts stale assets.
//
// v4 is the Aug-2026 redesign. The list itself is unchanged — the redesign
// added no files — but the stylesheet and every view module hold new content,
// and without a bump the fetch handler hands a returning visitor the
// pre-redesign copy and only refreshes it for the visit after.
//
// v5 adds the desktop surface: its shell and manifest, `desktop.css`, every
// `src/views-desktop/` module and `data/seating.json`.
const CACHE_NAME = 'riigikogu-mobile-v5';

// Where this app is deployed. Not used to build URLs — the relative list above
// does that — but checked at install time, because a silent mount-point mismatch
// is precisely the bug this file is recovering from.
const DEPLOY_SCOPE = '/riigikogu-mobile/';

const OFFLINE_URL = './offline.html';

/**
 * The whole file layout, both surfaces: the two shells, every ES module either
 * one imports, and the JSON they fetch at runtime. The data matters as much as
 * the code here — neither app renders anything without `data/*.json`, so a
 * shell-only precache would give an offline user a permanent "Could not load
 * data".
 *
 * The shared layers appear once and are listed once, because they *are* shared:
 * `src/data.js`, `src/dom.js` and `src/lib/*` are the same modules under both
 * surfaces, and `data/seating.json` is read only by the desktop one.
 *
 * MP photos are deliberately absent: they live on `api.riigikogu.ee`, a
 * different origin, and the fetch handler leaves cross-origin requests alone.
 * Offline, both rosters render with their photo placeholders.
 */
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './offline.html',
  './manifest.json',
  './styles.css',

  // The desktop surface's shell and its own manifest — a second app, nested
  // inside this one's scope (USABILITY.md §10.11). Both the directory URL and
  // the file are listed, for the same reason `./` and `./index.html` are: a
  // visitor may have either in their history.
  './desktop/',
  './desktop/index.html',
  './desktop/manifest.json',
  './desktop.css',

  // Shared by both surfaces.
  './src/data.js',
  './src/dom.js',
  './src/lib/calculator.js',
  './src/lib/factions.js',

  './src/app.js',
  './src/views/parliament.js',
  './src/views/mps.js',
  './src/views/calculator.js',
  './src/views/board.js',

  './src/views-desktop/app.js',
  './src/views-desktop/parts.js',
  './src/views-desktop/floor.js',
  './src/views-desktop/seating.js',
  './src/views-desktop/parliament.js',
  './src/views-desktop/directory.js',
  './src/views-desktop/calculator.js',

  // The five files src/data.js loads, plus the floor plan the desktop surface
  // loads for itself. `catalogues.json` is intentionally absent: the monthly job
  // writes it, nothing in either app reads it.
  './data/parties.json',
  './data/mps.json',
  './data/alignment.json',
  './data/board.json',
  './data/meta.json',
  './data/seating.json',

  './icons/icon.svg',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  const scope = new URL(self.registration.scope).pathname;
  if (scope !== DEPLOY_SCOPE && scope !== '/') {
    console.warn(
      `[SW] scope ${scope} is neither the deployed ${DEPLOY_SCOPE} nor a local root.`,
    );
  }

  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/**
 * Cache-first with a background refresh: the cached copy is served immediately
 * and the network copy replaces it for next time. Data staleness is bounded by
 * one visit, and the monthly refresh is at most a day's news anyway.
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        // Fire and forget. Offline this rejects, which is not an error — the
        // cached response has already been returned.
        event.waitUntil(fetchAndCache(request).catch(() => {}));
        return cached;
      }
      return fetchAndCache(request).catch(() => fallback(request));
    }),
  );
});

async function fetchAndCache(request) {
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

/** Offline and never cached: a real page for navigations, a 503 for the rest. */
async function fallback(request) {
  if (request.mode === 'navigate') {
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
  }
  return new Response('Offline', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/plain' },
  });
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
