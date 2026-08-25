#!/usr/bin/env node
/**
 * Renders every PNG the two manifests reference from the four SVG masters in
 * `icons/`. Run it after any edit to a master — the PNGs are build output, not
 * hand-made files.
 *
 *   node scripts/generate_icons.mjs
 *
 * `sharp` is already in devDependencies; nothing else is needed.
 */
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const icons = join(root, 'icons');

/** [source SVG, output PNG, pixel size, flatten background or null] */
const JOBS = [
  // Mobile app — manifest.json
  ['icon.svg',                  'icon-192x192.png',            192, null],
  ['icon.svg',                  'icon-512x512.png',            512, null],
  ['icon-maskable.svg',         'icon-maskable-512.png',       512, '#0f172a'],
  // iOS home screen: always square and always opaque — iOS applies its own mask
  // and paints anything transparent black.
  ['icon-maskable.svg',         'apple-touch-icon.png',        180, '#0f172a'],

  // Desktop app — desktop/manifest.json
  ['desktop-icon.svg',          'desktop-icon-192.png',        192, null],
  ['desktop-icon.svg',          'desktop-icon-512.png',        512, null],
  ['desktop-icon-maskable.svg', 'desktop-icon-maskable-512.png', 512, '#0f172a'],
  ['desktop-icon-maskable.svg', 'desktop-apple-touch-icon.png', 180, '#0f172a'],
  // Windows 11 reads the smallest listed size for the taskbar and the jump
  // list; 44 is the small-tile size and the one that has to stay legible.
  ['desktop-icon.svg',          'desktop-icon-44.png',          44, null],
  ['desktop-icon.svg',          'desktop-icon-256.png',        256, null],
];

for (const [src, out, size, background] of JOBS) {
  let pipeline = sharp(await readFile(join(icons, src)), { density: 512 }).resize(size, size);
  if (background) pipeline = pipeline.flatten({ background });
  await pipeline.png({ compressionLevel: 9 }).toFile(join(icons, out));
  console.log(`${out.padEnd(32)} ${size}x${size}`);
}
