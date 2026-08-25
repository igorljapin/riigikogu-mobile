# Handoff: Crown app icon (option 2a)

Repo: `igorljapin/riigikogu-mobile` · branch `main` · both surfaces (mobile PWA + desktop PWA)

## Overview

Replace the illustrated Toompea castle icon with **Crown** — a cropped silhouette of
Pikk Hermann's top: merlons, machicolation band, corbels, and the flag on its pole.
The tower shaft runs off the bottom edge of the canvas; that crop is the identity of
the mark and must be preserved.

The mark ships to three places: Android/Chrome (`manifest.json`), iOS home screen
(`apple-touch-icon.png`), and Windows 11 / Edge (`desktop/manifest.json`). A separate
desktop variant adds a window-and-roof motif so the two installed apps are
distinguishable in a taskbar.

## About the design files

The artwork in `icons/` is **production-ready SVG**, not a prototype — copy these files
into the repo as-is. That is the exception in this bundle.

`reference/*.dc.html` are **design references created in HTML**: the icon spec sheet and
the step-by-step implementation plan, rendered as documents. They are for reading, not
for copying into the app. Nothing in `reference/` ships.

## Fidelity

**High-fidelity.** Final geometry, final colours, final file names. All coordinates below
are exact and every colour is a token already present in `styles.css`. No interpretation
needed; if something looks ambiguous, the SVG source is the answer.

## What to do

Seven steps, no new dependencies, no build step added. `sharp` is already in
`devDependencies`.

```
git checkout -b icon/crown
npm ci
```

1. **Copy the artwork in.** All seven SVGs from `icons/` in this bundle go to `icons/` in
   the repo (`icon.svg` is overwritten — leave the old one in git history, do not rename
   it). `scripts/generate_icons.mjs` goes to `scripts/`.

2. **Generate the PNGs.**
   ```
   node scripts/generate_icons.mjs
   ```
   Ten PNGs land in `icons/`. They are build output — never hand-edit one; change the SVG
   and re-run.

   | File | Size | Used by |
   |---|---|---|
   | `icon-192x192.png` | 192 | manifest, Android |
   | `icon-512x512.png` | 512 | manifest, splash |
   | `icon-maskable-512.png` | 512 | manifest, maskable |
   | `apple-touch-icon.png` | 180 | iOS home screen |
   | `desktop-icon-192.png` | 192 | desktop manifest |
   | `desktop-icon-512.png` | 512 | desktop manifest |
   | `desktop-icon-maskable-512.png` | 512 | desktop, maskable |
   | `desktop-icon-256.png` | 256 | Windows Start |
   | `desktop-icon-44.png` | 44 | Windows taskbar |
   | `desktop-apple-touch-icon.png` | 180 | iPad, desktop app |

   The two apple-touch files and the two maskable PNGs are flattened onto `#0f172a` with
   no alpha channel. iOS paints transparent pixels black, so an opaque source is the only
   way to be sure of the result.

3. **`manifest.json`** — replace the whole `"icons"` array. Everything else in the file
   stays; `theme_color` and `background_color` already match the mark.
   ```json
   "icons": [
     {
       "src": "icons/icon.svg",
       "sizes": "any",
       "type": "image/svg+xml",
       "purpose": "any"
     },
     {
       "src": "icons/icon-192x192.png",
       "sizes": "192x192",
       "type": "image/png",
       "purpose": "any"
     },
     {
       "src": "icons/icon-512x512.png",
       "sizes": "512x512",
       "type": "image/png",
       "purpose": "any"
     },
     {
       "src": "icons/icon-maskable-512.png",
       "sizes": "512x512",
       "type": "image/png",
       "purpose": "maskable"
     },
     {
       "src": "icons/icon-mono.svg",
       "sizes": "any",
       "type": "image/svg+xml",
       "purpose": "monochrome"
     }
   ],
   ```

4. **`desktop/manifest.json`** — same edit, desktop artwork. Paths keep the `../` prefix:
   the desktop app has its own scope but shares the one `icons/` directory.
   ```json
   "icons": [
     {
       "src": "../icons/desktop-icon.svg",
       "sizes": "any",
       "type": "image/svg+xml",
       "purpose": "any"
     },
     {
       "src": "../icons/desktop-icon-44.png",
       "sizes": "44x44",
       "type": "image/png",
       "purpose": "any"
     },
     {
       "src": "../icons/desktop-icon-192.png",
       "sizes": "192x192",
       "type": "image/png",
       "purpose": "any"
     },
     {
       "src": "../icons/desktop-icon-256.png",
       "sizes": "256x256",
       "type": "image/png",
       "purpose": "any"
     },
     {
       "src": "../icons/desktop-icon-512.png",
       "sizes": "512x512",
       "type": "image/png",
       "purpose": "any"
     },
     {
       "src": "../icons/desktop-icon-maskable-512.png",
       "sizes": "512x512",
       "type": "image/png",
       "purpose": "maskable"
     }
   ],
   ```
   Both snippets keep one property per line to match the formatting already used in these
   two files.

5. **The two shells.** Mobile `index.html` needs **no change** — it already points at
   `./icons/icon.svg` and `./icons/apple-touch-icon.png`, and both file names are reused.
   In `desktop/index.html`, repoint the two icon links so the desktop app stops borrowing
   the mobile mark:
   ```diff
   - <link rel="icon" href="../icons/icon.svg" type="image/svg+xml">
   - <link rel="apple-touch-icon" href="../icons/apple-touch-icon.png">
   + <link rel="icon" href="../icons/desktop-icon.svg" type="image/svg+xml">
   + <link rel="apple-touch-icon" href="../icons/desktop-apple-touch-icon.png">
   ```

6. **`service-worker.js`** — two edits. The cache name bump is what evicts the old icon
   from everyone who already installed the app; without it a returning visitor keeps the
   castle until their second visit.
   ```diff
   - const CACHE_NAME = 'riigikogu-mobile-v6';
   + const CACHE_NAME = 'riigikogu-mobile-v7';
   ```
   Then replace the four icon lines at the end of `PRECACHE_ASSETS` with:
   ```js
     './icons/icon.svg',
     './icons/icon-mono.svg',
     './icons/icon-192x192.png',
     './icons/icon-512x512.png',
     './icons/icon-maskable-512.png',
     './icons/apple-touch-icon.png',

     './icons/desktop-icon.svg',
     './icons/desktop-icon-44.png',
     './icons/desktop-icon-192.png',
     './icons/desktop-icon-256.png',
     './icons/desktop-icon-512.png',
     './icons/desktop-icon-maskable-512.png',
     './icons/desktop-apple-touch-icon.png',
   ```
   List only files that exist. Install is deliberately allowed to fail loudly in this
   worker, so one missing entry rejects `addAll()` and kills registration for everyone.
   The four masters nothing loads at runtime — `icon-dark.svg`, `icon-maskable.svg` and
   their desktop pairs — stay out of the list on purpose.

7. **Check it.**
   ```
   npm test          # 64 unit + 46 resolver + 118 Playwright
   npm run serve     # http://localhost:8099
   ```
   `tests/pwa/desktop-offline.spec.js` asserts that both sizes Chrome and Edge ask for are
   present and that every `src` is relative and fetchable. Both arrays above satisfy that;
   the extra entries are additive.

## The artwork

Canvas `viewBox="0 0 1024 1024"` for every master. Corner radius on the rounded masters:
`rx="230"` (230/1024), applied as a `clipPath`, not a CSS radius.

### Files

| Master | Shape | Notes |
|---|---|---|
| `icon.svg` | rounded, `rx=230` | mobile, light — the default everywhere |
| `icon-dark.svg` | rounded, `rx=230` | mobile, dark theme |
| `icon-mono.svg` | full-bleed, transparent | white-on-transparent, `purpose: monochrome` |
| `icon-maskable.svg` | square, full-bleed | 80% safe zone, no corner radius |
| `desktop-icon.svg` | rounded, `rx=230` | desktop, light |
| `desktop-icon-dark.svg` | rounded, `rx=230` | desktop, dark theme |
| `desktop-icon-maskable.svg` | square, full-bleed | 80% safe zone |

Why four masters per surface rather than one: the rounded file is what a browser shows as
a favicon and what Windows puts on the taskbar, so it carries its own corner radius. The
maskable file is square and full-bleed because Android and iOS apply their own mask on
top, and a pre-rounded icon inside a mask gets rounded twice.

### Geometry (mobile master, exact)

Read top to bottom; every value is a user unit in the 1024 canvas.

- **Flag pole** — `rect x=500 y=54 w=14 h=250`, `#94a3b8`. **Finial** — `circle cx=507
  cy=46 r=16`, `#f4f6f8`.
- **Flag** — three stacked bands right of the pole, each `x=514 w=232 h=52`:
  `y=78` `#2563eb`, `y=130` `#233046`, `y=182` `#f4f6f8`. Outlined as a whole by
  `rect x=514 y=78 w=232 h=156`, `fill:none`, `stroke #94a3b8`, `stroke-width 4`,
  `opacity .55`.
- **Merlons** — five `w=60 h=80` blocks at `y=300`, `x` = 288, 385, 482, 579, 676
  (97 pitch). First three `#f4f6f8`, last two `#94a3b8` — the shadow side.
- **Machicolation band** — `rect x=288 y=378 w=448 h=52` `#f4f6f8`, with
  `rect x=562 y=378 w=174 h=52` `#94a3b8` over its right end.
- **Shaft** — `path M312 430 H712 L732 1024 H292 Z` `#f4f6f8` (a slight outward taper),
  with the shadow half `path M562 430 H712 L732 1024 H572 Z` `#94a3b8`.
- **Corbels** — eight `w=22 h=26` blocks at `y=430`, `x` = 320, 368, 416, 464, 512, 560,
  608, 656 (48 pitch), `#94a3b8` at `opacity .5`.
- **Windows** — three `w=28 h=70 rx=14` slits at `x=498`, `y` = 520, 680, 840, filled with
  the background `#0f172a` so they read as voids.

The desktop master keeps this crown and adds, bottom-right: a facade
`rect x=592 y=712 w=432 h=312` `#f4f6f8`, a roof `path M568 712 L628 648 L1024 648 L1024
712 Z` `#94a3b8`, and eight `w=34 h=54 rx=4` windows in `#0f172a` on a 80-unit pitch
(`x` = 636, 716, 796, 876 at `y=760` and `y=866`).

### Colours

Every colour is a token from `styles.css`. Nothing here is a one-off.

| Role | Light | Dark master |
|---|---|---|
| Ground / background | `#0f172a` | `#080d16` |
| Stone (lit face) | `#f4f6f8` | `#f6f8fb` |
| Stone (shadow face) | `#94a3b8` | `#64748b` |
| Flag, blue band | `#2563eb` | `#2563eb` |
| Flag, dark band | `#233046` | `#233046` |
| Flag, light band | `#f4f6f8` | `#f6f8fb` |

`icon-mono.svg` is white only: `#ffffff` for the lit faces and the finial,
`rgba(255,255,255,.8)` / `.55` / `.28` for the flag bands, pole and outline. Background is
`fill="none"`.

If a future redesign moves those tokens, the icons move with them by search and replace.

## Two constraints to hold on to

1. **The shaft must keep running off the bottom edge.** The crop is what stops the mark
   reading as a generic tower.
2. **The maskable masters scale the whole drawing to 80% about the *bottom centre***, not
   the centre: `transform="translate(512,1024) scale(0.8) translate(-512,-1024)"`. That
   moves the crown inside the safe circle while the shaft stays flush with the edge. Scale
   about the centre instead and a light band appears under the tower on Android.

Re-run `node scripts/generate_icons.mjs` and bump `CACHE_NAME` after any artwork edit.
Those two steps are the whole maintenance story.

## Device check — the part no test grades

- **iPhone.** Safari → Share → Add to Home Screen. Check the crown is not clipped by the
  corner mask and that the flag still reads at arm's length.
- **Windows 11.** Edge → install the desktop app. Check the taskbar, the Start tile and
  Alt-Tab — the 44px render is the one that fails first.
- **Android.** Chrome → Install app. The maskable file is what you are checking; the
  circle mask crops hard.
- **Browser tab.** The favicon at 16px is the smallest the mark is ever asked to be.

An installed PWA caches its icon aggressively. To see a change on a device that already
has the app: uninstall it, hard-reload the page, then re-install.

## What iOS will and will not use

A home-screen web app on iOS reads **only** `apple-touch-icon.png`. It ignores the
manifest's icon array, ignores `purpose: maskable` and `monochrome`, and has no mechanism
for the dark, tinted or clear appearances at all — those belong to native apps, which
declare them in an icon asset compiled by Xcode.

So the light mark is what ships to iPhone. `icon-dark.svg` and its desktop pair are in the
repo because they cost nothing to keep and they are the starting artwork the day either
surface is wrapped as a native app. `icon-mono.svg` does earn its keep now: Windows and
Android both read `purpose: monochrome` for notification badges and themed icons.

Windows applies no corner rounding of its own to an installed PWA's icon, which is why
`desktop-icon.svg` carries the 230/1024 radius baked in and the maskable file does not.

## Files in this bundle

```
icons/
  icon.svg                     mobile, light, rounded
  icon-dark.svg                mobile, dark
  icon-mono.svg                mobile, white on transparent
  icon-maskable.svg            mobile, square, 80% safe zone
  desktop-icon.svg             desktop, light, rounded
  desktop-icon-dark.svg        desktop, dark
  desktop-icon-maskable.svg    desktop, square, 80% safe zone
scripts/
  generate_icons.mjs           renders all 10 PNGs with sharp
reference/
  Crown Icon Implementation Plan.dc.html   the same plan as a printable document
  Icon.dc.html                             icon spec sheet / scale previews
  support.js, doc-page.js                  needed to open the two HTML files
```

Files touched in the repo: `icons/*` (added), `scripts/generate_icons.mjs` (added),
`manifest.json`, `desktop/manifest.json`, `desktop/index.html`, `service-worker.js`.
`index.html` unchanged.
