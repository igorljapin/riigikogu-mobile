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
 * "Coalition (50 seats)" → 50. The heading renders upper-case via CSS
 * `text-transform`, so the selector matches the DOM text case-insensitively.
 */
function sectionHeading(page, heading) {
  return page.getByText(new RegExp(`^${heading}\\s*\\(\\d+ seats?\\)$`, 'i'));
}

async function sectionSeats(page, heading) {
  const text = await sectionHeading(page, heading).innerText();
  return Number(/\((\d+)/.exec(text)[1]);
}

/**
 * Every bloc section's stated size, read off the headings themselves.
 *
 * Written as "however many sections there are" rather than "coalition plus
 * opposition" on purpose. The promise in USABILITY.md §1 (2.2) is that the bloc
 * totals account for all 101 seats with none invented or lost — not that there
 * are exactly two of them. The shipped bundle had two buckets and swept nine
 * whip-less MPs into the opposition; Phase 4 gives them their own, so the
 * arithmetic is 50 + 42 + 9. This helper checks the promise, not the shape.
 */
async function allSectionSeats(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('h1, h2, h3, h4, p, div, span')]
      .filter((el) => el.children.length === 0)
      .map((el) => /^(.+?)\s*\((\d+) seats?\)$/i.exec((el.textContent || '').trim()))
      .filter(Boolean)
      .map((m) => ({ bloc: m[1], seats: Number(m[2]) })),
  );
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

  test('the bloc sections account for all 101 seats', async ({ page }) => {
    const sections = await allSectionSeats(page);
    expect(sections.length).toBeGreaterThanOrEqual(2);

    const named = sections.map((s) => s.bloc.toLowerCase());
    expect(named).toContain('coalition');
    expect(named).toContain('opposition');

    expect(sections.reduce((sum, s) => sum + s.seats, 0)).toBe(TOTAL_SEATS);
  });

  test('the party chips sum to the section headings that contain them', async ({ page }) => {
    const chips = await partyChips(page);
    // Board buttons ("Pres. of the Riigikogu Hussar") never start with a digit,
    // so every chip captured here is a party chip.
    expect(chips.length).toBeGreaterThanOrEqual(7);

    const chipTotal = chips.reduce((sum, c) => sum + c.seats, 0);
    const sectionTotal = (await allSectionSeats(page)).reduce((sum, s) => sum + s.seats, 0);
    expect(chipTotal).toBe(sectionTotal);
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

  /**
   * 2.13 — new with the Aug-2026 redesign (USABILITY.md §9.2).
   *
   * The seat chart's legend is a second statement of the same arithmetic the
   * bloc headings make. Two statements of one number is exactly where a
   * redesign drifts, so the test is that they agree — and, as everywhere else
   * in Tier 1, it reads both off the app rather than off today's roster.
   */
  test('the seat chart legend states every bloc total, and they agree with the headings', async ({ page }) => {
    const sections = await allSectionSeats(page);
    expect(sections.length).toBeGreaterThanOrEqual(2);

    let legendTotal = 0;
    for (const { bloc, seats } of sections) {
      const id = bloc.toLowerCase();
      const legend = page.getByTestId(`seat-chart-legend-${id}`);
      await expect(legend).toBeVisible();
      await expect(legend).toContainText(new RegExp(bloc, 'i'));

      const total = page.getByTestId(`bloc-total-${id}`);
      await expect(total).toHaveText(String(seats));
      legendTotal += Number(await total.innerText());
    }

    expect(legendTotal).toBe(TOTAL_SEATS);
  });

  /**
   * 2.14 — a profile reached from a party's list is a step deeper, not a
   * detour: closing it used to drop the reader back on the tab, losing the list
   * they were reading. The back control is the same icon-only chrome the
   * calculator's picker uses.
   */
  test('an MP opened from a party sheet can get back to that sheet', async ({ page }) => {
    const [first] = await partyChips(page);
    await page.getByRole('button', { name: `${first.seats} ${first.name}` }).click();

    const member = modal(page).getByTestId('party-sheet-member').first();
    const name = (await member.innerText()).split('\n')[0].trim();
    await member.click();

    // The profile is open, and it is the member that was tapped.
    const popup = modal(page);
    await expect(popup.getByTestId('mp-profile-link')).toContainText(name);

    await popup.getByTestId('mp-popup-back').click();

    // Back on the party's list, still stating the count the chip claimed.
    await expect(modal(page).getByText(`${first.seats} members`)).toBeVisible();
    await expect(modal(page).getByTestId('party-sheet-member').first()).toContainText(name);
    await closeModal(page);
  });

  test('an MP opened from the board has no back control', async ({ page }) => {
    // Nothing to go back to — the board is on the tab behind this overlay, and
    // a back arrow that just closed would be a lie about where it leads.
    await page.getByTestId('board-president').click();
    await expect(modal(page).getByTestId('mp-popup-back')).toHaveCount(0);
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
