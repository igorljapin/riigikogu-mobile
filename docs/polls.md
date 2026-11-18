# Polls source and operations

Norstat Eesti AS conducts the survey for MTÜ Ühiskonnauuringute Instituut.
[Reitingud.ee](https://reitingud.ee/reitingud/) publishes the methodology and
national weekly and four-week results. Its public front end uses a
[compact JSON feed](https://kiir.kusitlus.com/_datasets_public/rk-ratings/ratings-compact.json).
The supplied November 18, 2026 capture records gzip, ETag and Last-Modified.
The handoff identifies the [publisher decoder inspected as text](https://rk.kusitlus.com/_app/immutable/chunks/zL1TjGn9.js).
The feed is an implementation detail of the public website. Confirm permission
to redistribute the normalized historical series and any attribution conditions
with the publisher before merging or publishing. Public access alone establishes
neither a redistribution license nor an API contract.

## Data and display

The importer supports compact v3 and validates the national references in
`r`, the `w1` and `w4` axes in `a`, category indexes into `p`, the ordered
sample labels in `s`, and the five fields and row lengths in each block
`b`. It checks demographic references and dimensions at the source boundary.
Only the two national blocks enter the app. For dates, explicit source periods
take precedence. A legacy weekly row without a start uses the previous weekly
end plus one day, or its own end for the first row. A legacy four-week row uses
the first component's resolved weekly start. The normalized output records
whether a start was inferred.

`data/poll-parties.json` is the curated contract for IDs, display names, aliases,
colors and grouping. The ranked named categories are Centre, Isamaa, SDE, EKRE,
Reform, Eesti 200, Parempoolsed and Greens. Other sums each of these source
categories once:

- Eesti Vabaduspartei - Põllumeeste kogu
- Eestimaa Ühendatud Vasakpartei
- Muu erakond
- Elurikkuse erakond
- Eesti Vabaerakond
- Eesti Iseseisvuspartei
- Üksikkandidaadi poolt
- Mihhail Stalnuhhin
- Eesti Rahvuslased ja Konservatiivid (ERK)
- Erakond KOOS
- Vabaerakond Aru Pähe
- Eesti Rahvusliberaalid - Vabaerakond

Other is unavailable when any component is missing. An unknown category or a
missing expected category blocks a proposal pending review. Party aliases use
Unicode NFC, collapsed whitespace and case folding before exact lookup. Party
metadata is embedded in the same served snapshot as observations so both
surfaces render a consistent version.

Normalized schema 1 stores scaled integer percentage values (divide by `scale`),
`null` for missing values, source `Mittevalija` separately, and sample counts
`total`, `voters`, `effectiveTotal` and `effectiveVoters`. The app displays the
first two counts and uses the publisher's `voters` distribution. The four-week
series comes from the publisher's aggregate block. Totals can deviate by up to
half one source precision unit per available category. A partial historical
wave can be below the lower bound. The latest wave needs every expected
category, including explicit zeroes, and values are never renormalized.

`source.sha256` hashes the decompressed response bytes. `source.retrievedAt`
records the acquisition time. HTTP validators are for conditional requests.
`published` belongs to an individual observation and is populated only after
separate verification. The importer carries forward verified publication dates
when the wave and fieldwork match. The date shown on the page is the publication
date when known, otherwise the source snapshot retrieval date.

### Seed cross-check

The November 18 handoff supplied 395 weekly and 392 four-week waves. Both archive
hashes, gzip round-trip and both independently decoded latest observations
matched. For the 19 October–15 November aggregate the decoded table reads Centre
25.3%, Isamaa 21.9%, SDE 17.5%, EKRE 12.6%, Reform 12.3%, Parempoolsed 5.8%,
Eesti 200 1.0%, Greens 0.8% and Other 2.8%. Weekly wave 395 covers 9–15 November.

The [November 18 Reitingud.ee release](https://reitingud.ee/uudised/keskerakond-juhib-reitingutabelit-isamaa-edestab-kindlalt-sotsiaaldemokraate/)
matches all nine displayed rows in both the latest and previous columns. Its
fieldwork and total sample of 4,000 match the aggregate. The release's Other
values are 2.8% and 2.7% respectively, compared with 0.3% and 0.2% for the single
`Muu erakond` category. The [November 11 Reitingud.ee release](https://reitingud.ee/uudised/keskerakond-kasvatas-edu-isamaa-ees/)
also matches all nine rows in the previous aggregate (12 October–8 November).

## Refresh and offline behavior

Polls loads the app's own `data/polls.json` when opened or retried. The loader
times out after five seconds and only saves a structurally valid, non-rollback
snapshot. The shared service worker precaches the interface and leaves requests
for polling JSON to its network-first loader. Both apps reuse the same saved
snapshot. If the network or response fails, the app labels the saved copy.
First-time offline use displays a message and retry. The fieldwork end determines
the overdue notice after 14 days (`OVERDUE_DAYS` in `src/lib/polls.js`).
A new check leaves the original retrieval time on unchanged published content.

## Update and review

The **Weekly polling data** workflow checks Wednesday and Thursday at 12:17 UTC.
Thursday repeats the same validation so it can catch later releases or
corrections. After the implementation is merged, choose the workflow's **Run
workflow** button on `main`. The default **dry_run** validates and tests with
read-only permissions. Clear it when a validated change should open or update
the `automation/polls-data` PR. Both scheduled checks propose reviewed data PRs
when results change. The weekly workflow never writes to `main`.

A no-write local rehearsal using capture files:

```sh
stage=$(mktemp -d)
python3 scripts/fetch_polls.py --baseline data/polls.json \
  --input /path/to/ratings-compact.json \
  --capture-metadata /path/to/response-metadata.json \
  --output "$stage/polls.json" --report "$stage/report.json"
python3 scripts/polls_update_summary.py "$stage/report.json"
npm test
```

Omit both capture flags to exercise live GET and conditional requests. Live
access from the workspace returned a proxy 403. The GitHub-hosted runner's
reachability and the scheduled trigger remain unverified. If GitHub cannot
reach the feed, use an authorized capture and submit the locally validated
file through a human-reviewed PR.

Check the run summary and source release before reviewing the data diff. Verify
fieldwork, sample counts, totals and scope. Look at listed historical
corrections and flags for new-wave movements of at least 10 pp weekly or 5 pp
in the aggregate. Check the provider for explanations of large movements.
For corrections, inspect changed dates, samples and values with the original
release. If the source withdraws an unmerged update, close the stale data PR
after checking the current release. An unchanged normalized feed creates no
timestamp-only update. Missing releases leave the published snapshot in place.
A validation failure stops the workflow and gives the reason in its summary.

For a schema change or unfamiliar category, compare with the publisher's
decoder as text, update the mapping or adapter in a separate reviewed PR, keep
all historical observations or document the source correction, and rerun both
the local import and full suite. To stop checks, disable **Weekly polling
data** in Actions. To roll back a released dataset, submit a reviewed revert.
A deliberate rollback requires a polling cache generation change in both
`src/polls-data.js` and `service-worker.js` and a worker version bump so installed
clients accept the older curated snapshot. Verify both installed apps after
rollout.

GitHub currently puts `GITHUB_TOKEN`-initiated PR workflows in an
approval-required state. The updater runs the full suite before it proposes
anything. A reviewer with write access must approve pending **Usability
Contract** workflows from the PR, and review the data before a human merge.
Confirm the Actions permission **Allow GitHub Actions to create and approve
pull requests** if the bot receives a 403. The existing Pages source is
`main` at the repository root and a human merge retains that publishing path.
A bot token push alone does not trigger a Pages build. Revisit automation
only after several successful reviewed cycles. Historical corrections, schema
or mapping changes, rollbacks and flagged movements should continue through
human review. [GitHub token behavior](https://docs.github.com/en/actions/concepts/security/github_token) · [Pages publishing](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).
