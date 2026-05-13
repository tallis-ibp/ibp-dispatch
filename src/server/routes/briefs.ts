import type { IncomingMessage, ServerResponse } from 'http';
import { getSql } from '../../db/client.js';
import { parseParams, dateParam } from '../../middleware/validate.js';
import { z } from 'zod';
import { generateBriefs } from '../../core/generateBriefs.js';
import { dispatchBriefToCrews } from '../../telegram/dispatcher.js';

export async function handleGetBrief(req: IncomingMessage, res: ServerResponse, date: string): Promise<void> {
  const parsed = parseParams(z.object({ date: dateParam }), { date });
  if (!parsed.ok) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: parsed.error }));
    return;
  }

  const sql = getSql();
  const [brief] = await sql`SELECT * FROM briefs WHERE date = ${date}`;
  if (!brief) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Brief not found' }));
    return;
  }

  const jobs = await sql`SELECT * FROM brief_jobs WHERE brief_date = ${date}`;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ...brief, jobs }));
}

export async function handleGenerateBrief(req: IncomingMessage, res: ServerResponse, date: string): Promise<void> {
  const parsed = parseParams(z.object({ date: dateParam }), { date });
  if (!parsed.ok) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: parsed.error }));
    return;
  }

  await generateBriefs(date);
  await handleGetBrief(req, res, date);
}

export async function handleApproveBrief(req: IncomingMessage, res: ServerResponse, date: string): Promise<void> {
  const sql = getSql();
  const [brief] = await sql`SELECT date FROM briefs WHERE date = ${date}`;
  if (!brief) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Brief not found' }));
    return;
  }

  await sql`UPDATE briefs SET approved = 1, approved_at = ${new Date().toISOString()}, approved_by = 'dashboard' WHERE date = ${date}`;
  await sql`UPDATE brief_jobs SET approved = 1 WHERE brief_date = ${date}`;
  await dispatchBriefToCrews(date);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}
