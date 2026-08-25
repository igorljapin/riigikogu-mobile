import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { loadData, repoRoot } from './helpers/fixtures.mjs';

/**
 * The MP portraits, and the three-way agreement they depend on.
 *
 * They are build output, like the icons: `scripts/fetch_mp_photos.mjs` fetches
 * each member's photo from `api.riigikogu.ee` once and writes
 * `assets/mps/<uuid>.webp`, `data/mps.json`'s `photo` field, and the generated
 * block of the service worker's precache list. Three files that have no way of
 * knowing about each other, kept in step by a script that is easy to forget to
 * run — which is what this asserts, because every way the agreement breaks is
 * silent locally and loud in production:
 *
 * - **A member names a file that is not there.** The row falls back to initials
 *   forever, and — because install is deliberately allowed to fail loudly in
 *   this worker — the precache entry beside it rejects `addAll()` and kills
 *   service worker registration for *every* visitor, on both surfaces.
 * - **A file nobody names.** Dead weight in the deployment, and a portrait of
 *   someone who has left parliament still being served.
 * - **`photo` pointing anywhere but at the member's own uuid.** The wrong
 *   person's face on a row, which is the one failure here a reader would
 *   actually notice.
 *
 * Why the portraits are local at all is in the script's header and in
 * `USABILITY.md` §4: the API's file URLs are keyed by a record the CMS re-mints
 * on every re-publish, so 66 of the 101 committed on 2026-08-12 answered 404 by
 * the 25th, and the origin rate-limits the hundred-image burst a roster paints.
 */

const ASSET_DIR = join(repoRoot, 'assets', 'mps');

/** The generated portrait entries of the worker's precache list, repo-relative. */
function precachedPortraits() {
  const source = readFileSync(join(repoRoot, 'service-worker.js'), 'utf8');
  return [...source.matchAll(/'\.\/(assets\/mps\/[^']+)'/g)].map((match) => match[1]);
}

test('every MP names a portrait, and it is their own', () => {
  const { mps } = loadData();
  assert.ok(mps.length > 0);

  for (const mp of mps) {
    assert.equal(
      mp.photo,
      `assets/mps/${mp.uuid}.webp`,
      `${mp.name}: photo must be the member's own uuid — run scripts/fetch_mp_photos.mjs`,
    );
  }
});

test('every named portrait is on disk, and is a WebP of a plausible size', () => {
  const { mps } = loadData();

  for (const mp of mps) {
    const file = join(repoRoot, mp.photo);
    assert.ok(existsSync(file), `${mp.name}: ${mp.photo} is not on disk`);

    const bytes = statSync(file).size;
    // A 270px WebP portrait runs 3–12 KB. The floor catches a truncated or
    // error-page download; the ceiling catches a full-size JPEG renamed, which
    // would put ~4 MB into a precache every visitor installs.
    assert.ok(bytes > 1024, `${mp.name}: ${mp.photo} is only ${bytes} bytes`);
    assert.ok(bytes < 60 * 1024, `${mp.name}: ${mp.photo} is ${(bytes / 1024).toFixed(0)} KB`);

    // RIFF....WEBP — the container, without decoding the image.
    const header = readFileSync(file).subarray(0, 12);
    assert.equal(header.subarray(0, 4).toString('latin1'), 'RIFF', `${mp.photo}: not a RIFF file`);
    assert.equal(header.subarray(8, 12).toString('latin1'), 'WEBP', `${mp.photo}: not a WebP file`);
  }
});

test('assets/mps holds a portrait for every member and for nobody else', () => {
  const { mps } = loadData();
  const onDisk = readdirSync(ASSET_DIR).filter((name) => name.endsWith('.webp')).sort();
  const named = mps.map((mp) => `${mp.uuid}.webp`).sort();

  assert.deepEqual(
    onDisk,
    named,
    'assets/mps and data/mps.json disagree — run scripts/fetch_mp_photos.mjs to prune and refill',
  );
});

test('the precache list names exactly the portraits that exist', () => {
  const { mps } = loadData();
  const precached = precachedPortraits().sort();
  const named = mps.map((mp) => mp.photo).sort();

  assert.deepEqual(
    precached,
    named,
    'service-worker.js and data/mps.json disagree — run scripts/fetch_mp_photos.mjs',
  );
});

test('the manifest records where every portrait came from', () => {
  const manifest = JSON.parse(readFileSync(join(ASSET_DIR, 'manifest.json'), 'utf8'));
  const { mps } = loadData();
  const byUuid = new Map(manifest.portraits.map((portrait) => [portrait.uuid, portrait]));

  assert.equal(manifest.portraits.length, mps.length);
  for (const mp of mps) {
    const portrait = byUuid.get(mp.uuid);
    assert.ok(portrait, `${mp.name}: no provenance recorded`);
    assert.equal(portrait.file, mp.photo);
    // The sha256 of the source bytes is what lets a re-run skip a portrait that
    // has not changed, so a missing or malformed one means a monthly job that
    // rewrites all 101 files every time it runs.
    assert.match(portrait.sourceSha256, /^[0-9a-f]{64}$/, `${mp.name}: bad source hash`);
    assert.match(portrait.sourceUrl, /^https:\/\/api\.riigikogu\.ee\//, `${mp.name}: bad source URL`);
  }
});
