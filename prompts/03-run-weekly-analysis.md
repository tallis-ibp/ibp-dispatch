# Prompt: Run Weekly Analysis

Use this once the monday.com extraction is working.

```text
Refresh the Google Sheet schedule and monday.com job data, then produce a weekly dispatch risk report.

Steps:
1. Run npm run fetch:schedule.
2. Use the monday.com connector to refresh data/monday-jobs.json.
3. Run npm run analyze.
4. Read reports/weekly-schedule-analysis.md.

Report back:
- What is scheduled this week.
- Which jobs are missing monday.com matches.
- Which assignments are blocked by material/logistics.
- Which blank crews may be available but need confirmation.
- Which assignments are risky based on crew fit, crew size, or reliability.
- The top scheduling decisions Lucas needs to make.

Do not update monday.com or the Google Sheet unless I explicitly approve the exact changes.
```
