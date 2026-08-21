const { test, expect } = require('@playwright/test');
const { DESKTOP, VIEWS, gotoDesktop, openView } = require('../../helpers/desktop');

/**
 * Tier 1 — the desktop shell and its left rail.
 *
 * Enforces D1.1–D1.3 of `USABILITY.md` §10.1.
 */

test.use(DESKTOP);

test.describe('Tier 1 desktop — shell and navigation', () => {
  test.beforeEach(async ({ page }) => {
    await gotoDesktop(page);
  });

  test('D1.1 — all three destinations exist and are reachable', async ({ page }) => {
    await expect(page).toHaveTitle('XV Riigikogu Desktop');

    for (const view of VIEWS) {
      await expect(page.getByTestId(`nav-${view}`)).toBeVisible();
    }
    for (const view of VIEWS) {
      await openView(page, view);
      await expect(page.getByTestId(`nav-${view}`)).toHaveAttribute('data-active', 'true');
    }
  });

  test('D1.2 — the active destination is the only one shown', async ({ page }) => {
    // Rendered outright rather than hidden behind one another: only the active
    // destination's controls exist in the DOM at all.
    await expect(page.getByTestId('party-row-reform')).toBeVisible();
    await expect(page.getByTestId('mp-search')).toHaveCount(0);
    await expect(page.getByTestId('calc-total')).toHaveCount(0);

    await openView(page, 'directory');
    await expect(page.getByTestId('mp-search')).toBeVisible();
    await expect(page.getByTestId('party-row-reform')).toHaveCount(0);
    await expect(page.getByTestId('calc-total')).toHaveCount(0);

    await openView(page, 'calculator');
    await expect(page.getByTestId('calc-total')).toBeVisible();
    await expect(page.getByTestId('mp-search')).toHaveCount(0);
    await expect(page.getByTestId('party-row-reform')).toHaveCount(0);
  });

  test('D1.2 — switching away closes an open seat popup', async ({ page }) => {
    const uuid = await page.locator('[data-mp-uuid]').first().getAttribute('data-mp-uuid');
    await page.getByTestId(`seat-${uuid}`).click();
    await expect(page.getByTestId('seat-popup')).toBeVisible();

    await openView(page, 'calculator');
    // Gone from the DOM, not merely hidden — the overlay rule of §3, restated
    // for this surface by D2.5.
    await expect(page.locator('[data-overlay]')).toHaveCount(0);

    await openView(page, 'parliament');
    await expect(page.locator('[data-overlay]')).toHaveCount(0);
  });

  test('D1.3 — loading the app and visiting every destination raises no error', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await gotoDesktop(page);
    for (const view of VIEWS) await openView(page, view);

    expect(errors).toEqual([]);
  });

  test('the provenance line comes from meta.updatedAt, not a hand-typed string', async ({ page }) => {
    // The failure this guards is the one the retiring desktop app shipped: a
    // hand-typed date that nothing recomputed, above numbers that had moved.
    const meta = require('../../../data/meta.json');
    await expect(page.getByTestId('data-updated')).toContainText(
      String(new Date(meta.updatedAt).getUTCFullYear()),
    );
  });
});
