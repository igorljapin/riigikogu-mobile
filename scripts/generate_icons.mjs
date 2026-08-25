#!/usr/bin/env node
/**
 * Renders every PNG the two manifests reference from the SVG masters in
 * `icons/`. Run it after any edit to a master — the PNGs are build output, not
 * hand-made files.
 *
 *   node scripts/generate_icons.mjs
 *
 * `sharp` is already in devDependencies; nothing else is needed.
 *
 * Three shapes of job, because three platforms crop differently:
 *
 *   plain    the master rendered edge to edge. What Chrome shows for
 *            `purpose: any`, and what Windows puts on the taskbar and the
 *            Start tile — Windows applies no mask and no rounding of its own,
 *            so the 230/1024 radius is baked into the rounded masters.
 *   flatten  the same, composited onto the ground colour so the PNG has no
 *            alpha. Android's maskable slot.
 *   inset    the master drawn at `inset`× and seated on the bottom edge of an
 *            opaque tile — the same bottom-centre pivot the maskable masters
 *            use, so the shaft still runs off the edge while the crown gains a
 *            margin. iOS only; see below.
 *
 * Why iOS gets its own treatment: a home-screen web app reads
 * `apple-touch-icon.png` and nothing else — no manifest array, no maskable, no
 * monochrome. iOS applies a squircle whose radius is within a hair of the
 * masters' own 230/1024, so the rounded master flattened onto its own ground
 * colour is already the right shape; what it needs is breathing room at the
 * top, where the finial otherwise sits two pixels off the edge. Rendering the
 * maskable master instead would work, but 0.8 is a mask allowance, not a
 * margin, and it leaves the mark visibly small against every neighbouring
 * app. 0.9 is the compromise, checked by eye at 180px.
 */
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const icons = join(root, 'icons');

/** The ground both apps sit on — `theme_color` in either manifest. */
const GROUND = '#0f172a';

/** How much of the tile the mark fills on iOS. See the note above. */
const IOS_SCALE = 0.9;

/** [source SVG, output PNG, pixel size, 'plain' | 'flatten' | 'inset'] */
const JOBS = [
  // Mobile app — manifest.json
  ['icon.svg',                  'icon-192x192.png',              192, 'plain'],
  ['icon.svg',                  'icon-512x512.png',              512, 'plain'],
  ['icon-maskable.svg',         'icon-maskable-512.png',         512, 'flatten'],
  ['icon.svg',                  'apple-touch-icon.png',          180, 'inset'],

  // Desktop app — desktop/manifest.json
  ['desktop-icon.svg',          'desktop-icon-192.png',          192, 'plain'],
  ['desktop-icon.svg',          'desktop-icon-512.png',          512, 'plain'],
  ['desktop-icon-maskable.svg', 'desktop-icon-maskable-512.png', 512, 'flatten'],
  ['desktop-icon.svg',          'desktop-apple-touch-icon.png',  180, 'inset'],
  // Windows 11 reads the smallest listed size for the taskbar and the jump
  // list; 44 is the small-tile size and the one that has to stay legible. It
  // keeps every detail on purpose — the palace's window grid is what stops it
  // reading as a white blob at that size, checked by eye against a variant
  // with the windows dropped.
  ['desktop-icon.svg',          'desktop-icon-44.png',            44, 'plain'],
  ['desktop-icon.svg',          'desktop-icon-256.png',          256, 'plain'],
];

for (const [src, out, size, mode] of JOBS) {
  const master = await readFile(join(icons, src));
  const render = (px) => sharp(master, { density: 512 }).resize(px, px);

  let pipeline;
  if (mode === 'inset') {
    const inner = Math.round(size * IOS_SCALE);
    pipeline = sharp({
      create: { width: size, height: size, channels: 4, background: GROUND },
    }).composite([
      {
        input: await render(inner).png().toBuffer(),
        left: Math.round((size - inner) / 2),
        top: size - inner,
      },
    ]);
  } else {
    pipeline = render(size);
  }

  // `flatten` alone leaves a fully-opaque alpha channel behind on the composited
  // tiles; iOS wants the channel gone, not merely unused.
  if (mode !== 'plain') pipeline = pipeline.flatten({ background: GROUND }).removeAlpha();

  await pipeline.png({ compressionLevel: 9 }).toFile(join(icons, out));
  console.log(`${out.padEnd(32)} ${size}x${size}  ${mode}`);
}
