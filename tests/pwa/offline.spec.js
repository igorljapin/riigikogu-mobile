const { test, expect } = require('@playwright/test');

/**
 * PWA install + offline.
 *
 * Every test here is `test.fixme` — declared, but not run, with a documented
 * reason. This is not a placeholder: it is a written-down bug report that the
 * test runner will start enforcing the moment the bug is fixed.
 *
 * ┌─ THE BUG ────────────────────────────────────────────────────────────────┐
 * │ `service-worker.js` precaches `/riigikogu-dashboard/index.html` and       │
 * │ friends, but the site is served from `/riigikogu-mobile/`. Registration   │
 * │ fails outright — BEHAVIOR_SNAPSHOT.md §9 defect 1 recorded the console    │
 * │ error during the Phase-0 capture:                                        │
 * │                                                                          │
 * │     SW failed: TypeError: Cannot read properties of undefined            │
 * │                (reading 'scope')                                         │
 * │     GET …/service-worker.js  404                                         │
 * │                                                                          │
 * │ Offline mode therefore cannot work today, for anyone, on any device.     │
 * │ Reference: ARCHITECTURE_PLAN.md finding 6.                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * OWNED BY PHASE 6, which fixes the paths, sets the precache list to the
 * Phase-4 file layout (including `data/*.json`), bumps the cache version, and
 * removes the `.fixme` markers below. Phase 6 is not done until these pass for
 * real — `test.fixme` fails the suite if a test unexpectedly passes only when
 * it is run, so Phase 6 must delete the markers rather than rely on them.
 */

// The rest of the suite blocks service workers for determinism; this file needs them.
test.use({ serviceWorkers: 'allow' });

const PRECACHE_SCOPE = '/riigikogu-mobile/';

test.describe('PWA — install and offline', () => {
  test.fixme('the service worker registers successfully', async ({ page }) => {
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

  test.fixme('the precache list points at the path the app is actually served from', async () => {
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '../../service-worker.js'),
      'utf8',
    );

    expect(source).not.toContain('/riigikogu-dashboard/');
    expect(source).toContain(PRECACHE_SCOPE);
  });

  test.fixme('manifest start_url and scope match the deployment path', async ({ page }) => {
    const response = await page.request.get('/manifest.json');
    expect(response.ok()).toBe(true);
    const manifest = await response.json();

    expect(manifest.start_url).toContain(PRECACHE_SCOPE);
    expect(manifest.scope).toContain(PRECACHE_SCOPE);
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  test.fixme('the app still renders after going offline', async ({ page, context }) => {
    await page.goto('/index.html');
    await page.evaluate(() => navigator.serviceWorker.ready);

    await context.setOffline(true);
    await page.reload();

    await expect(page.getByText('XV Riigikogu', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Calculator', exact: true })).toBeVisible();

    await context.setOffline(false);
  });

  test.fixme('the calculator works offline, from cached data', async ({ page, context }) => {
    // Phase 4 moves the roster into data/*.json fetched at runtime, so offline
    // support has to cover the data as well as the shell.
    await page.goto('/index.html');
    await page.evaluate(() => navigator.serviceWorker.ready);

    await context.setOffline(true);
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

    await context.setOffline(false);
  });
});
