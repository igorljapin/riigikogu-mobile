const { test, expect } = require('@playwright/test');
const { gotoApp, openTab, closeModal, modal, TOTAL_SEATS } = require('../helpers/app');

/**
 * Reads every party chip on the Parliament tab as { name, seats }, from the
 * chip labels themselves ("39 Reform"). Nothing here hardcodes a seat count —
 * the assertions check that the app's own numbers agree with each other.
 */
async function partyChips(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .map((b) => (b.innerText || '').replace(/\s+/g, ' ').trim())
      .map((t) => /^(\d+) (.+)$/.exec(t))
      .filter(Boolean)
      .map((m) => ({ seats: Number(m[1]), name: m[2] })),
  );
}

/**
 * "Coalition (52 seats)" → 52. The heading renders upper-case via CSS
 * `text-transform`, so the selector matches the DOM text case-insensitively.
 */
function sectionHeading(page, heading) {
  return page.getByText(new RegExp(`^${heading}\\s*\\(\\d+ seats?\\)$`, 'i'));
}

async function sectionSeats(page, heading) {
  const text = await sectionHeading(page, heading).innerText();
  return Number(/\((\d+)/.exec(text)[1]);
}

test.describe('Tier 1 — Parliament tab', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    await openTab(page, 'Parliament');
  });

  test('shows a coalition and an opposition section', async ({ page }) => {
    await expect(sectionHeading(page, 'Coalition')).toBeVisible();
    await expect(sectionHeading(page, 'Opposition')).toBeVisible();
    await expect(page.getByText(/Majority threshold: 51 seats/)).toBeVisible();
  });

  test('coalition and opposition seats account for all 101 seats', async ({ page }) => {
    const coalition = await sectionSeats(page, 'COALITION');
    const opposition = await sectionSeats(page, 'OPPOSITION');
    expect(coalition + opposition).toBe(TOTAL_SEATS);
  });

  test('the party chips sum to the section headings that contain them', async ({ page }) => {
    const chips = await partyChips(page);
    // Board buttons ("Pres. of the Riigikogu Hussar") never start with a digit,
    // so every chip captured here is a party chip.
    expect(chips.length).toBeGreaterThanOrEqual(7);

    const chipTotal = chips.reduce((sum, c) => sum + c.seats, 0);
    const coalition = await sectionSeats(page, 'COALITION');
    const opposition = await sectionSeats(page, 'OPPOSITION');
    expect(chipTotal).toBe(coalition + opposition);
    expect(chipTotal).toBe(TOTAL_SEATS);
  });

  test('every party chip is labelled and clickable', async ({ page }) => {
    const chips = await partyChips(page);
    for (const chip of chips) {
      expect(chip.name).not.toEqual('');
      await expect(page.getByRole('button', { name: `${chip.seats} ${chip.name}` })).toBeEnabled();
    }
  });

  test('tapping a party chip opens a member sheet whose count matches the chip', async ({ page }) => {
    const [first] = await partyChips(page);
    await page.getByRole('button', { name: `${first.seats} ${first.name}` }).click();

    const sheet = modal(page);
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText(`${first.seats} members`)).toBeVisible();

    await closeModal(page);
  });

  test('the Board of the Riigikogu lists three officers, each opening a profile', async ({ page }) => {
    await expect(page.getByText('BOARD OF THE RIIGIKOGU')).toBeVisible();

    const officers = ['Pres. of the Riigikogu', 'First V-Pres.', 'Second V-Pres.'];
    for (const officer of officers) {
      const button = page.getByRole('button', { name: new RegExp(`^${officer.replace(/\./g, '\\.')} `) });
      await expect(button).toBeVisible();

      const label = (await button.innerText()).replace(/\s+/g, ' ').trim();
      const surname = label.slice(officer.length).trim();
      expect(surname.length).toBeGreaterThan(0);

      await button.click();
      await expect(modal(page).getByText(new RegExp(surname))).toBeVisible();
      await closeModal(page);
    }
  });
});
