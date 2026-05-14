import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requestHandler } from '../src/server/handler.js';
import { runMigrations } from '../src/db/migrations.js';
import { seedCrews } from '../src/db/seedCrews.js';

let initialized = false;
let initError: string | null = null;

async function ensureInitialized(): Promise<void> {
  if (initialized) return;
  try {
    await runMigrations();
    console.log('[init] Migrations complete');
  } catch (err) {
    initError = String(err);
    console.error('[init] Migrations failed:', err);
    throw err; // DB unusable — surface to caller
  }
  try {
    await seedCrews();
    console.log('[init] Seed complete');
  } catch (err) {
    // Seed failure is non-fatal (tables exist, just no default rows)
    console.error('[init] Seed failed (non-fatal):', err);
  }
  initialized = true;
  initError = null;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Health / debug endpoint — no auth needed
  if (req.url === '/api/health' || req.url?.startsWith('/api/health?')) {
    const sql = (await import('../src/db/client.js')).getSql();
    try {
      const [row] = await sql`SELECT COUNT(*) AS n FROM crews`;
      res.status(200).json({ ok: true, initialized, initError, crewCount: row.n });
    } catch (err) {
      res.status(200).json({ ok: false, initialized, initError, dbError: String(err) });
    }
    return;
  }

  try {
    await ensureInitialized();
  } catch (err) {
    res.status(500).json({ error: 'DB init failed', detail: String(err) });
    return;
  }
  return requestHandler(req, res);
}
