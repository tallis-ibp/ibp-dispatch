import type { VercelRequest, VercelResponse } from '@vercel/node';
import { generateProposals } from '../../src/agents/schedulingAgent.js';
import { sendMorningSummary } from '../../src/telegram/schedulerBot.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  try {
    await generateProposals(today);
    await sendMorningSummary(today);
    res.json({ ok: true, task: 'morning', date: today });
  } catch (err) {
    console.error('[cron/morning]', err);
    res.status(500).json({ error: String(err) });
  }
}
