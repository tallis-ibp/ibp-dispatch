# IBP Crew Dispatch System — Full Rebuild Design

**Date:** 2026-05-12  
**Status:** Approved  
**Scope:** TypeScript migration + missing features + security hardening + mobile dashboard

---

## 1. Overview

The IBP Crew Dispatch System automates daily scheduling and communication for a paver/pool-deck construction operation in Florida. The system reads crew assignments from a Google Sheet, matches jobs from Monday.com, generates AI-assisted schedule proposals, and dispatches work orders to crew Telegram groups with one tap of approval.

**Core loop:**
1. Overnight: fetch Google Sheet + sync Monday.com jobs
2. 6:00 AM: AI scheduling agent generates crew→job proposals
3. Scheduler reviews proposals (mobile or desktop dashboard, or Telegram)
4. Scheduler approves with one tap → briefs dispatched to all crew groups
5. Crews receive dispatch with inline keyboard buttons (Done / Problem)
6. Crew check-ins update Monday.com in real time
7. CEO/Manager can view live status via a read-only shared link

---

## 2. Technology Stack

| Layer | Choice | Reason |
|---|---|---|
| Language | **TypeScript** (Node.js ESM) | Compile-time type safety, catches bugs before production |
| Database | **SQLite** (better-sqlite3) | Replaces fragile JSON files; atomic writes, no corruption |
| Telegram | **Grammy** library | Handles retries, rate limits, inline keyboards natively |
| Validation | **Zod** | Schema validation on every API input |
| Auth | **JWT** (jsonwebtoken) | Stateless, mobile-friendly, role-aware |
| HTTP Server | Node.js `http` (existing) | No framework needed at this scale |
| AI | **Anthropic Claude API** | Scheduling proposals (Sonnet), photo analysis (Sonnet), dispatch chat (Haiku) |
| Deployment | **Railway** | Existing, persistent volume at `/app/data` |

No frontend framework — plain HTML/CSS/JS dashboard. Keeps the stack simple and avoids a build pipeline.

---

## 3. Data Layer — SQLite Schema

Replaces all `data/*.json` files. One database file at `data/ibp.db`.

```sql
-- Source of truth for all active jobs (synced from Monday.com)
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,               -- Monday item ID
  job_number TEXT UNIQUE NOT NULL,
  item_name TEXT NOT NULL,
  customer_name TEXT,
  address TEXT,
  city TEXT,
  client_type TEXT,
  job_type TEXT,
  status TEXT,
  material_status TEXT,
  material_ready INTEGER,            -- 0/1/null
  equipment_needed TEXT,             -- JSON array
  trailer_needed TEXT,               -- JSON array
  driver_needed INTEGER,
  logistics_status TEXT,
  promised_date TEXT,
  notes TEXT,
  synced_at TEXT NOT NULL
);

-- Daily dispatch briefs (one per date)
CREATE TABLE briefs (
  date TEXT PRIMARY KEY,             -- YYYY-MM-DD
  generated_at TEXT NOT NULL,
  approved INTEGER DEFAULT 0,
  approved_at TEXT,
  approved_by TEXT                   -- 'scheduler' or 'telegram'
);

-- Individual crew assignments within a brief
CREATE TABLE brief_jobs (
  id TEXT PRIMARY KEY,
  brief_date TEXT NOT NULL REFERENCES briefs(date),
  crew_key TEXT NOT NULL,
  job_number TEXT,
  job_name TEXT NOT NULL,
  address TEXT,
  gate_code TEXT,
  supervisor TEXT,
  trailer_type TEXT,
  tasks TEXT,                        -- JSON array
  materials TEXT,                    -- JSON array
  next_stop TEXT,
  risk_flags TEXT,                   -- JSON array
  dispatch_text TEXT,
  check_in_status TEXT,
  last_check_in TEXT,
  approved INTEGER DEFAULT 0,
  sent_at TEXT,
  annotations TEXT
);

-- Crew Telegram group configuration
CREATE TABLE crews (
  key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  telegram_group_id TEXT,
  language TEXT DEFAULT 'en',
  reliability TEXT,
  strengths TEXT,                    -- JSON array
  cautions TEXT                      -- JSON array
);

-- Photos received from crew groups
CREATE TABLE photos (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  received_at TEXT NOT NULL,
  file_id TEXT NOT NULL,
  local_path TEXT,
  chat_id TEXT,
  sender TEXT,
  caption TEXT,
  crew_key TEXT,
  job_number TEXT,
  monday_item_id TEXT,
  ai_summary TEXT,
  completion_status TEXT,
  monday_updated INTEGER DEFAULT 0
);

-- Unknown/unrecognized messages flagged for review
CREATE TABLE flags (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  chat_id TEXT,
  crew_key TEXT,
  sender TEXT,
  text TEXT,
  resolved INTEGER DEFAULT 0,
  resolved_at TEXT,
  note TEXT
);

-- Driver logistics run plans
CREATE TABLE logistics_runs (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  run_number INTEGER,
  driver_key TEXT,
  crew_key TEXT,
  job_number TEXT,
  job_address TEXT,
  gate_code TEXT,
  trailer_type TEXT,
  stops TEXT,                        -- JSON array
  flags TEXT,                        -- JSON object
  dispatch_text TEXT,
  approved INTEGER DEFAULT 0,
  approved_at TEXT,
  sent_at TEXT
);

-- AI-generated schedule proposals
CREATE TABLE schedule_proposals (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  crew_key TEXT NOT NULL,
  job_number TEXT,
  job_name TEXT,
  reasoning TEXT,                    -- why AI matched this crew to this job
  confidence TEXT,                   -- high / medium / low
  status TEXT DEFAULT 'pending'      -- pending / approved / rejected
);

-- Phrases learned from crew messages
CREATE TABLE learned_phrases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phrase TEXT NOT NULL,
  intent TEXT NOT NULL,
  learned_at TEXT NOT NULL
);

-- Auth sessions (scheduler magic links + viewer share links)
CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  role TEXT NOT NULL,                -- 'scheduler' or 'viewer'
  label TEXT,                        -- e.g. "CEO link" or "Manager - John"
  created_at TEXT NOT NULL,
  expires_at TEXT,                   -- null = never expires
  last_used_at TEXT,
  revoked INTEGER DEFAULT 0
);
```

---

## 4. Module Structure

```
src/
├── db/
│   ├── client.ts          -- shared better-sqlite3 instance (singleton)
│   ├── schema.ts          -- CREATE TABLE statements
│   └── migrations.ts      -- run on startup, idempotent
│
├── middleware/
│   ├── auth.ts            -- JWT verify middleware; attaches role to request
│   ├── validate.ts        -- Zod wrapper: validates body/params, returns 400 on failure
│   └── rateLimit.ts       -- in-memory sliding window (60 req/min general, 5/min login)
│
├── core/
│   ├── config.ts          -- crew profiles, day column map, job type inference
│   ├── fetchSchedule.ts   -- Google Sheet CSV fetch + cache
│   ├── scheduleParser.ts  -- CSV → schedule records
│   ├── generateBriefs.ts  -- records + jobs → brief_jobs rows
│   └── analyzeSchedule.ts -- weekly markdown report
│
├── agents/
│   ├── schedulingAgent.ts -- Claude Sonnet: reads pending jobs + crew profiles → proposals
│   ├── logisticsAgent.ts  -- driver route planning (multi-driver: Noel + Arthur)
│   └── dispatchChat.ts    -- Claude Haiku: multi-turn dispatch assistant
│
├── monday/
│   ├── api.ts             -- GraphQL wrapper
│   ├── fetchJobs.ts       -- fetch active jobs from board
│   ├── refreshMonday.ts   -- scheduled sync every 30 min → upsert into jobs table
│   ├── addUpdate.ts       -- post crew check-in updates to Monday item
│   └── uploadPhoto.ts     -- multipart photo upload to Monday item
│
├── telegram/
│   ├── grammy.ts          -- Grammy bot instance; webhook when PUBLIC_URL is set, polling otherwise
│   ├── schedulerBot.ts    -- morning summary to scheduler + Approve/Hold/Dashboard buttons
│   ├── dispatcher.ts      -- send approved briefs to crew groups
│   ├── messageHandler.ts  -- crew inline keyboard callbacks + intent detection
│   └── photoHandler.ts    -- download + Vision analysis + Monday upload
│
├── scripts/
│   └── setupWebhook.ts    -- one-time webhook registration (run manually on deploy)
│
└── server/
    ├── index.ts           -- HTTP server, cron jobs, startup validation
    └── routes/
        ├── auth.ts        -- POST /api/login (Telegram magic link flow)
        ├── share.ts       -- POST /api/share (generate viewer link), GET /api/share (list)
        ├── briefs.ts      -- CRUD + approve endpoint
        ├── proposals.ts   -- scheduling agent endpoints
        ├── logistics.ts   -- driver run endpoints
        ├── photos.ts      -- photo list + file serving
        ├── flags.ts       -- flag list + resolve + teach-bot
        └── crews.ts       -- crew config management

dashboard/
├── index.html             -- login screen (magic link flow) + main app shell
├── style.css              -- mobile-responsive (works on 375px phones)
├── app.js                 -- attaches JWT to all fetch calls; crew cards + approval
├── chat.js                -- dispatch assistant chat
├── logistics.js           -- driver run UI
├── proposals.js           -- AI schedule proposals review UI
└── viewer.js              -- read-only CEO/manager dashboard
```

---

## 5. Authentication & Roles

### Scheduler Login (Magic Link via Telegram)

1. Scheduler opens dashboard — sees login screen
2. Taps "Login via Telegram" button → browser opens `https://t.me/<botname>?start=login_<nonce>`
3. Bot receives `/start login_<nonce>`, verifies nonce is valid and unused (nonces stored in DB, expire in 10 min)
4. Bot sends a one-time login link: `https://<app-url>/api/auth/exchange?nonce=<nonce>`
5. Server validates nonce → issues JWT → sets it as an `HttpOnly` cookie → redirects to dashboard
6. JWT role: `scheduler`, expiry: 24h, refreshed on activity

> **Why nonce-then-exchange instead of JWT in URL:** A JWT in a URL gets logged in server access logs, browser history, and Referer headers. The nonce is single-use and short-lived (10 min), so intercepting it is a narrow window and the exchange happens server-side.

### Viewer Link (CEO / Manager)

1. Scheduler taps "Share Access" in dashboard settings
2. Chooses label (e.g. "CEO — Lucas") and expiry (7 days / 30 days / never)
3. System generates a JWT with role `viewer` and the chosen expiry
4. Link: `https://<app-url>?token=<jwt>` — copy and send via WhatsApp/iMessage/email
5. Recipient opens link in any browser — auto-authenticated, sees read-only dashboard
6. Scheduler can revoke any share link at any time (sets `revoked = 1` in sessions table)

### Dashboard Views by Role

| Feature | Scheduler | Viewer |
|---|---|---|
| View today's schedule | ✅ | ✅ |
| Expand crew card (address, photos, check-ins) | ✅ | ✅ |
| Edit brief / gate codes | ✅ | ❌ |
| Approve & dispatch | ✅ | ❌ |
| View flags | ✅ | ❌ |
| Manage logistics / driver runs | ✅ | ❌ |
| Generate share links | ✅ | ❌ |
| Dispatch chat (AI assistant) | ✅ | ❌ |

---

## 6. Scheduling Agent

**File:** `src/agents/schedulingAgent.ts`  
**Model:** Claude Sonnet

### Input
- All jobs with `status = 'NEED_TO_SCHEDULE'` or `'SCHEDULED_JOB'` and `material_ready = 1`
- All crew profiles from `config.ts` (skills, reliability, cautions)
- Current week's schedule records from Google Sheet (to detect crews already assigned)

### Output
One `schedule_proposals` row per crew per date with:
- `job_number` — the recommended job
- `reasoning` — plain English explanation (e.g. "Santiago is a high-reliability deck crew; job #600049 is a deck install with confirmed materials and no gooseneck needed")
- `confidence` — `high` / `medium` / `low`

### Rules passed to Claude
- Coping and tile jobs → only Toby or Fausto
- Big slab / gooseneck jobs → Marcelao or Waype
- Penna is detail-work only; do not assign large deck installs
- High-reliability crews for gated communities
- Do not propose a job if `material_ready` is false
- Flag jobs with missing gate codes as `confidence: low`
- Never assign two crews to the same job on the same day unless explicitly multi-crew

### UI
- Proposals tab in dashboard shows each suggestion with reasoning and confidence badge
- Scheduler can approve individual proposals, swap the job, or reject
- Approving all proposals generates the daily brief

---

## 7. Telegram Bot — Grammy

### Scheduler Chat (Personal)

Sent at **6:00 AM** every day:

```
📋 Schedule Ready — [Day], [Date]

SANTIAGO → [Job name] ([type])
PENNA → [Job name]
WAYPE → [Job name]
...

⚠️ [N] flags: [short descriptions]

[✅ Approve & Send]  [✏️ Open Dashboard]  [🚫 Hold]
```

- **Approve & Send**: dispatches all approved crew briefs, sends driver route to Noel/Arthur
- **Open Dashboard**: sends a short-lived deep-link to the mobile dashboard
- **Hold**: marks brief as held, sends reminder in 30 min if still no action
- If no response by **7:00 AM**: bot sends one reminder. No auto-send ever.

### Crew Groups

Dispatch message format (one per job, existing format):
```
*JOB NAME #NUMBER*
ADDRESS: [address]
GATE CODE: [code or NA]
SUP: @[supervisor]
TRAILER: [type]
TASK: [action]
MATERIAL:
- [item]: [qty]
NEXT: [next stop]
```

Followed by inline keyboard:
```
[✅ Job Done]  [⚠️ Issue]
```

- **Job Done**: updates `brief_jobs.check_in_status = 'done'`, posts update to Monday item
- **Issue**: bot replies asking for details; crew types the issue; flagged for scheduler

Photo messages: crew sends photo → Grammy downloads → Claude Vision analyzes → result posted to Monday item → dashboard photo feed updated.

### Driver Chat (Noel / Arthur)

Receives formatted logistics run on approval:
```
*LOGISTICS RUN #[N] — [Day]*
JOB: [name]
[stop 1] → [stop 2] → [stop 3]
TRAILER: [type]
GATE: [code]
⚠️ [any weight/dump flags]
NEXT: [next run or Casa]
```

---

## 8. Security

| Surface | Control |
|---|---|
| Dashboard | JWT required on all `/api/*` routes; 401 without valid token |
| Login | Rate-limited to 5 attempts/min per IP; nonces single-use |
| Telegram webhook | Secret token validated on every request; 403 without it |
| Scheduler commands | Only accepted from one known Telegram chat ID (env var) |
| Crew commands | Only accepted from registered group IDs in `crews` table |
| API inputs | Zod validation on all endpoints; 400 on invalid input |
| SQL | Parameterized queries only via better-sqlite3; no string concatenation |
| File serving | Path resolved and prefix-checked; path traversal → 400 |
| Rate limiting | 60 req/min per IP general; auto-unlocks after 60s |
| Secrets | Validated at startup; server refuses to start if any required env var is missing |
| Logs | Tokens, API keys, chat IDs never printed to logs |

---

## 9. Cron Jobs

| Time | Job |
|---|---|
| 5:00 AM | Fetch Google Sheet schedule |
| 5:30 AM | Sync Monday.com jobs (`refreshMonday.ts`) |
| 6:00 AM | Run scheduling agent → generate proposals → send Telegram summary to scheduler |
| Every 30 min | Monday.com incremental sync (status updates only) |
| 7:00 AM | Reminder to scheduler if brief not yet approved |

---

## 10. Environment Variables

```env
# Required — server will not start without these
TELEGRAM_BOT_TOKEN=
TELEGRAM_SCHEDULER_CHAT_ID=    # Scheduler's personal Telegram chat ID
MONDAY_API_KEY=
ANTHROPIC_API_KEY=
JWT_SECRET=                    # Random 32+ char string
PUBLIC_URL=                    # e.g. https://ibp-dispatch.up.railway.app (also enables webhook mode)

# Optional
SCHEDULE_SHEET_ID=             # Google Sheet ID (has default)
TELEGRAM_WEBHOOK_SECRET=       # Random string; bot validates this on every webhook call
PORT=3002
NODE_ENV=production
```

---

## 11. What Gets Deleted

| File | Replaced by |
|---|---|
| `src/telegram/bot.mjs` | Grammy instance in `src/telegram/grammy.ts` |
| `src/telegram/poller.mjs` | Grammy built-in polling |
| `data/*.json` (all) | SQLite tables |
| `data/raw/*.csv` | Still cached on disk for fallback |

---

## 12. Migration Path

The migration is **zero-downtime** — the existing system keeps running while the new one is built in parallel:

1. Add TypeScript config (`tsconfig.json`) + compile step
2. Create SQLite schema + migrations (run alongside existing JSON files initially)
3. Migrate each module one at a time (JS → TS, JSON reads → DB reads)
4. Replace Telegram polling with Grammy last (most visible change)
5. Add auth, new routes, scheduling agent
6. Delete JSON files once all reads/writes confirmed in SQLite
7. Deploy, run `setupWebhook.ts` to register Telegram webhook

---

## 13. Out of Scope (This Version)

- Multi-user roles beyond `scheduler` and `viewer`
- Push notifications (browser or SMS)
- Native mobile app
- Offline support
- SOC2 / compliance auditing
- Multi-driver load balancing (Arthur supported but not auto-balanced with Noel)
