const { test, expect } = require('@playwright/test');
const {
  DESKTOP, gotoDesktop, openView, readFloor, seatsInState,
} = require('../../helpers/desktop');

/**
 * Tier 1 — the Parliament destination: the floor plan, the party highlight and
 * the Board.
 *
 * Enforces D2.4–D2.10 of `USABILITY.md` §10.2. The data-driven half of that
 * section — that the floor *is* `seating.json` joined to the roster, coloured
 * by voting bloc — is `tests/tier2/desktop/seating-data.spec.js`.
 */

test.use(DESKTOP);

/** A uuid on the floor, and one from a different party. */
async function twoSeats(page) {
  const floor = await readFloor(page);
  const first = floor[0];
  const other = floor.find((s) => s.partyId !== first.partyId);
  return [first, other];
}

test.describe('Tier 1 desktop — Parliament', () => {
  test.beforeEach(async ({ page }) => {
    await gotoDesktop(page);
  });

  test('D2.4 — hovering a seat shows that seat only, from one shared node', async ({ page }) => {
    const [first, other] = await twoSeats(page);
    const tooltip = page.getByTestId('seat-tooltip');

    // One node for 101 seats. Not an optimisation — a tooltip per seat is 101
    // nodes to show at most one of, and 101 chances for two to be open at once.
    await expect(tooltip).toHaveCount(1);
    await expect(tooltip).toBeHidden();

    await page.getByTestId(`seat-${first.uuid}`).hover();
    await expect(tooltip).toBeVisible();
    const firstText = await tooltip.innerText();

    await page.getByTestId(`seat-${other.uuid}`).hover();
    await expect(tooltip).toHaveCount(1);
    await expect(tooltip).toBeVisible();
    expect(await tooltip.innerText()).not.toBe(firstText);
  });

  test('D2.5 — clicking a seat opens that member, and close removes it', async ({ page }) => {
    const [first] = await twoSeats(page);
    await page.getByTestId(`seat-${first.uuid}`).click();

    const popup = page.getByTestId('seat-popup');
    await expect(popup).toBeVisible();
    await expect(popup).toHaveAttribute('data-mp-uuid', first.uuid);

    await page.getByTestId('seat-popup-close').click();
    // Removed, not hidden: that is what makes "closed" checkable, and what
    // keeps exactly one close control reachable at a time.
    await expect(page.locator('[data-overlay]')).toHaveCount(0);
  });

  test('D2.5 — opening a second seat leaves only one popup', async ({ page }) => {
    const [first, other] = await twoSeats(page);
    await page.getByTestId(`seat-${first.uuid}`).click();
    await page.getByTestId(`seat-${other.uuid}`).click();

    await expect(page.locator('[data-overlay]')).toHaveCount(1);
    await expect(page.getByTestId('seat-popup')).toHaveAttribute('data-mp-uuid', other.uuid);
  });

  test('D2.6 — "Open full profile" lands on that member with everything cleared', async ({ page }) => {
    const [first] = await twoSeats(page);

    // Something to clear: a highlight on the floor.
    await page.getByTestId('party-row-reform').click();
    expect(await seatsInState(page, 'highlighted')).not.toHaveLength(0);

    await page.getByTestId(`seat-${first.uuid}`).click();
    const name = await page.getByTestId('seat-popup-name').innerText();
    await page.getByTestId('seat-popup-open-profile').click();

    await expect(page.locator('#view')).toHaveAttribute('data-view', 'directory');
    await expect(page.getByTestId('mp-profile-name')).toHaveText(name);
    await expect(page.getByTestId(`mp-row-${first.uuid}`)).toHaveAttribute('data-selected', 'true');

    // Arriving on a filtered list would hide the member you asked for.
    await expect(page.getByTestId('mp-search')).toHaveValue('');
    await expect(page.getByTestId('filter-bloc-all')).toHaveAttribute('data-active', 'true');

    await openView(page, 'parliament');
    expect(await seatsInState(page, 'highlighted')).toHaveLength(0);
  });

  test('D2.7 — a party row lights that party, additively, sharing the chips\' state', async ({ page }) => {
    const floor = await readFloor(page);
    const reform = floor.filter((s) => s.partyId === 'reform').map((s) => s.uuid);
    const sde = floor.filter((s) => s.partyId === 'sde').map((s) => s.uuid);

    await page.getByTestId('party-row-reform').click();
    expect((await seatsInState(page, 'highlighted')).sort()).toEqual([...reform].sort());
    // Everything else drops back rather than merely staying put.
    expect(await seatsInState(page, 'dimmed')).toHaveLength(floor.length - reform.length);

    // One state, two controls: the row lit it, the chip must know.
    await expect(page.getByTestId('party-chip-reform')).toHaveAttribute('data-active', 'true');

    // Additive — a second party joins the first rather than replacing it.
    await page.getByTestId('party-chip-sde').click();
    expect((await seatsInState(page, 'highlighted')).sort()).toEqual([...reform, ...sde].sort());
    await expect(page.getByTestId('party-row-sde')).toHaveAttribute('data-active', 'true');

    // …and toggling from the other control turns the same highlight off.
    await page.getByTestId('party-chip-reform').click();
    expect((await seatsInState(page, 'highlighted')).sort()).toEqual([...sde].sort());
    await expect(page.getByTestId('party-row-reform')).toHaveAttribute('data-active', 'false');
  });

  test('D2.7 — the caption reports the highlighted total', async ({ page }) => {
    const seats = (await readFloor(page)).filter((s) => s.partyId === 'reform').length;
    await page.getByTestId('party-row-reform').click();
    await expect(page.getByTestId('floor-caption')).toContainText(String(seats));
  });

  test('D2.8 — Clear removes every highlight and never reflows the list', async ({ page }) => {
    const clear = page.getByTestId('party-highlight-clear');
    const firstRow = page.getByTestId('party-row-reform');

    const boxBefore = await firstRow.boundingBox();
    const clearBoxBefore = await clear.boundingBox();

    await page.getByTestId('party-row-reform').click();
    await page.getByTestId('party-chip-sde').click();

    // The control appears by becoming visible, not by entering the layout: its
    // box is where it always was, and the list under it has not moved.
    expect(await clear.boundingBox()).toEqual(clearBoxBefore);
    expect(await firstRow.boundingBox()).toEqual(boxBefore);

    await clear.click();
    expect(await seatsInState(page, 'highlighted')).toHaveLength(0);
    expect(await seatsInState(page, 'dimmed')).toHaveLength(0);
    for (const id of ['reform', 'sde']) {
      await expect(page.getByTestId(`party-row-${id}`)).toHaveAttribute('data-active', 'false');
      await expect(page.getByTestId(`party-chip-${id}`)).toHaveAttribute('data-active', 'false');
    }
    expect(await firstRow.boundingBox()).toEqual(boxBefore);
  });

  test('D2.9 — the highlight and the calculator selection never meet', async ({ page }) => {
    await page.getByTestId('party-row-reform').click();

    // A highlight is "where does Reform sit", not "would Reform's votes pass
    // this". Carrying one into the other would answer a question nobody asked.
    await openView(page, 'calculator');
    await expect(page.getByTestId('calc-total')).toHaveAttribute('data-seats', '0');
    await expect(page.getByTestId('calc-party-reform')).toHaveAttribute('data-active', 'false');

    await page.getByTestId('calc-preset-coalition').click();
    await openView(page, 'parliament');
    // Reform is still lit because that is where the reader left it — and it is
    // lit alone, not joined by the rest of the coalition the calculator picked.
    const lit = await seatsInState(page, 'highlighted');
    const reform = (await readFloor(page)).filter((s) => s.partyId === 'reform');
    expect(lit.sort()).toEqual(reform.map((s) => s.uuid).sort());
  });

  test('D2.10 — the Board shows three officers, each opening their profile', async ({ page }) => {
    const board = require('../../../data/board.json');
    const rows = page.locator('[data-testid^="board-row-"]');
    await expect(rows).toHaveCount(3);

    for (const officer of board) {
      await expect(page.getByTestId(`board-row-${officer.uuid}`)).toContainText(officer.name);
    }

    await page.getByTestId(`board-row-${board[0].uuid}`).click();
    await expect(page.locator('#view')).toHaveAttribute('data-view', 'directory');
    await expect(page.getByTestId('mp-profile-name')).toHaveText(board[0].name);
    await expect(page.getByTestId(`mp-row-${board[0].uuid}`)).toHaveAttribute('data-selected', 'true');
  });
});
