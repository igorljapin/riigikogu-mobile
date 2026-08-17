const { test, expect } = require('@playwright/test');
const {
  gotoApp,
  openTab,
  modal,
  closeModal,
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

  test('Coalition and Opposition presets together cover every aligned seat', async ({ page }) => {
    // The presets sweep up parties that have declared a bloc, and nothing else.
    // MPs who left a group and joined no party have no whip and no common
    // position, so no preset may claim them — the bundle's Opposition preset
    // did, silently crediting the opposition with nine votes it does not have
    // (BEHAVIOR_SNAPSHOT.md §8.4). What must still hold is that between them the
    // presets account for every seat that IS in a bloc, with none double-counted.
    const counts = await partyRowCounts(page);
    const unaligned = counts.Independent.total;

    await page.getByRole('button', { name: 'Coalition', exact: true }).click();
    const coalition = await calcTotal(page);

    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await page.getByRole('button', { name: 'Opposition', exact: true }).click();
    const opposition = await calcTotal(page);

    expect(coalition + opposition + unaligned).toBe(TOTAL_SEATS);
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

  /* ---------------------------------------------------------------- *
   * Individual adjustments and the picker — new surface, new coverage
   * (USABILITY.md §9.2). Both tests read every number off the app.
   * ---------------------------------------------------------------- */

  test('every individual adjustment is named, and Undo reverses exactly that one', async ({ page }) => {
    await page.getByRole('button', { name: 'Coalition', exact: true }).click();
    const preset = await calcTotal(page);

    // Two of each kind on purpose. With one apiece, "undo this adjustment" and
    // "undo every adjustment" are indistinguishable — and the second is a bug
    // this test has to be able to see.
    const [excludedA, excludedB] = [await excludeOneIndividualMp(page), await excludeOneIndividualMp(page)];
    const [addedA, addedB] = [await addOneIndividualMp(page), await addOneIndividualMp(page)];

    const rows = page.locator('[data-testid="adjust-chip-exclude"], [data-testid="adjust-chip-add"]');
    await expect(rows).toHaveCount(4);
    expect(await calcTotal(page)).toBe(preset); // −2 +2
    for (const name of [excludedA, excludedB, addedA, addedB]) {
      await expect(rows.filter({ hasText: name })).toHaveCount(1);
    }

    // Undo one exclusion: one seat back, and the other three rows untouched.
    await page.getByTestId('adjust-chip-exclude').filter({ hasText: excludedA })
      .getByTestId('adjust-undo').click();
    expect(await calcTotal(page)).toBe(preset + 1);
    await expect(rows).toHaveCount(3);
    await expect(rows.filter({ hasText: excludedA })).toHaveCount(0);
    await expect(rows.filter({ hasText: excludedB })).toHaveCount(1);

    // Undo one addition: one seat gone, and the rest still stand.
    await page.getByTestId('adjust-chip-add').filter({ hasText: addedA })
      .getByTestId('adjust-undo').click();
    expect(await calcTotal(page)).toBe(preset);
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: addedA })).toHaveCount(0);
    await expect(rows.filter({ hasText: addedB })).toHaveCount(1);
  });

  test('the picker offers only eligible MPs, and an adjusted MP leaves the pool', async ({ page }) => {
    await page.getByRole('button', { name: 'Coalition', exact: true }).click();

    const partyIds = (locator) => locator.evaluateAll((els) => els.map((el) => el.dataset.partyId));
    const selected = await partyIds(page.locator('[data-selected="true"]'));
    expect(selected.length).toBeGreaterThan(0);

    // Exclude: only parties the selection actually contains.
    await page.getByTestId('calc-exclude-mps').click();
    const offeredToExclude = await partyIds(modal(page).getByTestId('picker-party'));
    expect(offeredToExclude.length).toBeGreaterThan(0);
    expect(offeredToExclude.filter((id) => !selected.includes(id))).toEqual([]);

    // Step 2: adjusting an MP takes them out of the pool and off the total.
    const before = await calcTotal(page);
    await modal(page).getByTestId('picker-party').first().click();
    const members = modal(page).getByTestId('picker-mp');
    const pool = await members.count();
    expect(pool).toBeGreaterThan(0);

    const uuid = await members.first().getAttribute('data-mp-uuid');
    await members.first().click();
    await expect(members).toHaveCount(pool - 1);
    await expect(modal(page).locator(`[data-testid="picker-mp"][data-mp-uuid="${uuid}"]`)).toHaveCount(0);
    expect(await calcTotal(page)).toBe(before - 1);
    await closeModal(page);

    // Add: only parties the selection does not contain.
    await page.getByTestId('calc-add-mps').click();
    const offeredToAdd = await partyIds(modal(page).getByTestId('picker-party'));
    expect(offeredToAdd.length).toBeGreaterThan(0);
    expect(offeredToAdd.filter((id) => selected.includes(id))).toEqual([]);
    await closeModal(page);
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
