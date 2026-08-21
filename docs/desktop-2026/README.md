# Phase 1 handoff — Riigikogu desktop redesign

Approved 1920×1080 desktop design for the XV Riigikogu dashboard, built on the
mobile redesign's tokens. Everything needed to see the design working, read its
source, and write the Phase 2 usability contract against it.

## Start here

`prototype/riigikogu-desktop-standalone.html` — **open it in a browser, no
server, no install.** One self-contained file with the roster data embedded.
The left rail switches between the three views; the LIGHT/DARK button at the
bottom of the rail flips the theme. Everything is live: hover a seat, click a
seat for the profile card, click a party to highlight its members, search and
filter the directory, build a coalition in the calculator.

It is a 1920-wide design. Below that width the browser will scroll rather than
reflow — responsive behaviour is out of Phase 1 scope. Zoom out to ~67% on a
1440 screen to see a whole view at once.

## Contents

```
mockups/                    six 1920×1080 PNGs, the approved artboards
  01-parliament-light.png       04-parliament-dark.png
  02-directory-light.png        05-directory-dark.png
  03-calculator-light.png       06-calculator-dark.png

prototype/
  riigikogu-desktop-standalone.html   ← open this one; offline, data embedded
  riigikogu-desktop.dc.html           same thing before bundling
  support.js                          runtime for the above

source/                     the design as authored, for reading
  RKDesktopScreen.dc.html       the screen: all three views, both themes
  Riigikogu Desktop.dc.html     the light artboard canvas
  Riigikogu Desktop Dark.dc.html  the dark artboard canvas
  support.js, data/             served alongside

data/                       the roster the design renders
  parties.json  mps.json  alignment.json  board.json  meta.json  seating.json

DESIGN_NOTES.md             decisions the mockups make that the plan does not
INTERACTIONS.md             every interactive element + suggested data-testid
```

`source/` needs a static server (it fetches `data/*.json`); the standalone file
does not. `python3 -m http.server` from inside `source/` is enough.

## What the prototype is and isn't

It is a faithful, clickable specification — the real interaction model, the
real data, both themes. Treat disagreements between it and the PNGs as bugs in
the PNGs.

It is **not** production code and should not be merged. It is one component in
a design-tool runtime, with layout as inline styles and no build step, test
harness, accessibility pass, error handling, or i18n. Phase 3 rebuilds these
views in the repo's own stack; this is the reference it builds against.

## Data

The mobile handoff's roster at 2026-08-12 — coalition 50, opposition 42,
unaligned 9 — joined to the Phase 0 `seating.json`. The join is clean in both
directions: 101 seats, 101 active MPs, no orphans. The desktop repo's bundle
party data was not used, per Phase 0.

Party colours and each party's `textColor` come from `parties.json` and are
**identical in light and dark** — they are content, not theme. That is why
Reform seats stay black-on-yellow in dark mode.

## For Phase 2

`INTERACTIONS.md` enumerates every interactive element with a suggested
`data-testid`, which is close to the table the plan asks for. Two of those
promises are new in Phase 1 and easy to miss when reading the old snapshot: the
**party-highlight toggle** on the Parliament view, and the calculator's
**named-adjustment rows** with per-row undo.

`DESIGN_NOTES.md` is a record of design intent, not a contract. Anything in it
that constitutes a user-facing promise should be folded into `USABILITY.md`
proper — that is where Phase 3 will look.
