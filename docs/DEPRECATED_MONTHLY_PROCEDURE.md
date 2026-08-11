# DEPRECATED — the original monthly update procedure

> **Do not follow this.** It is preserved verbatim from `CLAUDE.md` as it stood
> before Phase 0 of `ARCHITECTURE_PLAN.md`, purely as a historical record of what
> the repository used to claim about itself.
>
> Every numbered step below is unexecutable. Three of the four files it names do
> not exist (`mp-data-scraped.json`, `data/change_report.json`,
> `data/mp_data_fetched.json`), `index.html` is a minified build artifact whose
> "hardcoded JavaScript objects" cannot be hand-edited, and at the time it was
> written the `main` branch it targets did not exist either.
>
> The replacement lives in `ARCHITECTURE_PLAN.md` Phase 5: an automated job that
> updates `data/*.json` — which the rebuilt app actually reads — and opens a
> reviewed PR.

---

## File Map (as originally claimed)

- `index.html` - All MP data is hardcoded as JavaScript objects.
  This is the primary file requiring edits when composition changes.
- `mp-data-scraped.json` - Photo and profile link lookup used by
  the MP popup window. Keep in sync with mp_data_current.json.
- `data/mp_data_current.json` - Committed baseline used for
  monthly diff comparison.
- `data/mp_data_fetched.json` - Temporary file created by workflow.
  Never commit this directly to main.
- `data/change_report.json` - Output of comparison script.
  Always read this first before making any changes.

## Monthly Update Procedure (as originally written)

1. READ data/change_report.json fully before touching any file.

2. For PARTY SWITCHES (politically significant - flag in PR):
   - Find MP by name in index.html
   - Update their party/faction field
   - Update coalition/opposition totals in the dashboard header
   - Update mp-data-scraped.json and data/mp_data_current.json

3. For NEW MEMBERS:
   - Add MP to index.html with correct party assignment
   - Add entry to mp-data-scraped.json with photoUrl and profileUrl
   - Update data/mp_data_current.json
   - Note in PR that seating position needs verification

4. For REMOVED MEMBERS:
   - Remove from index.html active roster
   - Remove from mp-data-scraped.json
   - Update data/mp_data_current.json

5. For PHOTO CHANGES only:
   - Update photoUrl in mp-data-scraped.json only
   - Update data/mp_data_current.json
   - No changes to index.html needed

6. VALIDATION before committing:
   - Total MP count must equal 101
   - All bracket pairs must match
   - Test that PWA service worker cache list still references correct files

7. CREATE pull request:
   - Title: "MP Data Update - [Month YYYY]"
   - Flag party switches for human review before merge
   - Target branch: main
