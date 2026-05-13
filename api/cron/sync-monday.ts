import type { VercelRequest, VercelResponse } from '@vercel/node';
import { refreshMonday } from '../../src/monday/refreshMonday.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    await refreshMonday();
    res.json({ ok: true, task: 'sync-monday' });
  } catch (err) {
    console.error('[cron/sync-monday]', err);
    res.status(500).json({ error: String(err) });
  }
}
