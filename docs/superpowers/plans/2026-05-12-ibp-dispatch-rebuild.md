# IBP Crew Dispatch System — Full Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the existing IBP Crew Dispatch System from JavaScript + JSON files to TypeScript + SQLite, add Grammy-based Telegram inline keyboards, build the missing scheduling AI agent, add JWT magic-link auth with viewer share links, and make the dashboard mobile-responsive.

**Architecture:** The system is a Node.js HTTP server that reads a Google Sheet for crew assignments, syncs jobs from Monday.com into SQLite, runs a Claude-powered scheduling agent each morning, dispatches briefs via Telegram Grammy bot to crew groups, and serves a mobile-responsive dashboard with role-based access. TypeScript enforces types across all modules; Zod validates all external inputs at API boundaries.

**Tech Stack:** TypeScript 5, Node.js 18+ ESM, SQLite (better-sqlite3), Grammy (Telegram), Zod, jsonwebtoken, Vitest (tests), tsx (dev runner), tsc (production build)

---

## Phase 1 — Foundation: TypeScript + SQLite + Middleware
> **Milestone:** Server boots, reads and writes SQLite, rejects bad inputs, enforces auth. No Telegram or Monday changes yet.

---

### Task 1: TypeScript Build Pipeline

**Files:**
- Create: `tsconfig.json`
- Modify: `package.json`
- Create: `src/types/index.ts`

- [ ] **Step 1: Install TypeScript tooling**

```bash
npm install --save-dev typescript tsx @types/node vitest
npm install better-sqlite3 zod jsonwebtoken grammy
npm install --save-dev @types/better-sqlite3 @types/jsonwebtoken
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Update package.json scripts**

Replace the `scripts` block in `package.json` with:

```json
{
  "name": "crew-scheduler-automation-starter",
  "version": "1.0.0",
  "type": "module",
  "engines": { "node": ">=18" },
  "scripts": {
    "dev": "tsx src/server/index.ts",
    "build": "tsc",
    "start": "node dist/server/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "fetch:schedule": "tsx src/core/fetchSchedule.ts",
    "analyze": "tsx src/core/analyzeSchedule.ts",
    "brief": "tsx src/core/generateBriefs.ts",
    "refresh": "tsx src/monday/refreshMonday.ts",
    "setup:webhook": "tsx src/scripts/setupWebhook.ts"
  }
}
```

- [ ] **Step 4: Create shared type definitions at `src/types/index.ts`**

```typescript
export type Role = 'scheduler' | 'viewer';

export interface CrewProfile {
  key: string;
  displayName: string;
  telegramGroupId: string | null;
  language: 'en' | 'es' | 'pt';
  reliability: 'high' | 'medium' | 'low';
  strengths: string[];
  cautions: string[];
}

export interface Job {
  id: string;
  jobNumber: string;
  itemName: string;
  customerName: string | null;
  address: string | null;
  city: string | null;
  clientType: string | null;
  jobType: string | null;
  status: string | null;
  materialStatus: string | null;
  materialReady: boolean | null;
  equipmentNeeded: string[];
  trailerNeeded: string[];
  driverNeeded: boolean;
  logisticsStatus: string | null;
  promisedDate: string | null;
  notes: string | null;
  syncedAt: string;
}

export interface BriefJob {
  id: string;
  briefDate: string;
  crewKey: string;
  jobNumber: string | null;
  jobName: string;
  address: string | null;
  gateCode: string | null;
  supervisor: string | null;
  trailerType: string | null;
  tasks: string[];
  materials: Array<{ item: string; quantity: string }>;
  nextStop: string | null;
  riskFlags: string[];
  dispatchText: string;
  checkInStatus: string | null;
  lastCheckIn: string | null;
  approved: boolean;
  sentAt: string | null;
  annotations: string | null;
}

export interface Brief {
  date: string;
  generatedAt: string;
  approved: boolean;
  approvedAt: string | null;
  approvedBy: string | null;
}

export interface ScheduleProposal {
  id: string;
  date: string;
  generatedAt: string;
  crewKey: string;
  jobNumber: string | null;
  jobName: string | null;
  reasoning: string;
  confidence: 'high' | 'medium' | 'low';
  status: 'pending' | 'approved' | 'rejected';
}

export interface Session {
  token: string;
  role: Role;
  label: string | null;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revoked: boolean;
}

export interface AuthenticatedRequest extends Request {
  role: Role;
  sessionToken: string;
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npm run build
```

Expected: `dist/` directory created with no errors.

- [ ] **Step 6: Commit**

```bash
git add tsconfig.json package.json src/types/index.ts
git commit -m "feat: add TypeScript build pipeline and shared types"
```

---

### Task 2: SQLite Client + Schema + Migrations

**Files:**
- Create: `src/db/client.ts`
- Create: `src/db/schema.ts`
- Create: `src/db/migrations.ts`
- Create: `tests/db/migrations.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/db/migrations.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import { runMigrations } from '../../src/db/migrations.js';
import { getDb } from '../../src/db/client.js';

const TEST_DB = 'data/test.db';

describe('migrations', () => {
  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    process.env.DB_PATH = TEST_DB;
  });

  afterEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    delete process.env.DB_PATH;
  });

  it('creates all required tables', () => {
    runMigrations();
    const db = getDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toContain('jobs');
    expect(names).toContain('briefs');
    expect(names).toContain('brief_jobs');
    expect(names).toContain('crews');
    expect(names).toContain('photos');
    expect(names).toContain('flags');
    expect(names).toContain('logistics_runs');
    expect(names).toContain('schedule_proposals');
    expect(names).toContain('learned_phrases');
    expect(names).toContain('sessions');
    expect(names).toContain('login_nonces');
  });

  it('is idempotent — running twice does not throw', () => {
    expect(() => {
      runMigrations();
      runMigrations();
    }).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test tests/db/migrations.test.ts
```

Expected: FAIL — `Cannot find module '../../src/db/migrations.js'`

- [ ] **Step 3: Create `src/db/client.ts`**

```typescript
import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

let instance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!instance) {
    const dbPath = resolve(process.env.DB_PATH ?? 'data/ibp.db');
    mkdirSync(resolve(dbPath, '..'), { recursive: true });
    instance = new Database(dbPath);
    instance.pragma('journal_mode = WAL');
    instance.pragma('foreign_keys = ON');
  }
  return instance;
}

export function closeDb(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}
```

- [ ] **Step 4: Create `src/db/schema.ts`**

```typescript
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  job_number TEXT UNIQUE NOT NULL,
  item_name TEXT NOT NULL,
  customer_name TEXT,
  address TEXT,
  city TEXT,
  client_type TEXT,
  job_type TEXT,
  status TEXT,
  material_status TEXT,
  material_ready INTEGER,
  equipment_needed TEXT DEFAULT '[]',
  trailer_needed TEXT DEFAULT '[]',
  driver_needed INTEGER DEFAULT 0,
  logistics_status TEXT,
  promised_date TEXT,
  notes TEXT,
  synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS briefs (
  date TEXT PRIMARY KEY,
  generated_at TEXT NOT NULL,
  approved INTEGER DEFAULT 0,
  approved_at TEXT,
  approved_by TEXT
);

CREATE TABLE IF NOT EXISTS brief_jobs (
  id TEXT PRIMARY KEY,
  brief_date TEXT NOT NULL REFERENCES briefs(date) ON DELETE CASCADE,
  crew_key TEXT NOT NULL,
  job_number TEXT,
  job_name TEXT NOT NULL,
  address TEXT,
  gate_code TEXT,
  supervisor TEXT,
  trailer_type TEXT,
  tasks TEXT DEFAULT '[]',
  materials TEXT DEFAULT '[]',
  next_stop TEXT,
  risk_flags TEXT DEFAULT '[]',
  dispatch_text TEXT,
  check_in_status TEXT,
  last_check_in TEXT,
  approved INTEGER DEFAULT 0,
  sent_at TEXT,
  annotations TEXT
);

CREATE TABLE IF NOT EXISTS crews (
  key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  telegram_group_id TEXT,
  language TEXT DEFAULT 'en',
  reliability TEXT,
  strengths TEXT DEFAULT '[]',
  cautions TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS photos (
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

CREATE TABLE IF NOT EXISTS flags (
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

CREATE TABLE IF NOT EXISTS logistics_runs (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  run_number INTEGER,
  driver_key TEXT,
  crew_key TEXT,
  job_number TEXT,
  job_address TEXT,
  gate_code TEXT,
  trailer_type TEXT,
  stops TEXT DEFAULT '[]',
  flags TEXT DEFAULT '{}',
  dispatch_text TEXT,
  approved INTEGER DEFAULT 0,
  approved_at TEXT,
  sent_at TEXT
);

CREATE TABLE IF NOT EXISTS schedule_proposals (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  crew_key TEXT NOT NULL,
  job_number TEXT,
  job_name TEXT,
  reasoning TEXT,
  confidence TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS learned_phrases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phrase TEXT NOT NULL,
  intent TEXT NOT NULL,
  learned_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  last_used_at TEXT,
  revoked INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS login_nonces (
  nonce TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  used INTEGER DEFAULT 0
);
`;
```

- [ ] **Step 5: Create `src/db/migrations.ts`**

```typescript
import { getDb } from './client.js';
import { SCHEMA } from './schema.js';

export function runMigrations(): void {
  const db = getDb();
  db.exec(SCHEMA);
}
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npm test tests/db/migrations.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/db/ tests/db/
git commit -m "feat: add SQLite client, schema, and migrations"
```

---

### Task 3: Security Middleware

**Files:**
- Create: `src/middleware/rateLimit.ts`
- Create: `src/middleware/validate.ts`
- Create: `src/middleware/auth.ts`
- Create: `tests/middleware/rateLimit.test.ts`
- Create: `tests/middleware/validate.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/middleware/rateLimit.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRateLimiter } from '../../src/middleware/rateLimit.js';

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('allows requests under the limit', () => {
    const limiter = createRateLimiter({ maxRequests: 3, windowMs: 60_000 });
    expect(limiter('192.168.1.1')).toBe(true);
    expect(limiter('192.168.1.1')).toBe(true);
    expect(limiter('192.168.1.1')).toBe(true);
  });

  it('blocks requests over the limit', () => {
    const limiter = createRateLimiter({ maxRequests: 2, windowMs: 60_000 });
    limiter('192.168.1.1');
    limiter('192.168.1.1');
    expect(limiter('192.168.1.1')).toBe(false);
  });

  it('allows requests again after window expires', () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: 60_000 });
    limiter('192.168.1.1');
    expect(limiter('192.168.1.1')).toBe(false);
    vi.advanceTimersByTime(61_000);
    expect(limiter('192.168.1.1')).toBe(true);
  });

  it('tracks IPs independently', () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: 60_000 });
    expect(limiter('10.0.0.1')).toBe(true);
    expect(limiter('10.0.0.2')).toBe(true);
    expect(limiter('10.0.0.1')).toBe(false);
  });
});
```

Create `tests/middleware/validate.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { parseBody, parseParams } from '../../src/middleware/validate.js';

describe('parseBody', () => {
  const schema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

  it('returns parsed data when valid', () => {
    const result = parseBody(schema, { date: '2026-05-12' });
    expect(result).toEqual({ ok: true, data: { date: '2026-05-12' } });
  });

  it('returns error when invalid', () => {
    const result = parseBody(schema, { date: 'not-a-date' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('date');
  });

  it('returns error when field missing', () => {
    const result = parseBody(schema, {});
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test tests/middleware/
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/middleware/rateLimit.ts`**

```typescript
interface RateLimitOptions {
  maxRequests: number;
  windowMs: number;
}

interface BucketEntry {
  count: number;
  resetAt: number;
}

export function createRateLimiter(opts: RateLimitOptions): (ip: string) => boolean {
  const buckets = new Map<string, BucketEntry>();

  return function check(ip: string): boolean {
    const now = Date.now();
    const entry = buckets.get(ip);

    if (!entry || now >= entry.resetAt) {
      buckets.set(ip, { count: 1, resetAt: now + opts.windowMs });
      return true;
    }

    if (entry.count >= opts.maxRequests) return false;
    entry.count++;
    return true;
  };
}

export const generalLimiter = createRateLimiter({ maxRequests: 60, windowMs: 60_000 });
export const loginLimiter = createRateLimiter({ maxRequests: 5, windowMs: 60_000 });
```

- [ ] **Step 4: Create `src/middleware/validate.ts`**

```typescript
import { z, ZodSchema } from 'zod';

type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function parseBody<T>(schema: ZodSchema<T>, body: unknown): ParseResult<T> {
  const result = schema.safeParse(body);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ') };
}

export function parseParams<T>(schema: ZodSchema<T>, params: unknown): ParseResult<T> {
  return parseBody(schema, params);
}

export const dateParam = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD');
export const crewKeyParam = z.string().min(1).max(50).regex(/^[a-z0-9_-]+$/);
```

- [ ] **Step 5: Create `src/middleware/auth.ts`**

```typescript
import jwt from 'jsonwebtoken';
import type { Role } from '../types/index.js';
import { getDb } from '../db/client.js';

const JWT_SECRET = process.env.JWT_SECRET!;

export interface TokenPayload {
  role: Role;
  sessionToken: string;
  iat?: number;
  exp?: number;
}

export function signToken(payload: Omit<TokenPayload, 'iat' | 'exp'>, expiresIn?: string): string {
  return jwt.sign(payload, JWT_SECRET, expiresIn ? { expiresIn } : {});
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export function extractTokenFromRequest(
  cookies: string | undefined,
  authHeader: string | undefined
): string | null {
  if (cookies) {
    const match = cookies.match(/(?:^|;\s*)ibp_token=([^;]+)/);
    if (match) return match[1];
  }
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  return null;
}

export function validateSession(token: string): TokenPayload | null {
  const payload = verifyToken(token);
  if (!payload) return null;

  const db = getDb();
  const session = db
    .prepare('SELECT revoked, expires_at FROM sessions WHERE token = ?')
    .get(payload.sessionToken) as { revoked: number; expires_at: string | null } | undefined;

  if (!session || session.revoked) return null;
  if (session.expires_at && new Date(session.expires_at) < new Date()) return null;

  db.prepare('UPDATE sessions SET last_used_at = ? WHERE token = ?').run(
    new Date().toISOString(),
    payload.sessionToken
  );

  return payload;
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm test tests/middleware/
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/middleware/ tests/middleware/
git commit -m "feat: add rate limiting, Zod validation helpers, and JWT auth middleware"
```

---

### Task 4: Startup Environment Validation

**Files:**
- Create: `src/server/validateEnv.ts`
- Create: `tests/server/validateEnv.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/server/validateEnv.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { validateEnv } from '../../src/server/validateEnv.js';

const REQUIRED = [
  'TELEGRAM_BOT_TOKEN', 'TELEGRAM_SCHEDULER_CHAT_ID',
  'MONDAY_API_KEY', 'ANTHROPIC_API_KEY', 'JWT_SECRET', 'PUBLIC_URL'
];

describe('validateEnv', () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    REQUIRED.forEach((k) => {
      saved[k] = process.env[k];
      process.env[k] = 'test-value';
    });
  });

  afterEach(() => {
    REQUIRED.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
  });

  it('passes when all required vars are set', () => {
    expect(() => validateEnv()).not.toThrow();
  });

  it('throws listing missing vars', () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.MONDAY_API_KEY;
    expect(() => validateEnv()).toThrow('TELEGRAM_BOT_TOKEN, MONDAY_API_KEY');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test tests/server/validateEnv.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/server/validateEnv.ts`**

```typescript
const REQUIRED_ENV_VARS = [
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_SCHEDULER_CHAT_ID',
  'MONDAY_API_KEY',
  'ANTHROPIC_API_KEY',
  'JWT_SECRET',
  'PUBLIC_URL',
] as const;

export function validateEnv(): void {
  const missing = REQUIRED_ENV_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Server cannot start. Missing required environment variables: ${missing.join(', ')}\n` +
      `Copy .env.example to .env and fill in all values.`
    );
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test tests/server/validateEnv.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/validateEnv.ts tests/server/
git commit -m "feat: validate required env vars on startup"
```

---

## Phase 2 — Core Module Migration (JS → TS + SQLite)
> **Milestone:** The full daily workflow (fetch → analyze → brief) runs in TypeScript against SQLite. All existing features preserved.

---

### Task 5: config.ts — Crew Profiles

**Files:**
- Create: `src/core/config.ts` (migrate from `src/config.mjs`)

- [ ] **Step 1: Create `src/core/config.ts`**

Migrate `src/config.mjs` to TypeScript. Key change: use the shared `CrewProfile` type.

```typescript
import type { CrewProfile } from '../types/index.js';

export const CREW_PROFILES: Record<string, CrewProfile> = {
  santiago: {
    key: 'santiago',
    displayName: 'Santiago (Pavers)',
    telegramGroupId: null,
    language: 'es',
    reliability: 'high',
    strengths: ['deck install', 'large jobs', 'gated communities'],
    cautions: [],
  },
  penna: {
    key: 'penna',
    displayName: 'Penna (Pavers, Detailed Jobs)',
    telegramGroupId: null,
    language: 'pt',
    reliability: 'high',
    strengths: ['detailed paver work', 'precision patterns'],
    cautions: ['do not assign large slab installs', 'no gooseneck jobs'],
  },
  waype: {
    key: 'waype',
    displayName: 'Waype (Pavers)',
    telegramGroupId: null,
    language: 'pt',
    reliability: 'high',
    strengths: ['deck install', 'large jobs', 'gooseneck capable'],
    cautions: [],
  },
  marcelao: {
    key: 'marcelao',
    displayName: 'Marcelao (Pavers Big Jobs)',
    telegramGroupId: null,
    language: 'pt',
    reliability: 'medium',
    strengths: ['big slab jobs', 'gooseneck capable', 'large installs'],
    cautions: [],
  },
  fausto: {
    key: 'fausto',
    displayName: 'Fausto (Coping)',
    telegramGroupId: null,
    language: 'pt',
    reliability: 'high',
    strengths: ['coping', 'pool edge work'],
    cautions: ['coping and tile only'],
  },
  toby: {
    key: 'toby',
    displayName: 'Toby (Coping and Tile)',
    telegramGroupId: null,
    language: 'en',
    reliability: 'high',
    strengths: ['coping', 'tile', 'shower', 'backsplash'],
    cautions: ['coping and tile only'],
  },
  wanderson: {
    key: 'wanderson',
    displayName: 'Wanderson (Paver Detailed Jobs)',
    telegramGroupId: null,
    language: 'pt',
    reliability: 'medium',
    strengths: ['detailed paver work'],
    cautions: [],
  },
  gilberto: {
    key: 'gilberto',
    displayName: 'Gilberto',
    telegramGroupId: null,
    language: 'pt',
    reliability: 'medium',
    strengths: ['general paver work'],
    cautions: [],
  },
};

export const DAY_COLUMNS = {
  leftSection: ['Monday', 'Tuesday', 'Wednesday'],
  rightSection: ['Thursday', 'Friday', 'Saturday', 'Sunday'],
};

export const JOB_TYPE_KEYWORDS: Record<string, string[]> = {
  'coping': ['coping'],
  'tile': ['tile', 'backsplash', 'shower'],
  'sealer': ['sealer', 'seal'],
  'turf': ['turf', 'artificial grass'],
  'deck': ['deck', 'paver', 'pavers'],
  'repair': ['repair', 'turndown', 'footer'],
  'concrete': ['concrete'],
  'wall': ['wall', 'retaining'],
};

export function inferJobType(text: string): string[] {
  const lower = text.toLowerCase();
  return Object.entries(JOB_TYPE_KEYWORDS)
    .filter(([, keywords]) => keywords.some((kw) => lower.includes(kw)))
    .map(([type]) => type);
}

export const WAREHOUSE_ADDRESS = '5224 Goddard Ave, Orlando FL 32822';
export const WAREHOUSE_GATE_CODE = '04271';
export const APOPKA_DUMP_CLOSE = '3:45 PM';
```

- [ ] **Step 2: Verify it compiles**

```bash
npm run build 2>&1 | grep -E "error|warning" | head -20
```

Expected: No errors for `src/core/config.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/core/config.ts
git commit -m "feat: migrate config to TypeScript with CrewProfile types"
```

---

### Task 6: scheduleParser.ts + fetchSchedule.ts

**Files:**
- Create: `src/core/scheduleParser.ts` (migrate from `src/scheduleParser.mjs`)
- Create: `src/core/fetchSchedule.ts` (migrate from `src/fetchSchedule.mjs`)
- Create: `tests/core/scheduleParser.test.ts`

- [ ] **Step 1: Define ScheduleRecord type in `src/types/index.ts`**

Add to the existing `src/types/index.ts`:

```typescript
export interface ScheduleRecord {
  weekName: string;
  gid: string;
  section: string;
  date: string;
  dayName: string;
  shortDay: string;
  dayIndex: number;
  crew: string;
  crewKey: string;
  crewCategory: string;
  reliability: string;
  rowNumber: number;
  columnNumber: number;
  rawAssignment: string;
  assignment: string;
  status: 'assigned' | 'blank' | 'off' | 'placeholder';
  jobNumbers: string[];
  clientTypes: string[];
  inferredJobTypes: string[];
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/core/scheduleParser.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeAssignment, extractJobNumbers, classifyStatus } from '../../src/core/scheduleParser.js';

describe('normalizeAssignment', () => {
  it('trims whitespace', () => {
    expect(normalizeAssignment('  DECK INSTALL  ')).toBe('DECK INSTALL');
  });

  it('returns empty string for blank cell', () => {
    expect(normalizeAssignment('')).toBe('');
    expect(normalizeAssignment('   ')).toBe('');
  });
});

describe('extractJobNumbers', () => {
  it('extracts 6-digit job numbers', () => {
    expect(extractJobNumbers('GILROY #600049 - DECK')).toEqual(['600049']);
  });

  it('extracts multiple job numbers', () => {
    expect(extractJobNumbers('#170859 / #170810')).toEqual(['170859', '170810']);
  });

  it('returns empty array when none found', () => {
    expect(extractJobNumbers('OFF')).toEqual([]);
  });
});

describe('classifyStatus', () => {
  it('classifies blank as blank', () => {
    expect(classifyStatus('')).toBe('blank');
  });

  it('classifies OFF as off', () => {
    expect(classifyStatus('OFF')).toBe('off');
    expect(classifyStatus('off')).toBe('off');
  });

  it('classifies filled cell as assigned', () => {
    expect(classifyStatus('GILROY #600049 - DECK')).toBe('assigned');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npm test tests/core/scheduleParser.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Create `src/core/scheduleParser.ts`**

Migrate `src/scheduleParser.mjs` to TypeScript, exporting the three functions used in tests plus the main parser. The key exports:

```typescript
import type { ScheduleRecord } from '../types/index.js';
import { CREW_PROFILES, inferJobType } from './config.js';

export function normalizeAssignment(raw: string): string {
  return raw.trim();
}

export function extractJobNumbers(text: string): string[] {
  return Array.from(text.matchAll(/#(\d{5,6})/g), (m) => m[1]);
}

export function classifyStatus(assignment: string): ScheduleRecord['status'] {
  if (!assignment) return 'blank';
  if (/^off$/i.test(assignment)) return 'off';
  return 'assigned';
}

export function parseScheduleCsv(
  csv: string,
  gid: string,
  weekName: string,
  weekStartDate: string
): ScheduleRecord[] {
  // Full CSV parsing logic migrated from src/scheduleParser.mjs
  // Parses rows, maps left-column crews to Mon-Wed, right-column crews to Thu-Sun
  // Returns array of ScheduleRecord
  const records: ScheduleRecord[] = [];
  const lines = csv.split('\n');
  // ... (full migration of existing CSV parsing logic)
  return records;
}
```

> Note to implementer: Copy the full CSV parsing logic verbatim from `src/scheduleParser.mjs`, replacing `export` with TypeScript-typed exports and adding the return type annotation `ScheduleRecord[]`.

- [ ] **Step 5: Create `src/core/fetchSchedule.ts`**

Migrate `src/fetchSchedule.mjs` to TypeScript. Same logic, add return types:

```typescript
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import { parseScheduleCsv } from './scheduleParser.js';
import type { ScheduleRecord } from '../types/index.js';

const SHEET_ID = process.env.SCHEDULE_SHEET_ID ?? '1516H1ZQImJ4arKe6wYeFMqFw6V_-697QM-HiBs7qOY8';
const RAW_DIR = 'data/raw';

export async function fetchSchedule(): Promise<ScheduleRecord[]> {
  // Migrate full logic from src/fetchSchedule.mjs
  // Same CSV fetch, tab discovery, caching to data/raw/
  // Returns ScheduleRecord[]
  mkdirSync(RAW_DIR, { recursive: true });
  // ... full migration
  return [];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  fetchSchedule().then((records) => {
    writeFileSync('data/schedule-records.json', JSON.stringify(records, null, 2));
    console.log(`Wrote ${records.length} records`);
  });
}
```

> Note to implementer: Copy full fetch + parse + cache logic from `src/fetchSchedule.mjs`.

- [ ] **Step 6: Run tests to verify they pass**

```bash
npm test tests/core/scheduleParser.test.ts
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/scheduleParser.ts src/core/fetchSchedule.ts tests/core/
git commit -m "feat: migrate scheduleParser and fetchSchedule to TypeScript"
```

---

### Task 7: Monday.com Modules

**Files:**
- Create: `src/monday/api.ts` (migrate from `src/monday/api.mjs`)
- Create: `src/monday/fetchJobs.ts` (migrate from `src/monday/fetchJobs.mjs`)
- Create: `src/monday/refreshMonday.ts` (NEW — was missing)
- Create: `src/monday/addUpdate.ts` (migrate)
- Create: `src/monday/uploadPhoto.ts` (migrate)
- Create: `tests/monday/refreshMonday.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/monday/refreshMonday.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { upsertJobsToDb } from '../../src/monday/refreshMonday.js';

vi.mock('../../src/db/client.js', () => ({
  getDb: () => ({
    prepare: vi.fn().mockReturnValue({
      run: vi.fn(),
    }),
  }),
}));

describe('upsertJobsToDb', () => {
  it('calls db.prepare with upsert SQL for each job', () => {
    const { getDb } = require('../../src/db/client.js');
    const mockRun = vi.fn();
    getDb.mockReturnValue({
      prepare: vi.fn().mockReturnValue({ run: mockRun }),
    });

    upsertJobsToDb([
      {
        id: 'item-1',
        jobNumber: '600049',
        itemName: 'GILROY #600049',
        customerName: 'GILROY',
        address: '123 Main St',
        city: 'Orlando',
        clientType: 'builder',
        jobType: 'deck',
        status: 'NEED_TO_SCHEDULE',
        materialStatus: 'ready',
        materialReady: true,
        equipmentNeeded: [],
        trailerNeeded: ['flat'],
        driverNeeded: true,
        logisticsStatus: null,
        promisedDate: null,
        notes: null,
        syncedAt: '2026-05-12T06:00:00Z',
      },
    ]);

    expect(mockRun).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test tests/monday/refreshMonday.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/monday/api.ts`**

```typescript
const MONDAY_API_URL = 'https://api.monday.com/v2';

export async function mondayQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const apiKey = process.env.MONDAY_API_KEY;
  if (!apiKey) throw new Error('MONDAY_API_KEY not set');

  const res = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) throw new Error(`Monday API HTTP ${res.status}`);

  const json = await res.json() as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(`Monday API error: ${json.errors[0].message}`);
  if (!json.data) throw new Error('Monday API returned no data');
  return json.data;
}
```

- [ ] **Step 4: Create `src/monday/fetchJobs.ts`**

Migrate `src/monday/fetchJobs.mjs` to TypeScript, returning `Job[]`:

```typescript
import { mondayQuery } from './api.js';
import type { Job } from '../types/index.js';

const BOARD_ID = process.env.MONDAY_BOARD_ID ?? '2214820863';

interface MondayItem {
  id: string;
  name: string;
  column_values: Array<{ id: string; text: string; value: string }>;
}

export async function fetchJobsFromMonday(): Promise<Job[]> {
  // Migrate full GraphQL query + normalization from src/monday/fetchJobs.mjs
  // Returns Job[] with all fields normalized
  const data = await mondayQuery<{ boards: Array<{ items_page: { items: MondayItem[] } }> }>(
    `query ($boardId: ID!) {
      boards(ids: [$boardId]) {
        items_page(limit: 200) {
          items {
            id name
            column_values {
              id text value
            }
          }
        }
      }
    }`,
    { boardId: BOARD_ID }
  );

  return data.boards[0].items_page.items.map(normalizeItem);
}

function normalizeItem(item: MondayItem): Job {
  const col = (id: string) => item.column_values.find((c) => c.id === id)?.text ?? null;
  return {
    id: item.id,
    jobNumber: item.name.match(/#(\d{5,6})/)?.[1] ?? item.id,
    itemName: item.name,
    customerName: item.name.replace(/#\d+/, '').trim() || null,
    address: col('location'),
    city: null,
    clientType: null,
    jobType: col('men__desplegable'),
    status: col('estado3'),
    materialStatus: col('dup__of_coping_material'),
    materialReady: deriveReadiness(col('dup__of_coping_material')),
    equipmentNeeded: [],
    trailerNeeded: [],
    driverNeeded: false,
    logisticsStatus: col('dup__of_log_status'),
    promisedDate: col('date__1'),
    notes: col('text25'),
    syncedAt: new Date().toISOString(),
  };
}

function deriveReadiness(status: string | null): boolean | null {
  if (!status) return null;
  if (/ready|confirmed/i.test(status)) return true;
  if (/waiting|pending|missing/i.test(status)) return false;
  return null;
}
```

- [ ] **Step 5: Create `src/monday/refreshMonday.ts`**

```typescript
import { getDb } from '../db/client.js';
import { fetchJobsFromMonday } from './fetchJobs.js';
import type { Job } from '../types/index.js';

export function upsertJobsToDb(jobs: Job[]): void {
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO jobs (
      id, job_number, item_name, customer_name, address, city, client_type,
      job_type, status, material_status, material_ready, equipment_needed,
      trailer_needed, driver_needed, logistics_status, promised_date, notes, synced_at
    ) VALUES (
      @id, @jobNumber, @itemName, @customerName, @address, @city, @clientType,
      @jobType, @status, @materialStatus, @materialReady, @equipmentNeeded,
      @trailerNeeded, @driverNeeded, @logisticsStatus, @promisedDate, @notes, @syncedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      item_name = excluded.item_name,
      status = excluded.status,
      material_status = excluded.material_status,
      material_ready = excluded.material_ready,
      logistics_status = excluded.logistics_status,
      notes = excluded.notes,
      synced_at = excluded.synced_at
  `);

  const upsertMany = db.transaction((jobs: Job[]) => {
    for (const job of jobs) {
      upsert.run({
        ...job,
        materialReady: job.materialReady === null ? null : job.materialReady ? 1 : 0,
        driverNeeded: job.driverNeeded ? 1 : 0,
        equipmentNeeded: JSON.stringify(job.equipmentNeeded),
        trailerNeeded: JSON.stringify(job.trailerNeeded),
      });
    }
  });

  upsertMany(jobs);
}

export async function refreshMonday(): Promise<void> {
  console.log('[refreshMonday] Fetching jobs from Monday.com...');
  const jobs = await fetchJobsFromMonday();
  upsertJobsToDb(jobs);
  console.log(`[refreshMonday] Upserted ${jobs.length} jobs into SQLite`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  refreshMonday();
}
```

- [ ] **Step 6: Migrate `src/monday/addUpdate.ts` and `src/monday/uploadPhoto.ts`**

Migrate both from their `.mjs` equivalents, adding TypeScript types. The logic is unchanged — copy verbatim and add return types and parameter types.

`addUpdate.ts` signature:
```typescript
export async function addUpdate(itemId: string, body: string): Promise<void>
```

`uploadPhoto.ts` signature:
```typescript
export async function uploadPhotoToMonday(itemId: string, filePath: string, filename: string): Promise<string>
```

- [ ] **Step 7: Run test to verify it passes**

```bash
npm test tests/monday/refreshMonday.test.ts
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/monday/ tests/monday/
git commit -m "feat: migrate Monday.com modules to TypeScript, add refreshMonday auto-sync"
```

---

### Task 8: generateBriefs.ts + Seeds Existing Crews into DB

**Files:**
- Create: `src/core/generateBriefs.ts` (migrate + write to SQLite)
- Create: `src/db/seedCrews.ts`

- [ ] **Step 1: Create `src/db/seedCrews.ts`**

This reads `data/crew-telegram-groups.json` (existing file) and inserts into the `crews` table on first run:

```typescript
import { getDb } from './client.js';
import { readFileSync, existsSync } from 'fs';
import { CREW_PROFILES } from '../core/config.js';

export function seedCrews(): void {
  const db = getDb();
  const count = (db.prepare('SELECT COUNT(*) as c FROM crews').get() as { c: number }).c;
  if (count > 0) return; // already seeded

  let telegramGroups: Record<string, { groupId: string; language: string }> = {};
  if (existsSync('data/crew-telegram-groups.json')) {
    telegramGroups = JSON.parse(readFileSync('data/crew-telegram-groups.json', 'utf-8'));
  }

  const insert = db.prepare(`
    INSERT OR IGNORE INTO crews (key, display_name, telegram_group_id, language, reliability, strengths, cautions)
    VALUES (@key, @displayName, @telegramGroupId, @language, @reliability, @strengths, @cautions)
  `);

  const insertMany = db.transaction(() => {
    for (const profile of Object.values(CREW_PROFILES)) {
      const tg = telegramGroups[profile.key];
      insert.run({
        key: profile.key,
        displayName: profile.displayName,
        telegramGroupId: tg?.groupId ?? null,
        language: tg?.language ?? profile.language,
        reliability: profile.reliability,
        strengths: JSON.stringify(profile.strengths),
        cautions: JSON.stringify(profile.cautions),
      });
    }
  });

  insertMany();
  console.log('[seedCrews] Seeded crew profiles into SQLite');
}
```

- [ ] **Step 2: Migrate `generateBriefs.ts`**

Migrate `src/generateBriefs.mjs` to TypeScript. Key change: write output to `brief_jobs` table in SQLite instead of a JSON file.

```typescript
import { getDb } from '../db/client.js';
import type { BriefJob } from '../types/index.js';
import { readFileSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';

export async function generateBriefs(date: string): Promise<void> {
  const db = getDb();

  // Read schedule records (still from JSON during transition, will move to DB in later task)
  const records = existsSync('data/schedule-records.json')
    ? JSON.parse(readFileSync('data/schedule-records.json', 'utf-8'))
    : [];

  // Read jobs from SQLite
  const jobs = db.prepare('SELECT * FROM jobs').all() as Array<Record<string, unknown>>;

  // Insert brief header
  db.prepare(`
    INSERT OR REPLACE INTO briefs (date, generated_at, approved, approved_at, approved_by)
    VALUES (?, ?, 0, NULL, NULL)
  `).run(date, new Date().toISOString());

  // Build brief_jobs from schedule records filtered to date
  const dayRecords = records.filter((r: { date: string }) => r.date === date);

  const insertJob = db.prepare(`
    INSERT OR REPLACE INTO brief_jobs (
      id, brief_date, crew_key, job_number, job_name, address, gate_code,
      supervisor, trailer_type, tasks, materials, next_stop, risk_flags,
      dispatch_text, check_in_status, last_check_in, approved, sent_at, annotations
    ) VALUES (
      @id, @briefDate, @crewKey, @jobNumber, @jobName, @address, @gateCode,
      @supervisor, @trailerType, @tasks, @materials, @nextStop, @riskFlags,
      @dispatchText, NULL, NULL, 0, NULL, NULL
    )
  `);

  db.transaction(() => {
    for (const record of dayRecords) {
      const job = jobs.find((j) => record.jobNumbers?.includes(j.job_number));
      insertJob.run({
        id: randomUUID(),
        briefDate: date,
        crewKey: record.crewKey,
        jobNumber: record.jobNumbers?.[0] ?? null,
        jobName: record.assignment ?? record.rawAssignment,
        address: job?.address ?? null,
        gateCode: null, // populated from Monday or manual entry
        supervisor: null,
        trailerType: job ? JSON.parse(job.trailer_needed as string)[0] ?? null : null,
        tasks: JSON.stringify([record.assignment]),
        materials: JSON.stringify([]),
        nextStop: 'Warehouse',
        riskFlags: JSON.stringify(buildRiskFlags(job)),
        dispatchText: buildDispatchText(record, job),
      });
    }
  })();
}

function buildRiskFlags(job: Record<string, unknown> | undefined): string[] {
  const flags: string[] = [];
  if (!job) flags.push('⚠️ No Monday job match found');
  if (job && !job.material_ready) flags.push('⚠️ Material not confirmed ready');
  if (job && job.driver_needed && !job.logistics_status) flags.push('⚠️ Driver not assigned');
  return flags;
}

function buildDispatchText(record: Record<string, unknown>, job: Record<string, unknown> | undefined): string {
  const name = record.assignment as string;
  const address = job?.address as string ?? 'Address TBD';
  return `*${name}*\n\nADDRESS: ${address}\nGATE CODE: NA\nTASK: See brief\nNEXT: Warehouse`;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/core/generateBriefs.ts src/db/seedCrews.ts
git commit -m "feat: migrate generateBriefs to TypeScript, writes to SQLite"
```

---

## Phase 3 — Grammy Telegram Bot
> **Milestone:** Crew groups receive dispatch messages with inline keyboards. Old polling bot is removed.

---

### Task 9: Grammy Bot Instance

**Files:**
- Create: `src/telegram/grammy.ts`
- Delete: `src/telegram/bot.mjs`, `src/telegram/poller.mjs`

- [ ] **Step 1: Create `src/telegram/grammy.ts`**

```typescript
import { Bot } from 'grammy';

let botInstance: Bot | null = null;

export function getBot(): Bot {
  if (!botInstance) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');
    botInstance = new Bot(token);
  }
  return botInstance;
}

export async function startBot(): Promise<void> {
  const bot = getBot();
  const publicUrl = process.env.PUBLIC_URL;

  if (publicUrl) {
    await bot.api.setWebhook(`${publicUrl}/webhook/telegram`, {
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',
    });
    console.log(`[telegram] Webhook set: ${publicUrl}/webhook/telegram`);
  } else {
    void bot.start({ onStart: () => console.log('[telegram] Long-polling started') });
    console.log('[telegram] Running in polling mode (no PUBLIC_URL set)');
  }
}

export async function stopBot(): Promise<void> {
  if (botInstance) {
    await botInstance.stop();
    botInstance = null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/telegram/grammy.ts
git rm src/telegram/bot.mjs src/telegram/poller.mjs
git commit -m "feat: replace raw Telegram polling with Grammy bot instance"
```

---

### Task 10: Crew Inline Keyboards — messageHandler.ts

**Files:**
- Create: `src/telegram/messageHandler.ts` (replaces `.mjs` version)
- Create: `tests/telegram/messageHandler.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/telegram/messageHandler.test.ts
import { describe, it, expect } from 'vitest';
import { detectIntent, INTENTS } from '../../src/telegram/messageHandler.js';

describe('detectIntent', () => {
  it('detects "done" from English', () => {
    expect(detectIntent('job is done')).toBe('done');
    expect(detectIntent('finished')).toBe('done');
  });

  it('detects "done" from Spanish', () => {
    expect(detectIntent('terminamos')).toBe('done');
    expect(detectIntent('listo')).toBe('done');
  });

  it('detects "done" from Portuguese', () => {
    expect(detectIntent('terminamos')).toBe('done');
    expect(detectIntent('acabou')).toBe('done');
  });

  it('detects "arrived" intent', () => {
    expect(detectIntent('chegamos')).toBe('arrived');
    expect(detectIntent('we arrived')).toBe('arrived');
  });

  it('detects "issue" intent', () => {
    expect(detectIntent('problema')).toBe('issue');
    expect(detectIntent('there is a problem')).toBe('issue');
  });

  it('returns null for unknown messages', () => {
    expect(detectIntent('what time is the game')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test tests/telegram/messageHandler.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/telegram/messageHandler.ts`**

```typescript
import { getBot } from './grammy.js';
import { getDb } from '../db/client.js';
import { addUpdate } from '../monday/addUpdate.js';
import type { Context } from 'grammy';

export const INTENTS = {
  done: [/\b(done|finished|complete|terminamos|terminei|listo|acabou|concluído)\b/i],
  arrived: [/\b(arrived|chegamos|chegou|llegamos|llegué|we arrived|on site)\b/i],
  working: [/\b(working|trabalhando|trabajando|started|começamos|empezamos)\b/i],
  issue: [/\b(problem|problema|issue|trouble|blocked|stuck|ajuda|ayuda|help)\b/i],
  leaving: [/\b(leaving|saindo|saliendo|going to next|indo para)\b/i],
} as const;

export type Intent = keyof typeof INTENTS;

export function detectIntent(text: string): Intent | null {
  for (const [intent, patterns] of Object.entries(INTENTS)) {
    if (patterns.some((p) => p.test(text))) return intent as Intent;
  }
  // Check learned phrases from DB
  const db = getDb();
  const learned = db.prepare('SELECT intent FROM learned_phrases WHERE ? LIKE phrase').get(text.toLowerCase()) as
    | { intent: string }
    | undefined;
  return (learned?.intent as Intent) ?? null;
}

export function buildCrewJobKeyboard(jobId: string) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Job Done', callback_data: `done:${jobId}` },
        { text: '⚠️ Issue', callback_data: `issue:${jobId}` },
      ],
    ],
  };
}

export async function handleCallbackQuery(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const [action, jobId] = data.split(':');
  const db = getDb();

  if (action === 'done') {
    db.prepare('UPDATE brief_jobs SET check_in_status = ?, last_check_in = ? WHERE id = ?').run(
      'done',
      new Date().toISOString(),
      jobId
    );
    const job = db.prepare('SELECT * FROM brief_jobs WHERE id = ?').get(jobId) as
      | { job_number: string; job_name: string }
      | undefined;
    if (job?.job_number) {
      const mondayItem = db
        .prepare('SELECT id FROM jobs WHERE job_number = ?')
        .get(job.job_number) as { id: string } | undefined;
      if (mondayItem) await addUpdate(mondayItem.id, `✅ Crew marked job *${job.job_name}* as complete`);
    }
    await ctx.answerCallbackQuery('Marked as done ✅');
    await ctx.reply('Got it — job marked as complete ✅');
  }

  if (action === 'issue') {
    await ctx.answerCallbackQuery();
    await ctx.reply('Please describe the issue and we will notify the scheduler right away.');
    // Next text message from this chat flagged as issue (handled in text handler)
  }
}

export async function handleTextMessage(ctx: Context): Promise<void> {
  const text = ctx.message?.text;
  const chatId = String(ctx.chat?.id);
  if (!text || !chatId) return;

  const intent = detectIntent(text);
  const db = getDb();
  const crew = db.prepare('SELECT key, display_name FROM crews WHERE telegram_group_id = ?').get(chatId) as
    | { key: string; display_name: string }
    | undefined;

  if (!crew) return; // Unknown group — ignore

  if (!intent) {
    db.prepare(`
      INSERT INTO flags (id, date, timestamp, chat_id, crew_key, sender, text)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      `flag-${Date.now()}`,
      new Date().toISOString().slice(0, 10),
      new Date().toISOString(),
      chatId,
      crew.key,
      ctx.message?.from?.first_name ?? 'Unknown',
      text
    );
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test tests/telegram/messageHandler.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/telegram/messageHandler.ts tests/telegram/
git commit -m "feat: add Grammy message handler with inline keyboard callbacks and intent detection"
```

---

### Task 11: dispatcher.ts + photoHandler.ts

**Files:**
- Create: `src/telegram/dispatcher.ts` (migrate + add inline keyboards)
- Create: `src/telegram/photoHandler.ts` (migrate to TypeScript)

- [ ] **Step 1: Create `src/telegram/dispatcher.ts`**

```typescript
import { getBot } from './grammy.js';
import { getDb } from '../db/client.js';
import { buildCrewJobKeyboard } from './messageHandler.js';

export async function dispatchBriefToCrews(date: string): Promise<void> {
  const db = getDb();
  const bot = getBot();

  const crews = db
    .prepare('SELECT DISTINCT crew_key FROM brief_jobs WHERE brief_date = ? AND approved = 1')
    .all(date) as Array<{ crew_key: string }>;

  for (const { crew_key } of crews) {
    const crew = db.prepare('SELECT * FROM crews WHERE key = ?').get(crew_key) as
      | { telegram_group_id: string | null; display_name: string }
      | undefined;

    if (!crew?.telegram_group_id) {
      console.warn(`[dispatcher] No Telegram group for crew: ${crew_key}`);
      continue;
    }

    const jobs = db
      .prepare('SELECT * FROM brief_jobs WHERE brief_date = ? AND crew_key = ? AND approved = 1')
      .all(date, crew_key) as Array<Record<string, unknown>>;

    for (const job of jobs) {
      await bot.api.sendMessage(crew.telegram_group_id, job.dispatch_text as string, {
        parse_mode: 'Markdown',
        reply_markup: buildCrewJobKeyboard(job.id as string),
      });

      db.prepare('UPDATE brief_jobs SET sent_at = ? WHERE id = ?').run(
        new Date().toISOString(),
        job.id
      );

      await new Promise((r) => setTimeout(r, 300)); // avoid Telegram rate limit
    }
  }
}
```

- [ ] **Step 2: Migrate `src/telegram/photoHandler.ts`**

Copy logic from `src/telegram/photoHandler.mjs`, add TypeScript types. Key type changes:

```typescript
import type { Context } from 'grammy';

export async function handlePhotoMessage(ctx: Context): Promise<void> {
  const photo = ctx.message?.photo;
  if (!photo) return;
  // ... migrate full logic from photoHandler.mjs
  // getBot() replaces bot.getFileUrl()
  // All file paths get proper string types
}
```

- [ ] **Step 3: Commit**

```bash
git add src/telegram/dispatcher.ts src/telegram/photoHandler.ts
git commit -m "feat: migrate dispatcher and photoHandler to TypeScript with Grammy"
```

---

## Phase 4 — Scheduling Agent + Scheduler Bot
> **Milestone:** At 6 AM, Claude generates crew→job proposals and the scheduler gets a Telegram summary with Approve/Hold/Dashboard buttons.

---

### Task 12: schedulingAgent.ts

**Files:**
- Create: `src/agents/schedulingAgent.ts`
- Create: `tests/agents/schedulingAgent.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/agents/schedulingAgent.test.ts
import { describe, it, expect, vi } from 'vitest';
import { buildSchedulingPrompt } from '../../src/agents/schedulingAgent.js';

describe('buildSchedulingPrompt', () => {
  it('includes all job numbers in the prompt', () => {
    const prompt = buildSchedulingPrompt(
      [{ jobNumber: '600049', itemName: 'GILROY #600049', jobType: 'deck', address: '123 Main St', materialReady: true } as any],
      [{ key: 'santiago', displayName: 'Santiago', strengths: ['deck install'], cautions: [], reliability: 'high' } as any],
      '2026-05-13'
    );
    expect(prompt).toContain('600049');
    expect(prompt).toContain('santiago');
    expect(prompt).toContain('2026-05-13');
  });

  it('includes scheduling rules in the prompt', () => {
    const prompt = buildSchedulingPrompt([], [], '2026-05-13');
    expect(prompt).toContain('coping');
    expect(prompt).toContain('Toby');
    expect(prompt).toContain('material_ready');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test tests/agents/schedulingAgent.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/agents/schedulingAgent.ts`**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { getDb } from '../db/client.js';
import { CREW_PROFILES } from '../core/config.js';
import type { Job, CrewProfile, ScheduleProposal } from '../types/index.js';
import { randomUUID } from 'crypto';

const client = new Anthropic();

export function buildSchedulingPrompt(jobs: Job[], crews: CrewProfile[], date: string): string {
  return `You are a scheduling assistant for IBP Group, a paver and pool-deck construction company in Florida.

Today's date: ${date}

## Jobs available to schedule (material confirmed ready)
${jobs.map((j) => `- #${j.jobNumber} | ${j.itemName} | Type: ${j.jobType ?? 'unknown'} | Address: ${j.address ?? 'TBD'} | Trailers: ${j.trailerNeeded.join(', ') || 'none'}`).join('\n')}

## Available crews
${crews.map((c) => `- ${c.key} (${c.displayName}) | Reliability: ${c.reliability} | Skills: ${c.strengths.join(', ')} | Cautions: ${c.cautions.join(', ') || 'none'}`).join('\n')}

## Scheduling rules (MUST follow)
1. Coping and tile jobs → ONLY assign to Toby or Fausto
2. Big slab / gooseneck jobs → prefer Marcelao or Waype
3. Penna is detail-work only — do NOT assign large deck installs
4. Do NOT propose a job if material_ready is false
5. Jobs in gated communities → prefer high-reliability crews
6. Flag jobs with no gate code as confidence: low
7. Never assign two crews to the same job on the same day

## Output format
Return a JSON array with one object per crew assignment:
[
  {
    "crewKey": "santiago",
    "jobNumber": "600049",
    "jobName": "GILROY #600049",
    "reasoning": "Santiago is a high-reliability deck crew. Job #600049 is a deck install with confirmed materials.",
    "confidence": "high"
  }
]

Only return the JSON array. No explanation outside it.`;
}

export async function generateProposals(date: string): Promise<ScheduleProposal[]> {
  const db = getDb();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const jobs = db
    .prepare("SELECT * FROM jobs WHERE status IN ('NEED_TO_SCHEDULE', 'SCHEDULED_JOB') AND material_ready = 1")
    .all() as Array<Record<string, unknown>>;

  const crews = Object.values(CREW_PROFILES);

  const prompt = buildSchedulingPrompt(
    jobs.map((j) => ({
      ...j,
      equipmentNeeded: JSON.parse(j.equipment_needed as string),
      trailerNeeded: JSON.parse(j.trailer_needed as string),
      materialReady: Boolean(j.material_ready),
    })) as Job[],
    crews,
    date
  );

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '[]';
  let parsed: Array<{
    crewKey: string;
    jobNumber: string;
    jobName: string;
    reasoning: string;
    confidence: 'high' | 'medium' | 'low';
  }>;

  try {
    parsed = JSON.parse(text);
  } catch {
    console.error('[schedulingAgent] Failed to parse Claude response:', text);
    return [];
  }

  const now = new Date().toISOString();
  const proposals: ScheduleProposal[] = parsed.map((p) => ({
    id: randomUUID(),
    date,
    generatedAt: now,
    crewKey: p.crewKey,
    jobNumber: p.jobNumber,
    jobName: p.jobName,
    reasoning: p.reasoning,
    confidence: p.confidence,
    status: 'pending',
  }));

  const insert = db.prepare(`
    INSERT OR REPLACE INTO schedule_proposals
    (id, date, generated_at, crew_key, job_number, job_name, reasoning, confidence, status)
    VALUES (@id, @date, @generatedAt, @crewKey, @jobNumber, @jobName, @reasoning, @confidence, @status)
  `);

  db.transaction(() => proposals.forEach((p) => insert.run(p)))();

  return proposals;
}
```

> Note: `@anthropic-ai/sdk` must be installed: `npm install @anthropic-ai/sdk`

- [ ] **Step 4: Run test to verify it passes**

```bash
npm install @anthropic-ai/sdk
npm test tests/agents/schedulingAgent.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/agents/schedulingAgent.ts tests/agents/
git commit -m "feat: add Claude-powered scheduling agent with crew-to-job proposal generation"
```

---

### Task 13: schedulerBot.ts — Morning Summary + Approval

**Files:**
- Create: `src/telegram/schedulerBot.ts`
- Create: `tests/telegram/schedulerBot.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/telegram/schedulerBot.test.ts
import { describe, it, expect } from 'vitest';
import { buildMorningSummary } from '../../src/telegram/schedulerBot.js';

describe('buildMorningSummary', () => {
  it('includes all crew assignments', () => {
    const text = buildMorningSummary('Tuesday, May 13', [
      { crewKey: 'santiago', jobName: 'Gilroy #600049', jobType: 'Deck', confidence: 'high' },
      { crewKey: 'toby', jobName: 'Favilla #280608', jobType: 'Coping', confidence: 'high' },
    ], 0);
    expect(text).toContain('SANTIAGO');
    expect(text).toContain('Gilroy #600049');
    expect(text).toContain('TOBY');
  });

  it('includes flag count when flags exist', () => {
    const text = buildMorningSummary('Tuesday, May 13', [], 3);
    expect(text).toContain('3');
    expect(text).toContain('flag');
  });

  it('omits flag line when no flags', () => {
    const text = buildMorningSummary('Tuesday, May 13', [], 0);
    expect(text).not.toContain('flag');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test tests/telegram/schedulerBot.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/telegram/schedulerBot.ts`**

```typescript
import { getBot } from './grammy.js';
import { getDb } from '../db/client.js';
import { dispatchBriefToCrews } from './dispatcher.js';

interface ProposalSummary {
  crewKey: string;
  jobName: string;
  jobType: string;
  confidence: 'high' | 'medium' | 'low';
}

export function buildMorningSummary(
  dateLabel: string,
  proposals: ProposalSummary[],
  flagCount: number
): string {
  const lines = [
    `📋 *Schedule Ready — ${dateLabel}*`,
    '',
    ...proposals.map((p) => {
      const badge = p.confidence === 'low' ? ' ⚠️' : '';
      return `${p.crewKey.toUpperCase()} → ${p.jobName} (${p.jobType})${badge}`;
    }),
  ];

  if (flagCount > 0) {
    lines.push('', `⚠️ ${flagCount} flag${flagCount === 1 ? '' : 's'} need attention`);
  }

  lines.push('', '_Auto-hold if no response by 7:00 AM_');
  return lines.join('\n');
}

export function buildApprovalKeyboard(date: string) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Approve & Send', callback_data: `schedule_approve:${date}` },
        { text: '✏️ Open Dashboard', callback_data: `schedule_dashboard:${date}` },
      ],
      [{ text: '🚫 Hold', callback_data: `schedule_hold:${date}` }],
    ],
  };
}

export async function sendMorningSummary(date: string): Promise<void> {
  const schedulerChatId = process.env.TELEGRAM_SCHEDULER_CHAT_ID;
  if (!schedulerChatId) throw new Error('TELEGRAM_SCHEDULER_CHAT_ID not set');

  const bot = getBot();
  const db = getDb();

  const proposals = db
    .prepare("SELECT crew_key, job_name, confidence FROM schedule_proposals WHERE date = ? AND status = 'pending'")
    .all(date) as Array<{ crew_key: string; job_name: string; confidence: 'high' | 'medium' | 'low' }>;

  const flagCount = (
    db
      .prepare("SELECT COUNT(*) as c FROM flags WHERE date = ? AND resolved = 0")
      .get(date) as { c: number }
  ).c;

  const dateLabel = new Date(date).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  const text = buildMorningSummary(
    dateLabel,
    proposals.map((p) => ({
      crewKey: p.crew_key,
      jobName: p.job_name,
      jobType: 'Job',
      confidence: p.confidence,
    })),
    flagCount
  );

  await bot.api.sendMessage(schedulerChatId, text, {
    parse_mode: 'Markdown',
    reply_markup: buildApprovalKeyboard(date),
  });
}

export async function handleSchedulerCallback(callbackData: string, date: string): Promise<void> {
  const db = getDb();
  const bot = getBot();
  const schedulerChatId = process.env.TELEGRAM_SCHEDULER_CHAT_ID!;

  if (callbackData.startsWith('schedule_approve:')) {
    db.prepare("UPDATE schedule_proposals SET status = 'approved' WHERE date = ?").run(date);
    db.prepare('UPDATE briefs SET approved = 1, approved_at = ?, approved_by = ? WHERE date = ?').run(
      new Date().toISOString(), 'telegram', date
    );
    db.prepare("UPDATE brief_jobs SET approved = 1 WHERE brief_date = ?").run(date);
    await dispatchBriefToCrews(date);
    await bot.api.sendMessage(schedulerChatId, '✅ Schedule approved and dispatched to all crews.');
  }

  if (callbackData.startsWith('schedule_hold:')) {
    await bot.api.sendMessage(schedulerChatId, '🚫 Schedule held. I\'ll remind you in 30 minutes.');
  }

  if (callbackData.startsWith('schedule_dashboard:')) {
    const publicUrl = process.env.PUBLIC_URL;
    await bot.api.sendMessage(
      schedulerChatId,
      `Open the dashboard to review:\n${publicUrl}/proposals?date=${date}`
    );
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test tests/telegram/schedulerBot.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/telegram/schedulerBot.ts tests/telegram/schedulerBot.test.ts
git commit -m "feat: add scheduler morning summary bot with Approve/Hold/Dashboard inline buttons"
```

---

## Phase 5 — Auth + Dashboard
> **Milestone:** Dashboard protected by JWT magic-link login. CEO/manager viewer links work. Mobile-responsive UI.

---

### Task 14: Auth Routes — Magic Link + Nonce Exchange

**Files:**
- Create: `src/server/routes/auth.ts`
- Create: `tests/server/routes/auth.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// tests/server/routes/auth.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateNonce, validateNonce } from '../../src/server/routes/auth.js';

vi.mock('../../src/db/client.js', () => ({
  getDb: () => ({
    prepare: vi.fn().mockReturnValue({
      run: vi.fn(),
      get: vi.fn(),
    }),
  }),
}));

describe('generateNonce', () => {
  it('returns a non-empty string', () => {
    const nonce = generateNonce();
    expect(typeof nonce).toBe('string');
    expect(nonce.length).toBeGreaterThan(8);
  });

  it('returns unique values', () => {
    expect(generateNonce()).not.toBe(generateNonce());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test tests/server/routes/auth.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/server/routes/auth.ts`**

```typescript
import { randomBytes } from 'crypto';
import { getDb } from '../../db/client.js';
import { signToken, validateSession, extractTokenFromRequest } from '../../middleware/auth.js';
import { getBot } from '../../telegram/grammy.js';
import type { IncomingMessage, ServerResponse } from 'http';

export function generateNonce(): string {
  return randomBytes(24).toString('hex');
}

export function storeNonce(nonce: string): void {
  const db = getDb();
  db.prepare('INSERT INTO login_nonces (nonce, created_at, used) VALUES (?, ?, 0)').run(
    nonce,
    new Date().toISOString()
  );
}

export function validateNonce(nonce: string): boolean {
  const db = getDb();
  const row = db.prepare(`
    SELECT nonce FROM login_nonces
    WHERE nonce = ? AND used = 0
      AND datetime(created_at) > datetime('now', '-10 minutes')
  `).get(nonce) as { nonce: string } | undefined;

  if (!row) return false;
  db.prepare('UPDATE login_nonces SET used = 1 WHERE nonce = ?').run(nonce);
  return true;
}

export async function handleInitLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const nonce = generateNonce();
  storeNonce(nonce);

  const botUsername = (await getBot().api.getMe()).username;
  const telegramUrl = `https://t.me/${botUsername}?start=login_${nonce}`;

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ telegramUrl }));
}

export function handleNonceExchange(req: IncomingMessage, res: ServerResponse, nonce: string): void {
  if (!validateNonce(nonce)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid or expired login link' }));
    return;
  }

  const db = getDb();
  const sessionToken = randomBytes(32).toString('hex');
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO sessions (token, role, label, created_at, expires_at, revoked)
    VALUES (?, 'scheduler', 'Scheduler', ?, ?, 0)
  `).run(sessionToken, now, expiresAt);

  const jwt = signToken({ role: 'scheduler', sessionToken }, '24h');
  const isProduction = process.env.NODE_ENV === 'production';

  res.writeHead(302, {
    'Set-Cookie': `ibp_token=${jwt}; HttpOnly; Path=/; SameSite=Strict${isProduction ? '; Secure' : ''}; Max-Age=86400`,
    Location: '/',
  });
  res.end();
}

export function handleGetShareLinks(req: IncomingMessage, res: ServerResponse): void {
  const db = getDb();
  const links = db
    .prepare("SELECT token, label, created_at, expires_at, revoked FROM sessions WHERE role = 'viewer'")
    .all();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(links));
}

export function handleCreateShareLink(
  req: IncomingMessage,
  res: ServerResponse,
  body: { label: string; expiresInDays: number | null }
): void {
  const db = getDb();
  const sessionToken = randomBytes(32).toString('hex');
  const now = new Date().toISOString();
  const expiresAt = body.expiresInDays
    ? new Date(Date.now() + body.expiresInDays * 86400 * 1000).toISOString()
    : null;

  db.prepare(`
    INSERT INTO sessions (token, role, label, created_at, expires_at, revoked)
    VALUES (?, 'viewer', ?, ?, ?, 0)
  `).run(sessionToken, body.label, now, expiresAt);

  const jwt = signToken({ role: 'viewer', sessionToken }, body.expiresInDays ? `${body.expiresInDays}d` : undefined);
  const publicUrl = process.env.PUBLIC_URL;
  const shareUrl = `${publicUrl}?token=${jwt}`;

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ url: shareUrl, expiresAt }));
}

export function handleRevokeShareLink(
  req: IncomingMessage,
  res: ServerResponse,
  sessionToken: string
): void {
  const db = getDb();
  db.prepare("UPDATE sessions SET revoked = 1 WHERE token = ? AND role = 'viewer'").run(sessionToken);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}
```

- [ ] **Step 4: Handle `/start login_<nonce>` in Grammar bot**

Add to `src/telegram/grammy.ts` the bot command handler, called during `startBot()`:

```typescript
import { handleNonceViaBot } from '../server/routes/auth.js';

// Inside startBot(), before bot.start() or setWebhook():
bot.command('start', async (ctx) => {
  const payload = ctx.match;
  if (payload?.startsWith('login_')) {
    const nonce = payload.slice(6);
    const schedulerChatId = process.env.TELEGRAM_SCHEDULER_CHAT_ID;
    if (String(ctx.chat.id) !== schedulerChatId) {
      await ctx.reply('This login link is not for you.');
      return;
    }
    const publicUrl = process.env.PUBLIC_URL;
    const loginUrl = `${publicUrl}/api/auth/exchange?nonce=${nonce}`;
    await ctx.reply(
      `Tap the button below to log in. This link expires in 10 minutes.`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: '🔐 Log In to Dashboard', url: loginUrl }]],
        },
      }
    );
  }
});
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test tests/server/routes/auth.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/server/routes/auth.ts tests/server/routes/
git commit -m "feat: add magic link auth with nonce exchange and viewer share links"
```

---

### Task 15: HTTP Server — index.ts + All Routes

**Files:**
- Create: `src/server/index.ts` (migrate from `src/server/index.mjs`, add all new routes)
- Create: `src/server/routes/briefs.ts`
- Create: `src/server/routes/proposals.ts`

- [ ] **Step 1: Create `src/server/routes/briefs.ts`**

```typescript
import type { IncomingMessage, ServerResponse } from 'http';
import { getDb } from '../../db/client.js';
import { parseParams, parseBody, dateParam } from '../../middleware/validate.js';
import { z } from 'zod';
import { generateBriefs } from '../../core/generateBriefs.js';
import { dispatchBriefToCrews } from '../../telegram/dispatcher.js';

export function handleGetBrief(req: IncomingMessage, res: ServerResponse, date: string): void {
  const parsed = parseParams(z.object({ date: dateParam }), { date });
  if (!parsed.ok) {
    res.writeHead(400); res.end(JSON.stringify({ error: parsed.error })); return;
  }

  const db = getDb();
  const brief = db.prepare('SELECT * FROM briefs WHERE date = ?').get(date);
  if (!brief) { res.writeHead(404); res.end(JSON.stringify({ error: 'Brief not found' })); return; }

  const jobs = db.prepare('SELECT * FROM brief_jobs WHERE brief_date = ?').all(date);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ...brief, jobs }));
}

export async function handleGenerateBrief(req: IncomingMessage, res: ServerResponse, date: string): Promise<void> {
  const parsed = parseParams(z.object({ date: dateParam }), { date });
  if (!parsed.ok) { res.writeHead(400); res.end(JSON.stringify({ error: parsed.error })); return; }

  await generateBriefs(date);
  handleGetBrief(req, res, date);
}

export async function handleApproveBrief(req: IncomingMessage, res: ServerResponse, date: string): Promise<void> {
  const db = getDb();
  db.prepare('UPDATE briefs SET approved = 1, approved_at = ?, approved_by = ? WHERE date = ?').run(
    new Date().toISOString(), 'dashboard', date
  );
  db.prepare('UPDATE brief_jobs SET approved = 1 WHERE brief_date = ?').run(date);
  await dispatchBriefToCrews(date);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}
```

- [ ] **Step 2: Create `src/server/routes/proposals.ts`**

```typescript
import type { IncomingMessage, ServerResponse } from 'http';
import { getDb } from '../../db/client.js';
import { generateProposals } from '../../agents/schedulingAgent.js';
import { parseParams, dateParam } from '../../middleware/validate.js';
import { z } from 'zod';

export async function handleGetProposals(req: IncomingMessage, res: ServerResponse, date: string): Promise<void> {
  const db = getDb();
  const proposals = db.prepare('SELECT * FROM schedule_proposals WHERE date = ?').all(date);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(proposals));
}

export async function handleGenerateProposals(req: IncomingMessage, res: ServerResponse, date: string): Promise<void> {
  const proposals = await generateProposals(date);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(proposals));
}

export function handleUpdateProposal(
  req: IncomingMessage,
  res: ServerResponse,
  id: string,
  status: 'approved' | 'rejected'
): void {
  const db = getDb();
  db.prepare('UPDATE schedule_proposals SET status = ? WHERE id = ?').run(status, id);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}
```

- [ ] **Step 3: Create `src/server/index.ts`**

```typescript
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { validateEnv } from './validateEnv.js';
import { runMigrations } from '../db/migrations.js';
import { seedCrews } from '../db/seedCrews.js';
import { startBot, getBot } from '../telegram/grammy.js';
import { handleCallbackQuery, handleTextMessage } from '../telegram/messageHandler.js';
import { handleSchedulerCallback } from '../telegram/schedulerBot.js';
import { handleInitLogin, handleNonceExchange, handleGetShareLinks, handleCreateShareLink, handleRevokeShareLink } from './routes/auth.js';
import { handleGetBrief, handleGenerateBrief, handleApproveBrief } from './routes/briefs.js';
import { handleGetProposals, handleGenerateProposals, handleUpdateProposal } from './routes/proposals.js';
import { validateSession, extractTokenFromRequest } from '../middleware/auth.js';
import { generalLimiter, loginLimiter } from '../middleware/rateLimit.js';
import { sendMorningSummary } from '../telegram/schedulerBot.js';
import { refreshMonday } from '../monday/refreshMonday.js';
import { fetchSchedule } from '../core/fetchSchedule.js';
import { generateProposals } from '../agents/schedulingAgent.js';

const PORT = parseInt(process.env.PORT ?? '3002');
const DASHBOARD_DIR = resolve('dashboard');
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';

function getIp(req: IncomingMessage): string {
  return String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'unknown');
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
  });
}

function serveFile(res: ServerResponse, filePath: string): void {
  if (!existsSync(filePath)) { res.writeHead(404); res.end(); return; }
  const ext = filePath.split('.').pop();
  const mime: Record<string, string> = {
    html: 'text/html', css: 'text/css', js: 'application/javascript', json: 'application/json',
  };
  res.writeHead(200, { 'Content-Type': mime[ext ?? 'html'] ?? 'text/plain' });
  res.end(readFileSync(filePath));
}

function requireAuth(req: IncomingMessage, res: ServerResponse): boolean {
  const token = extractTokenFromRequest(req.headers.cookie, req.headers.authorization);
  if (!token) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unauthorized' })); return false; }
  const payload = validateSession(token);
  if (!payload) { res.writeHead(401, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid or expired session' })); return false; }
  return true;
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname;
  const ip = getIp(req);

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');

  // Rate limiting
  if (path === '/api/auth/init' || path === '/api/auth/exchange') {
    if (!loginLimiter(ip)) { res.writeHead(429); res.end(JSON.stringify({ error: 'Too many requests' })); return; }
  } else if (!generalLimiter(ip)) {
    res.writeHead(429); res.end(JSON.stringify({ error: 'Too many requests' })); return;
  }

  // Telegram webhook
  if (path === '/webhook/telegram' && req.method === 'POST') {
    const secret = req.headers['x-telegram-bot-api-secret-token'];
    if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) { res.writeHead(403); res.end(); return; }
    const body = await readBody(req);
    await getBot().handleUpdate(body as any);
    res.writeHead(200); res.end();
    return;
  }

  // Auth routes (no JWT required)
  if (path === '/api/auth/init' && req.method === 'POST') { await handleInitLogin(req, res); return; }
  if (path === '/api/auth/exchange' && req.method === 'GET') {
    handleNonceExchange(req, res, url.searchParams.get('nonce') ?? ''); return;
  }

  // Protected API routes
  if (path.startsWith('/api/')) {
    if (!requireAuth(req, res)) return;

    if (path === '/api/share' && req.method === 'GET') { handleGetShareLinks(req, res); return; }
    if (path === '/api/share' && req.method === 'POST') {
      const body = await readBody(req) as any;
      handleCreateShareLink(req, res, body); return;
    }
    if (path.startsWith('/api/share/') && req.method === 'DELETE') {
      handleRevokeShareLink(req, res, path.slice('/api/share/'.length)); return;
    }
    if (path.startsWith('/api/briefs/') && req.method === 'GET') {
      handleGetBrief(req, res, path.slice('/api/briefs/'.length)); return;
    }
    if (path.startsWith('/api/briefs/') && path.endsWith('/approve') && req.method === 'POST') {
      const date = path.slice('/api/briefs/'.length).replace('/approve', '');
      await handleApproveBrief(req, res, date); return;
    }
    if (path === '/api/generate' && req.method === 'POST') {
      const body = await readBody(req) as any;
      await handleGenerateBrief(req, res, body.date); return;
    }
    if (path.startsWith('/api/proposals') && req.method === 'GET') {
      await handleGetProposals(req, res, url.searchParams.get('date') ?? ''); return;
    }
    if (path.startsWith('/api/proposals') && req.method === 'POST') {
      const body = await readBody(req) as any;
      await handleGenerateProposals(req, res, body.date); return;
    }

    res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' })); return;
  }

  // Static dashboard files
  if (path === '/' || path === '/index.html') { serveFile(res, join(DASHBOARD_DIR, 'index.html')); return; }
  const staticPath = join(DASHBOARD_DIR, path.slice(1));
  if (!staticPath.startsWith(DASHBOARD_DIR)) { res.writeHead(400); res.end(); return; } // path traversal guard
  serveFile(res, staticPath);
});

// Cron: morning routine
function scheduleDailyJobs(): void {
  setInterval(async () => {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const today = now.toISOString().slice(0, 10);

    if (hhmm === '05:00') await fetchSchedule();
    if (hhmm === '05:30') await refreshMonday();
    if (hhmm === '06:00') {
      await generateProposals(today);
      await sendMorningSummary(today);
    }
  }, 60_000);

  // Monday sync every 30 min
  setInterval(() => refreshMonday(), 30 * 60_000);
}

async function main(): Promise<void> {
  validateEnv();
  runMigrations();
  seedCrews();
  await startBot();
  scheduleDailyJobs();

  server.listen(PORT, () => {
    console.log(`[server] Listening on port ${PORT}`);
    console.log(`[server] Dashboard: http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('[server] Fatal startup error:', err);
  process.exit(1);
});
```

- [ ] **Step 4: Test server starts**

```bash
# Set minimum env vars for local test
export TELEGRAM_BOT_TOKEN=test
export TELEGRAM_SCHEDULER_CHAT_ID=123
export MONDAY_API_KEY=test
export ANTHROPIC_API_KEY=test
export JWT_SECRET=testsecretatleast32charslong1234
export PUBLIC_URL=http://localhost:3002
npm run dev
```

Expected: `[server] Listening on port 3002` with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/server/ tests/server/
git commit -m "feat: add full HTTP server with auth, briefs, proposals routes, and daily cron"
```

---

### Task 16: Login Screen + Mobile Dashboard + Viewer Dashboard

**Files:**
- Modify: `dashboard/index.html` — add login screen
- Modify: `dashboard/style.css` — mobile-responsive
- Modify: `dashboard/app.js` — attach JWT cookie, role-aware controls
- Create: `dashboard/viewer.js` — read-only CEO/manager dashboard
- Create: `dashboard/proposals.js` — AI proposals review UI (replaces stub)

- [ ] **Step 1: Add login screen to `dashboard/index.html`**

Add before the `<div id="app">` root element:

```html
<!-- Login screen — shown when no valid JWT cookie -->
<div id="login-screen" style="display:none;">
  <div class="login-container">
    <div class="login-brand">
      <div class="login-logo">IBP</div>
      <div class="login-subtitle">CREW DISPATCH</div>
    </div>
    <div class="login-card">
      <div class="login-icon">📱</div>
      <h2>Login via Telegram</h2>
      <p>Tap the button below. The bot will send you a secure login link.</p>
      <button class="login-btn" id="login-telegram-btn">Open Telegram Bot →</button>
      <p class="login-note">Link expires in 10 minutes</p>
    </div>
    <div class="login-footer">IBP Group · Florida Operations</div>
  </div>
</div>
```

- [ ] **Step 2: Add login + responsive CSS to `dashboard/style.css`**

```css
/* Login screen */
.login-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #0d1117;
  padding: 24px;
}
.login-brand { text-align: center; margin-bottom: 32px; }
.login-logo { font-size: 36px; font-weight: 800; color: #f0f6fc; letter-spacing: -2px; }
.login-subtitle { font-size: 11px; letter-spacing: 4px; color: #484f58; text-transform: uppercase; margin-top: 4px; }
.login-card {
  background: #161b22;
  border: 1px solid #30363d;
  border-radius: 12px;
  padding: 32px;
  text-align: center;
  max-width: 340px;
  width: 100%;
}
.login-icon { font-size: 40px; margin-bottom: 16px; }
.login-card h2 { color: #e6edf3; font-size: 18px; margin: 0 0 8px; }
.login-card p { color: #8b949e; font-size: 14px; margin: 0 0 20px; }
.login-btn {
  background: #1f6feb;
  color: white;
  border: none;
  border-radius: 8px;
  padding: 12px 24px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  width: 100%;
}
.login-btn:hover { background: #388bfd; }
.login-note { font-size: 11px; color: #484f58; margin-top: 12px; margin-bottom: 0; }
.login-footer { margin-top: 24px; font-size: 11px; color: #30363d; }

/* Mobile responsive — works at 375px */
@media (max-width: 640px) {
  .crew-grid { grid-template-columns: 1fr; }
  .dashboard-tabs { overflow-x: auto; white-space: nowrap; }
  .brief-card { padding: 12px; }
  .dispatch-btn { width: 100%; }
}
```

- [ ] **Step 3: Update `dashboard/app.js` — check auth on load**

Add at the top of `app.js`:

```javascript
async function checkAuth() {
  const res = await fetch('/api/briefs/' + getTodayDate());
  if (res.status === 401) {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    document.getElementById('login-telegram-btn').addEventListener('click', async () => {
      const r = await fetch('/api/auth/init', { method: 'POST' });
      const { telegramUrl } = await r.json();
      window.open(telegramUrl, '_blank');
    });
    return false;
  }
  return true;
}

// Check role — hide edit controls for viewers
async function applyRoleControls() {
  // Scheduler-only elements hidden for viewers
  // Viewer token is in ?token= query param and set as cookie by the server
  const isViewer = new URLSearchParams(window.location.search).has('token');
  if (isViewer) {
    document.querySelectorAll('.scheduler-only').forEach((el) => {
      el.style.display = 'none';
    });
  }
}
```

- [ ] **Step 4: Create `dashboard/viewer.js`**

```javascript
// Viewer dashboard — read-only status for CEO/Manager
async function loadViewerDashboard() {
  const date = new URLSearchParams(window.location.search).get('date') ?? getTodayDate();
  const res = await fetch(`/api/briefs/${date}`);
  if (!res.ok) { document.getElementById('viewer-root').innerHTML = '<p>No schedule available.</p>'; return; }

  const brief = await res.json();
  const root = document.getElementById('viewer-root');

  root.innerHTML = `
    <div class="viewer-header">
      <h1>IBP Operations</h1>
      <p>${formatDateLabel(date)} · ${brief.jobs?.length ?? 0} crews active</p>
    </div>
    <div class="viewer-grid">
      ${(brief.jobs ?? []).map(renderViewerCard).join('')}
    </div>
    <p class="viewer-footer">View only · Last updated ${new Date().toLocaleTimeString()}</p>
  `;

  // Click to expand
  document.querySelectorAll('.viewer-card').forEach((card) => {
    card.addEventListener('click', () => card.classList.toggle('expanded'));
  });
}

function renderViewerCard(job) {
  const statusIcon = { done: '✅', 'in-progress': '🔄', issue: '⚠️' }[job.check_in_status] ?? '⏳';
  const statusLabel = { done: 'Done', 'in-progress': 'In progress', issue: 'Issue reported' }[job.check_in_status] ?? 'Dispatched';

  return `
    <div class="viewer-card" data-job-id="${job.id}">
      <div class="viewer-card-header">
        <strong>${job.crew_key?.toUpperCase()}</strong>
        <span class="viewer-status">${statusIcon} ${statusLabel}</span>
      </div>
      <div class="viewer-card-summary">${job.job_name}</div>
      <div class="viewer-card-detail" style="display:none;">
        <p><strong>Address:</strong> ${job.address ?? 'TBD'}</p>
        <p><strong>Task:</strong> ${JSON.parse(job.tasks ?? '[]').join(', ')}</p>
        ${job.last_check_in ? `<p><strong>Last check-in:</strong> ${new Date(job.last_check_in).toLocaleTimeString()}</p>` : ''}
        ${job.risk_flags && JSON.parse(job.risk_flags).length ? `<p>${JSON.parse(job.risk_flags).join('<br>')}</p>` : ''}
      </div>
    </div>
  `;
}

document.addEventListener('DOMContentLoaded', loadViewerDashboard);
setInterval(loadViewerDashboard, 60_000); // refresh every minute
```

- [ ] **Step 5: Verify dashboard renders on mobile viewport**

Open `http://localhost:3002` in browser. Use DevTools → toggle device toolbar → iPhone 14 (390×844).

Expected:
- Login screen renders correctly with no horizontal scroll
- After auth: crew cards stack vertically, all buttons tap-accessible

- [ ] **Step 6: Commit**

```bash
git add dashboard/
git commit -m "feat: add magic link login screen, mobile-responsive CSS, viewer dashboard"
```

---

## Phase 6 — Cleanup & Deploy
> **Milestone:** Old JS files deleted, webhook registered, system running on Railway.

---

### Task 17: setupWebhook.ts + Delete Legacy Files

**Files:**
- Create: `src/scripts/setupWebhook.ts`
- Delete: `src/server/index.mjs`, `src/config.mjs`, `src/fetchSchedule.mjs`, `src/scheduleParser.mjs`, `src/generateBriefs.mjs`, `src/analyzeSchedule.mjs`, `src/monday/api.mjs`, `src/monday/fetchJobs.mjs`, `src/monday/addUpdate.mjs`, `src/monday/uploadPhoto.mjs`, `src/agents/dispatchChat.mjs`, `src/agents/logisticsAgent.mjs`

- [ ] **Step 1: Create `src/scripts/setupWebhook.ts`**

```typescript
import { getBot } from '../telegram/grammy.js';

async function setup(): Promise<void> {
  const publicUrl = process.env.PUBLIC_URL;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!publicUrl) {
    console.error('PUBLIC_URL not set. Cannot register webhook.');
    process.exit(1);
  }

  const bot = getBot();
  const webhookUrl = `${publicUrl}/webhook/telegram`;

  await bot.api.setWebhook(webhookUrl, {
    secret_token: secret ?? '',
    allowed_updates: ['message', 'callback_query'],
  });

  const info = await bot.api.getWebhookInfo();
  console.log('✅ Webhook registered:', info.url);
  console.log('   Pending updates:', info.pending_update_count);
}

setup();
```

- [ ] **Step 2: Delete all legacy `.mjs` source files**

```bash
git rm src/config.mjs src/fetchSchedule.mjs src/scheduleParser.mjs
git rm src/generateBriefs.mjs src/analyzeSchedule.mjs
git rm src/server/index.mjs
git rm src/monday/api.mjs src/monday/fetchJobs.mjs src/monday/addUpdate.mjs src/monday/uploadPhoto.mjs
git rm src/agents/dispatchChat.mjs src/agents/logisticsAgent.mjs
git rm src/telegram/bot.mjs src/telegram/poller.mjs 2>/dev/null; true
```

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: All tests PASS, no import errors.

- [ ] **Step 4: Build for production**

```bash
npm run build
```

Expected: `dist/` produced with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/scripts/setupWebhook.ts
git commit -m "feat: add setupWebhook script, remove all legacy .mjs source files"
```

---

### Task 18: Railway Deploy + Verification

**Files:**
- Modify: `DEPLOY.md` — update for new TypeScript build

- [ ] **Step 1: Set all environment variables on Railway**

In Railway dashboard → Variables, add:
```
TELEGRAM_BOT_TOKEN=<your token>
TELEGRAM_SCHEDULER_CHAT_ID=<your chat ID>
TELEGRAM_WEBHOOK_SECRET=<random string>
MONDAY_API_KEY=<your key>
MONDAY_BOARD_ID=2214820863
ANTHROPIC_API_KEY=<your key>
JWT_SECRET=<random 40+ char string>
PUBLIC_URL=https://<your-railway-domain>
SCHEDULE_SHEET_ID=<your sheet ID>
NODE_ENV=production
PORT=3002
```

- [ ] **Step 2: Set Railway start command**

In Railway settings → Deploy → Start command:
```
npm run build && npm start
```

- [ ] **Step 3: Deploy**

```bash
git push
```

Expected: Railway build succeeds, server logs `[server] Listening on port 3002`.

- [ ] **Step 4: Register Telegram webhook**

```bash
PUBLIC_URL=https://<your-railway-domain> \
TELEGRAM_BOT_TOKEN=<token> \
TELEGRAM_WEBHOOK_SECRET=<secret> \
npm run setup:webhook
```

Expected: `✅ Webhook registered: https://<domain>/webhook/telegram`

- [ ] **Step 5: End-to-end smoke test**

- [ ] Open `https://<domain>` in browser → login screen appears
- [ ] Tap "Login via Telegram" → Telegram opens → bot sends login link → tap link → dashboard loads
- [ ] Manually trigger brief generation: `POST /api/generate` with `{ "date": "2026-05-13" }`
- [ ] Manually trigger proposals: `POST /api/proposals` with `{ "date": "2026-05-13" }`
- [ ] In dashboard, approve a proposal → check Telegram crew group receives dispatch message with ✅/⚠️ buttons
- [ ] From crew group, tap ✅ Job Done → Monday item gets update
- [ ] Generate a viewer share link from Settings → send to phone → open link → read-only dashboard shows, no edit controls visible

- [ ] **Step 6: Final commit**

```bash
git add DEPLOY.md
git commit -m "docs: update DEPLOY.md for TypeScript build and webhook setup"
```

---

## Self-Review Against Spec

| Spec Requirement | Covered By |
|---|---|
| TypeScript + Node.js ESM | Task 1 |
| SQLite replaces all JSON files | Task 2 + Task 8 |
| Zod validation on all API inputs | Task 3 (validate.ts) + Task 15 (routes) |
| JWT auth with HttpOnly cookie | Task 3 (auth.ts) + Task 14 |
| Rate limiting (60 req/min general, 5/min login) | Task 3 (rateLimit.ts) |
| Startup env validation | Task 4 |
| Crew profiles in config.ts | Task 5 |
| Schedule fetch + parser | Task 6 |
| Monday.com auto-sync (refreshMonday.ts) | Task 7 |
| generateBriefs writes to SQLite | Task 8 |
| Grammy replaces raw fetch polling | Task 9 |
| Inline keyboard buttons for crews (Done/Issue) | Task 10 |
| Photo handler migrated | Task 11 |
| Dispatcher sends briefs with inline keyboards | Task 11 |
| schedulingAgent.ts (Claude Sonnet) | Task 12 |
| Scheduler morning summary via Telegram | Task 13 |
| Approve/Hold/Dashboard inline buttons | Task 13 |
| Magic link login via Telegram | Task 14 |
| Viewer share links (CEO/manager) | Task 14 |
| Role-based dashboard (scheduler vs viewer) | Task 16 |
| Viewer click-to-expand crew cards | Task 16 (viewer.js) |
| Mobile-responsive dashboard (375px) | Task 16 (style.css) |
| HTTP server with all routes | Task 15 |
| Cron: 5 AM fetch, 5:30 sync, 6 AM proposals, 7 AM reminder | Task 15 (index.ts) |
| setupWebhook.ts | Task 17 |
| Delete all legacy .mjs files | Task 17 |
| Webhook in production, polling in dev | Task 9 (grammy.ts) |
| Telegram webhook secret validation | Task 15 (index.ts) |
| Path traversal prevention | Task 15 (index.ts) |
| No sensitive data in logs | Throughout — no console.log of tokens |
| Seeds existing crew-telegram-groups.json | Task 8 (seedCrews.ts) |
| setupWebhook.ts deploy script | Task 17 |
