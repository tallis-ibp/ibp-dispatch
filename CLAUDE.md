# Claude Code Instructions

You are helping build a scheduling and logistics assistant for a paver/pool-deck construction operation.

Your first job is read-only analysis. Do not update monday.com, the Google Sheet, or any production system unless Lucas explicitly asks you to do so.

## Operating Model

Read these files before making changes:

- `docs/operating-model.md`
- `docs/monday-data-map.md`
- `docs/questions-for-scheduling-team.md`
- `docs/whatsapp-dispatch-patterns.md` — real-world dispatch patterns from Noel driver WhatsApp (Feb–Apr 2026)

## Local Commands

Use these commands from this folder:

```bash
npm run fetch:schedule
npm run analyze
npm run refresh
```

If `npm` is not available but `node` is, use:

```bash
node src/fetchSchedule.mjs
node src/analyzeSchedule.mjs
```

`npm run fetch:schedule` reads the Google Sheet and writes `data/schedule-records.json`.

`npm run analyze` reads `data/schedule-records.json` plus `data/monday-jobs.json` if it exists, then writes `reports/weekly-schedule-analysis.md`.

## Monday Connector Workflow

Use the monday.com connector to identify the boards that contain:

- active jobs
- job scope
- job addresses
- customer/client type
- promised dates
- material readiness
- logistics readiness
- equipment/trailer/driver needs
- warehouse or Wilson support

Export the relevant active items into `data/monday-jobs.json` using the schema in `schemas/monday-job.schema.json`.

If the Monday board structure is ambiguous, ask Lucas which board is the source of truth.

## Scheduling Rules

- A blank schedule cell means "unknown/open to diagnose," not automatically available.
- A filled day cell means that crew is planned for that project/job/task that day.
- The sheet is split visually: Monday-Wednesday use the left crew-name column; Thursday-Sunday use the repeated middle crew-name column.
- `OTHERS` means irregular or one-off crews and should be converted into a named crew before dispatch when possible.
- Job numbers are unique. Extract them from assignment text and match them to monday.com.
- Crew size, skill, reliability, location, materials, trailers, drivers, equipment, and Wilson's capacity all matter.

## Output Style

Focus on dispatch decisions:

- What is scheduled?
- What is missing?
- Which crews are likely available but need confirmation?
- Which jobs are blocked by materials, equipment, trailers, drivers, or missing helpers?
- Which assignments are risky because of crew fit or reliability?
- What should Lucas or the scheduling team decide next?

Keep reports practical and action-oriented.

## Logistics Brief Standards (from WhatsApp analysis)

Every logistics brief must include the following for each driver run — not just job name and address:

1. **Gate code** — required for all gated community jobs. Ask if missing.
2. **Trailer type and color** — specify which trailer (red dump, blue flat, gooseneck, etc.)
3. **Supplier PO/order number** — when driver must pick up material from Keystone, Premier, Old Castle, etc.
4. **Load weight check** — flag any run over 5 TN as likely needing 2 trips
5. **Dump schedule** — if trailer cleaning needed, call out landfill constraint (Apopka closes 3:45 PM)
6. **Full day sequence** — pre-planned stop order sent the night before (Task 1 → 2 → 3 → Home)
7. **Next stop** — every task should include where the driver goes after

The biggest idle-time killer identified in Noel's chat: reactive dispatch, one task at a time, with gaps. The brief should produce a pre-sequenced day plan that the human coordinator can send all at once.

Standard dispatch message format to WhatsApp (for human coordinator to copy-paste):

```
*JOB NAME #NUMBER*
ADDRESS: [full address + zip]
GATE CODE: [code or NA]
SUP: @[supervisor]
TRAILER: [color/type]
TASK: [action]
MATERIAL:
- [item]: [quantity]
NEXT: [next stop or "Warehouse" or "Casa"]
```
