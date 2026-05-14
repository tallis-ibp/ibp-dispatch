import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requestHandler } from '../src/server/handler.js';
import { runMigrations } from '../src/db/migrations.js';
import { seedCrews } from '../src/db/seedCrews.js';

// Run once per cold start — CREATE TABLE IF NOT EXISTS is idempotent
let initialized = false;
async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  await runMigrations();
  await seedCrews();
  initialized = true;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  await ensureInitialized();
  return requestHandler(req, res);
}
