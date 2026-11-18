const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const seed = require('../../data/polls.json');

for (const colorScheme of ['light', 'dark']) {
  for (const surface of [
    { name: 'desktop', url: '/desktop/', nav: 'nav-polls', width: 1440, height: 980 },
    { name: 'mobile', url: '/', nav: 'tab-polls', width: 390, height: 844 },
    { name: 'narrow-mobile', url: '/', nav: 'tab-polls', width: 320, height: 720 },
  ]) {
    test(`Polls renders at ${surface.width}px on ${surface.name} in ${colorScheme} mode`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: surface.width, height: surface.height });
      await page.emulateMedia({ colorScheme });
      await page.clock.setFixedTime(new Date(seed.source.retrievedAt));
      await page.goto(surface.url);
      await page.getByTestId(surface.nav).click();
      const ratings = page.getByRole('heading', { name: 'Latest ratings' });
      const trends = page.getByRole('heading', { name: 'Support over time' });
      await expect(ratings).toBeVisible();
      await expect(trends).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(surface.width);
      const rankBox = await ratings.boundingBox();
      const trendsBox = await trends.boundingBox();
      if (surface.name === 'desktop') {
        expect(rankBox.x).toBeLessThan(trendsBox.x);
        expect(rankBox.y).toBe(trendsBox.y);
      } else {
        expect(rankBox.y).toBeLessThan(trendsBox.y);
      }
      if (testInfo.config.reporter.some(([name]) => name === 'html') || process.env.POLLS_SCREENSHOTS_DIR) {
        const name = `polls-${surface.name}-${colorScheme}.png`;
        const image = await page.screenshot({ fullPage: true, scale: 'css' });
        await testInfo.attach(name, { body: image, contentType: 'image/png' });
        if (process.env.POLLS_SCREENSHOTS_DIR) {
          await fs.writeFile(path.join(process.env.POLLS_SCREENSHOTS_DIR, name), image);
        }
      }
    });
  }
}

test('the desktop Polls layout fits narrow screens and restores the other destinations', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/desktop/');
  await page.getByTestId('nav-polls').click();
  await expect(page.getByRole('heading', { name: 'Latest ratings' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByTestId('nav-directory').click();
  await expect(page.getByTestId('mp-search')).toBeVisible();
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', 'width=1920');
});
