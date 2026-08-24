/**
 * Desktop-surface test helpers.
 *
 * The desktop suite differs from the mobile one in two ways, and both are
 * deliberate.
 *
 * **It runs at 1920×1080**, the size the Phase-1 artboards were drawn at
 * (`docs/desktop-2026/DESIGN_NOTES.md` — deleted after Phase 4; in git
 * history). The Playwright config's default
 * viewport is a phone, because the mobile app is what it was written for;
 * every desktop spec opts out with `test.use(DESKTOP)`.
 *
 * **It selects on `data-testid`, not on text.** The mobile Tier-1 helpers are
 * anchored to visible labels because they were written against a minified
 * bundle with no hooks at all (`tests/helpers/app.js`). This surface was built
 * contract-first: `USABILITY.md` §10 fixed its testid table before a line of
 * `src/views-desktop/` existed, so the testids *are* the contract and there is
 * nothing to be gained by going around them. What that buys is exactly what
 * PR B needs — the design can be rewritten wholesale and this suite still says
 * whether the app works.
 *
 * The assertions built on these helpers are self-consistency checks wherever
 * they can be: a number the app shows compared against another number the app
 * shows. Tier 2 is where the DOM is compared against `data/*.json`.
 */

const { expect } = require('@playwright/test');

/** The artboard viewport. A desktop spec's first line is `test.use(DESKTOP)`. */
const DESKTOP = {
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
  hasTouch: false,
  isMobile: false,
};

const VIEWS = ['parliament', 'directory', 'calculator'];

async function gotoDesktop(page, view = 'parliament') {
  await page.goto('/desktop/index.html');
  // The rail is rendered only after data/*.json and data/seating.json land, so
  // waiting for it is waiting for a painted app rather than for a shell.
  await expect(page.getByTestId('nav-parliament')).toBeVisible();
  if (view !== 'parliament') await openView(page, view);
}

async function openView(page, view) {
  await page.getByTestId(`nav-${view}`).click();
  await expect(page.locator('#view')).toHaveAttribute('data-view', view);
}

/* ------------------------------------------------------------------ *
 * The floor plan
 * ------------------------------------------------------------------ */

/** Every occupied tile of whichever floor plan is on screen. */
function seats(page) {
  return page.locator('#view [data-mp-uuid][data-seat-state]');
}

/** `[{uuid, partyId, state}]` for the whole floor, in grid order. */
async function readFloor(page) {
  return seats(page).evaluateAll((nodes) => nodes.map((node) => ({
    uuid: node.dataset.mpUuid,
    partyId: node.dataset.partyId,
    state: node.dataset.seatState,
  })));
}

/** The uuids of every member currently sitting in `state`. */
async function seatsInState(page, state) {
  return (await readFloor(page)).filter((s) => s.state === state).map((s) => s.uuid);
}

/* ------------------------------------------------------------------ *
 * Calculator readouts
 * ------------------------------------------------------------------ */

/** The hero figure, as a number. */
async function calcTotal(page) {
  return Number(await page.getByTestId('calc-total').getAttribute('data-seats'));
}

/** `{partyId: seatsInThatParty}` read off the calculator's own party cards. */
async function partyTotals(page) {
  return page.locator('[data-testid^="calc-party-"][data-party-id]').evaluateAll(
    (cards) => Object.fromEntries(cards.map((card) => [
      card.dataset.partyId,
      Number(/of (\d+)/.exec(card.innerText.replace(/\n/g, ' '))[1]),
    ])),
  );
}

/**
 * Drive the calculator to exactly `target` seats, without knowing the roster.
 *
 * Parties first, largest that still fits — then individual seats from whatever
 * party was left out, which is what the seat click does when its party is not
 * selected. Both halves read the app's own numbers, so the route survives a
 * defection that changes every party's size.
 *
 * Used for the threshold boundaries: "one below" and "exactly on" have to be
 * reachable for 51, 61, 68 and 81 without a spec hardcoding today's arithmetic.
 */
async function selectExactly(page, target) {
  await page.getByTestId('calc-clear').click();

  const totals = await partyTotals(page);
  const bySize = Object.entries(totals).sort((a, b) => b[1] - a[1]);

  let running = 0;
  for (const [partyId, size] of bySize) {
    if (size > 0 && running + size <= target) {
      await page.getByTestId(`calc-party-${partyId}`).click();
      running += size;
    }
  }

  // The remainder, one seat at a time. Every tile still `dimmed` belongs to a
  // party that was skipped, so clicking it adds rather than holds out.
  while (running < target) {
    const uuid = (await seatsInState(page, 'dimmed'))[0];
    await page.getByTestId(`calc-seat-${uuid}`).click();
    running += 1;
  }

  await expect(page.getByTestId('calc-total')).toHaveAttribute('data-seats', String(target));
  return target;
}

/* ------------------------------------------------------------------ *
 * Directory
 * ------------------------------------------------------------------ */

function mpRows(page) {
  // Anchored on the uuid attribute as well as the prefix: a row is a member,
  // and a hook that merely starts with `mp-row-` is not one.
  return page.locator('[data-testid^="mp-row-"][data-mp-uuid]');
}

/** The number the result line claims, e.g. "38 members" → 38. */
async function resultCount(page) {
  return Number(/\d+/.exec(await page.getByTestId('mp-result-count').innerText())[0]);
}

/** Select a member by uuid and wait for the profile pane to follow. */
async function selectMember(page, uuid, name) {
  await page.getByTestId(`mp-row-${uuid}`).click();
  if (name) await expect(page.getByTestId('mp-profile-name')).toHaveText(name);
}

module.exports = {
  DESKTOP,
  VIEWS,
  gotoDesktop,
  openView,
  seats,
  readFloor,
  seatsInState,
  calcTotal,
  partyTotals,
  selectExactly,
  mpRows,
  resultCount,
  selectMember,
};
