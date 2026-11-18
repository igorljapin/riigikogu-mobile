"""Format an importer report for the run summary and data pull request."""
import json
import sys
from pathlib import Path


def main():
    report_path = Path(sys.argv[1])
    if not report_path.exists():
        print("### Polling data update\n\nThe importer did not produce a report. See the failed step log.")
        return
    report = json.loads(report_path.read_text())
    print("### Polling data update\n")
    print(f"- Status: {report['status']}")
    print(f"- Validation: {'failed' if 'error' in report else 'passed'}")
    print(f"- Results changed: {('yes' if report['changed'] else 'no') if 'changed' in report else 'unknown'}")
    for series, wave in report.get("latest", {}).items():
        print(f"- {series}: {wave['start']} to {wave['end']} (wave {wave['id']})")
    for key, label in (("corrections", "Historical corrections"), ("reviewFlags", "Review flags")):
        entries = report.get(key, [])
        print(f"- {label}: {len(entries)}")
        for entry in entries[:30]:
            print(f"  - {entry}")
        if len(entries) > 30:
            print("  - See the validation report artifact for the full list.")
    if "error" in report:
        # Keep provider-controlled errors inert in Markdown.
        error = report["error"].replace("\n", " ").replace("`", "'").replace("<", "&lt;")
        print(f"- Failure reason: `{error}`")


if __name__ == "__main__":
    main()
