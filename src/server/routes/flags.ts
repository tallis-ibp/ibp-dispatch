import type { IncomingMessage, ServerResponse } from 'http';
import { getSql } from '../../db/client.js';

// GET /api/flags?date=YYYY-MM-DD
// Returns flags joined with crew display_name, ordered by timestamp DESC
export async function handleGetFlags(req: IncomingMessage, res: ServerResponse, date: string): Promise<void> {
  const sql = getSql();
  const flags = await sql`
    SELECT
      f.id,
      f.date,
      f.timestamp,
      f.chat_id,
      f.crew_key,
      f.sender,
      f.text,
      f.resolved,
      f.resolved_at,
      f.note,
      c.display_name AS "displayName"
    FROM flags f
    LEFT JOIN crews c ON c.key = f.crew_key
    WHERE f.date = ${date}
    ORDER BY f.timestamp DESC
  `;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(flags));
}

// POST /api/flags/:id/resolve  body: { note?: string }
// Sets resolved=1, resolved_at=now(), note=body.note WHERE id=:id
export async function handleResolveFlag(
  req: IncomingMessage,
  res: ServerResponse,
  id: string,
  body: { note?: string }
): Promise<void> {
  if (!id) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'flag id is required' }));
    return;
  }
  const sql = getSql();
  await sql`
    UPDATE flags
    SET resolved = 1,
        resolved_at = ${new Date().toISOString()},
        note = ${body.note ?? null}
    WHERE id = ${id}
  `;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}

// POST /api/flags/teach  body: { phrase: string; intent: string }
// INSERTs into learned_phrases (phrase, intent, learned_at)
// phrase stored as lowercase for case-insensitive matching
export async function handleTeachPhrase(
  req: IncomingMessage,
  res: ServerResponse,
  body: { phrase: string; intent: string }
): Promise<void> {
  if (!body.phrase || !body.intent) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'phrase and intent are required' }));
    return;
  }
  const sql = getSql();
  await sql`
    INSERT INTO learned_phrases (phrase, intent, learned_at)
    VALUES (${body.phrase.toLowerCase()}, ${body.intent}, ${new Date().toISOString()})
  `;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}
