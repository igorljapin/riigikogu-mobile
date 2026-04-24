#!/usr/bin/env python3
import json, os

r = json.load(open("data/change_report.json"))
month_year = os.environ.get("MONTH_YEAR", "Unknown Month")

lines = [f"## Riigikogu MP Changes Detected - {month_year}", ""]

if r["new_members"]:
    lines.append("### New Members")
    for m in r["new_members"]:
        lines.append(f"- {m['name']} ({m.get('faction', '?')})")
    lines.append("")

if r["removed_members"]:
    lines.append("### Removed Members")
    for m in r["removed_members"]:
        lines.append(f"- {m['name']}")
    lines.append("")

if r["party_switches"]:
    lines.append("### Party Switches - review carefully before merging")
    for s in r["party_switches"]:
        lines.append(f"- {s['name']}: {s['from']} to {s['to']}")
    lines.append("")

lines.append("## Next Step")
lines.append("Open Claude Code on the web, select this branch, and run the update task per CLAUDE.md.")

print("\n".join(lines))
