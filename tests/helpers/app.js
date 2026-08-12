/**
 * Tier-1 helpers — text and role selectors only.
 *
 * The current app is a minified bundle with no `data-testid` attributes and no
 * ARIA roles beyond the implicit ones, so everything here is anchored to what a
 * user actually sees: button labels, headings, and visible numbers.
 *
 * ONE exception, deliberately isolated in `modal()` below: an overlay has no
 * user-visible handle of its own to scope to. Until Phase 4 that meant a raw
 * Tailwind class selector against the minified bundle (`div.fixed.inset-0`);
 * the rebuild replaces it with the `data-overlay` marker every overlay carries
 * alongside its own `data-testid` (`party-sheet`, `mp-popup`, `modal-add-mps`,
 * `modal-exclude-mps`). It remains the only structural coupling in Tier 1, and
 * it is now part of the documented contract rather than an implementation
 * detail borrowed from a stylesheet.
 *
 * The assertions built on these helpers are *self-consistency* checks: they
 * compare numbers the app displays against other numbers the app displays, so
 * they stay true no matter how stale or fresh the underlying roster is. That is
 * what lets one suite guard both the current bundle and the Phase-4 rebuild.
 */

const { expect } = require('@playwright/test');

const TABS = ['Parliament', 'Members', 'Calculator'];

/** Party short names, exactly as the app renders them on the Calculator tab. */
const PARTY_SHORTS = ['Reform', 'Eesti 200', 'SDE', 'EKRE', 'Isamaa', 'Center', 'Independent'];

const TOTAL_SEATS = 101;

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function gotoApp(page) {
  await page.goto('/index.html');
  await expect(page.getByText('XV Riigikogu', { exact: true })).toBeVisible();
}

/** The bottom-bar tab button. Exact match — "Parliament Floor" is a heading, not a button. */
function tab(page, name) {
  return page.getByRole('button', { name, exact: true });
}

async function openTab(page, name) {
  await tab(page, name).click();
}

/**
 * The only structural selector in Tier-1. See the note at the top of this file.
 */
function modal(page) {
  return page.locator('[data-overlay]').last();
}

async function closeModal(page) {
  await modal(page).getByRole('button', { name: '×' }).click();
  // Overlays are removed from the DOM, not hidden — so "closed" is checkable.
  await expect(page.locator('[data-overlay]')).toHaveCount(0);
}

/* ------------------------------------------------------------------ *
 * Calculator readouts
 * ------------------------------------------------------------------ */

/** The big "N/ 101" readout, as a number. */
async function calcTotal(page) {
  return page.evaluate(() => {
    for (const el of document.querySelectorAll('*')) {
      const text = (el.textContent || '').trim();
      const m = /^(\d+)\s*\/\s*101$/.exec(text);
      if (m) return Number(m[1]);
    }
    return null;
  });
}

/** "✓ Majority" / "✗ No majority". */
async function calcVerdict(page) {
  return page.evaluate(() => {
    for (const el of document.querySelectorAll('*')) {
      const text = (el.textContent || '').trim();
      if (/^[✓✗]\s/.test(text) && el.children.length === 0) return text;
    }
    return null;
  });
}

/**
 * A threshold card's rendered background colour, found by climbing from the
 * leaf element whose text is exactly the seat number (51 / 61 / 68 / 81) to the
 * nearest ancestor that actually paints a background.
 *
 * Tests compare this value between two states rather than against a hardcoded
 * palette, so a restyle that keeps the *behaviour* (card changes when the
 * threshold is met) keeps the suite green.
 */
async function thresholdBackground(page, seats) {
  return page.evaluate((label) => {
    const leaf = [...document.querySelectorAll('p, span, div')].find(
      (el) => el.children.length === 0 && (el.textContent || '').trim() === label,
    );
    if (!leaf) return null;
    for (let el = leaf, depth = 0; el && depth < 4; el = el.parentElement, depth++) {
      const bg = getComputedStyle(el).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
    }
    return null;
  }, String(seats));
}

/**
 * A calculator party toggle, e.g. the row labelled "Reform 0/39". Not anchored
 * at the end: once an MP is individually excluded the row grows a "-1"
 * adjustment badge. No party short name is a prefix of another, so the leading
 * anchor is enough to keep this unambiguous.
 */
function partyRow(page, short) {
  return page.getByRole('button', { name: new RegExp(`^${escapeRegExp(short)} \\d+/\\d+`) });
}

/**
 * Every calculator party row as { short: { selected, total } }, read straight
 * off the labels the app renders.
 */
async function partyRowCounts(page) {
  const counts = {};
  for (const short of PARTY_SHORTS) {
    const name = await partyRow(page, short).innerText();
    const m = /(\d+)\s*\/\s*(\d+)/.exec(name.replace(/\n/g, ' '));
    counts[short] = { selected: Number(m[1]), total: Number(m[2]) };
  }
  return counts;
}

/**
 * Smallest set of parties whose displayed seat counts sum to exactly `target`,
 * always leaving at least one party unselected so an individual MP can still be
 * added on top. Returns null when no such set exists.
 *
 * This is what makes the boundary tests data-independent: the suite discovers a
 * route to "one seat below the threshold" from whatever numbers the app is
 * currently showing, instead of hardcoding today's roster.
 */
function subsetSummingTo(seatsByParty, target) {
  const entries = Object.entries(seatsByParty);
  let best = null;
  for (let mask = 1; mask < 1 << entries.length; mask++) {
    let sum = 0;
    const picked = [];
    for (let i = 0; i < entries.length; i++) {
      if (mask & (1 << i)) {
        sum += entries[i][1];
        picked.push(entries[i][0]);
      }
    }
    if (sum === target && picked.length < entries.length) {
      if (!best || picked.length < best.length) best = picked;
    }
  }
  return best;
}

/** Select whole parties by their calculator rows. */
async function selectParties(page, shorts) {
  for (const short of shorts) {
    await partyRow(page, short).click();
  }
}

/**
 * The first MP button inside an open picker. The picker's own chrome — a
 * back-arrow button with no text and the `×` close button — is skipped by
 * requiring at least two letters in the label.
 */
function firstMpButton(overlay) {
  return overlay.getByRole('button').filter({ hasText: /\p{L}{2,}/u }).first();
}

/**
 * Add exactly one MP from a non-selected party via the two-step picker.
 * Returns the name of the MP that was added.
 */
async function addOneIndividualMp(page) {
  await page.getByRole('button', { name: /^Add Individual MPs/ }).click();
  const overlay = modal(page);
  await overlay.getByRole('button', { name: /available to add$/ }).first().click();
  const mpButton = firstMpButton(overlay);
  const name = (await mpButton.innerText()).split('\n')[0].trim();
  await mpButton.click();
  await closeModal(page);
  return name;
}

/**
 * Exclude exactly one MP from an already-selected party.
 * Returns the name of the MP that was excluded.
 */
async function excludeOneIndividualMp(page) {
  await page.getByRole('button', { name: /^Exclude MPs/ }).click();
  const overlay = modal(page);
  await overlay.getByRole('button', { name: /available to exclude$/ }).first().click();
  const mpButton = firstMpButton(overlay);
  const name = (await mpButton.innerText()).split('\n')[0].trim();
  await mpButton.click();
  await closeModal(page);
  return name;
}

/* ------------------------------------------------------------------ *
 * Members tab
 * ------------------------------------------------------------------ */

/** Every MP row — a button whose label ends in one of the party short names. */
function mpRows(page) {
  const alternatives = PARTY_SHORTS.map(escapeRegExp).join('|');
  return page.getByRole('button', { name: new RegExp(`(${alternatives})$`) });
}

/** The count baked into a filter chip label, e.g. "All (101)" → 101. */
async function filterChipCount(page, label) {
  const text = await page.getByRole('button', { name: new RegExp(`^${escapeRegExp(label)}`) }).innerText();
  return Number(/\((\d+)\)/.exec(text)[1]);
}

module.exports = {
  TABS,
  PARTY_SHORTS,
  TOTAL_SEATS,
  gotoApp,
  tab,
  openTab,
  modal,
  closeModal,
  calcTotal,
  calcVerdict,
  thresholdBackground,
  partyRow,
  partyRowCounts,
  subsetSummingTo,
  selectParties,
  addOneIndividualMp,
  excludeOneIndividualMp,
  mpRows,
  filterChipCount,
};
