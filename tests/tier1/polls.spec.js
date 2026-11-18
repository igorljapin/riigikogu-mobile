const { test, expect } = require('@playwright/test');
const fixture = require('../fixtures/polls/normalized.json');

const path = '**/data/polls.json';
const testDate = new Date('2026-11-18T17:00:00Z');

test('Polls loads on demand and offers series, exact observations, table and methodology', async ({ page }) => {
  let resume;
  const hold = new Promise((resolve) => { resume = resolve; });
  let requests = 0;
  await page.clock.setFixedTime(testDate);
  await page.route(path, async (route) => {
    requests++;
    await hold;
    await route.fulfill({ json: fixture });
  });
  await page.goto('/');
  const tabs = page.getByRole('navigation', { name: 'Sections' }).getByRole('button');
  await expect(tabs).toHaveText(['Parliament', 'Members', 'Calculator', 'Polls']);
  expect(requests).toBe(0);
  await tabs.last().click();
  await expect(page.getByRole('heading', { name: 'Party support' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Loading polling data…');
  resume();

  const series = page.getByLabel('Polling series');
  const chart = page.getByTestId('polls-chart');
  const exact = page.getByTestId('polls-observation');
  await expect(series).toHaveValue('fourWeek');
  await expect(page.getByText('Published 18 Nov 2026')).toBeVisible();
  await expect(page.getByTestId('polls-rankings').locator('li').first()).toContainText('Centre25.3%+0.4 pp');
  await expect(page.getByTestId('polls-rankings').locator('li').last()).toContainText('Other2.8%+0.1 pp');
  await page.getByText('What’s included in Other').click();
  await expect(page.getByText('Independent candidate')).toBeVisible();

  await expect(page.getByLabel('Date range')).toHaveValue('6');
  await page.getByLabel('Date range').selectOption({ label: 'All history' });
  await expect(chart).toContainText('Support (%)');
  await expect(chart).toContainText('Fieldwork end date');
  await expect(exact).toContainText('Centre 25.3%');
  const slider = page.getByRole('slider', { name: 'Fieldwork observation' });
  await slider.press('ArrowLeft');
  await expect(exact).toContainText('Centre 24.9%');
  const rect = await chart.boundingBox();
  await page.touchscreen.tap(rect.x + rect.width * 0.94, rect.y + rect.height * 0.5);
  await expect(exact).toContainText('Centre 25.3%');

  await page.getByText('Compare parties').click();
  await page.getByRole('checkbox', { name: 'Reform' }).check();
  await expect(exact).toContainText('Reform 12.3%');
  await page.getByText('View results as a table').click();
  const table = page.getByRole('table', { name: /Party support by fieldwork/ });
  await expect(table.getByRole('columnheader', { name: 'Reform' })).toBeVisible();
  await expect(table.getByRole('cell', { name: '12.3%' })).toBeVisible();

  await page.getByText('Methodology', { exact: true }).click();
  await expect(page.getByText('2,760')).toBeVisible();
  await expect(page.getByText('4,000')).toBeVisible();

  await series.selectOption({ label: 'Weekly results' });
  await expect(page.getByText('Source snapshot retrieved 18 Nov 2026')).toBeVisible();
  await expect(page.getByTestId('polls-rankings').locator('li').first()).toContainText('Centre24.7%−0.4 pp');
  await page.getByText('Methodology', { exact: true }).click();
  await expect(page.getByText('696', { exact: true })).toBeVisible();
});

test('a polling failure is isolated and the retry can show empty and overdue states', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-12-01T12:00:00Z'));
  let response = 503;
  await page.route(path, async (route) => response === 200 ?
    route.fulfill({ json: fixture }) : route.fulfill({ status: response }));
  await page.goto('/');
  await page.getByTestId('tab-polls').click();
  await expect(page.getByRole('status')).toHaveText(/could not be loaded/);
  response = 204;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByRole('status')).toHaveText('No polling results are available yet.');
  response = 200;
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText(/Update overdue/)).toBeVisible();
  await expect(page.getByText('25.3%', { exact: true }).first()).toBeVisible();
  await page.getByTestId('tab-calculator').click();
  await expect(page.getByRole('heading', { name: 'Select Parties' })).toBeVisible();
  await page.getByTestId('tab-members').click();
  await expect(page.getByPlaceholder('Search MPs...')).toBeVisible();
  await page.getByTestId('tab-parliament').click();
  await expect(page.getByText('Parliament Floor')).toBeVisible();
});
