const { test, expect } = require('@playwright/test');
const { gotoApp, tab, openTab, TABS } = require('../helpers/app');

test.describe('Tier 1 — app shell and navigation', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
  });

  test('page title and header identify the app', async ({ page }) => {
    await expect(page).toHaveTitle('XV Riigikogu Dashboard');
    await expect(page.getByText('XV Riigikogu', { exact: true })).toBeVisible();
    await expect(page.getByText(/Estonian Parliament\s*•\s*101 MPs/)).toBeVisible();
  });

  test('all three tabs exist in the bottom bar', async ({ page }) => {
    for (const name of TABS) {
      await expect(tab(page, name)).toBeVisible();
    }
  });

  test('each tab switches to its own content', async ({ page }) => {
    // Parliament is the landing tab.
    await expect(page.getByText('Parliament Floor')).toBeVisible();

    await openTab(page, 'Members');
    await expect(page.getByPlaceholder('Search MPs...')).toBeVisible();
    await expect(page.getByText('Parliament Floor')).toHaveCount(0);

    await openTab(page, 'Calculator');
    await expect(page.getByRole('heading', { name: 'Select Parties' })).toBeVisible();
    await expect(page.getByPlaceholder('Search MPs...')).toHaveCount(0);

    await openTab(page, 'Parliament');
    await expect(page.getByText('Parliament Floor')).toBeVisible();
  });

  test('the app loads without uncaught JavaScript errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await gotoApp(page);
    for (const name of TABS) {
      await openTab(page, name);
    }
    expect(errors).toEqual([]);
  });
});
