const { test, expect } = require('@playwright/test');
const {
  gotoApp,
  openTab,
  calcTotal,
  calcVerdict,
  thresholdBackground,
  partyRow,
  partyRowCounts,
  subsetSummingTo,
  selectParties,
  addOneIndividualMp,
  excludeOneIndividualMp,
  PARTY_SHORTS,
  TOTAL_SEATS,
} = require('../helpers/app');

const SIMPLE_MAJORITY = 51;
const CONSTITUTIONAL_MAJORITY = 68;

/**
 * Every assertion in this file is a *self-consistency* check: the calculator's
 * output is compared against numbers the same app renders elsewhere on the same
 * screen. None of them encodes today's roster, so they hold across the Phase-4
 * rebuild and across every future data update — while still failing loudly if
 * the arithmetic itself breaks.
 */
test.describe('Tier 1 — Vote calculator', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await openTab(page, 'Calculator');
  });

  test('starts empty, with no majority', async ({ page }) => {
    expect(await calcTotal(page)).toBe(0);
    expect(await calcVerdict(page)).toMatch(/No majority/);

    const counts = await partyRowCounts(page);
    for (const short of PARTY_SHORTS) {
      expect(counts[short].selected).toBe(0);
    }
  });

  test('the party rows account for all 101 seats', async ({ page }) => {
    const counts = await partyRowCounts(page);
    const total = Object.values(counts).reduce((sum, c) => sum + c.total, 0);
    expect(total).toBe(TOTAL_SEATS);
  });

  test('selecting a party adds exactly the seat count that party displays', async ({ page }) => {
    const counts = await partyRowCounts(page);
    let running = 0;

    for (const short of PARTY_SHORTS) {
      await partyRow(page, short).click();
      running += counts[short].total;

      expect(await calcTotal(page)).toBe(running);
      const after = await partyRowCounts(page);
      expect(after[short].selected).toBe(after[short].total);
    }

    // All seven parties selected == the whole parliament.
    expect(await calcTotal(page)).toBe(TOTAL_SEATS);
  });

  test('deselecting a party removes exactly the seats it added', async ({ page }) => {
    const counts = await partyRowCounts(page);
    await selectParties(page, PARTY_SHORTS);
    expect(await calcTotal(page)).toBe(TOTAL_SEATS);

    let running = TOTAL_SEATS;
    for (const short of PARTY_SHORTS) {
      await partyRow(page, short).click();
      running -= counts[short].total;
      expect(await calcTotal(page)).toBe(running);
    }
    expect(await calcTotal(page)).toBe(0);
  });

  test('the Coalition preset total equals the sum of the rows it selects', async ({ page }) => {
    await page.getByRole('button', { name: 'Coalition', exact: true }).click();

    const counts = await partyRowCounts(page);
    const selected = Object.values(counts).reduce((sum, c) => sum + c.selected, 0);
    expect(selected).toBeGreaterThan(0);
    expect(await calcTotal(page)).toBe(selected);
  });

  test('the Opposition preset total equals the sum of the rows it selects', async ({ page }) => {
    await page.getByRole('button', { name: 'Opposition', exact: true }).click();

    const counts = await partyRowCounts(page);
    const selected = Object.values(counts).reduce((sum, c) => sum + c.selected, 0);
    expect(selected).toBeGreaterThan(0);
    expect(await calcTotal(page)).toBe(selected);
  });

  test('Coalition and Opposition presets together cover every seat', async ({ page }) => {
    await page.getByRole('button', { name: 'Coalition', exact: true }).click();
    const coalition = await calcTotal(page);

    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.getByRole('button', { name: 'Opposition', exact: true }).click();
    const opposition = await calcTotal(page);

    expect(coalition + opposition).toBe(TOTAL_SEATS);
  });

  test('Reset clears the selection and the verdict', async ({ page }) => {
    await page.getByRole('button', { name: 'Coalition', exact: true }).click();
    expect(await calcTotal(page)).toBeGreaterThan(0);

    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    expect(await calcTotal(page)).toBe(0);
    expect(await calcVerdict(page)).toMatch(/No majority/);
  });

  /* ---------------------------------------------------------------- *
   * Threshold boundaries — the reason this suite exists.
   *
   * The route to "one seat below the threshold" is computed from the seat
   * counts the app itself displays, so these tests do not depend on the data
   * vintage. They then step over the line by exactly one MP.
   * ---------------------------------------------------------------- */

  for (const [label, threshold] of [
    ['simple majority', SIMPLE_MAJORITY],
    ['constitutional majority', CONSTITUTIONAL_MAJORITY],
  ]) {
    test(`the ${threshold} (${label}) badge flips exactly at the threshold`, async ({ page }) => {
      const counts = await partyRowCounts(page);
      const totals = Object.fromEntries(PARTY_SHORTS.map((s) => [s, counts[s].total]));

      const route = subsetSummingTo(totals, threshold - 1);
      expect(route, `no party combination sums to ${threshold - 1}`).not.toBeNull();

      const inactiveBackground = await thresholdBackground(page, threshold);
      expect(inactiveBackground).not.toBeNull();

      // One seat short.
      await selectParties(page, route);
      expect(await calcTotal(page)).toBe(threshold - 1);
      expect(await thresholdBackground(page, threshold)).toBe(inactiveBackground);
      if (threshold === SIMPLE_MAJORITY) {
        expect(await calcVerdict(page)).toMatch(/No majority/);
      }

      // Exactly on the threshold.
      await addOneIndividualMp(page);
      expect(await calcTotal(page)).toBe(threshold);
      expect(await thresholdBackground(page, threshold)).not.toBe(inactiveBackground);
      if (threshold === SIMPLE_MAJORITY) {
        expect(await calcVerdict(page)).toMatch(/✓\s*Majority/);
      }
    });
  }

  test('a threshold above the current selection stays inactive', async ({ page }) => {
    const inactive = await thresholdBackground(page, CONSTITUTIONAL_MAJORITY);

    const counts = await partyRowCounts(page);
    const totals = Object.fromEntries(PARTY_SHORTS.map((s) => [s, counts[s].total]));
    const route = subsetSummingTo(totals, SIMPLE_MAJORITY - 1);
    await selectParties(page, route);
    await addOneIndividualMp(page);

    // 51 reached, 68 not.
    expect(await calcTotal(page)).toBe(SIMPLE_MAJORITY);
    expect(await thresholdBackground(page, SIMPLE_MAJORITY)).not.toBe(
      await thresholdBackground(page, CONSTITUTIONAL_MAJORITY),
    );
    expect(await thresholdBackground(page, CONSTITUTIONAL_MAJORITY)).toBe(inactive);
  });

  test('adding an individual MP adds exactly one seat', async ({ page }) => {
    await page.getByRole('button', { name: 'Coalition', exact: true }).click();
    const before = await calcTotal(page);

    const name = await addOneIndividualMp(page);
    expect(name.length).toBeGreaterThan(0);
    expect(await calcTotal(page)).toBe(before + 1);
  });

  test('excluding an individual MP removes exactly one seat', async ({ page }) => {
    await page.getByRole('button', { name: 'Coalition', exact: true }).click();
    const before = await calcTotal(page);

    const name = await excludeOneIndividualMp(page);
    expect(name.length).toBeGreaterThan(0);
    expect(await calcTotal(page)).toBe(before - 1);

    // The exclusion is reflected in that party's own row, not just the total.
    const counts = await partyRowCounts(page);
    const selected = Object.values(counts).reduce((sum, c) => sum + c.selected, 0);
    expect(selected).toBe(before - 1);
  });

  test('Reset also clears individual adjustments', async ({ page }) => {
    await page.getByRole('button', { name: 'Coalition', exact: true }).click();
    await excludeOneIndividualMp(page);
    await addOneIndividualMp(page);

    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    expect(await calcTotal(page)).toBe(0);

    // Re-selecting the same preset must give the untouched total back.
    await page.getByRole('button', { name: 'Coalition', exact: true }).click();
    const counts = await partyRowCounts(page);
    const selected = Object.values(counts).reduce((sum, c) => sum + c.selected, 0);
    expect(await calcTotal(page)).toBe(selected);
  });
});
