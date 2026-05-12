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
  const brief = db.prepare('SELECT date FROM briefs WHERE date = ?').get(date);
  if (!brief) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Brief not found' }));
    return;
  }
  db.prepare('UPDATE briefs SET approved = 1, approved_at = ?, approved_by = ? WHERE date = ?').run(
    new Date().toISOString(), 'dashboard', date
  );
  db.prepare('UPDATE brief_jobs SET approved = 1 WHERE brief_date = ?').run(date);
  await dispatchBriefToCrews(date);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}
