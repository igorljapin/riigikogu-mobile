const { test, expect } = require('@playwright/test');
const { withServerDown, workerReady } = require('../helpers/pwa');

/**
 * PWA install + offline.
 *
 * Written in Phase 2 as a `test.fixme` bug report: `service-worker.js`
 * precached `/riigikogu-dashboard/…` while the site is served from
 * `/riigikogu-mobile/`, so every entry 404'd and installation failed
 * (BEHAVIOR_SNAPSHOT.md §9 defect 1, ARCHITECTURE_PLAN.md finding 6). **Phase 6
 * fixed it and removed the markers; these run for real now.**
 *
 * One thing to know before editing: the suite serves the repo root, so the app
 * is at `/` here and at `/riigikogu-mobile/` in production. That is why the
 * worker's precache list is relative — it resolves against the worker's own URL
 * in both — and why the assertion below is about the *absence* of the dead
 * absolute path rather than the presence of a live one.
 */

// The rest of the suite blocks service workers for determinism; this file needs them.
test.use({ serviceWorkers: 'allow' });

const DEPLOY_SCOPE = '/riigikogu-mobile/';
const DEAD_SCOPE = '/riigikogu-dashboard/';

test.describe('PWA — install and offline', () => {
  test('the service worker registers successfully', async ({ page }) => {
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/index.html');

    const registered = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return Boolean(registration && registration.active);
    });

    expect(registered).toBe(true);
    expect(errors.filter((e) => /SW failed|service-worker/i.test(e))).toEqual([]);
  });

  test('the precache list resolves against the path the app is served from', async ({ page }) => {
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '../../service-worker.js'),
      'utf8',
    );
    // Comments are allowed to name the dead path — the file's header explains
    // the bug it is recovering from, and that history is worth keeping. Code is
    // not: strip comments, then assert nothing live still points there.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toContain(DEAD_SCOPE);
    expect(code).toContain(DEPLOY_SCOPE);

    // The assertion that would have caught the original bug: whatever the list
    // contains, the entries have to exist under the scope actually being served.
    await page.goto('/index.html');
    await page.evaluate(() => navigator.serviceWorker.ready);

    const { scope, missing } = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const cacheNames = await caches.keys();
      const cache = await caches.open(cacheNames.find((n) => n.startsWith('riigikogu-mobile-')));
      const cached = (await cache.keys()).map((request) => request.url);
      const wanted = ['index.html', 'styles.css', 'src/app.js', 'data/mps.json', 'data/meta.json'];
      return {
        scope: registration.scope,
        missing: wanted.filter((f) => !cached.some((url) => url.endsWith(f))),
      };
    });

    expect(missing).toEqual([]);
    expect(scope.endsWith('/')).toBe(true);
  });

  test('manifest start_url and scope match the deployment path', async ({ page }) => {
    const response = await page.request.get('/manifest.json');
    expect(response.ok()).toBe(true);
    const manifest = await response.json();

    expect(manifest.start_url).toContain(DEPLOY_SCOPE);
    expect(manifest.scope).toContain(DEPLOY_SCOPE);
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  test('the app still renders after going offline', async ({ page }) => {
    // Offline here means the server is gone, not `context.setOffline` — see
    // `tests/helpers/pwa.js`. Phase 3 PR C changed the mechanism and not the
    // promise: 5.4 said the same thing before, over an emulation a restarted
    // worker did not inherit, so the app was quietly still on the network.
    await withServerDown(async (origin, unplug) => {
      await page.goto(`${origin}/index.html`);
      await workerReady(page);

      await unplug();
      await page.reload();

      await expect(page.getByText('XV Riigikogu', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Calculator', exact: true })).toBeVisible();
    });
  });

  test('MP portraits are drawn offline, from the cache', async ({ page }) => {
    // New in Aug 2026, and the reason §4's "photos are the one thing that does
    // not work offline" is gone. They were `api.riigikogu.ee`'s until then —
    // cross-origin, so this worker never saw them, and two thirds of the URLs
    // were dead anyway. They are `assets/mps/<uuid>.webp` now, precached with
    // the rest of the app.
    await withServerDown(async (origin, unplug) => {
      await page.goto(`${origin}/index.html`);
      await workerReady(page);

      await unplug();
      await page.reload();

      await page.getByRole('button', { name: 'Members', exact: true }).click();
      const avatar = page.getByTestId('mp-row-avatar').first();
      await expect(avatar).toHaveAttribute('data-avatar', 'photo');

      // The attribute says the image fired `load`; this says the browser has
      // actual pixels, which is the half a broken cache entry would fail.
      const drawn = await avatar.locator('img').evaluate((img) => img.naturalWidth);
      expect(drawn).toBeGreaterThan(0);
    });
  });

  test('the calculator works offline, from cached data', async ({ page }) => {
    // Phase 4 moved the roster into data/*.json fetched at runtime, so offline
    // support has to cover the data as well as the shell.
    await withServerDown(async (origin, unplug) => {
      await page.goto(`${origin}/index.html`);
      await workerReady(page);

      await unplug();
      await page.reload();

      await page.getByRole('button', { name: 'Calculator', exact: true }).click();
      await page.getByRole('button', { name: 'Coalition', exact: true }).click();

      const total = await page.evaluate(() => {
        for (const el of document.querySelectorAll('*')) {
          const m = /^(\d+)\s*\/\s*101$/.exec((el.textContent || '').trim());
          if (m) return Number(m[1]);
        }
        return 0;
      });
      expect(total).toBeGreaterThan(0);
    });
  });
});
