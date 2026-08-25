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
//
// v6 is the housekeeping pass on `manifest.json` and `offline.html` (new
// theme/background colours, dark-mode offline page): the list itself is
// unchanged, but two precached files' contents are, so a bump is still
// needed to evict the stale copies.
//
// v7 is the Crown icon. Both surfaces get their own mark for the first time —
// the mobile app the cropped Pikk Hermann silhouette, the desktop app the same
// crown with the palace beside it — so the list grows from four icons to
// thirteen. The bump matters more here than usual: without it a returning
// visitor is served the old castle out of the v6 cache and only sees the new
// mark on the visit after.
//
// v8 brings the MP portraits into the deployment. They were hotlinked from
// `api.riigikogu.ee` until August 2026, when two thirds of the URLs turned out
// to be dead — the CMS mints a new file uuid whenever a portrait is
// re-published — and the ones that answered were rate-limited into 429s by the
// hundred-image burst a roster paints. They are `assets/mps/<uuid>.webp` now:
// same origin, precached below, and the first thing in this app that works
// offline having previously not.
const CACHE_NAME = 'riigikogu-mobile-v8';

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

  // Every icon either manifest names, and nothing else. The masters the apps
  // never load — `icon-dark.svg`, `icon-maskable.svg` and their desktop pairs —
  // are deliberately absent: they are sources for `scripts/generate_icons.mjs`,
  // not assets a browser requests. Install is allowed to fail loudly in this
  // worker, so one entry naming a file that does not exist rejects `addAll()`
  // and kills registration for everyone; `tests/unit/icons.test.mjs` asserts
  // this list and the two manifests still agree.
  './icons/icon.svg',
  './icons/icon-mono.svg',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',

  './icons/desktop-icon.svg',
  './icons/desktop-icon-44.png',
  './icons/desktop-icon-192.png',
  './icons/desktop-icon-256.png',
  './icons/desktop-icon-512.png',
  './icons/desktop-icon-maskable-512.png',
  './icons/desktop-apple-touch-icon.png',

  // Every MP portrait, one per member, keyed by the member's uuid. Written by
  // `scripts/fetch_mp_photos.mjs` — the list is a hundred lines because it has
  // to be exact: `install` fails loudly here, so a name with no file behind it
  // kills registration for every visitor, and `tests/unit/photos.test.mjs`
  // holds this block to what `assets/mps/` actually contains.
  //
  // Portraits used to be `api.riigikogu.ee`'s, cross-origin, and invisible to
  // this worker. They are the app's own files now, which is what makes them
  // cacheable at all — see §4 of USABILITY.md and the script's header for why
  // hotlinking them could not be made to work.
  // BEGIN MP PORTRAITS — generated by scripts/fetch_mp_photos.mjs
  './assets/mps/001dd80c-38c3-4557-b3ee-408d3ffd5cd7.webp',
  './assets/mps/04510d7c-b12a-48aa-8402-80b0efb114a6.webp',
  './assets/mps/07003549-aa42-4764-8bdd-cab06cb94a92.webp',
  './assets/mps/07132cc4-5afc-4edb-9537-7c721ec39b2d.webp',
  './assets/mps/09500870-255e-416d-8eda-f80e9929adda.webp',
  './assets/mps/0c571754-914d-406a-baba-6734212353de.webp',
  './assets/mps/0e66e826-df65-4fdd-a098-66a7e9a7c911.webp',
  './assets/mps/0ef9e676-8ee6-481a-ae29-e1ce75af5aaa.webp',
  './assets/mps/0f9372ee-f108-47f9-9192-82ff84cf3efb.webp',
  './assets/mps/122e850b-5e6b-41f6-8b91-830ca8de8450.webp',
  './assets/mps/1600fe77-4b45-44ab-972a-181a5ef71767.webp',
  './assets/mps/17d27ea5-b5e6-43e0-86db-ebc15bdd5788.webp',
  './assets/mps/1839253a-aec0-4019-995a-1c031db8fd10.webp',
  './assets/mps/1c173f0d-6c5e-445a-934f-32e7edf903db.webp',
  './assets/mps/1d0b281d-b769-4e94-8c67-faa1cb1b1395.webp',
  './assets/mps/23161df7-bc1b-442e-b4cd-2d1f37627658.webp',
  './assets/mps/236e49d6-eecb-4562-8ad4-bedd586bb149.webp',
  './assets/mps/28e48bd7-9f1f-4d6a-b40c-9c6ff6d445e5.webp',
  './assets/mps/29068268-672d-451a-a08a-5727ec4300f4.webp',
  './assets/mps/2bc608c1-1c67-4db8-968b-94bc3947dfac.webp',
  './assets/mps/2dcb35ed-acbc-4bcf-9e9d-9da681842d6d.webp',
  './assets/mps/315ea785-8f59-40e5-a158-3de8b908572f.webp',
  './assets/mps/31eee189-0019-469f-8469-7da564bf1af9.webp',
  './assets/mps/3febb869-f443-4aba-908e-7c0c30f8c4dd.webp',
  './assets/mps/410c0030-7bcd-4977-85c2-27af3439770f.webp',
  './assets/mps/429e71ce-d5ba-4617-8db4-d546482d43bc.webp',
  './assets/mps/4a332fbb-be05-4cb2-b6a0-5916eb40fe89.webp',
  './assets/mps/4b96f3e5-af5e-41ce-86c9-3fdee3ce51da.webp',
  './assets/mps/4e2e1744-16b5-4d88-a08a-cf250c776956.webp',
  './assets/mps/4f816f8e-1501-4940-b87a-af029fcd98c0.webp',
  './assets/mps/53141769-f7bb-4995-8d12-5ff0d9c1eca1.webp',
  './assets/mps/54bc0d5b-7c98-4245-8682-4a3a0b6e0275.webp',
  './assets/mps/561abe91-76eb-45f3-90b0-efa94c663689.webp',
  './assets/mps/563f86fd-db45-4046-b8ed-b66e5a2aec45.webp',
  './assets/mps/5650dddf-f2ca-4b94-8888-e7482808f81b.webp',
  './assets/mps/586335bd-0e3f-4cee-a325-7af602224ca7.webp',
  './assets/mps/58be6531-1f4b-4b0b-9c21-92566a40ae8b.webp',
  './assets/mps/6434e7ab-6aba-4945-9812-e7a2e7c8bf3f.webp',
  './assets/mps/64c0141f-371b-4520-8a50-09e65231f775.webp',
  './assets/mps/658c9d00-82c9-4161-8314-48ff1d67e3b7.webp',
  './assets/mps/65b1d8bb-7f45-48f5-b4aa-7ba4ca459824.webp',
  './assets/mps/694b084f-e151-4f7e-8a5c-2664a40cee7a.webp',
  './assets/mps/6b45cfb5-8a17-481c-b674-80fc00c6cf5d.webp',
  './assets/mps/71bdc9b2-841d-408f-8ace-909e8c11d7d5.webp',
  './assets/mps/7251e077-1964-4f2b-9dba-349dc127b56e.webp',
  './assets/mps/7655e8d3-b658-49f0-8e09-f6cbc4a2c714.webp',
  './assets/mps/76c477e6-4b49-4d49-ad7b-a4853182a1da.webp',
  './assets/mps/798de8ee-0587-4543-aa2e-89c3f6c8f914.webp',
  './assets/mps/7b6823ed-96f9-462b-b931-3dd4faceb09e.webp',
  './assets/mps/7d6b0605-e425-41c8-9a53-3b92b81f21b1.webp',
  './assets/mps/7f83e40c-4854-4632-9372-448b3a5dc93a.webp',
  './assets/mps/80eac2f1-bb1e-4996-ac5a-4c3dba91bade.webp',
  './assets/mps/80f542c1-393a-46e2-9fca-99948e59850d.webp',
  './assets/mps/8600af41-4dcc-424d-9d05-7c851e5270b5.webp',
  './assets/mps/8940964b-6bfd-482d-a4f5-53f2cccb149d.webp',
  './assets/mps/8946b072-80c5-436e-95b2-41f928a7c636.webp',
  './assets/mps/8d9daaeb-dbaf-4887-8311-881b29bedfa9.webp',
  './assets/mps/90074aa2-4938-41a9-8275-3a6efa1cee31.webp',
  './assets/mps/9035e217-d990-40ca-87ed-54c77653c6d7.webp',
  './assets/mps/906f1a0a-0000-4a96-866c-b30f2b6adc49.webp',
  './assets/mps/94351dfe-449e-48db-9396-06cf204ce22e.webp',
  './assets/mps/94ffc777-09a5-4472-bf5d-ce16e78a2341.webp',
  './assets/mps/966e7ccd-b097-4e49-923c-c8d39dae2d62.webp',
  './assets/mps/98008392-64a2-4429-8a41-fb051823e402.webp',
  './assets/mps/987e47c7-929b-4437-9385-fab4f4fd7824.webp',
  './assets/mps/988995d4-3cbe-4ea7-acdd-6222d0b658b1.webp',
  './assets/mps/989194b6-b6cc-4c8f-9e6a-8eb8913d103e.webp',
  './assets/mps/9a8a55b8-c946-47a2-9e17-9978c3fd23f8.webp',
  './assets/mps/9d863d49-8bfb-4314-bd3c-cfa143f518c8.webp',
  './assets/mps/a12ffc5c-0809-46cb-abc4-cc99a7fa3f60.webp',
  './assets/mps/a39c4392-bbc8-4036-b923-0f5f2b3d9766.webp',
  './assets/mps/a5af5ad0-6e31-443a-9b12-15769d43e784.webp',
  './assets/mps/a5d17c31-61e5-4e45-87b0-5834b6728fe6.webp',
  './assets/mps/a62b7530-a1fb-4c0b-b041-f10c2cfaa31a.webp',
  './assets/mps/a78027e5-2480-49f2-a340-ee88daf92d53.webp',
  './assets/mps/afc264da-dc7d-4885-a971-0e645995e6de.webp',
  './assets/mps/b2226516-4cd4-4471-b93b-696c40b7a9e2.webp',
  './assets/mps/b5922bb2-56bb-4de6-a7e1-754553191c27.webp',
  './assets/mps/b5e0d7fe-b784-4057-bf7e-cc3f1873887d.webp',
  './assets/mps/b6f8dff5-7c69-4d4c-b978-be0a2ad6e161.webp',
  './assets/mps/bc9c1725-2fd8-4f54-a0e3-58b87e9dfe1f.webp',
  './assets/mps/c4e3fc0f-80fb-4a3e-b49e-80045c5253d9.webp',
  './assets/mps/c7f4f213-58a3-4b6f-a236-153644653d17.webp',
  './assets/mps/caea357b-12c0-4069-b53e-89f69f517212.webp',
  './assets/mps/d0d7a6a5-25de-40d0-b5df-09575a7c9bfc.webp',
  './assets/mps/d18cee4c-7b30-405f-96f2-4ab6f81efaf2.webp',
  './assets/mps/d4effc9d-0aee-4450-9926-5246efcda08c.webp',
  './assets/mps/d557812c-971d-415b-827d-aa6a382ec6ef.webp',
  './assets/mps/d5c54f88-dff3-486b-aac6-2cd124577d38.webp',
  './assets/mps/d5f3dddb-d809-448a-a94f-adbf208e408a.webp',
  './assets/mps/d7d9e4d7-699e-4038-83c3-d13369f644c9.webp',
  './assets/mps/d8b9f165-31aa-46a4-8dbd-964cbe89cfb8.webp',
  './assets/mps/db46f14c-3bdf-47a0-bed4-0172f7d942db.webp',
  './assets/mps/db532de2-5abd-4b6d-a82c-2d9a75fd9d18.webp',
  './assets/mps/ee639cdf-b86c-48b7-9b34-fbba9b83826d.webp',
  './assets/mps/f4e5d00e-19d1-428a-ba5e-5ce9ae4ef2c2.webp',
  './assets/mps/f6353ede-a0a5-4918-ab8b-790a1957c5cd.webp',
  './assets/mps/f8a770b2-916c-4172-84b3-005ba9906a18.webp',
  './assets/mps/fd2d1dd5-ff19-445e-b190-28aabb07763a.webp',
  './assets/mps/fd57045c-5dde-4c26-bf60-e5c294da0e4c.webp',
  './assets/mps/fe6fcd51-6911-4dc6-9232-ddeac5ec1155.webp',
  // END MP PORTRAITS
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
