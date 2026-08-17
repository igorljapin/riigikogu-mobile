/**
 * Service worker for the XV Riigikogu dashboard.
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
const CACHE_NAME = 'riigikogu-mobile-v4';

// Where this app is deployed. Not used to build URLs — the relative list above
// does that — but checked at install time, because a silent mount-point mismatch
// is precisely the bug this file is recovering from.
const DEPLOY_SCOPE = '/riigikogu-mobile/';

const OFFLINE_URL = './offline.html';

/**
 * The Phase-4 file layout, in full: the shell, every ES module, and the JSON the
 * app fetches at runtime. The data matters as much as the code here — the app
 * renders nothing without `data/*.json`, so a shell-only precache would give an
 * offline user a permanent "Could not load data".
 *
 * MP photos are deliberately absent: they live on `api.riigikogu.ee`, a
 * different origin, and the fetch handler leaves cross-origin requests alone.
 * Offline, the roster renders with its photo placeholders.
 */
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './offline.html',
  './manifest.json',
  './styles.css',

  './src/app.js',
  './src/data.js',
  './src/dom.js',
  './src/lib/calculator.js',
  './src/lib/factions.js',
  './src/views/parliament.js',
  './src/views/mps.js',
  './src/views/calculator.js',
  './src/views/board.js',

  // The five files src/data.js loads. `catalogues.json` is intentionally not
  // here: the monthly job writes it, nothing in the app reads it.
  './data/parties.json',
  './data/mps.json',
  './data/alignment.json',
  './data/board.json',
  './data/meta.json',

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
