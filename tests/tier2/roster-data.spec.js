const { test, expect } = require('@playwright/test');

const mps = require('../../data/mps.json');
const meta = require('../../data/meta.json');
const alignment = require('../../data/alignment.json');

/**
 * ================================ SKIPPED ================================
 * Tier 2 — roster and calculator against data/*.json.
 *
 * Same reason as `parliament-data.spec.js`: needs `data-testid` hooks and
 * runtime JSON loading, both of which land in Phase 4. Un-skip there.
 * =========================================================================
 */

const activeMps = mps.filter((mp) => mp.active);

test.describe('Tier 2 — Members directory against data/*.json (Phase 4)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.getByTestId('tab-members').click();
  });

  test('renders exactly one row per MP in mps.json', async ({ page }) => {
    expect(activeMps).toHaveLength(meta.totalSeats);
    await expect(page.getByTestId('mp-row')).toHaveCount(activeMps.length);
  });

  test('every MP in the data appears by name, keyed by uuid', async ({ page }) => {
    for (const mp of activeMps) {
      const row = page.locator(`[data-testid="mp-row"][data-mp-uuid="${mp.uuid}"]`);
      await expect(row).toHaveCount(1);
      await expect(row).toContainText(mp.name);
    }
  });

  test('each MP popup links to the canonical profile URL and photo', async ({ page }) => {
    // A representative sample — one per registered party — keeps the run fast
    // while still covering every code path that builds a URL.
    const seen = new Set();
    const sample = activeMps.filter((mp) => {
      if (seen.has(mp.registeredPartyId)) return false;
      seen.add(mp.registeredPartyId);
      return true;
    });

    for (const mp of sample) {
      await page.locator(`[data-testid="mp-row"][data-mp-uuid="${mp.uuid}"]`).click();
      const popup = page.getByTestId('mp-popup');
      await expect(popup).toBeVisible();
      await expect(popup.getByTestId('mp-profile-link')).toHaveAttribute('href', mp.profileUrl);
      await expect(popup.getByTestId('mp-profile-link')).toHaveAttribute('target', '_blank');
      await expect(popup.getByTestId('mp-photo')).toHaveAttribute('src', mp.photoUrl);
      await page.getByTestId('mp-popup-close').click();
      await expect(popup).toBeHidden();
    }
  });

  test('committee memberships are rendered for MPs that have them', async ({ page }) => {
    const mp = activeMps.find((m) => m.committees.length > 0);
    await page.locator(`[data-testid="mp-row"][data-mp-uuid="${mp.uuid}"]`).click();
    const popup = page.getByTestId('mp-popup');
    // One pill per committee, in the order data/mps.json lists them, and no
    // extras — the array form of toHaveText, because `mp-committee` resolves to
    // one element per committee rather than to a single container.
    await expect(popup.getByTestId('mp-committee')).toHaveText(mp.committees.map((c) => c.name));
  });

  test('unaligned MPs are labelled unaligned, not opposition', async ({ page }) => {
    for (const uuid of alignment.unaligned) {
      await page.locator(`[data-testid="mp-row"][data-mp-uuid="${uuid}"]`).click();
      const popup = page.getByTestId('mp-popup');
      await expect(popup.getByTestId('mp-bloc')).toHaveText(/unaligned/i);
      await page.getByTestId('mp-popup-close').click();
    }
  });

  test('defectors show the party they vote with, and their party history', async ({ page }) => {
    for (const [uuid, defector] of Object.entries(alignment.defectors)) {
      await page.locator(`[data-testid="mp-row"][data-mp-uuid="${uuid}"]`).click();
      const popup = page.getByTestId('mp-popup');
      await expect(popup.getByTestId('mp-party')).toHaveAttribute('data-party-id', defector.votesWith);
      await expect(popup.getByTestId('mp-party-history')).toBeVisible();
      await page.getByTestId('mp-popup-close').click();
    }
  });
});

test.describe('Tier 2 — Calculator against data/*.json (Phase 4)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/index.html');
    await page.getByTestId('tab-calculator').click();
  });

  test('each party row offers exactly its voting-bloc seat count', async ({ page }) => {
    for (const [partyId, seats] of Object.entries(meta.votingBloc)) {
      const id = partyId === 'unaligned' ? 'independent' : partyId;
      await expect(page.getByTestId(`calc-party-row-${id}`)).toContainText(`0/${seats}`);
    }
  });

  test('the Coalition preset selects exactly the coalition bloc from alignment.json', async ({ page }) => {
    await page.getByTestId('preset-coalition').click();
    await expect(page.getByTestId('calc-total')).toHaveText(new RegExp(`^${meta.coalitionSeats}\\b`));

    const coalitionParties = Object.entries(alignment.blocs)
      .filter(([, bloc]) => bloc === 'coalition')
      .map(([id]) => id);
    for (const id of coalitionParties) {
      await expect(page.getByTestId(`calc-party-row-${id}`)).toHaveAttribute('data-selected', 'true');
    }
  });

  test('the Coalition preset does not reach a majority at the current data', async ({ page }) => {
    // As of 2026-08-10 Reform + Eesti 200 hold 50 of 101 — a minority
    // government (BEHAVIOR_SNAPSHOT.md §8.3). This assertion tracks meta.json,
    // so it stays correct if that changes; what it locks is that the UI's
    // verdict agrees with the computed arithmetic.
    await page.getByTestId('preset-coalition').click();
    const expected = meta.coalitionHasMajority ? /✓/ : /✗/;
    await expect(page.getByTestId('calc-verdict')).toHaveText(expected);
    expect(meta.coalitionSeats >= meta.simpleMajority).toBe(meta.coalitionHasMajority);
  });

  test('unaligned MPs belong to no preset', async ({ page }) => {
    await page.getByTestId('preset-coalition').click();
    const coalition = Number(/\d+/.exec(await page.getByTestId('calc-total').innerText())[0]);
    await page.getByTestId('preset-reset').click();
    await page.getByTestId('preset-opposition').click();
    const opposition = Number(/\d+/.exec(await page.getByTestId('calc-total').innerText())[0]);

    expect(coalition + opposition).toBe(meta.totalSeats - meta.unalignedSeats);
  });

  test('the threshold badges read their values from meta.json', async ({ page }) => {
    for (const seats of [meta.simpleMajority, meta.threeFifths, meta.constitutionalMajority, meta.fourFifths]) {
      await expect(page.getByTestId(`badge-threshold-${seats}`)).toBeVisible();
    }
  });
});
