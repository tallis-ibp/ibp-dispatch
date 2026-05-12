import type { IncomingMessage, ServerResponse } from 'http';
import { getDb } from '../../db/client.js';
import { generateProposals } from '../../agents/schedulingAgent.js';
import { parseParams, dateParam } from '../../middleware/validate.js';
import { z } from 'zod';

export async function handleGetProposals(req: IncomingMessage, res: ServerResponse, date: string): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'date must be YYYY-MM-DD' }));
    return;
  }
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
  status: unknown
): void {
  if (status !== 'approved' && status !== 'rejected') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'status must be "approved" or "rejected"' }));
    return;
  }
  const db = getDb();
  db.prepare('UPDATE schedule_proposals SET status = ? WHERE id = ?').run(status, id);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}
