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

// GET /api/flags/:id  → flag + crew + nearest brief_job (today, same crew)
export async function handleGetFlagDetail(
  req: IncomingMessage,
  res: ServerResponse,
  id: string,
): Promise<void> {
  if (!id) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'flag id is required' }));
    return;
  }
  const sql = getSql();
  const [flag] = await sql<Array<{
    id: string; date: string; timestamp: string; chatId: string | null;
    crewKey: string | null; sender: string | null; text: string | null;
    resolved: number; resolvedAt: string | null; note: string | null;
    displayName: string | null; language: string | null;
  }>>`
    SELECT
      f.id, f.date, f.timestamp,
      f.chat_id AS "chatId", f.crew_key AS "crewKey",
      f.sender, f.text, f.resolved,
      f.resolved_at AS "resolvedAt", f.note,
      c.display_name AS "displayName", c.language
    FROM flags f
    LEFT JOIN crews c ON c.key = f.crew_key
    WHERE f.id = ${id}
  `;
  if (!flag) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Flag not found' }));
    return;
  }
  // Best-effort: find a brief_job from the same date+crew this flag might be about
  let jobContext: unknown = null;
  if (flag.crewKey) {
    const [bj] = await sql`
      SELECT id, job_number AS "jobNumber", job_name AS "jobName"
      FROM brief_jobs
      WHERE brief_date = ${flag.date} AND crew_key = ${flag.crewKey}
      ORDER BY job_number
      LIMIT 1
    `;
    jobContext = bj ?? null;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ...flag, jobContext }));
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
