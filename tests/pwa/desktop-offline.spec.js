const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { DESKTOP, openView } = require('../helpers/desktop');
const { REPO, precacheList, withServerDown, workerReady } = require('../helpers/pwa');

/**
 * PWA install + offline, for the desktop surface — `USABILITY.md` §10.11.
 *
 * The twin of `offline.spec.js`, and deliberately a second file rather than
 * more cases in that one: these run at the artboard viewport and hold §10.11's
 * promises, not §1's. Nothing about the mobile surface's five promises changed;
 * the worker they describe simply grew a second app to serve.
 *
 * Three things to know before editing.
 *
 * **There is one worker, not two** (D5.2). A worker's scope is capped by the
 * directory its script is served from, so the repository root's
 * `service-worker.js` already covers `desktop/`; a nested
 * `desktop/service-worker.js` would win inside that directory and keep its own
 * copy of `data/*.json`, which is a way to be offline with two different
 * rosters.
 *
 * **The lists these tests compare are read, not typed** — the shipped modules
 * off the filesystem (D5.3), the requested URLs off the app's own resource
 * timings, and the precache off `service-worker.js` (D5.4). A file added to the
 * surface and forgotten in the worker fails here on the day it is written.
 *
 * **Offline means the server is gone**, not `context.setOffline` — see
 * `tests/helpers/pwa.js` for why that emulation does not survive the navigation
 * these tests need.
 */

// The rest of the suite blocks service workers for determinism; this file needs
// them, and it needs the artboard viewport the desktop surface is drawn for.
test.use({ ...DESKTOP, serviceWorkers: 'allow' });

const DEPLOY_SCOPE = '/riigikogu-mobile/';
const DESKTOP_SCOPE = '/riigikogu-mobile/desktop/';

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO, rel), 'utf8'));

/** Every module the desktop surface owns, as the directory actually holds it. */
function desktopModules() {
  return fs
    .readdirSync(path.join(REPO, 'src', 'views-desktop'))
    .filter((name) => name.endsWith('.js'))
    .map((name) => `/src/views-desktop/${name}`);
}

test.describe('PWA — the desktop surface', () => {
  test('D5.1 the desktop shell registers the worker without error', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/desktop/index.html');
    await expect(page.getByTestId('nav-parliament')).toBeVisible();

    const { active, scope } = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return { active: Boolean(registration.active), scope: new URL(registration.scope).pathname };
    });

    expect(active).toBe(true);
    // The scope *contains* this page rather than equalling its directory: the
    // worker is the root one, and `desktop/` sits inside it.
    expect(new URL(page.url()).pathname.startsWith(scope)).toBe(true);
    expect(errors.filter((e) => /SW failed|service-worker/i.test(e))).toEqual([]);
  });

  test('D5.2 both surfaces share one worker and one cache', async ({ page }) => {
    await page.goto('/index.html');
    await workerReady(page);
    await page.goto('/desktop/index.html');
    await workerReady(page);
    await expect(page.getByTestId('nav-parliament')).toBeVisible();

    const { scopes, names } = await page.evaluate(async () => ({
      scopes: (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope),
      names: await caches.keys(),
    }));

    // Visiting both surfaces registers nothing new: one worker serves them, and
    // there is one copy of `data/*.json` behind them both.
    expect(scopes).toHaveLength(1);
    expect(names).toHaveLength(1);
  });

  test('D5.3 the precache lists every file the desktop surface ships', async () => {
    const precache = precacheList();
    const shipped = [
      '/desktop/index.html',
      '/desktop/manifest.json',
      '/desktop.css',
      // The one dataset only this surface reads; the other five are §1's.
      '/data/seating.json',
      ...desktopModules(),
    ];

    expect(shipped.filter((file) => !precache.includes(file))).toEqual([]);
  });

  test('D5.4 everything the desktop surface requests is in that list', async ({ page }) => {
    await page.goto('/desktop/index.html');
    await expect(page.getByTestId('nav-parliament')).toBeVisible();
    // All three destinations, because a module or a dataset may be fetched by
    // one of them and by nothing else.
    await openView(page, 'directory');
    await openView(page, 'calculator');
    await openView(page, 'parliament');

    const requested = await page.evaluate(() => {
      const urls = new Set([location.href, ...performance.getEntriesByType('resource').map((e) => e.name)]);
      return [...urls]
        // MP photos are `api.riigikogu.ee`'s and deliberately uncached (§4);
        // the worker itself is the browser's to fetch and update, never its own
        // cache entry.
        .filter((url) => url.startsWith(location.origin))
        .map((url) => new URL(url).pathname)
        .filter((pathname) => pathname !== '/service-worker.js');
    });

    const precache = precacheList();
    expect(requested.filter((pathname) => !precache.includes(pathname))).toEqual([]);
    // A guard on the guard: an assertion over an empty list passes for the
    // wrong reason.
    expect(requested.length).toBeGreaterThan(10);
  });

  test('D5.5 the desktop manifest is a second app nested in the mobile scope', async ({ page }) => {
    await page.goto('/desktop/index.html');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', './manifest.json');

    const response = await page.request.get('/desktop/manifest.json');
    expect(response.ok()).toBe(true);
    const manifest = await response.json();

    expect(manifest.scope).toBe(DESKTOP_SCOPE);
    expect(manifest.start_url).toBe(DESKTOP_SCOPE);
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);

    // Nested inside the mobile scope and not equal to it: two apps, two start
    // URLs, one deployment.
    const mobile = readJson('manifest.json');
    expect(manifest.scope.startsWith(DEPLOY_SCOPE)).toBe(true);
    expect(manifest.scope).not.toBe(mobile.scope);
    expect(manifest.start_url).not.toBe(mobile.start_url);

    // Installable shape: a name, and both icon sizes Chrome and Edge ask for.
    expect(manifest.name).toBeTruthy();
    const sizes = manifest.icons.map((entry) => entry.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');

    // Every icon src is relative, so it resolves under `/` here and under
    // `/riigikogu-mobile/` in production — the rule the precache follows too.
    for (const entry of manifest.icons) {
      expect(entry.src.startsWith('/')).toBe(false);
      const url = new URL(entry.src, new URL('/desktop/manifest.json', page.url()));
      expect((await page.request.get(url.href)).ok(), entry.src).toBe(true);
    }
  });

  test('D5.6 the desktop app opens with the server gone, and its calculator works', async ({ page }) => {
    await withServerDown(async (origin, unplug) => {
      // The install story, and the reason the precache list matters at all: the
      // mobile app is what got installed, the worker precached both surfaces,
      // and the desktop URL is opened for the first time on a train. Visiting
      // `desktop/` first would prove much less — the fetch handler caches what
      // it serves, so a file nobody precached is in the cache the moment it has
      // been loaded once.
      await page.goto(`${origin}/index.html`);
      await workerReady(page);

      await unplug();

      await page.goto(`${origin}/desktop/index.html`);
      await expect(page.getByTestId('nav-parliament')).toBeVisible();
      await expect(page.getByTestId('floor-grid')).toBeVisible();

      // The floor is the join of two cached files: `seating.json` for the cells
      // and `mps.json` for who is in them. Counting the occupied ones proves
      // both came out of the cache, which a shell-only precache would not.
      const seating = readJson('data/seating.json');
      await expect(page.locator('#view [data-mp-uuid][data-seat-state]'))
        .toHaveCount(Object.keys(seating.seats).length);

      await openView(page, 'calculator');
      await page.getByTestId('calc-preset-coalition').click();

      // Against `meta.json` deliberately: the number has to come from the
      // cached data, and "greater than zero" would also pass on an empty roster.
      const meta = readJson('data/meta.json');
      await expect(page.getByTestId('calc-total'))
        .toHaveAttribute('data-seats', String(meta.coalitionSeats));
    });
  });
});
