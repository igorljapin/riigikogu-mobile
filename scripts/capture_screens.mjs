/**
 * Re-capture the Phase-0 characterisation states against the current app, and
 * build the before/after strips the Phase-4 PR is reviewed from.
 *
 * The nineteen states are exactly the ones `BEHAVIOR_SNAPSHOT.md` recorded, at
 * the same viewport, so every pair is comparable pixel for pixel:
 *
 *   snapshot/<name>.png          Phase 0 — the shipped minified bundle
 *   snapshot/phase4/<name>.png   this rebuild
 *   snapshot/compare/<name>.png  the two side by side, labelled
 *
 * Usage:
 *   python3 -m http.server 8099 &     # or let this script's default URL point anywhere
 *   node scripts/capture_screens.mjs [--url http://127.0.0.1:8099/index.html]
 */

import { mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const BEFORE = join(REPO, 'snapshot');
const AFTER = join(BEFORE, 'phase4');
const COMPARE = join(BEFORE, 'compare');

const args = process.argv.slice(2);
const url = args[args.indexOf('--url') + 1]?.startsWith('http')
  ? args[args.indexOf('--url') + 1]
  : 'http://127.0.0.1:8099/index.html';

const VIEWPORT = { width: 390, height: 844 };
const SCALE = 2;

/**
 * States the Phase-0 capture recorded full-page rather than at viewport height.
 * Matching that choice keeps each before/after pair the same shape.
 */
const FULL_PAGE = new Set([
  '01-tab-parliament', '08-mp-popup-hussar', '09-mp-popup-grunthal-independent',
  '10-tab-calculator-empty', '11-calc-s1-coalition-52', '12-calc-s2-opposition-49',
  '13-calc-s3-77-of-101', '16-calc-after-excluding-one-mp', '19-calc-final-with-adjustments',
]);

/** The Phase-0 states, in order, as a click-path from a freshly loaded app. */
const STATES = [
  ['01-tab-parliament', async () => {}],
  ['02-party-sheet-reform', async (p) => p.getByTestId('party-chip-reform').click()],
  ['03-board-president-popup', async (p) => p.getByTestId('board-president').click()],
  ['04-tab-members', async (p) => p.getByTestId('tab-members').click()],
  ['05-members-search-kall', async (p) => {
    await p.getByTestId('tab-members').click();
    await p.getByTestId('mp-search').fill('Kall');
  }],
  ['06-members-filter-usa', async (p) => {
    await p.getByTestId('tab-members').click();
    await p.getByTestId('filter-usa').click();
  }],
  ['07-members-filter-chairs', async (p) => {
    await p.getByTestId('tab-members').click();
    await p.getByTestId('filter-chairs').click();
  }],
  ['08-mp-popup-hussar', async (p) => {
    await p.getByTestId('tab-members').click();
    await p.getByTestId('mp-search').fill('Hussar');
    await p.getByTestId('mp-row').first().click();
  }],
  ['09-mp-popup-grunthal-independent', async (p) => {
    await p.getByTestId('tab-members').click();
    await p.getByTestId('mp-search').fill('Grünthal');
    await p.getByTestId('mp-row').first().click();
  }],
  ['10-tab-calculator-empty', async (p) => p.getByTestId('tab-calculator').click()],
  ['11-calc-s1-coalition-52', async (p) => {
    await p.getByTestId('tab-calculator').click();
    await p.getByTestId('preset-coalition').click();
  }],
  ['12-calc-s2-opposition-49', async (p) => {
    await p.getByTestId('tab-calculator').click();
    await p.getByTestId('preset-opposition').click();
  }],
  ['13-calc-s3-77-of-101', async (p) => {
    await p.getByTestId('tab-calculator').click();
    for (const id of ['reform', 'e200', 'isamaa', 'sde']) {
      await p.getByTestId(`calc-party-row-${id}`).click();
    }
  }],
  ['14-calc-exclude-panel', async (p) => {
    await p.getByTestId('tab-calculator').click();
    await p.getByTestId('preset-coalition').click();
    await p.getByTestId('calc-exclude-mps').click();
  }],
  ['15-calc-exclude-pick-mp', async (p) => {
    await p.getByTestId('tab-calculator').click();
    await p.getByTestId('preset-coalition').click();
    await p.getByTestId('calc-exclude-mps').click();
    await p.getByTestId('picker-party').first().click();
  }],
  ['16-calc-after-excluding-one-mp', async (p) => {
    await p.getByTestId('tab-calculator').click();
    await p.getByTestId('preset-coalition').click();
    await p.getByTestId('calc-exclude-mps').click();
    await p.getByTestId('picker-party').first().click();
    await p.getByTestId('picker-mp').first().click();
    await p.getByTestId('modal-exclude-mps-close').click();
  }],
  ['17-calc-add-individual-mps-panel', async (p) => {
    await p.getByTestId('tab-calculator').click();
    await p.getByTestId('preset-coalition').click();
    await p.getByTestId('calc-add-mps').click();
  }],
  ['18-calc-add-pick-mp', async (p) => {
    await p.getByTestId('tab-calculator').click();
    await p.getByTestId('preset-coalition').click();
    await p.getByTestId('calc-add-mps').click();
    await p.getByTestId('picker-party').first().click();
  }],
  ['19-calc-final-with-adjustments', async (p) => {
    await p.getByTestId('tab-calculator').click();
    await p.getByTestId('preset-coalition').click();

    await p.getByTestId('calc-exclude-mps').click();
    await p.getByTestId('picker-party').first().click();
    await p.getByTestId('picker-mp').first().click();
    await p.getByTestId('modal-exclude-mps-close').click();

    await p.getByTestId('calc-add-mps').click();
    await p.getByTestId('picker-party').first().click();
    await p.getByTestId('picker-mp').first().click();
    await p.getByTestId('modal-add-mps-close').click();
  }],
];

/* ------------------------------------------------------------------ *
 * Capture
 * ------------------------------------------------------------------ */

async function capture() {
  const executablePath = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
  const browser = await chromium.launch({ executablePath });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    hasTouch: true,
    serviceWorkers: 'block',
  });

  await mkdir(AFTER, { recursive: true });

  for (const [name, drive] of STATES) {
    const page = await context.newPage();
    await page.goto(url);
    await page.getByTestId('tab-parliament').waitFor();
    await drive(page);
    await page.waitForTimeout(120);
    await page.screenshot({ path: join(AFTER, `${name}.png`), fullPage: FULL_PAGE.has(name) });
    await page.close();
    console.log(`  captured ${name}`);
  }

  await browser.close();
}

/* ------------------------------------------------------------------ *
 * Side-by-side
 * ------------------------------------------------------------------ */

const GAP = 24;
const LABEL = 56;

function labelStrip(width, left, right) {
  const half = (width - GAP) / 2;
  const svg = `<svg width="${width}" height="${LABEL}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${LABEL}" fill="#0f172a"/>
    <text x="${half / 2}" y="${LABEL / 2 + 10}" font-family="sans-serif" font-size="26"
          font-weight="700" fill="#e2e8f0" text-anchor="middle">${left}</text>
    <text x="${half + GAP + half / 2}" y="${LABEL / 2 + 10}" font-family="sans-serif" font-size="26"
          font-weight="700" fill="#e2e8f0" text-anchor="middle">${right}</text>
  </svg>`;
  return Buffer.from(svg);
}

async function compose() {
  await mkdir(COMPARE, { recursive: true });
  const names = (await readdir(AFTER)).filter((f) => f.endsWith('.png')).sort();

  for (const file of names) {
    const beforePath = join(BEFORE, file);
    if (!existsSync(beforePath)) {
      console.log(`  skip ${file} — no Phase-0 counterpart`);
      continue;
    }

    const [a, b] = await Promise.all([sharp(beforePath).metadata(), sharp(join(AFTER, file)).metadata()]);
    const height = Math.max(a.height, b.height);
    const width = a.width + GAP + b.width;

    await sharp({
      create: { width, height: height + LABEL, channels: 3, background: '#0f172a' },
    })
      .composite([
        { input: labelStrip(width, 'BEFORE — shipped bundle', 'AFTER — Phase 4 rebuild'), top: 0, left: 0 },
        { input: beforePath, top: LABEL, left: 0 },
        { input: join(AFTER, file), top: LABEL, left: a.width + GAP },
      ])
      .png()
      .toFile(join(COMPARE, file));
    console.log(`  composed ${file}`);
  }
}

console.log(`Capturing ${url} …`);
await capture();
console.log('Composing before/after strips …');
await compose();
console.log('Done.');
