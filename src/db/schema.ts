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
