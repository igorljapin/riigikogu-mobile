# `snapshot/` — what the app looked like, before and after

| Directory | What it holds |
|---|---|
| `snapshot/*.png` | **Phase 0**, 2026-08-11. The shipped minified bundle, captured before any rebuild work. The reference `BEHAVIOR_SNAPSHOT.md` describes. |
| `snapshot/phase4/*.png` | **Phase 4**, 2026-08-12. The same nineteen states, driven through the rebuilt app at the same viewport (390 × 844, DPR 2). |
| `snapshot/compare/*.png` | The two side by side, labelled — the images the Phase-4 PR is reviewed from. |

Filenames match across all three directories, so `01-tab-parliament.png` is the
same state in each. A few names carry numbers that the rebuild legitimately
changes (`11-calc-s1-coalition-52` now reads 50, `13-calc-s3-77-of-101` now
reads 75); the names are kept so the pairs line up, and every changed figure is
listed in the Phase-4 PR.

Regenerate the last two directories with:

```bash
python3 -m http.server 8099 &
node scripts/capture_screens.mjs
```
