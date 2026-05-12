# Prompt: Extract Monday Jobs

Use this prompt after Claude Code can see monday.com boards.

```text
Use the monday.com connector to read the active/upcoming job and logistics boards.

Create data/monday-jobs.json matching schemas/monday-job.schema.json.

Rules:
- Read-only: do not update monday.com.
- Include only active, upcoming, scheduled, or recently scheduled jobs that may affect the crew schedule.
- Extract jobNumber without the leading #.
- If a column is missing, leave the field blank, null, false, or [] as appropriate.
- Summarize useful item updates into notes.
- If board or column meaning is ambiguous, ask me before guessing.

After writing data/monday-jobs.json, run:
npm run analyze

Then summarize reports/weekly-schedule-analysis.md in dispatch language.
```
