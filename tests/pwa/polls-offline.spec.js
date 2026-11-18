const { test, expect } = require('@playwright/test');
const fixture = require('../fixtures/polls/normalized.json');

test.use({ serviceWorkers: 'allow' });
const path = '**/data/polls.json';

async function ready(page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (navigator.serviceWorker.controller) return;
    await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  });
}

test('a malformed refresh cannot displace the shared validated snapshot', async ({ page, context }) => {
  let snapshot = fixture;
  await context.route(path, (route) => route.fulfill({ json: snapshot }));
  await page.goto('/');
  await ready(page);
  await page.getByTestId('tab-polls').click();
  await expect(page.getByTestId('polls-rankings')).toContainText('25.3%');

  snapshot = structuredClone(fixture);
  snapshot.series.fourWeek.at(-1).sample.voters = -1;
  await page.getByTestId('tab-parliament').click();
  await page.getByTestId('tab-polls').click();
  await expect(page.getByText(/Showing saved results/)).toBeVisible();

  await context.unroute(path);
  const desktop = await context.newPage();
  await desktop.setViewportSize({ width: 1440, height: 1000 });
  await desktop.goto('/desktop/');
  await ready(desktop);
  // Set offline after both targets exist. Chromium can apply the context's
  // emulated network state to a new target after its initial requests.
  await context.setOffline(true);
  // Some Chromium versions report an interface as online even when this
  // request fails. Exercise the transport-based fallback on that path.
  await desktop.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => true }));
  await desktop.reload();
  await desktop.getByTestId('nav-polls').click();
  await expect(desktop.getByText('Offline results from this device.')).toBeVisible();
  await expect(desktop.getByTestId('polls-rankings')).toContainText('25.3%');
});

test('the installed shell can open Polls offline before a first successful refresh', async ({ page, context }) => {
  await page.goto('/');
  await ready(page);
  await context.setOffline(true);
  await page.getByTestId('tab-polls').click();
  await expect(page.getByText('You’re offline. Connect to load polling results.')).toBeVisible();
  await page.getByTestId('tab-parliament').click();
  await expect(page.getByText('Parliament Floor')).toBeVisible();
});
