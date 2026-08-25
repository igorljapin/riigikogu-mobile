# `assets/` — the binary files the app ships

Everything in here is **build output**, the same rule the `icons/` PNGs follow:
a generator writes it, nobody hand-edits it, and a test asserts that what is on
disk is what the rest of the repository says is on disk.

## `mps/` — the 101 member portraits

| | |
|---|---|
| Written by | `scripts/fetch_mp_photos.mjs` |
| Source | `https://api.riigikogu.ee/api/plenary-members?lang=EN`, each member's `photo._links.download.href` |
| Format | WebP, 270×270, quality 80 — about 6 KB each, ~600 KB in total |
| Named by | the **member's** uuid, which is stable, and never the file record's, which is not |
| Provenance | `mps/manifest.json` records the source URL and the sha256 of the source bytes each file was encoded from |
| Checked by | `tests/unit/photos.test.mjs`, and `node scripts/fetch_mp_photos.mjs --check` |

270px is not arbitrary: the largest avatar either surface paints is 128 CSS
pixels (the desktop profile), so 270 covers a 2× display without upscaling, and
it is also what the API serves — nothing is invented by resizing up.

### Why these are committed rather than hotlinked

Both surfaces used to point `<img src>` straight at
`api.riigikogu.ee/api/files/<file-uuid>/download`, the URL the API hands out.
That URL identifies a *file record*, not a member, and the CMS mints a new one
whenever a portrait is re-published. On 2026-08-25, 66 of the 101 URLs committed
on 2026-08-12 answered `404 File not found` — two thirds of the roster fell back
to initials, on both surfaces, for everyone. No refresh schedule outruns that:
the rot started within days of the build.

Two further faults sat behind the same `src`. The origin rate-limits per IP and
answers `429` to a burst — four parallel requests draw one — while a roster
paints a hundred images at once; and it sends no `Cache-Control`, `ETag` or
`Last-Modified` on the images it does serve, so every visit re-ran the burst.
Being cross-origin, none of it was visible to `service-worker.js`, which is why
photos never worked offline.

Committing them answers all four at once, for ~600 KB.

### Copyright

These are the official portraits the Riigikogu publishes through its own API for
each sitting member, reproduced here to show that member in a dashboard about
the Riigikogu. The app displayed exactly these images before this directory
existed; what changed is which server they are served from. If the parliament
asks for them to be served from theirs, `photoUrl` in `data/mps.json` still
records where each one came from, and reverting is a change to one resolver
(`photoSrc` in `src/data.js`) — but read `scripts/fetch_mp_photos.mjs`'s header
first, because that is the arrangement that was already broken.

### Refreshing them

```bash
node scripts/fetch_mp_photos.mjs          # fetch, encode, prune, update the precache list
node scripts/fetch_mp_photos.mjs --check  # verify what is committed, download nothing
```

The monthly job runs the first form itself. A run that changes the *set* of
portraits — a member arriving or leaving — also changes the precache list, and
then `CACHE_NAME` in `service-worker.js` needs a bump so returning visitors are
not served the old cache; the script says so when it happens, and so does the
job's step summary.
