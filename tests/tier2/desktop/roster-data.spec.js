const { test, expect } = require('@playwright/test');
const {
  DESKTOP, calcTotal, gotoDesktop, partyTotals, selectMember,
} = require('../../helpers/desktop');

const mps = require('../../../data/mps.json');
const parties = require('../../../data/parties.json');
const alignment = require('../../../data/alignment.json');
const meta = require('../../../data/meta.json');

/**
 * Tier 2 — the Directory profile and the calculator against `data/*.json`.
 *
 * Enforces D3.8, D3.9, D4.10 and D4.11 of `USABILITY.md` §10.3–§10.4.
 *
 * These are the promises about the **three-state model** — in a group, defected
 * to another party, or in no group at all — as the desktop surface states it.
 * The third state is the one that matters: nine members today have no whip and
 * no common position, and a surface that folded them into a bloc to round a
 * number would manufacture a majority that does not exist
 * (`data/README.md`, `USABILITY.md` §10.5).
 */

test.use(DESKTOP);

const active = mps.filter((mp) => mp.active !== false);
const byUuid = Object.fromEntries(active.map((mp) => [mp.uuid, mp]));
const unaligned = new Set(alignment.unaligned);
const defectors = Object.keys(alignment.defectors);
const partyById = Object.fromEntries(parties.map((p) => [p.id, p]));

/** Members whose registration and vote agree — the note must be absent for them. */
const ordinary = active.filter(
  (mp) => !unaligned.has(mp.uuid) && !alignment.defectors[mp.uuid],
);

test.describe('Tier 2 desktop — the roster against data/', () => {
  test('D3.8 — the note card appears for exactly the members who earned one', async ({ page }) => {
    await gotoDesktop(page, 'directory');
    const note = page.getByTestId('mp-note');

    for (const uuid of defectors) {
      await selectMember(page, uuid, byUuid[uuid].name);
      await expect(note, byUuid[uuid].name).toBeVisible();
      // Sourced from alignment.json's own note, not from a string in a view.
      await expect(note).toContainText(alignment.defectors[uuid].note);
    }

    for (const uuid of alignment.unaligned) {
      const mp = byUuid[uuid];
      await selectMember(page, uuid, mp.name);
      if (mp.leftFaction) {
        // Sourced from leftFaction / leftFactionDate — both API-derived, so the
        // card stays true after the next defection with nobody editing a string.
        const short = parties.find((p) => p.factionName === mp.leftFaction)?.short;
        await expect(note, mp.name).toBeVisible();
        if (short) await expect(note).toContainText(short);
      }
    }

    // Absent otherwise, which is what makes it worth reading when it is there.
    for (const mp of ordinary.slice(0, 12)) {
      await selectMember(page, mp.uuid, mp.name);
      await expect(note, mp.name).toHaveCount(0);
    }
  });

  test('D3.9 — a member of no group reads Non-affiliated, never their former party', async ({ page }) => {
    await gotoDesktop(page, 'directory');
    expect(alignment.unaligned.length).toBeGreaterThan(0);

    for (const uuid of alignment.unaligned) {
      const mp = byUuid[uuid];
      await selectMember(page, uuid, mp.name);

      const chip = page.getByTestId('mp-profile-party');
      await expect(chip, mp.name).toHaveText('Non-affiliated');

      // The party they used to sit with is the one thing this chip must not
      // say: they left it, and it does not speak for them.
      const former = parties.find((p) => p.factionName === mp.leftFaction);
      if (former) await expect(chip).not.toHaveText(former.short);

      await expect(page.getByTestId('mp-profile-bloc')).toHaveAttribute('data-bloc', 'unaligned');
    }
  });

  test('D3.9 — a member of no group votes with nobody, not with "their own group"', async ({ page }) => {
    await gotoDesktop(page, 'directory');

    // The trap this catches: an unaligned member's registration and voting bloc
    // are *both* `independent`, so "are these two equal" says yes and the fact
    // grid tells the reader they are whipped by a group they walked out of.
    for (const uuid of alignment.unaligned) {
      const mp = byUuid[uuid];
      await selectMember(page, uuid, mp.name);
      const fact = page.getByTestId('mp-fact-votes-with');
      await expect(fact, mp.name).not.toContainText('Own group');
      await expect(fact).toContainText('no group, no whip');
    }

    // The other two states still read as they should.
    const defector = byUuid[defectors[0]];
    await selectMember(page, defector.uuid, defector.name);
    await expect(page.getByTestId('mp-fact-votes-with')).toContainText('defected');

    const ordinaryMp = ordinary[0];
    await selectMember(page, ordinaryMp.uuid, ordinaryMp.name);
    await expect(page.getByTestId('mp-fact-votes-with')).toHaveText(/Own group/);
  });

  test('a registration is named with the registry\'s word, never the bloc\'s', async ({ page }) => {
    await gotoDesktop(page);

    // `Unaligned` is the name of a bloc. A defector is *registered*
    // `Non-affiliated`, and a tooltip reading "registered Unaligned" states the
    // wrong one of the two counts this whole repository exists to keep apart.
    const defector = byUuid[defectors[0]];
    await page.getByTestId(`seat-${defector.uuid}`).hover();
    const tooltip = page.getByTestId('seat-tooltip');
    await expect(tooltip).toContainText('registered Non-affiliated');
    await expect(tooltip).not.toContainText('registered Unaligned');

    await page.getByTestId(`seat-${defector.uuid}`).click();
    await expect(page.getByTestId('seat-popup')).toContainText('Registered Non-affiliated');
  });

  test('D3.9 — the bloc chip is coloured by bloc, not by party', async ({ page }) => {
    await gotoDesktop(page, 'directory');
    const blocOf = (mp) => {
      if (unaligned.has(mp.uuid)) return 'unaligned';
      const votesWith = alignment.defectors[mp.uuid]?.votesWith ?? mp.registeredPartyId;
      return alignment.blocs[votesWith] ?? 'unaligned';
    };

    // One member from each of the three buckets, including a defector, whose
    // bloc is their new party's and never their registration's.
    const sample = [
      active.find((mp) => blocOf(mp) === 'coalition'),
      active.find((mp) => blocOf(mp) === 'opposition'),
      byUuid[alignment.unaligned[0]],
      byUuid[defectors[0]],
    ].filter(Boolean);

    for (const mp of sample) {
      await selectMember(page, mp.uuid, mp.name);
      await expect(page.getByTestId('mp-profile-bloc'), mp.name)
        .toHaveAttribute('data-bloc', blocOf(mp));
      await expect(page.getByTestId('mp-profile-party'))
        .toHaveAttribute('data-party-id', alignment.defectors[mp.uuid]?.votesWith
          ?? (unaligned.has(mp.uuid) ? 'independent' : mp.registeredPartyId));
    }
  });

  test('D4.10 — the calculator counts voting blocs, and no preset sweeps in the party-less', async ({ page }) => {
    await gotoDesktop(page, 'calculator');

    // Every party card shows its voting-bloc size, which for the two parties
    // that lost or gained members is not their registered size.
    const totals = await partyTotals(page);
    for (const [partyId, seats] of Object.entries(meta.votingBloc)) {
      expect(totals[partyId === 'unaligned' ? 'independent' : partyId]).toBe(seats);
    }

    await page.getByTestId('calc-preset-coalition').click();
    expect(await calcTotal(page)).toBe(meta.coalitionSeats);
    await expect(page.getByTestId('calc-party-independent')).toHaveAttribute('data-active', 'false');
    await expect(page.getByTestId('calc-party-count-independent')).toHaveText('0');

    await page.getByTestId('calc-preset-opposition').click();
    expect(await calcTotal(page)).toBe(meta.oppositionSeats);
    await expect(page.getByTestId('calc-party-independent')).toHaveAttribute('data-active', 'false');
    await expect(page.getByTestId('calc-party-count-independent')).toHaveText('0');

    // The consequence to expect, and the reason it is right: the two presets do
    // not cover the house. Nine members belong to neither, and a preset that
    // reached 101 would be counting votes nobody has promised.
    expect(meta.coalitionSeats + meta.oppositionSeats).toBe(meta.totalSeats - meta.unalignedSeats);
    expect(meta.unalignedSeats).toBeGreaterThan(0);
  });

  test('D4.11 — the four thresholds come from meta.json', async ({ page }) => {
    await gotoDesktop(page, 'calculator');

    const values = [
      meta.simpleMajority, meta.threeFifths, meta.constitutionalMajority, meta.fourFifths,
    ];
    // The hooks are built from the values, so a threshold that moved would move
    // its testid with it rather than leaving a stale literal behind.
    await expect(page.locator('[data-testid^="calc-threshold-"]')).toHaveCount(values.length);
    for (const seats of values) {
      await expect(page.getByTestId(`calc-threshold-${seats}`))
        .toHaveAttribute('data-threshold', String(seats));
    }

    await expect(page.getByTestId('calc-total')).toHaveAttribute('data-total', String(meta.totalSeats));
  });

  test('every party colour on the floor is the canonical one', async ({ page }) => {
    await gotoDesktop(page);
    // §10.5: party colours are `data/parties.json`'s, and the label colour is
    // content — Reform stays black-on-yellow in either theme.
    const swatches = await page.locator('[data-mp-uuid]').evaluateAll((nodes) => {
      const seen = {};
      for (const node of nodes) {
        const style = getComputedStyle(node);
        seen[node.dataset.partyId] = [style.backgroundColor, style.color];
      }
      return seen;
    });

    const rgb = (hex) => {
      const n = parseInt(hex.replace('#', ''), 16);
      return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
    };

    for (const [partyId, [background, color]] of Object.entries(swatches)) {
      expect(background, partyId).toBe(rgb(partyById[partyId].color));
      expect(color, partyId).toBe(rgb(partyById[partyId].textColor));
    }
  });
});
