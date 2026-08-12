# XV Riigikogu Mobile Dashboard

📱 **Mobile dashboard for the Estonian Parliament (XV Riigikogu) — composition, members, and a vote calculator.**

![XV Riigikogu 2023–2027](https://img.shields.io/badge/XV_Riigikogu-2023--2027-blue)
![No build step](https://img.shields.io/badge/Build-none-green)
![PWA](https://img.shields.io/badge/PWA-installable%20%2B%20offline-purple)

**Live:** [igorljapin.github.io/riigikogu-mobile](https://igorljapin.github.io/riigikogu-mobile/)
· **Desktop version:** [riigikogu-desktop](https://igorljapin.github.io/riigikogu-desktop/)

---

## Features

**Parliament** — the 101 seats split into coalition, opposition and unaligned,
with the majority threshold stated, every party as a tappable chip that opens
its member list, and the Board of the Riigikogu.

**Members** — all 101 MPs with photos, official `riigikogu.ee` profile links,
party colour coding, committee assignments, faction offices, and search plus
filters (All · 🇺🇸 USA friendship group · Chairs).

**Calculator** — build a hypothetical majority: tap parties in or out, add or
exclude individual MPs, use the Coalition/Opposition presets, and watch the four
constitutional thresholds light up as the total crosses them.

**PWA** — installs to the home screen and works offline from a cached copy of
the app and its data. (MP photos are served by `api.riigikogu.ee` and are the
one thing that falls back to placeholders offline.)

---

## Current composition

> Every number below is read from `data/*.json`, which the app fetches at
> runtime — not typed into this file or into the UI. Regenerate with
> `python3 scripts/build_data.py`. **Snapshot of `data/meta.json` as of
> 2026-08-12**; the app always shows the current values, and its header states
> the date it was last updated.

Each party has **two** seat counts, and they answer different questions:

| Party | Registered | Voting bloc | Bloc |
|---|---|---|---|
| Reform | 36 | 38 | coalition |
| Eesti 200 | 12 | 12 | coalition |
| SDE | 9 | 14 | opposition |
| Isamaa | 8 | 11 | opposition |
| EKRE | 9 | 9 | opposition |
| Center | 7 | 8 | opposition |
| Non-affiliated / unaligned | 20 | 9 | **neither** |
| **Total** | **101** | **101** | |

**Coalition 50 · Opposition 42 · Unaligned 9.** Reform and Eesti 200 have led a
**minority government since 2026-08-10**, one seat short of the 51 needed to
pass ordinary legislation.

- **Registered** is what the API reports: formal parliamentary group membership.
  Use it for procedural facts — speaking time, committee entitlements, anything
  quoted as an official Riigikogu figure.
- **Voting bloc** is group membership plus the MPs who left a group and now vote
  with another party. Use it for majority arithmetic. **This is what the app
  displays and what the calculator computes**, because under the Rules of
  Procedure §40–42 an MP who leaves a group may never join another for the rest
  of the term — so a defector stays registered as non-affiliated forever while
  voting with their new party.
- The nine **unaligned** MPs left a group and joined no party. They have no whip
  and no common position, so they are shown as their own bucket and are never
  counted toward either bloc.

### Board of the Riigikogu

| Office | Member | Party |
|---|---|---|
| President | Lauri Hussar | Eesti 200 |
| First Vice-President | Toomas Kivimägi | Reform |
| Second Vice-President | Arvo Aller | EKRE |

### Voting thresholds

The calculator lights up four cards as the selection grows. All four seat counts
come from `data/meta.json`; the app never hardcodes them.

| Card | Seats | `meta.json` key |
|---|---|---|
| 1/2+1 | 51 | `simpleMajority` |
| 3/5 | 61 | `threeFifths` |
| 2/3 | 68 | `constitutionalMajority` |
| 4/5 | 81 | `fourFifths` |

### Also in the data

101 MPs across 13 electoral districts · 11 standing and 4 select committees ·
6 faction chairs and 8 deputy chairs · 38 members of the Estonia–USA
Parliamentary Friendship Group.

---

## Install (Add to Home Screen)

**iPhone / iPad (Safari):** open the [live site](https://igorljapin.github.io/riigikogu-mobile/) → **Share** → **Add to Home Screen** → **Add**.

**Android (Chrome):** open the [live site](https://igorljapin.github.io/riigikogu-mobile/) → **⋮** menu → **Install app** / **Add to Home screen** → **Add**.

Installed, it opens full-screen, launches instantly, and keeps working offline
after the first load.

---

## How it is built

Plain HTML, plain CSS and native ES modules. **No framework, no bundler, no
build step** — the source in this repository is exactly what GitHub Pages
serves.

```
index.html            shell: <div id=app> and one <script type=module>
styles.css            the whole stylesheet
src/
  app.js              tab router + mount
  data.js             fetches data/*.json at runtime
  dom.js              three DOM helpers
  lib/                pure, unit-tested logic — calculator.js, factions.js
  views/              parliament.js · mps.js · calculator.js · board.js
data/                  parties · mps · alignment · board · meta · catalogues
service-worker.js     precache + offline
manifest.json  offline.html  icons/
scripts/              build_data.py · validate_data.py · fetch_mp_data.py · …
tests/                unit · tier1 · tier2 · pwa · python
```

The layering is deliberate and load-bearing:

| Layer | Files | Rule |
|---|---|---|
| Data | `data/*.json` | Single source of truth, fetched at runtime. A data change touches these and nothing else. |
| Logic | `src/lib/*.js` | Pure functions, no DOM, no I/O. |
| View | `src/views/*.js`, `styles.css` | The only layer a redesign touches — and it must keep every `data-testid`. |
| Contract | `USABILITY.md`, `tests/` | Every promise the app makes, with an executable proof. |

An earlier redesign of this app had to be reverted because design, data and
logic were fused into one minified bundle and nothing could say what had broken.
`USABILITY.md` is the answer to that: a documented `data-testid` contract plus a
suite that runs on every PR, so a redesign is free to rewrite the views and the
stylesheet and still be provably safe.

### Running it locally

```bash
npm ci
npm run serve        # http://localhost:8099
npm test             # 64 unit + 23 resolver + 54 Playwright tests
```

---

## Where the data comes from

`.github/workflows/monthly-mp-check.yml` runs on the 1st of each month against
the [Riigikogu Open Data API](https://api.riigikogu.ee/), validates the result,
runs the test suites, and opens a pull request with the diff classified — roster
changes, board changes, committee moves, and, when someone leaves a
parliamentary group, an explicit **action required** item. Roughly 95% of the
app's data maintains itself; the one thing no API can tell you is which party a
defector joined, and that is the only recurring human decision.

`data/alignment.json` is the single hand-maintained file. See
[`data/README.md`](data/README.md) for the schemas and
[`CLAUDE.md`](CLAUDE.md) for the working rules.

**Sources:** [Riigikogu](https://www.riigikogu.ee/) ·
[Riigikogu Open Data API](https://api.riigikogu.ee/) (voting data CC BY-SA 3.0).

---

## License

MIT — free to use and modify.

## Author

**Igor Ljapin** — [@igorljapin](https://github.com/igorljapin)
