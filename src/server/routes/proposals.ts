import type { IncomingMessage, ServerResponse } from 'http';
import { getSql } from '../../db/client.js';
import { generateProposals } from '../../agents/schedulingAgent.js';

export async function handleGetProposals(req: IncomingMessage, res: ServerResponse, date: string): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'date must be YYYY-MM-DD' }));
    return;
  }
  const sql = getSql();
  const proposals = await sql`SELECT * FROM schedule_proposals WHERE date = ${date}`;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(proposals));
}

export async function handleGenerateProposals(req: IncomingMessage, res: ServerResponse, date: string): Promise<void> {
  const proposals = await generateProposals(date);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(proposals));
}

export async function handleUpdateProposal(
  req: IncomingMessage,
  res: ServerResponse,
  id: string,
  status: unknown
): Promise<void> {
  if (status !== 'approved' && status !== 'rejected') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'status must be "approved" or "rejected"' }));
    return;
  }
  const sql = getSql();
  await sql`UPDATE schedule_proposals SET status = ${status} WHERE id = ${id}`;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}
