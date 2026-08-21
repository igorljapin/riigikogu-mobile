# Desktop Redesign & Merge Plan — riigikogu-desktop → riigikogu-mobile

> **Status: PLANNED — not yet executed.** This document is the single source of
> truth for the project. Every session listed below starts by reading it and
> executes exactly one phase. Update the phase table as phases land.
>
> Written 2026-08-19, after auditing both repositories and the mobile
> redesign history (mobile PRs #30–#36).

## Goal

1. Redesign the desktop interface with **Claude Design**, matching the design
   language the mobile app adopted in its Aug-2026 redesign.
2. Merge the desktop app into `riigikogu-mobile` as a second **view layer**
   over the same DATA and LOGIC layers, ending the dual maintenance of MP data.
3. Retire this repository (`riigikogu-desktop`) behind a redirect.

## The one strategic decision this plan encodes

**The desktop redesign is *designed* first but *implemented only once — inside
the merged repository*.** The current desktop app is a minified Parcel/React
bundle with no source code in the repo; implementing the new design against it
would be throwaway work, redone from scratch after the merge. So:

- Phase 1 produces the approved desktop **design** (Claude Design canvas) —
  before any merge work, as intended.
- Phases 3–4 implement that design **directly as the desktop view layer in
  `riigikogu-mobile`**, so the redesign is built exactly once.

This honours "redesign first, then merge" while avoiding paying for the
implementation twice.

## Why merge at all (established 2026-08-19)

The two repos already disagree about reality: mobile (data of 2026-08-12)
correctly shows a **minority coalition of 50** after the Stoicescu
(2026-08-09) and Kiili (2026-08-10) defections; desktop (last data update
2026-08-01) still lists Stoicescu under Eesti 200 and shows a majority that no
longer exists. One data pipeline ends this class of failure permanently. The
mobile repo's four-layer architecture (DATA `data/*.json` → LOGIC `src/lib` →
VIEW `src/views` + CSS → CONTRACT `USABILITY.md` + `tests/`) was built to take
additional views.

## Phase table

| Phase | What | Repo | Session model / effort | Status |
|---|---|---|---|---|
| 0 | Desktop baseline snapshot + data extraction | riigikogu-desktop | Sonnet 5 / high | ☐ |
| 1 | Claude Design canvas for the desktop UI | (design canvas) | Opus 5 / high | ☐ |
| 2 | Handoff + Usability Contract amendment | riigikogu-mobile | Sonnet 5 / medium | ☐ |
| 3 | Desktop view layer implementation (2–3 PRs) | riigikogu-mobile | Opus 5 / xhigh (or high) | ☐ |
| 4 | Cutover: deploy, verify, redirect, retire | both | Sonnet 5 / medium | ☐ |

Rationale for the model choices is at the end of this document.

---

## Phase 0 — Desktop baseline snapshot + data extraction

**Repo:** `riigikogu-desktop` (this one). **Model:** Sonnet 5, effort high.
One session, one PR.

Mirrors mobile's Phase 0 (`BEHAVIOR_SNAPSHOT.md`): before anything changes,
record what the desktop app does today and mine the bundle for the one piece
of data only it has.

1. **Screenshot the deployed app** (https://igorljapin.github.io/riigikogu-desktop/)
   with Playwright at 1920×1080: every view/tab, the MP popup, the calculator
   with a selection active, hover states where capturable. Commit under
   `snapshot/` with a `BEHAVIOR_SNAPSHOT.md` inventory of every feature and
   interaction (this becomes the parity checklist for Phase 3).
2. **Extract the seating-grid data** from the minified bundle in `index.html`:
   for each of the 101 MPs, their seat/row/position values. Join each MP to
   their riigikogu.ee uuid via the profile URLs (also present in
   `mp-data-scraped.json`). Emit a draft **`data/seating.json` keyed by uuid**
   — this is the only desktop data that does not exist in mobile's `data/`.
   Party/faction values in the bundle are stale (pre-2026-08-09); ignore them —
   only seat positions are being harvested.
3. **Inventory desktop-only features** in `BEHAVIOR_SNAPSHOT.md`: the seating
   grid itself, popup contents, header totals, anything the mobile app has no
   equivalent for.

**Exit:** PR into this repo containing `snapshot/`, `BEHAVIOR_SNAPSHOT.md`,
`data/seating.json` (draft). No app changes.

**Kickoff prompt (start a session on riigikogu-desktop):**

```
Read DESIGN_AND_MERGE_PLAN.md and execute Phase 0 exactly as written.
Scope: this repo plus the deployed site; change no app behavior.
Deliverable: one PR with snapshot/ screenshots at 1920x1080,
BEHAVIOR_SNAPSHOT.md, and a draft data/seating.json keyed by MP uuid.
Constraints: NEVER edit index.html; treat the bundle's party data as stale
and harvest only seat positions. Record every assumption you make about
ambiguous seat data in BEHAVIOR_SNAPSHOT.md under "Assumptions".
```

---

## Phase 1 — Claude Design canvas for the desktop UI

**Surface:** Claude Design (as used for the mobile redesign). **Model:**
Opus 5, effort high.

1. Seed a canvas with desktop artboards at **1920×1080**: Parliament view
   (seating grid + composition + Board), MP directory, Calculator, plus the
   shared header/navigation.
2. **Feed the session the mobile design language so desktop matches it**:
   - the token block at the top of mobile `styles.css` (colors, type scale,
     radii, spacing, light + dark) and `USABILITY.md` §9 (the redesign record);
   - screenshots of the live mobile app;
   - Phase 0's desktop screenshots (what exists today).
3. Hard constraints to state in the seed prompt: reuse mobile's tokens — the
   desktop design is the same language at desktop density, not a new one;
   party colours stay data-driven (`--party-<id>` from `parties.json`), never
   hardcoded in mockups as if they were theme colours; both light and dark.
4. **Iterate in the canvas editor by hand** (click-to-select, properties
   panel) — manual edits cost nothing. Re-prompt Claude only for structural
   re-seeds, not pixel nudges.
5. Keep the approved artboards + exported screenshots for Phase 2.

**Exit:** you have approved every artboard.

**Kickoff prompt (Claude Design session):**

```
Design the desktop version of my Riigikogu dashboard, matching the design
system of the mobile app exactly. Artboards at 1920x1080: (1) Parliament —
seating grid of 101 MPs + coalition/opposition/unaligned composition + Board;
(2) MP directory with search/filters; (3) Coalition calculator with the four
constitutional thresholds. Attached: the mobile app's design tokens
(styles.css excerpt), mobile screenshots, and screenshots of the current
desktop app for feature reference. MUST reuse the mobile tokens (colors,
type, radii, spacing) at desktop density; MUST design light and dark; party
colours are data-driven — treat them as content, not theme. Do not invent a
new visual language.
```

---

## Phase 2 — Handoff + Usability Contract amendment

**Repo:** `riigikogu-mobile`. **Model:** Sonnet 5, effort medium. One small PR
— this is the desktop analogue of mobile PR #30/#31.

1. Commit a handoff at `docs/desktop-2026/`: the approved mockup screenshots,
   a copy of this plan, the Phase 0 `data/seating.json` draft and
   `BEHAVIOR_SNAPSHOT.md`. (Like the mobile redesign handoff, this directory
   is deleted in post-ship housekeeping; git history keeps it.)
2. Amend `USABILITY.md`: a new desktop section — the promises the desktop
   surface makes, its `data-testid` table, and which existing promises apply
   to both surfaces. Contract first, implementation after — the order that
   worked for the mobile redesign.

**Exit:** handoff + amended contract merged to mobile `main`.

**Kickoff prompt (session on riigikogu-mobile):**

```
Read docs/desktop-2026/DESIGN_AND_MERGE_PLAN.md (attached in my first
message if the directory does not exist yet) and execute Phase 2. Commit the
attached mockups and handoff files under docs/desktop-2026/, then amend
USABILITY.md with the desktop surface's promises and data-testid table,
mirroring how the Aug-2026 redesign amended it (see PR #30). One PR. Do not
touch src/, styles.css, data/, or service-worker.js.
```

---

## Phase 3 — Desktop view layer implementation

**Repo:** `riigikogu-mobile`. **Model:** Opus 5, effort **xhigh** if the
session picker offers it, otherwise high. The only genuinely hard phase —
budget 2–3 PRs, each its own session if the previous one grew long.

**PR A — data + scaffold.** `data/seating.json` (from the handoff) with
validation rules in `scripts/validate_data.py` and a "who writes what" entry
in `data/README.md`; a desktop entry point (`desktop/index.html` shell in the
mobile-repo style: a div + one module script); `src/views-desktop/` skeleton
wired to the existing `src/data.js` loader and `src/lib/*` logic; tier-1
desktop test skeleton against the contract testids. Ugly but functional.

**PR B — the design.** Implement the approved artboards: `desktop.css` built
on the same tokens as `styles.css`, full `src/views-desktop/` (parliament +
seating grid, MP directory, calculator). Reuses `src/lib/calculator.js` and
`src/lib/factions.js` untouched. Every testid from the amended contract
present; parity check against `BEHAVIOR_SNAPSHOT.md`; `npm test` green.

**PR C — PWA + pipeline.** Desktop manifest (scope
`/riigikogu-mobile/desktop/`, nested inside the mobile scope — verify install
behaviour in Chrome and Edge); service-worker precache additions +
`CACHE_NAME` bump + offline spec; monthly workflow: a roster change now also
flags "needs a seat assignment in `data/seating.json`" in the PR body.

Rules that already govern this repo and bind every PR here: never commit to
`main`; `npm test` green before merge; a data change touches `data/*.json`
only; touching the service worker means bumping `CACHE_NAME`. Run
`/code-review medium` in-session on each PR before marking it ready.

**Exit:** desktop app live at `igorljapin.github.io/riigikogu-mobile/desktop/`,
suite green, reading the same `data/*.json` as mobile.

**Kickoff prompt (session on riigikogu-mobile, one per PR):**

```
Read docs/desktop-2026/DESIGN_AND_MERGE_PLAN.md and execute Phase 3, PR A
[/ B / C] exactly as scoped there. Follow CLAUDE.md's critical rules; the
amended USABILITY.md desktop section is the contract — every testid it
names must exist and be tested. Reuse src/lib and src/data.js untouched;
desktop views live in src/views-desktop/ and desktop.css only. npm test
must be green before you open the PR. Surface anything the mockups leave
ambiguous as a PR-body question rather than inventing behavior.
```

---

## Phase 4 — Cutover and retirement of riigikogu-desktop

**Repos:** both. **Model:** Sonnet 5, effort medium. One session.

1. Verify the deployed desktop app on Pages against `BEHAVIOR_SNAPSHOT.md`;
   test PWA install of **both** scopes in Chrome and Edge.
2. In `riigikogu-desktop`: replace the app with a redirect stub —
   `index.html` with meta-refresh + canonical link to the new URL, and a
   **self-destructing service worker** (same filename as the current one;
   `registration.unregister()` + delete all caches) so installed PWAs and
   cached visitors actually receive the redirect instead of the stale bundle
   forever. Delete the monthly workflow, data files, and scripts; rewrite
   README and CLAUDE.md as pointers to the new home. This kills the stale
   pre-2026-08-09 majority numbers the old app still shows.
3. In `riigikogu-mobile`: update README/CLAUDE.md file maps with the desktop
   rows; delete `docs/desktop-2026/` (housekeeping, as after the mobile
   redesign).
4. Owner actions (cannot be done from a session): archive `riigikogu-desktop`
   in GitHub settings once the redirect has been live for a while.
5. **Do not rename `riigikogu-mobile`** to something neutral like `riigikogu`
   — it would break the mobile URL and every installed mobile PWA. The repo
   name is cosmetic; the URLs are not.

**Kickoff prompt (session on riigikogu-desktop, with mobile attached):**

```
Read DESIGN_AND_MERGE_PLAN.md and execute Phase 4. The merged desktop app
is live at https://igorljapin.github.io/riigikogu-mobile/desktop/ — verify
it against BEHAVIOR_SNAPSHOT.md first and stop if anything is missing.
Then convert this repo to a redirect stub exactly as the plan describes,
including the self-destructing service worker (keep its current filename).
One PR here, one small docs PR to riigikogu-mobile.
```

---

## Model & effort strategy (and why)

You are on a subscription, so "cost" means **rate-limit burn**, not dollars —
but the ordering of models by burn matches their API pricing: Haiku 4.5 (1x)
< Sonnet 5 (~3x) < Opus 5 (~5x) < Fable 5 (~10x), with output weighted ~5x
input.

- **Sonnet 5 is the default** (Phases 0, 2, 4). Snapshotting, data
  extraction, doc PRs, and the redirect stub are well-specified, mechanical
  work — exactly what the "start with Sonnet 5, escalate only on demonstrated
  shortfall" rule is for.
- **Opus 5 where judgment is the product**: Phase 1 (visual design quality of
  the canvas seed — this is also what produced the mobile redesign) and
  Phase 3 (long-horizon agentic coding across contract, views, PWA, and
  pipeline — the step-change area for Opus 5).
- **Fable 5: not needed anywhere in this plan.** It's the escalation past
  Opus for tasks where Opus has demonstrably fallen short; nothing here
  qualifies. Using it by default is the single most expensive habit to drop.
- **Haiku 4.5: skip.** Nothing here is high-volume enough to benefit, and its
  failure on a subtle step (e.g. the seat-data join) costs a redo session.
- **Effort:** high is the right default; **xhigh only for Phase 3**
  (agentic coding is what xhigh exists for); medium for Phases 2 and 4 where
  the plan already contains the decisions. Don't use max — it buys
  overthinking here, not correctness.

## Token-efficiency rules for every session

1. **One phase = one fresh session.** Never carry a 100k-token session into
   the next phase; the plan file is the context carrier, not the chat.
2. **Every kickoff prompt points at this file** instead of restating context.
3. **Design iteration happens in the canvas editor, by hand.** Re-prompting
   Claude to nudge pixels is the most expensive way to move a rectangle.
4. **The redesign is implemented once**, in the merged repo (see the
   strategic decision above) — the largest single saving in this plan.
5. **Reviews run in-session** (`/code-review medium`) rather than as separate
   full-context sessions.
6. If a Phase 3 PR sprawls, stop and split rather than pushing a long session
   further — a fresh session reading the plan + the diff is cheaper than a
   bloated one re-reading its own history.
