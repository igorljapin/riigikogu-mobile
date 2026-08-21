const { test, expect } = require('@playwright/test');
const {
  DESKTOP, gotoDesktop, mpRows, resultCount, selectMember,
} = require('../../helpers/desktop');

/**
 * Tier 1 — the Directory destination: the roster, its filters and the profile
 * pane.
 *
 * Enforces D3.1–D3.7 and D3.10 of `USABILITY.md` §10.3. D3.8 and D3.9 — what a
 * profile says about a member whose registration and vote disagree — are
 * data-driven and live in `tests/tier2/desktop/roster-data.spec.js`.
 */

test.use(DESKTOP);

/** The uuid of the first row currently listed. */
async function firstRowUuid(page) {
  return mpRows(page).first().getAttribute('data-mp-uuid');
}

test.describe('Tier 1 desktop — Directory', () => {
  test.beforeEach(async ({ page }) => {
    await gotoDesktop(page, 'directory');
  });

  test('D3.1 — every member is listed and the count agrees with the rows', async ({ page }) => {
    const meta = require('../../../data/meta.json');
    await expect(mpRows(page)).toHaveCount(meta.totalSeats);
    expect(await resultCount(page)).toBe(meta.totalSeats);
  });

  test('D3.2 — search filters by name, case-insensitively', async ({ page }) => {
    const name = await mpRows(page).first().getByTestId('mp-name').innerText();
    const surname = name.split(' ').pop();

    await page.getByTestId('mp-search').fill(surname.toUpperCase());
    const shown = await mpRows(page).count();
    expect(shown).toBeGreaterThan(0);
    expect(await resultCount(page)).toBe(shown);

    // The count line and the list are the same list, always.
    for (const row of await mpRows(page).all()) {
      expect((await row.innerText()).toLowerCase()).toContain(surname.toLowerCase());
    }
  });

  test('D3.2 — search composes with the active bloc filter', async ({ page }) => {
    await page.getByTestId('filter-bloc-coalition').click();
    const coalition = await resultCount(page);

    const name = await mpRows(page).first().getByTestId('mp-name').innerText();
    await page.getByTestId('mp-search').fill(name);

    // Composed, not replaced: the search narrows what the filter left.
    const narrowed = await resultCount(page);
    expect(narrowed).toBeGreaterThan(0);
    expect(narrowed).toBeLessThanOrEqual(coalition);
    await expect(page.getByTestId('filter-bloc-coalition')).toHaveAttribute('data-active', 'true');
  });

  test('D3.3 — a search with no matches shows the empty state and recovers', async ({ page }) => {
    await page.getByTestId('mp-search').fill('Nobody By That Name');

    await expect(page.getByTestId('mp-empty')).toBeVisible();
    await expect(page.getByTestId('mp-empty')).toContainText('Nobody By That Name');
    await expect(mpRows(page)).toHaveCount(0);
    expect(await resultCount(page)).toBe(0);

    // An empty list is a state, not a dead end.
    await page.getByTestId('mp-search').fill('');
    await expect(page.getByTestId('mp-empty')).toHaveCount(0);
    expect(await resultCount(page)).toBe(await mpRows(page).count());
  });

  test('D3.4 — the bloc control is mutually exclusive', async ({ page }) => {
    const blocs = ['all', 'coalition', 'opposition', 'unaligned'];
    const active = page.locator('[data-testid^="filter-"][data-active="true"]');

    for (const bloc of blocs) {
      await page.getByTestId(`filter-bloc-${bloc}`).click();
      await expect(active).toHaveCount(1);
      await expect(page.getByTestId(`filter-bloc-${bloc}`)).toHaveAttribute('data-active', 'true');
      expect(await resultCount(page)).toBe(await mpRows(page).count());
    }
  });

  test('D3.5 — the tag filters replace the bloc filter rather than composing', async ({ page }) => {
    // The number to compare against is read from the roster rather than from a
    // count printed beside the filter: the approved artboards label these two
    // controls and nothing else. It is the stronger source anyway — a filter
    // that agreed with its own caption and with nothing else would still pass.
    const roster = require('../../../data/mps.json').filter((mp) => mp.active !== false);
    const chairs = roster.filter((mp) => mp.factionRole || mp.boardRole).length;
    const usa = roster.filter((mp) => mp.usaFriendship === true).length;

    // Both are a real subset of the house, so "replaced" and "composed" are
    // different numbers and the equalities below can tell them apart.
    expect(chairs).toBeGreaterThan(0);
    expect(chairs).toBeLessThan(roster.length);
    expect(usa).toBeGreaterThan(0);
    expect(usa).toBeLessThan(roster.length);

    await page.getByTestId('filter-bloc-coalition').click();
    const coalition = await resultCount(page);
    expect(coalition).toBeGreaterThan(0);
    expect(coalition).toBeLessThan(roster.length); // sanity: the filter did something

    await page.getByTestId('filter-chairs').click();
    // Replaced: the whole set of chairs and officers, not the coalition's share
    // of them. "The chairs" is a list people want whole.
    expect(await resultCount(page)).toBe(chairs);
    await expect(page.getByTestId('filter-bloc-coalition')).toHaveAttribute('data-active', 'false');
    await expect(page.getByTestId('filter-chairs')).toHaveAttribute('data-active', 'true');

    await page.getByTestId('filter-usa').click();
    expect(await resultCount(page)).toBe(usa);
    await expect(page.getByTestId('filter-chairs')).toHaveAttribute('data-active', 'false');
    await expect(page.locator('[data-testid^="filter-"][data-active="true"]')).toHaveCount(1);
  });

  test('D3.6 — selecting a member fills the profile and marks the row', async ({ page }) => {
    const rows = await mpRows(page).all();
    const target = rows[3];
    const uuid = await target.getAttribute('data-mp-uuid');
    const name = await target.getByTestId('mp-name').innerText();

    await selectMember(page, uuid, name);

    await expect(page.getByTestId(`mp-row-${uuid}`)).toHaveAttribute('data-selected', 'true');
    await expect(page.locator('[data-testid^="mp-row-"][data-selected="true"]')).toHaveCount(1);
    await expect(page.getByTestId('mp-profile-party')).toBeVisible();
    await expect(page.getByTestId('mp-profile-bloc')).toBeVisible();
  });

  test('D3.7 — the riigikogu.ee link is external, new-tab and noopener', async ({ page }) => {
    const mps = require('../../../data/mps.json');
    const uuid = await firstRowUuid(page);
    const mp = mps.find((m) => m.uuid === uuid);

    const link = page.getByTestId('mp-external-profile');
    await selectMember(page, uuid);

    await expect(link).toHaveAttribute('href', mp.profileUrl);
    await expect(link).toHaveAttribute('target', '_blank');
    // Without it the opened page gets a handle back into this one.
    await expect(link).toHaveAttribute('rel', /noopener/);
  });

  test('D3.10 — the seat locator marks the selected member\'s own cell', async ({ page }) => {
    const seating = require('../../../data/seating.json');
    const { rows, cols } = seating.gridDimensions;

    const uuid = await firstRowUuid(page);
    await selectMember(page, uuid);

    const locator = page.getByTestId('mp-seat-locator');
    await expect(locator).toBeVisible();
    // The same geometry as the floor, so it reads as the same room.
    await expect(locator.locator('span')).toHaveCount(rows * cols);

    const own = locator.locator('[data-self="true"]');
    await expect(own).toHaveCount(1);

    const seat = seating.seats[uuid];
    const index = await own.evaluate((node) => [...node.parentElement.children].indexOf(node));
    expect(index).toBe(seat.row * cols + seat.col);
  });

  test('the profile follows the selection, not the other way round', async ({ page }) => {
    const rows = await mpRows(page).all();
    for (const row of [rows[0], rows[10], rows[50]]) {
      const uuid = await row.getAttribute('data-mp-uuid');
      const name = await row.getByTestId('mp-name').innerText();
      await selectMember(page, uuid, name);
      await expect(page.getByTestId('mp-profile-name')).toHaveText(name);
    }
  });
});
