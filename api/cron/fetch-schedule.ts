import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchSchedule } from '../../src/core/fetchSchedule.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    await fetchSchedule();
    res.json({ ok: true, task: 'fetch-schedule' });
  } catch (err) {
    console.error('[cron/fetch-schedule]', err);
    res.status(500).json({ error: String(err) });
  }
}
