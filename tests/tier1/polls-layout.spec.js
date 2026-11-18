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


test('wide desktop comparison keeps seven series legible with aligned calendar guides', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.clock.setFixedTime(new Date(seed.source.retrievedAt));
  await page.goto('/desktop/');
  const cardTitle = page.locator('.dk-card-title').first();
  await expect(cardTitle).toBeVisible();
  const titleFont = await cardTitle.evaluate((title) => {
    const { fontFamily, fontSize, fontWeight } = getComputedStyle(title);
    return { fontFamily, fontSize, fontWeight };
  });
  await page.getByTestId('nav-polls').click();
  const trends = page.getByRole('heading', { name: 'Support over time' });
  await expect(trends).toBeVisible();
  expect(await trends.evaluate((title) => {
    const { fontFamily, fontSize, fontWeight } = getComputedStyle(title);
    return { fontFamily, fontSize, fontWeight };
  })).toEqual(titleFont);
  await page.getByText('Compare parties').click();
  for (const name of ['Center', 'Isamaa', 'SDE', 'EKRE', 'Reform', 'Parempoolsed', 'Eesti 200']) {
    await page.getByRole('checkbox', { name, exact: true }).check();
  }
  for (const name of ['Greens', 'Other']) {
    await page.getByRole('checkbox', { name, exact: true }).uncheck();
  }

  const chart = page.getByTestId('polls-chart');
  const lines = chart.locator('.polls-series-line');
  await expect(lines).toHaveCount(7);
  await expect(lines.first()).toHaveAttribute('vector-effect', 'non-scaling-stroke');
  await expect(lines.first()).toHaveCSS('stroke-width', '1.75px');
  await expect(chart.locator('.polls-series-line[stroke="#FF6000"]')).toHaveCount(1);
  const dates = chart.locator('.polls-axis-date');
  await expect(dates.first()).toHaveCSS('font-size', '12px');
  const guides = chart.locator('.polls-date-gridline');
  expect(await guides.count()).toBeGreaterThan(3);
  expect(await dates.count()).toBe(await guides.count());
  expect(await chart.evaluate((node) => {
    const dates = [...node.querySelectorAll('.polls-axis-date')];
    const guides = [...node.querySelectorAll('.polls-date-gridline')];
    return dates.every((date, index) => {
      const label = date.getBoundingClientRect();
      const guide = guides[index].getBoundingClientRect();
      return Math.abs(label.left + label.width / 2 - guide.left) < 1;
    });
  })).toBe(true);

  if (testInfo.config.reporter.some(([name]) => name === 'html') || process.env.POLLS_SCREENSHOTS_DIR) {
    for (const colorScheme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme });
      const name = `polls-desktop-seven-parties-${colorScheme}.png`;
      const image = await page.screenshot({ fullPage: true, scale: 'css' });
      await testInfo.attach(name, { body: image, contentType: 'image/png' });
      if (process.env.POLLS_SCREENSHOTS_DIR) {
        await fs.writeFile(path.join(process.env.POLLS_SCREENSHOTS_DIR, name), image);
      }
    }
  }
});
