const { test, expect } = require('@playwright/test');

const parties = require('../../data/parties.json');
const meta = require('../../data/meta.json');
const board = require('../../data/board.json');

/**
 * ================================ SKIPPED ================================
 * Tier 2 — data-driven contract.
 *
 * These specs cross-check the rendered DOM against `data/*.json`, the canonical
 * source of truth created in Phase 1. They need two things the CURRENT app does
 * not have and cannot be given:
 *
 *   1. `data-testid` attributes — the shipped `index.html` is a minified bundle
 *      with no stable hooks (ARCHITECTURE_PLAN.md finding 1).
 *   2. Runtime data loading — the bundle contains no fetch and no reference to
 *      `data/`; every number is baked in (finding 2). Comparing it to
 *      `data/*.json` would compare the app against data it has never read.
 *
 * Both arrive in **Phase 4**, which un-skips this file. Until then these tests
 * are the written-down specification of what Phase 4 must satisfy — the seat
 * counts, colours and roster the rebuild has to render — not dead code.
 *
 * To activate: change `test.describe.skip` to `test.describe`.
 * =========================================================================
 */

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

const partyById = Object.fromEntries(parties.map((p) => [p.id, p]));

test.describe.skip('Tier 2 — Parliament tab against data/*.json (Phase 4)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.getByTestId('tab-parliament').click();
  });

  test('every party chip renders its canonical colour', async ({ page }) => {
    for (const party of parties) {
      const chip = page.getByTestId(`party-chip-${party.id}`);
      await expect(chip).toBeVisible();
      await expect(chip).toHaveCSS('background-color', hexToRgb(party.color));
      await expect(chip).toHaveCSS('color', hexToRgb(party.textColor));
    }
  });

  test('every party chip shows its voting-bloc seat count, not the registered one', async ({ page }) => {
    for (const [partyId, seats] of Object.entries(meta.votingBloc)) {
      const id = partyId === 'unaligned' ? 'independent' : partyId;
      await expect(page.getByTestId(`party-chip-${id}`)).toContainText(String(seats));
    }
  });

  test('the registered counts are NOT what the headline chips display', async ({ page }) => {
    // The single biggest correctness risk in this app is registered counts
    // leaking into a voting-bloc display (ARCHITECTURE_PLAN.md §2). Where the
    // two differ, the chip must show the voting-bloc figure.
    for (const [partyId, registered] of Object.entries(meta.registered)) {
      const bloc = meta.votingBloc[partyId];
      if (bloc === undefined || bloc === registered) continue;
      const text = await page.getByTestId(`party-chip-${partyId}`).innerText();
      expect(Number(/\d+/.exec(text)[0])).toBe(bloc);
    }
  });

  test('bloc totals match meta.json and account for all 101 seats', async ({ page }) => {
    await expect(page.getByTestId('bloc-total-coalition')).toContainText(String(meta.coalitionSeats));
    await expect(page.getByTestId('bloc-total-opposition')).toContainText(String(meta.oppositionSeats));
    await expect(page.getByTestId('bloc-total-unaligned')).toContainText(String(meta.unalignedSeats));

    expect(meta.coalitionSeats + meta.oppositionSeats + meta.unalignedSeats).toBe(meta.totalSeats);
  });

  test('unaligned MPs are shown as a third bucket, never folded into a bloc', async ({ page }) => {
    // BEHAVIOR_SNAPSHOT.md §8.4: the old bundle counted all independents as
    // opposition, silently crediting the opposition with votes it does not have.
    const unaligned = page.getByTestId('bloc-total-unaligned');
    await expect(unaligned).toBeVisible();
    expect(meta.unalignedSeats).toBeGreaterThan(0);

    const opposition = Number(/\d+/.exec(await page.getByTestId('bloc-total-opposition').innerText())[0]);
    expect(opposition).toBe(meta.oppositionSeats);
    expect(opposition).not.toBe(meta.oppositionSeats + meta.unalignedSeats);
  });

  test('the Board of the Riigikogu matches board.json', async ({ page }) => {
    const slots = ['board-president', 'board-vice-president-1', 'board-vice-president-2'];
    for (const [index, slot] of slots.entries()) {
      const officer = board[index];
      const element = page.getByTestId(slot);
      await expect(element).toBeVisible();
      // Surname is what the compact board button shows.
      await expect(element).toContainText(officer.name.split(' ').pop());
      await expect(element).toHaveAttribute('data-party-id', officer.partyId);
    }
  });

  test('the staleness label comes from meta.updatedAt, not a hand-typed string', async ({ page }) => {
    const label = page.getByTestId('data-updated');
    await expect(label).toBeVisible();
    const year = new Date(meta.updatedAt).getUTCFullYear();
    await expect(label).toContainText(String(year));
  });

  test('tapping a party chip lists exactly that party voting bloc', async ({ page }) => {
    const party = partyById.reform;
    await page.getByTestId('party-chip-reform').click();
    const sheet = page.getByTestId('party-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText(party.short);
    await expect(sheet.getByTestId('party-sheet-member')).toHaveCount(meta.votingBloc.reform);
    await page.getByTestId('party-sheet-close').click();
    await expect(sheet).toBeHidden();
  });
});
