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

  /** First + last initial, uppercased — what the fallback avatar must show. */
  function expectedInitials(name) {
    const parts = name.split(/[\s-]+/).filter(Boolean);
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  test('row avatars carry the photo URL from mps.json, or that MP initials', async ({ page }) => {
    // 3.9, the data half: whichever state a row is in, it has to be that MP's
    // photo and that MP's initials — not a placeholder, and not the neighbour's.
    for (const mp of activeMps) {
      const avatar = page.locator(`[data-testid="mp-row"][data-mp-uuid="${mp.uuid}"] [data-testid="mp-row-avatar"]`);
      await expect(avatar).toHaveCount(1);
      await expect(avatar).toHaveAttribute('data-initials', expectedInitials(mp.name));
      if (mp.photoUrl) {
        await expect(avatar.locator('img')).toHaveAttribute('src', mp.photoUrl);
      }
    }
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

  /* 4.17 — new with the Aug-2026 redesign (§9.2). */

  test('the seat fill is proportional, and the verdict states the shortfall to a majority', async ({ page }) => {
    const fill = page.getByTestId('calc-fill');
    const verdict = page.getByTestId('calc-verdict');

    await expect(fill).toHaveAttribute('data-total', String(meta.totalSeats));
    await expect(fill).toHaveAttribute('data-seats', '0');
    // Empty: the whole house is still to be found.
    await expect(verdict).toContainText(`${meta.simpleMajority} short of ${meta.simpleMajority}`);

    await page.getByTestId('preset-coalition').click();
    await expect(fill).toHaveAttribute('data-seats', String(meta.coalitionSeats));

    const share = await fill.evaluate((el) => {
      const track = el.parentElement.getBoundingClientRect();
      return el.getBoundingClientRect().width / track.width;
    });
    expect(share).toBeCloseTo(meta.coalitionSeats / meta.totalSeats, 2);

    if (meta.coalitionHasMajority) {
      await expect(verdict).toHaveText(/✓/);
    } else {
      const short = meta.simpleMajority - meta.coalitionSeats;
      await expect(verdict).toContainText(`${short} short of ${meta.simpleMajority}`);
    }
  });
});
