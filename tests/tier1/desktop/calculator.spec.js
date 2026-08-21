const { test, expect } = require('@playwright/test');
const {
  DESKTOP, calcTotal, gotoDesktop, partyTotals, readFloor, seatsInState, selectExactly,
} = require('../../helpers/desktop');

const meta = require('../../../data/meta.json');

/**
 * Tier 1 — the Coalition calculator.
 *
 * Enforces D4.1–D4.9 of `USABILITY.md` §10.4. D4.10 and D4.11 — that the counts
 * are voting-bloc counts and the thresholds come from `meta.json` — are
 * data-driven and live in `tests/tier2/desktop/roster-data.spec.js`.
 *
 * Almost everything here is a self-consistency check: a number the calculator
 * shows compared against another number the calculator shows. The one exception
 * is the threshold list, which is read from `meta.json` because that is exactly
 * the promise (`D4.11`) — a threshold typed into a view would pass a test that
 * compared the view against itself.
 */

test.use(DESKTOP);

/** The four thresholds, ascending, as `meta.json` records them. */
const THRESHOLDS = [
  meta.simpleMajority, meta.threeFifths, meta.constitutionalMajority, meta.fourFifths,
].sort((a, b) => a - b);

/** A uuid from a party that is not currently selected. */
async function anyUnselectedSeat(page) {
  return (await seatsInState(page, 'dimmed'))[0];
}

test.describe('Tier 1 desktop — Calculator', () => {
  test.beforeEach(async ({ page }) => {
    await gotoDesktop(page, 'calculator');
  });

  test('D4.1 — the empty state totals 0 of 101 with no threshold met', async ({ page }) => {
    const total = page.getByTestId('calc-total');
    await expect(total).toHaveAttribute('data-seats', '0');
    await expect(total).toHaveAttribute('data-total', String(meta.totalSeats));

    for (const seats of THRESHOLDS) {
      await expect(page.getByTestId(`calc-threshold-${seats}`)).toHaveAttribute('data-met', 'false');
    }
    await expect(page.getByTestId('calc-adjustments-empty')).toBeVisible();
    expect(await seatsInState(page, 'counted')).toHaveLength(0);
  });

  test('D4.2 — a party card adds exactly its members, and removes exactly them', async ({ page }) => {
    const totals = await partyTotals(page);

    await page.getByTestId('calc-party-reform').click();
    expect(await calcTotal(page)).toBe(totals.reform);
    expect(await seatsInState(page, 'counted')).toHaveLength(totals.reform);

    await page.getByTestId('calc-party-sde').click();
    expect(await calcTotal(page)).toBe(totals.reform + totals.sde);

    await page.getByTestId('calc-party-reform').click();
    expect(await calcTotal(page)).toBe(totals.sde);
    await expect(page.getByTestId('calc-party-reform')).toHaveAttribute('data-active', 'false');
  });

  test('D4.3 — a seat click adds a member, or holds one out of a selected party', async ({ page }) => {
    const uuid = await anyUnselectedSeat(page);
    const partyId = (await readFloor(page)).find((s) => s.uuid === uuid).partyId;

    await page.getByTestId(`calc-seat-${uuid}`).click();
    expect(await calcTotal(page)).toBe(1);
    expect(await seatsInState(page, 'counted')).toEqual([uuid]);

    // Same seat, other meaning: once its party is the base, a click can only
    // hold the member out of it.
    await page.getByTestId(`calc-seat-${uuid}`).click();
    await page.getByTestId(`calc-party-${partyId}`).click();
    const whole = await calcTotal(page);

    await page.getByTestId(`calc-seat-${uuid}`).click();
    expect(await calcTotal(page)).toBe(whole - 1);
    expect(await seatsInState(page, 'held')).toEqual([uuid]);
  });

  test('D4.4 — deselecting a party clears only its own adjustments', async ({ page }) => {
    const totals = await partyTotals(page);

    await page.getByTestId('calc-party-reform').click();
    const held = (await seatsInState(page, 'counted'))[0];
    await page.getByTestId(`calc-seat-${held}`).click();
    expect(await calcTotal(page)).toBe(totals.reform - 1);

    // A second party joins; the hold-out on the first must survive it, and its
    // own removal must not take the first party's adjustment with it.
    await page.getByTestId('calc-party-sde').click();
    expect(await calcTotal(page)).toBe(totals.reform - 1 + totals.sde);

    await page.getByTestId('calc-party-sde').click();
    expect(await calcTotal(page)).toBe(totals.reform - 1);
    await expect(page.getByTestId(`calc-adjustment-${held}`)).toBeVisible();

    // Its own party leaving does take it — the hold-out meant nothing without
    // the party it was held out of.
    await page.getByTestId('calc-party-reform').click();
    expect(await calcTotal(page)).toBe(0);
    await expect(page.getByTestId('calc-adjustments-empty')).toBeVisible();

    // And re-selecting the party brings back the whole party, not a
    // half-remembered version of it — the thing a flat set of 101 booleans
    // cannot do.
    await page.getByTestId('calc-party-reform').click();
    expect(await calcTotal(page)).toBe(totals.reform);
  });

  test('D4.5 — the presets select a whole bloc and reset the adjustments', async ({ page }) => {
    const uuid = await anyUnselectedSeat(page);
    await page.getByTestId(`calc-seat-${uuid}`).click();
    await expect(page.getByTestId(`calc-adjustment-${uuid}`)).toBeVisible();

    await page.getByTestId('calc-preset-coalition').click();
    expect(await calcTotal(page)).toBe(meta.coalitionSeats);
    await expect(page.getByTestId('calc-adjustments-empty')).toBeVisible();

    await page.getByTestId('calc-preset-opposition').click();
    expect(await calcTotal(page)).toBe(meta.oppositionSeats);
    await expect(page.getByTestId('calc-adjustments-empty')).toBeVisible();
  });

  test('D4.6 — Clear empties the selection and every adjustment', async ({ page }) => {
    await page.getByTestId('calc-preset-coalition').click();
    const held = (await seatsInState(page, 'counted'))[0];
    await page.getByTestId(`calc-seat-${held}`).click();
    const added = await anyUnselectedSeat(page);
    await page.getByTestId(`calc-seat-${added}`).click();

    await page.getByTestId('calc-clear').click();

    expect(await calcTotal(page)).toBe(0);
    await expect(page.getByTestId('calc-adjustments-empty')).toBeVisible();
    expect(await seatsInState(page, 'counted')).toHaveLength(0);
    expect(await seatsInState(page, 'held')).toHaveLength(0);
    await expect(page.locator('[data-testid^="calc-party-"][data-active="true"]')).toHaveCount(0);
  });

  test('D4.7 — each threshold chip flips exactly at its own number', async ({ page }) => {
    for (const seats of THRESHOLDS) {
      const chip = page.getByTestId(`calc-threshold-${seats}`);

      await selectExactly(page, seats - 1);
      await expect(chip).toHaveAttribute('data-met', 'false');

      await selectExactly(page, seats);
      await expect(chip).toHaveAttribute('data-met', 'true');
    }
  });

  test('D4.8 — the verdict and the hint track the total', async ({ page }) => {
    const majority = meta.simpleMajority;

    await selectExactly(page, majority - 1);
    await expect(page.getByTestId('calc-verdict')).toHaveAttribute('data-met', 'false');
    await expect(page.getByTestId('calc-verdict')).toContainText(`1 short of ${majority}`);
    // The hint names the next threshold you have not cleared and the gap to it.
    await expect(page.getByTestId('calc-hint')).toContainText(`1 more seat reaches`);
    await expect(page.getByTestId('calc-hint')).toContainText(String(majority));

    await selectExactly(page, majority);
    await expect(page.getByTestId('calc-verdict')).toHaveAttribute('data-met', 'true');
    await expect(page.getByTestId('calc-verdict')).toContainText('Passes ordinary legislation');
    await expect(page.getByTestId('calc-hint')).toContainText(String(meta.threeFifths));

    await selectExactly(page, meta.fourFifths);
    await expect(page.getByTestId('calc-hint')).toContainText('Clears every constitutional threshold');
  });

  test('D4.9 — every adjustment is named, badged ±1, and undone on its own', async ({ page }) => {
    const totals = await partyTotals(page);

    const added = await anyUnselectedSeat(page);
    await page.getByTestId(`calc-seat-${added}`).click();
    await expect(page.getByTestId(`calc-adjustment-${added}`)).toContainText('+1');

    await page.getByTestId('calc-party-reform').click();
    const held = (await seatsInState(page, 'counted'))
      .filter((uuid) => uuid !== added)[0];
    await page.getByTestId(`calc-seat-${held}`).click();
    await expect(page.getByTestId(`calc-adjustment-${held}`)).toContainText('−1');

    const before = await calcTotal(page);
    expect(before).toBe(totals.reform - 1 + 1);

    // Undo reverses that one row and leaves the other standing.
    await page.getByTestId(`calc-adjustment-undo-${held}`).click();
    expect(await calcTotal(page)).toBe(before + 1);
    await expect(page.getByTestId(`calc-adjustment-${held}`)).toHaveCount(0);
    await expect(page.getByTestId(`calc-adjustment-${added}`)).toBeVisible();

    await page.getByTestId(`calc-adjustment-undo-${added}`).click();
    expect(await calcTotal(page)).toBe(totals.reform);
    await expect(page.getByTestId('calc-adjustments-empty')).toBeVisible();
  });
});
