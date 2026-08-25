import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';

import { repoRoot } from './helpers/fixtures.mjs';

/**
 * The icons are the one part of this app that ships as build output. The SVG
 * masters in `icons/` are the source; `scripts/generate_icons.mjs` renders the
 * ten PNGs; two manifests, two shells and the service worker's precache list
 * then name those files by hand, in three places that have no way of knowing
 * about each other.
 *
 * That hand-maintained agreement is what this file asserts, because the two
 * ways it breaks are both silent at author time and loud in production:
 *
 * - **A manifest names a file nobody generated.** Chrome drops the entry and
 *   installs the app with whatever is left — or with no icon at all.
 * - **The precache list and the manifests disagree.** Install is deliberately
 *   allowed to fail loudly in this worker (`service-worker.js`, Phase 6), so a
 *   single entry naming a missing file rejects `addAll()` and kills service
 *   worker registration for *every* visitor, on both surfaces. The offline
 *   promises (`USABILITY.md` 5.1–5.5) go with it.
 *
 * Neither needs a browser to catch, so neither waits for the Playwright tier.
 * `pwa/desktop-offline.spec.js` D5.5 already fetches every desktop icon over
 * HTTP; this covers the mobile manifest, which nothing checked, and adds the
 * two properties a fetch cannot see — that a PNG is the size it claims, and
 * that the iOS tiles carry no alpha channel.
 */

const MANIFESTS = ['manifest.json', 'desktop/manifest.json'];
const SHELLS = ['index.html', 'desktop/index.html'];

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), 'utf8'));
}

/**
 * A manifest `src` is relative to the manifest, which is not where the repo
 * root is for the desktop one — `../icons/x.png` from `desktop/` and
 * `icons/x.png` from the root name the same file, and both have to normalise
 * to the same key before anything can be compared.
 */
function resolveFromManifest(manifestPath, src) {
  return posix.normalize(posix.join(posix.dirname(manifestPath), src));
}

/** Every icon either manifest declares, as repo-relative paths. */
function declaredIcons() {
  return MANIFESTS.flatMap((manifestPath) =>
    readJson(manifestPath).icons.map((entry) => ({
      manifestPath,
      entry,
      path: resolveFromManifest(manifestPath, entry.src),
    })),
  );
}

/** The precache list, read out of the worker as the source it actually is. */
function precacheList() {
  const source = readFileSync(join(repoRoot, 'service-worker.js'), 'utf8');
  const block = source.match(/const PRECACHE_ASSETS = \[([\s\S]*?)\n\];/);
  assert.ok(block, 'PRECACHE_ASSETS is no longer an array literal this can read');

  return block[1]
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith("'"))
    .map((line) => line.replace(/^'/, '').replace(/',?$/, ''))
    .map((entry) => posix.normalize(entry));
}

/** width, height and colour type out of a PNG's IHDR — no image library needed. */
function pngHeader(absolutePath) {
  const bytes = readFileSync(absolutePath);
  assert.equal(
    bytes.subarray(0, 8).toString('hex'),
    '89504e470d0a1a0a',
    `${absolutePath} is not a PNG`,
  );
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    // 0 grey, 2 truecolour, 3 indexed, 4 grey+alpha, 6 truecolour+alpha.
    colourType: bytes.readUInt8(25),
  };
}

test('every icon both manifests declare exists on disk', () => {
  for (const { manifestPath, entry, path } of declaredIcons()) {
    assert.ok(
      existsSync(join(repoRoot, path)),
      `${manifestPath} declares ${entry.src}, which resolves to a missing ${path}`,
    );
  }
});

test('every icon src is relative, so it resolves under any mount point', () => {
  // The same rule the precache list follows: the app is served from
  // `/riigikogu-mobile/` in production and from `/` under the test server.
  for (const { manifestPath, entry } of declaredIcons()) {
    assert.ok(
      !entry.src.startsWith('/'),
      `${manifestPath} declares an absolute icon src: ${entry.src}`,
    );
  }
});

test('every PNG is the size its manifest entry claims', () => {
  for (const { manifestPath, entry, path } of declaredIcons()) {
    if (entry.sizes === 'any') continue;

    const [width, height] = entry.sizes.split('x').map(Number);
    const header = pngHeader(join(repoRoot, path));

    assert.deepEqual(
      { width: header.width, height: header.height },
      { width, height },
      `${manifestPath} declares ${entry.src} as ${entry.sizes}, but the file is ` +
        `${header.width}x${header.height} — re-run scripts/generate_icons.mjs`,
    );
  }
});

test('the maskable icon is its own asset, not the rounded one reused', () => {
  // The bug this replaces: both manifests used to point `purpose: maskable` at
  // the same 512 the `any` entry used. Android masks that file to a circle and
  // crops whatever sits outside the central 80%, so the mark lost its flag on
  // every Android home screen and nothing said so.
  for (const manifestPath of MANIFESTS) {
    const icons = readJson(manifestPath).icons;
    const purposes = (want) =>
      new Set(
        icons
          .filter((entry) => entry.purpose === want)
          .map((entry) => resolveFromManifest(manifestPath, entry.src)),
      );

    const maskable = purposes('maskable');
    assert.ok(maskable.size > 0, `${manifestPath} declares no maskable icon`);

    for (const path of maskable) {
      assert.ok(
        !purposes('any').has(path),
        `${manifestPath} uses ${path} for both purpose:any and purpose:maskable`,
      );
    }
  }
});

test('the iOS tiles carry no alpha channel', () => {
  // A home-screen web app on iOS reads `apple-touch-icon.png` and nothing else
  // — not the manifest array, not maskable, not monochrome. It also paints
  // transparent pixels black, so the only way to be sure of the result is to
  // ship an opaque file. `scripts/generate_icons.mjs` flattens these two onto
  // the ground colour; this is the assertion that it kept doing so.
  for (const path of ['icons/apple-touch-icon.png', 'icons/desktop-apple-touch-icon.png']) {
    const { colourType } = pngHeader(join(repoRoot, path));
    assert.ok(
      colourType === 0 || colourType === 2 || colourType === 3,
      `${path} has an alpha channel (PNG colour type ${colourType})`,
    );
  }
});

test('the shells point at icons that exist', () => {
  for (const shell of SHELLS) {
    const html = readFileSync(join(repoRoot, shell), 'utf8');
    const hrefs = [...html.matchAll(/<link\s+rel="(?:apple-touch-)?icon"[^>]*href="([^"]+)"/g)]
      .map((match) => match[1]);

    assert.ok(hrefs.length >= 2, `${shell} declares fewer than two icon links`);
    for (const href of hrefs) {
      const path = resolveFromManifest(shell, href.replace(/^\.\//, ''));
      assert.ok(existsSync(join(repoRoot, path)), `${shell} links a missing ${href}`);
    }
  }
});

test('the precache list names every icon the two apps can request', () => {
  // Not a tidiness check. A file a manifest names and the worker does not
  // precache is a file an offline install cannot draw; a file the worker
  // precaches and nobody generated takes the whole registration down with it.
  const precache = new Set(precacheList());

  for (const { manifestPath, entry, path } of declaredIcons()) {
    assert.ok(
      precache.has(path),
      `${manifestPath} declares ${entry.src} but service-worker.js does not precache ${path}`,
    );
  }

  for (const entry of precache) {
    if (!entry.startsWith('icons/')) continue;
    assert.ok(
      existsSync(join(repoRoot, entry)),
      `service-worker.js precaches ${entry}, which does not exist — install would reject`,
    );
  }
});

test('the SVG masters the generator reads are all present', () => {
  // The PNGs are build output and the masters are the source. Losing a master
  // is silent until someone next needs to change the artwork, by which point
  // the only copy left is a 512-pixel raster.
  const generator = readFileSync(join(repoRoot, 'scripts/generate_icons.mjs'), 'utf8');
  const masters = new Set(
    [...generator.matchAll(/'([\w-]+\.svg)'/g)].map((match) => match[1]),
  );

  assert.ok(masters.size >= 4, 'no SVG masters found in scripts/generate_icons.mjs');
  for (const master of masters) {
    assert.ok(
      existsSync(join(repoRoot, 'icons', master)),
      `scripts/generate_icons.mjs reads icons/${master}, which is missing`,
    );
  }
});
