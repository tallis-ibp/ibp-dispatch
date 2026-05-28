# IBP Dispatch

Internal dispatch dashboard for a paver and pool-deck construction operation. Pairs Monday.com jobs with crews via an AI scheduling agent, dispatches daily briefs through Telegram, and captures crew check-ins and photos.

**Live**: https://ibp-dispatch.vercel.app

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          User's browser                             │
│           Hash-routed dashboard (vanilla JS, no framework)          │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │ HTTPS
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       Vercel (single function)                      │
│  api/index.ts → src/server/handler.ts (hand-rolled HTTP router)     │
│   • /                  → serves public/index.html (with cache-bust) │
│   • /api/*             → routes/* handlers                          │
│   • /webhook/telegram  → grammy.handleUpdate                        │
│   • /api/cron/*        → background tasks                           │
└────┬─────────────────────────┬──────────────────────┬───────────────┘
     │                         │                      │
     ▼                         ▼                      ▼
┌──────────┐          ┌─────────────┐         ┌────────────┐
│ Supabase │          │  Telegram   │         │ Anthropic  │
│ Postgres │          │   Bot API   │         │  Claude    │
│ (pooler) │          │  (webhook)  │         │ (agent +   │
│          │          │             │         │  Vision)   │
└──────────┘          └─────────────┘         └────────────┘
                              │
                              ▼
                      Monday.com REST
                      (job sync + writeback)
```

Single function. Single repo. Static dashboard served from `public/`. Runs on Vercel Fluid Compute.

---

## Tech stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 18+ on Vercel Fluid Compute |
| Database | Postgres on Supabase via PgBouncer transaction-mode pool (port 6543) |
| DB client | `postgres` npm package, `prepare: false`, max 3 connections |
| HTTP | Hand-rolled router on `http.IncomingMessage` (no Express, no Next.js) |
| Frontend | Vanilla JS, no framework, hash router, modular `pages/*.js` files |
| Telegram | `grammy` library, webhook mode |
| AI | `@anthropic-ai/sdk`, Sonnet 4.6 for scheduling, Vision for photos |
| Monday | Direct REST calls in `src/monday/` |
| Auth | JWT in cookies (currently bypassed via `DISABLE_AUTH=true` — see Security) |
| Tests | `vitest` |
| Validation | `zod` for query params |

No build step for the frontend — files in `public/` are served as-is.

---

## File structure

```
api/
  index.ts                # Vercel function entry
  cron/                   # Scheduled tasks
    morning.ts            # 6am: generate proposals + send Telegram summary
    sync-monday.ts        # every 30min: pull jobs from Monday
    fetch-schedule.ts     # legacy — no-op on Vercel (writes to filesystem)

src/
  server/
    handler.ts            # Main router
    index.ts              # Local dev only (npm run dev)
    validateEnv.ts        # Required env vars
    routes/
      admin.ts            # Reset + setup-webhook (auth-gated)
      auth.ts             # JWT login flow (currently bypassed)
      briefs.ts           # GET/POST /api/briefs/:date and approve
      crews.ts            # CRUD + operational aggregates + test send
      flags.ts            # Unknown-message inbox
      health.ts           # /api/health/integrations
      jobs.ts             # Monday job browser + assignment endpoint
      learnedPhrases.ts   # Teach-the-bot CRUD
      photos.ts           # Photos list + image streaming proxy
      proposals.ts        # AI scheduling proposals
      telegram.ts         # Chat registry + activity feed + quick send

  db/
    client.ts             # postgres() singleton
    schema.ts             # All CREATE TABLE IF NOT EXISTS
    migrations.ts         # Runs schema on cold start
    seedCrews.ts          # Initial crew profiles (only when crews table empty)

  telegram/
    grammy.ts             # Bot factory, command handlers, webhook setup
    messageHandler.ts     # Text intent detection + callback queries
    photoHandler.ts       # Photo → Claude Vision → DB + Monday writeback
    dispatcher.ts         # Sends brief_jobs to crews
    schedulerBot.ts       # Morning summary message to dispatcher
    chatRegistry.ts       # telegram_chats table + auto-registration

  monday/
    api.ts                # REST client
    fetchJobs.ts          # Query Monday board for jobs
    refreshMonday.ts      # Pull + upsert into jobs table
    addUpdate.ts          # Write back to a Monday item
    uploadPhoto.ts        # (not currently used end-to-end)

  agents/
    schedulingAgent.ts    # Claude prompt builder + generateProposals

  core/
    config.ts             # CREW_PROFILES seed data, Sheet ID
    generateBriefs.ts     # Approved proposals → brief_jobs
    fetchSchedule.ts      # Google Sheet reader (no-op on Vercel)
    scheduleParser.ts     # Parses sheet CSV (only used locally)

  middleware/
    auth.ts               # JWT issue + validate
    rateLimit.ts          # In-memory IP throttle (60 req/min)
    validate.ts           # zod wrapper

  scripts/
    setupWebhook.ts       # CLI: register Telegram webhook
    refreshMonday.mjs     # Legacy CLI (superseded by .ts)

public/
  index.html              # Sidebar shell + script tags
  style.css               # Design system (slate palette, Inter font)
  app.js                  # Boot, auth check, build SHA indicator
  ui.js                   # IBP.* helpers (avatar, skeleton, toast, etc)
  router.js               # Hash router
  drawer.js               # Reusable side-panel
  pages/
    dispatch.js           # Today's brief by crew
    schedule.js           # AI proposals timeline + sheet embed
    jobs.js               # Monday jobs browser + assign UI
    logistics.js          # Driver route view with addresses
    crews.js              # Operational crew grid + AI config drawer
    photos.js             # Photo grid + filters
    flags.js              # Unknown-message inbox
    settings.js           # Integration health + tools + learned phrases
    telegram.js           # Chat registry + activity feed + quick test

vercel.json               # Routes, crons, output dir
tsconfig.json             # ESM, strict
```

---

## Local development

```bash
# 1. Clone and install
git clone https://github.com/tallis-ibp/ibp-dispatch.git
cd ibp-dispatch
npm install

# 2. Pull env from Vercel (or copy .env.example to .env.local manually)
vercel env pull .env.local

# 3. Run the local server
npm run dev
# Dashboard at http://localhost:3002

# 4. Set up the Telegram webhook (one-time, after first deploy or when changing env)
npm run setup:webhook

# 5. Run tests
npm test
```

The local server uses `setInterval`-based cron simulation; on Vercel, `vercel.json` schedules the handlers in `api/cron/*` instead. Same code runs in both environments.

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Supabase Postgres URL (use the **transaction pooler** port 6543) |
| `ANTHROPIC_API_KEY` | yes | Claude API key (scheduling agent + photo Vision) |
| `TELEGRAM_BOT_TOKEN` | yes | Bot token from @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | yes | Random string; sent as `X-Telegram-Bot-Api-Secret-Token` header |
| `TELEGRAM_SCHEDULER_CHAT_ID` | yes | Dispatcher's DM chat ID — receives admin messages |
| `MONDAY_API_KEY` | yes | Monday.com personal API token |
| `MONDAY_BOARD_ID` | no | Defaults to `2214820863` (the "general jobs" board) |
| `PUBLIC_URL` | yes | Used to construct webhook URL — `https://ibp-dispatch.vercel.app` in prod |
| `JWT_SECRET` | yes | Used by `auth.ts` to sign session cookies |
| `CRON_SECRET` | yes | Bearer token expected by `/api/cron/*` and admin endpoints |
| `DISABLE_AUTH` | currently `true` | When `true`, `requireAuth()` returns true for every request. **Leaves all write endpoints open** — see Security |
| `VERCEL_GIT_COMMIT_SHA` | auto | Set by Vercel; shown in sidebar footer for debugging |

---

## Database schema (highlights)

Defined in `src/db/schema.ts`. Migrations are idempotent (`CREATE TABLE IF NOT EXISTS`) and run automatically on every cold start.

| Table | Purpose | Key columns |
|---|---|---|
| `crews` | Crew profiles | `key` PK, `display_name`, `language`, `reliability`, `strengths` (JSON), `cautions` (JSON), `telegram_group_id` |
| `jobs` | Mirror of Monday "general jobs" board | `id` (Monday item id) PK, `job_number` UNIQUE, `status`, `material_ready`, `address`, `trailer_needed` (JSON) |
| `briefs` | Daily brief envelope | `date` PK, `approved`, `approved_by` |
| `brief_jobs` | One row per crew × job for a day | `id` PK, `brief_date` FK→briefs, `crew_key`, `job_number`, `sent_at`, `check_in_status` |
| `schedule_proposals` | AI / manual assignments before brief is generated | `id` PK, `date`, `crew_key`, `job_number`, `status` (pending/approved/rejected), `confidence` |
| `photos` | Inbound crew photos with AI Vision summary | `id` PK, `file_id` (Telegram), `chat_id`, `ai_summary`, `completion_status`, `monday_updated` |
| `flags` | Unknown / issue messages | `id` PK, `chat_id`, `crew_key`, `text`, `resolved` |
| `learned_phrases` | Phrases taught from flags → intent | `id` serial PK, `phrase`, `intent` |
| `telegram_chats` | Every chat the bot has ever interacted with | `chat_id` PK, `type` (group/supergroup/private), `linked_crew_key` FK→crews |
| `sessions` | JWT sessions (unused while `DISABLE_AUTH=true`) | `token` PK, `expires_at` |

Note: most `crew_key` and `job_number` columns are not currently FK-constrained. Deleting a crew leaves orphan rows in `brief_jobs`/`photos`/`flags`/`schedule_proposals`, which `handleGetBrief` silently drops via INNER JOIN.

---

## Cron jobs (vercel.json)

| Cron | Schedule | Handler | Notes |
|---|---|---|---|
| Sync Monday | `*/30 * * * *` | `/api/cron/sync-monday` | Pulls jobs into Postgres |
| Sync Monday | `30 5 * * *` | `/api/cron/sync-monday` | Duplicate of the every-30min job |
| Morning brief | `0 6 * * *` UTC | `/api/cron/morning` | Runs scheduling agent + sends Telegram summary |
| Fetch schedule | `0 5 * * *` UTC | `/api/cron/fetch-schedule` | Legacy — writes to filesystem, no-op on Vercel |

All cron handlers expect `Authorization: Bearer ${CRON_SECRET}`; Vercel sets this header automatically.

---

## Telegram bot setup

1. **Create a bot** via `@BotFather` in Telegram → `/newbot`. Save the token to `TELEGRAM_BOT_TOKEN`.
2. **Disable privacy mode** (critical) — `@BotFather` → `/mybots` → pick bot → Bot Settings → Group Privacy → **Turn off**. Without this the bot only sees `/commands` in groups, missing every regular message.
3. **Set the webhook** — after deploying, hit `POST /api/admin/setup-webhook` (button in Settings page). This registers the webhook with `allowed_updates: my_chat_member` so the bot auto-detects when added to a group.
4. **DM the bot once from your phone** — send `/myid` to get your chat ID. Set this as `TELEGRAM_SCHEDULER_CHAT_ID`.
5. **Add the bot to crew groups** — the Telegram page (`/#/telegram`) auto-detects new groups within seconds. Click "Link to crew" → pick the crew → done.

The bot reads message intent (Portuguese / Spanish / English) via regex + a learned-phrases table populated from the Flags page.

---

## Deployment (Vercel)

```bash
# First-time setup
vercel link
vercel env add DATABASE_URL production
# ... (add all variables from the table above)

# Deploy
git push origin main   # auto-deploys via Vercel GitHub integration
# or
vercel --prod
```

Every push to `main` deploys to production. `VERCEL_GIT_COMMIT_SHA` is injected into static asset URLs (`?v=<sha>`) so browsers never serve stale JS — the deployed SHA is visible in the sidebar footer (clickable to hard-reload).

---

## Security

**`DISABLE_AUTH=true` is currently set in production.** Every write endpoint is reachable without auth:

- `POST /api/admin/reset-test-data` — wipes operational data
- `POST /api/telegram/send` — sends arbitrary Telegram messages
- `POST /api/proposals` — runs the AI agent (Anthropic cost)
- `DELETE /api/crews/:key`, `POST /api/jobs/:n/assign`, etc.

The in-memory rate limiter (60 req/min per IP) limits noise but not abuse. Two options to close this:

- Enable **Vercel Password Protection** in the project settings (one-click). The `DISABLE_AUTH` flag can remain set.
- Set `DISABLE_AUTH=false` to restore the JWT login flow. The dashboard's login screen sends the user a one-time Telegram link to the bot; the bot replies with a deep link that mints a JWT.

Other notes:
- All SQL uses tagged-template parameterization. The two `sql.unsafe()` calls invoke hardcoded statements.
- Path traversal is blocked in `handler.ts` via `staticPath.startsWith(DASHBOARD_DIR)`.
- Telegram webhook validates `X-Telegram-Bot-Api-Secret-Token` against `TELEGRAM_WEBHOOK_SECRET` (validation is skipped if the env var is empty — keep it set).

---

## How everyday flows work

### Morning routine (automated)
```
05:00  fetch-schedule cron (no-op)
05:30  sync-monday cron pulls latest jobs
06:00  morning cron:
       1. scheduling agent reads jobs + crews from DB
       2. produces schedule_proposals (status='pending')
       3. sends Telegram summary to dispatcher with approve/hold buttons
```

### Manual assignment (dispatcher)
```
Dispatcher opens /#/jobs → finds a job → clicks "Assign"
→ picks a crew + date
→ POST /api/jobs/:n/assign creates BOTH an approved proposal AND a brief_job
→ dispatcher navigates to /#/dispatch → clicks "Send to {crew}"
→ Telegram bot sends the brief to that crew's group
→ brief_jobs.sent_at gets stamped
```

### Crew responds
```
Crew types "terminamos" in their group
→ webhook hits /webhook/telegram
→ messageHandler detects 'done' intent
→ brief_jobs.check_in_status = 'done'
→ Monday item gets an update via addUpdate.ts
→ bot acknowledges in the crew's language
```

### Crew sends a photo
```
Photo arrives at webhook
→ photoHandler downloads from Telegram
→ Claude Vision generates summary + status
→ photos table gets a row
→ Monday item gets a "photo" update
→ if status='done', bot can ask a follow-up question
```

---

## Backlog / known issues

In rough priority order:

1. **Missing foreign keys** on `brief_jobs.crew_key`, `schedule_proposals.crew_key`, `photos.crew_key`, `flags.crew_key`, `brief_jobs.job_number`. Add with `ON DELETE SET NULL` so deletes don't silently orphan rows.
2. **`DISABLE_AUTH=true`** in production — close via Vercel Password Protection or restore JWT auth.
3. **Missing indexes** on hot queries: `brief_jobs(brief_date)`, `brief_jobs(crew_key, brief_date)`, `schedule_proposals(date, job_number)`, `jobs(status, material_ready)`, `photos(date, crew_key)`, `flags(date, resolved)`, `learned_phrases(phrase)`.
4. **Race window in `handleAssignJob`** — the 5-statement sequence (insert briefs, delete+insert proposal, delete+insert brief_job) is not transactional. Convert to UPSERT (PgBouncer transaction mode does not support `sql.begin` reliably).
5. **Dead `fetch-schedule` cron** + `src/core/fetchSchedule.ts` write to a filesystem that doesn't exist on Vercel. Remove both, and the `vercel.json` schedule entry.
6. **Duplicate `sync-monday` cron** at `30 5 * * *` — the `*/30` job already fires at 5:30. Remove the explicit entry.
7. **`/api/crews` field casing** — currently returns snake_case from `SELECT c.*` mixed with camelCase aliases. Add explicit `AS "camelCase"` for every column for consistency with the rest of the API.
8. **Hardcoded Monday URLs** — two different workspace subdomains (`installbrickpavers-team` vs `groupibp`) appear across the codebase. One is incorrect. Centralize in a constants module.
9. **Two-step issue button flow** — designed but not built. Requires adding `awaiting_issue_for_brief_job_id` + `awaiting_issue_since` columns to `crews`.
10. **Replace sheet iframe with parsed view** — currently embeds Google Sheets via iframe. Longer term, parse the sheet into a `weekly_schedule` Postgres table.

---

## Adding things

### A new page in the dashboard
1. Add a `<button data-route="foo">` in `public/index.html`'s sidebar
2. Add `<script src="/pages/foo.js"></script>` near the bottom of `index.html`
3. Create `public/pages/foo.js` that calls `IBP.registerRoute('foo', (main) => { ... })`
4. Use helpers from `ui.js` (`IBP.el`, `IBP.fetchJson`, `IBP.skeleton`, `IBP.openDrawer`, etc.)

### A new API route
1. Create handler in `src/server/routes/foo.ts` — signature `(req, res, ...args) => Promise<void>`
2. Wire it in `src/server/handler.ts` inside the `if (path.startsWith('/api/'))` block
3. The router is hand-rolled — order of `if` branches matters; put specific paths first
4. All protected routes go below `if (!(await requireAuth(req, res))) return;`

### A new database table
1. Add `CREATE TABLE IF NOT EXISTS ...` to `src/db/schema.ts`
2. Migrations run automatically on cold start (idempotent)
3. Add types to `src/types/index.ts` if shared

### A new Telegram intent
1. Add the regex to `INTENTS` in `src/telegram/messageHandler.ts`
2. Add localized response copies in `MESSAGES`
3. Handle the new intent inside `applyIntentToJob` if it should update state

---

## Debugging

| Symptom | Where to look |
|---|---|
| Dashboard shows wrong data | Browser DevTools console + `/api/health/integrations` |
| Bot doesn't reply in a group | Privacy Mode in BotFather (must be **off**) |
| Bot doesn't receive `my_chat_member` events | Re-run **Re-register** button in Settings |
| Photos missing | Vercel filesystem is read-only; binaries are not stored, they're proxied from Telegram on demand. Check `file_id` in `photos` table |
| "Chat not found" on test send | Stored `telegram_group_id` doesn't match a real chat. Use the Telegram page's recent-chats picker |
| `sql.begin` errors | PgBouncer transaction mode rejects them — use sequential statements only |
| Stale cache | Click the SHA in sidebar footer (hard reload with timestamp) |
| Agent generates 0 proposals | Needs jobs with `material_ready=1` AND crews with `reliability NOT NULL` |
| Brief doesn't generate from proposals | `generateBriefs(date)` falls back to approved proposals when `data/schedule-records.json` is absent (always absent on Vercel) |

Vercel logs: `vercel logs <deployment-url>` or the Logs tab in the Vercel dashboard.

---

## NPM scripts

```bash
npm run dev              # Local dev server with hot reload
npm run build            # tsc compile to dist/
npm run start            # node dist/server/index.js
npm test                 # vitest run
npm run test:watch       # vitest watch
npm run fetch:schedule   # Reads Google Sheet → data/schedule-records.json (local only)
npm run brief            # Generates brief for today
npm run refresh          # Pulls Monday jobs into Postgres
npm run setup:webhook    # Registers Telegram webhook with allowed_updates
```
