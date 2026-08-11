const { test, expect } = require('@playwright/test');
const {
  gotoApp,
  openTab,
  modal,
  closeModal,
  mpRows,
  filterChipCount,
  TOTAL_SEATS,
} = require('../helpers/app');

test.describe('Tier 1 — Members directory', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await openTab(page, 'Members');
  });

  test('lists all 101 MPs, and the "All" chip agrees with the row count', async ({ page }) => {
    await expect(mpRows(page)).toHaveCount(TOTAL_SEATS);
    expect(await filterChipCount(page, 'All')).toBe(TOTAL_SEATS);
  });

  test('every row carries a non-empty MP name and a party label', async ({ page }) => {
    const rows = await mpRows(page).evaluateAll((els) =>
      els.map((el) =>
        (el.innerText || '')
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    );
    expect(rows).toHaveLength(TOTAL_SEATS);

    for (const lines of rows) {
      const [name, party] = [lines[0], lines[lines.length - 1]];
      // A name, not a bare emoji or a number.
      expect(name.replace(/[^\p{L}]/gu, '').length).toBeGreaterThan(2);
      expect(party.length).toBeGreaterThan(0);
    }

    // Names are distinct — a rendering bug that repeats one row would be caught here.
    const names = rows.map((lines) => lines[0]);
    expect(new Set(names).size).toBe(TOTAL_SEATS);
  });

  test('search narrows the list to rows that actually match', async ({ page }) => {
    const firstRowName = (await mpRows(page).first().innerText()).split('\n')[0].trim();
    // A distinctive fragment of a real name, discovered from the app itself.
    const fragment = firstRowName.split(/\s+/)[0].slice(0, 4);

    await page.getByPlaceholder('Search MPs...').fill(fragment);

    const matched = await mpRows(page).evaluateAll((els) =>
      els.map((el) => (el.innerText || '').split('\n')[0].trim()),
    );
    expect(matched.length).toBeGreaterThan(0);
    expect(matched.length).toBeLessThan(TOTAL_SEATS);
    for (const name of matched) {
      expect(name.toLowerCase()).toContain(fragment.toLowerCase());
    }

    await page.getByPlaceholder('Search MPs...').fill('');
    await expect(mpRows(page)).toHaveCount(TOTAL_SEATS);
  });

  test('search for a string no MP matches empties the list without breaking the app', async ({ page }) => {
    await page.getByPlaceholder('Search MPs...').fill('zzzzzznotanmp');
    await expect(mpRows(page)).toHaveCount(0);
    await page.getByPlaceholder('Search MPs...').fill('');
    await expect(mpRows(page)).toHaveCount(TOTAL_SEATS);
  });

  test('each filter chip yields exactly the number of rows its own label promises', async ({ page }) => {
    const chips = await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .map((b) => (b.innerText || '').replace(/\s+/g, ' ').trim())
        .filter((t) => /\(\d+\)$/.test(t)),
    );
    expect(chips.length).toBeGreaterThanOrEqual(3);

    for (const chip of chips) {
      const expected = Number(/\((\d+)\)$/.exec(chip)[1]);
      await page.getByRole('button', { name: chip }).click();
      await expect(mpRows(page)).toHaveCount(expected);
    }
  });

  test('tapping an MP opens a popup with an external profile link', async ({ page }) => {
    const row = mpRows(page).first();
    const name = (await row.innerText()).split('\n')[0].replace(/[^\p{L}\s-]/gu, '').trim();
    await row.click();

    const popup = modal(page);
    await expect(popup).toBeVisible();

    const link = popup.getByRole('link').first();
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('href', /^https:\/\/www\.riigikogu\.ee\/.+/);
    // The link text is the MP whose row was tapped.
    expect((await link.innerText()).trim()).toContain(name.split(/\s+/)[0]);

    await closeModal(page);
    await expect(mpRows(page)).toHaveCount(TOTAL_SEATS);
  });
});
