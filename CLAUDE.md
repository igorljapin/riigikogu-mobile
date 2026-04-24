# Riigikogu Mobile Dashboard - Claude Code Instructions

## Repository Purpose
Mobile PWA dashboard for the XV Riigikogu (101 MPs).
Hosted at https://igorljapin.github.io/riigikogu-mobile/

## File Map
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

## Monthly Update Procedure

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

## Critical Rules
- Never change UI layout, CSS, or PWA configuration
- Never modify the service worker or manifest.json
- Never commit directly to main - always use a feature branch
- Mobile layout is optimized for small screens - do not alter spacing
