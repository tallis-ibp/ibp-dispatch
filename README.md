# Crew Scheduler Automation Starter

This folder is a starter kit for building the scheduling automation in Claude Code.

It combines two data sources:

1. The Google Sheet weekly crew schedule.
2. Job and logistics data that Claude Code pulls from monday.com through the monday connector.

The scripts here do not write to monday.com or the Google Sheet. They read/export data locally, analyze it, and produce a review report.

## What This Does First

- Reads weekly schedule tabs from the shared Google Sheet.
- Converts the visual schedule into structured crew-day records.
- Treats blank cells as "needs diagnosis" rather than true availability.
- Uses known crew rules for Santiago, Penna, Waype, Ludwing/Tarcizio, Mario/Wilcher, Felipe, and Others.
- Looks for missing monday.com job records, material readiness problems, vague `OTHERS` assignments, and helper/logistics risks.

## Quick Start

From this folder:

```bash
npm run fetch:schedule
npm run analyze
```

If `npm` is not available but `node` is, run:

```bash
node src/fetchSchedule.mjs
node src/analyzeSchedule.mjs
```

The main output is:

```text
reports/weekly-schedule-analysis.md
```

## Claude Code Workflow

1. Open Claude Code in this folder.
2. Make sure the monday.com connector is enabled.
3. Ask Claude Code to read `CLAUDE.md`.
4. Use the prompt in `prompts/02-extract-monday-jobs.md` to create `data/monday-jobs.json`.
5. Run:

```bash
npm run refresh
```

6. Review `reports/weekly-schedule-analysis.md`.

## Important Rule

Do not let Claude update monday.com or the live Google Sheet until the read-only report is useful and you approve the proposed changes.

## Official Connector Notes

- Claude Code connects to external tools through MCP connectors: https://code.claude.com/docs/en/mcp
- monday.com has an official Claude connector and supports board search, updates, timelines, assignments, and progress insights: https://claude.com/connectors/monday
- monday.com setup notes say the monday MCP app must be installed and authorized with OAuth: https://support.monday.com/hc/en-us/articles/28515704603666-Connect-monday-MCP-with-Claude
