const { test, expect } = require('@playwright/test');
const { DESKTOP, gotoDesktop, readFloor } = require('../../helpers/desktop');

const parties = require('../../../data/parties.json');
const mps = require('../../../data/mps.json');
const alignment = require('../../../data/alignment.json');
const seating = require('../../../data/seating.json');

/**
 * Tier 2 — the floor plan against `data/*.json`.
 *
 * Enforces D2.1–D2.3 of `USABILITY.md` §10.2.
 *
 * The voting-bloc party is **recomputed here from `alignment.json`**, rather
 * than read out of `src/lib/factions.js`, and that is the point: a Tier-2 spec
 * that imported the app's own resolver would agree with it about everything,
 * including a bug. This is the second opinion. It is also the sabotage §6
 * describes, applied to a new surface — a registered count leaking into a
 * voting-bloc display is the single failure this repository exists to prevent,
 * and a floor plan coloured by registration would be exactly that failure,
 * eleven tiles wide.
 */

test.use(DESKTOP);

const active = mps.filter((mp) => mp.active !== false);
const byUuid = Object.fromEntries(active.map((mp) => [mp.uuid, mp]));
const partyById = Object.fromEntries(parties.map((p) => [p.id, p]));
const unaligned = new Set(alignment.unaligned);

/** Defector → `votesWith`; a member of no group → `independent`; else their own. */
function votingBlocPartyId(mp) {
  if (alignment.defectors[mp.uuid]) return alignment.defectors[mp.uuid].votesWith;
  if (unaligned.has(mp.uuid)) return 'independent';
  return mp.registeredPartyId;
}

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

test.describe('Tier 2 desktop — the floor plan against data/', () => {
  test.beforeEach(async ({ page }) => {
    await gotoDesktop(page);
  });

  test('D2.1 — the floor is seating.json joined to the roster, seat for seat', async ({ page }) => {
    const floor = await readFloor(page);

    // No seat invented, none lost, none doubled.
    expect(floor).toHaveLength(Object.keys(seating.seats).length);
    expect(floor.map((s) => s.uuid).sort()).toEqual(Object.keys(seating.seats).sort());
    expect(new Set(floor.map((s) => s.uuid)).size).toBe(floor.length);

    // Every occupied cell resolves to a real, sitting member.
    for (const seat of floor) expect(byUuid[seat.uuid], seat.uuid).toBeTruthy();
    expect(floor).toHaveLength(active.length);
  });

  test('D2.1 — every seat sits where seating.json puts it', async ({ page }) => {
    const { rows, cols } = seating.gridDimensions;
    const grid = page.getByTestId('floor-grid');
    await expect(grid).toHaveAttribute('data-rows', String(rows));
    await expect(grid).toHaveAttribute('data-cols', String(cols));

    // The 19 empty cells are rendered, not skipped: dropping them would let the
    // remaining 101 reflow into a solid block that is no longer the room.
    await expect(grid.locator('> *')).toHaveCount(rows * cols);

    const placed = await grid.locator('[data-mp-uuid]').evaluateAll(
      (nodes) => Object.fromEntries(nodes.map((n) => [
        n.dataset.mpUuid, `${n.dataset.row}:${n.dataset.col}`,
      ])),
    );
    for (const [uuid, seat] of Object.entries(seating.seats)) {
      expect(placed[uuid], byUuid[uuid]?.name ?? uuid).toBe(`${seat.row}:${seat.col}`);
    }
  });

  test('D2.2 — a seat is filled with the party its member votes with', async ({ page }) => {
    const floor = await readFloor(page);

    for (const seat of floor) {
      const expected = votingBlocPartyId(byUuid[seat.uuid]);
      expect(seat.partyId, byUuid[seat.uuid].name).toBe(expected);
    }

    // The attribute is only half the promise; the paint is the other half. An
    // MP whose two parties differ is where the two could come apart.
    const defector = Object.keys(alignment.defectors)[0];
    const votesWith = alignment.defectors[defector].votesWith;
    await expect(page.getByTestId(`seat-${defector}`)).toHaveCSS(
      'background-color', hexToRgb(partyById[votesWith].color),
    );
    expect(byUuid[defector].registeredPartyId).not.toBe(votesWith);
  });

  test('D2.2 — the registered count is NOT what the floor paints', async ({ page }) => {
    const floor = await readFloor(page);
    const painted = {};
    const registered = {};
    for (const seat of floor) {
      painted[seat.partyId] = (painted[seat.partyId] ?? 0) + 1;
      const reg = byUuid[seat.uuid].registeredPartyId;
      registered[reg] = (registered[reg] ?? 0) + 1;
    }

    const meta = require('../../../data/meta.json');
    for (const [partyId, seats] of Object.entries(meta.votingBloc)) {
      expect(painted[partyId === 'unaligned' ? 'independent' : partyId] ?? 0).toBe(seats);
    }

    // Where the two counts differ, the floor must be showing the voting one.
    // Reform reads 38 here and 36 in the registry, and both are correct.
    const moved = Object.keys(meta.registered).filter(
      (id) => meta.registered[id] !== (meta.votingBloc[id] ?? 0),
    );
    expect(moved.length).toBeGreaterThan(0);
    for (const partyId of moved) {
      expect(painted[partyId] ?? 0).not.toBe(registered[partyId]);
    }
  });

  test('D2.3 — a defector marker appears exactly where registration differs', async ({ page }) => {
    const markers = await page.locator('[data-testid^="seat-defector-"]').evaluateAll(
      (nodes) => Object.fromEntries(nodes.map((n) => [
        n.getAttribute('data-testid').replace('seat-defector-', ''), n.dataset.partyId,
      ])),
    );

    const expected = active.filter((mp) => votingBlocPartyId(mp) !== mp.registeredPartyId);
    expect(Object.keys(markers).sort()).toEqual(expected.map((mp) => mp.uuid).sort());

    // And nowhere else — a member of no group is registered where they vote
    // (nowhere), so they carry none.
    for (const uuid of alignment.unaligned) {
      expect(markers[uuid]).toBeUndefined();
    }
    expect(expected.length).toBeGreaterThan(0);

    // The dot is the *registered* party's colour: it is the one thing on the
    // floor that answers "where is this member on the books".
    for (const mp of expected) {
      expect(markers[mp.uuid], mp.name).toBe(mp.registeredPartyId);
      await expect(page.getByTestId(`seat-defector-${mp.uuid}`)).toHaveCSS(
        'background-color', hexToRgb(partyById[mp.registeredPartyId].color),
      );
    }
  });

  test('D2.3 — the calculator draws the same floor, with the same markers', async ({ page }) => {
    // The two views share one component precisely so a seat cannot mean two
    // things on two screens (`src/views-desktop/floor.js`).
    const parliament = await readFloor(page);
    await page.getByTestId('nav-calculator').click();
    const calculator = await readFloor(page);

    expect(calculator.map((s) => `${s.uuid}:${s.partyId}`))
      .toEqual(parliament.map((s) => `${s.uuid}:${s.partyId}`));
    await expect(page.locator('[data-testid^="seat-defector-"]'))
      .toHaveCount(Object.keys(alignment.defectors).length);
  });
});
