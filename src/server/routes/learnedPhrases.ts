import type { IncomingMessage, ServerResponse } from 'http';
import { getSql } from '../../db/client.js';

const KNOWN_INTENTS = new Set([
  'arrived', 'working', 'done', 'issue', 'leaving',
  'at-pickup', 'material-delivered', 'loading', 'dumping', 'ignore',
]);

export async function handleGetLearnedPhrases(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, phrase, intent, learned_at AS "learnedAt"
    FROM learned_phrases
    ORDER BY learned_at DESC
  `;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(rows));
}

export async function handleCreateLearnedPhrase(
  req: IncomingMessage,
  res: ServerResponse,
  body: { phrase?: string; intent?: string },
): Promise<void> {
  const phrase = body.phrase?.trim().toLowerCase();
  const intent = body.intent?.trim();
  if (!phrase || !intent) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'phrase and intent are required' }));
    return;
  }
  if (!KNOWN_INTENTS.has(intent)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `intent must be one of: ${[...KNOWN_INTENTS].join(', ')}` }));
    return;
  }
  const sql = getSql();
  const [row] = await sql`
    INSERT INTO learned_phrases (phrase, intent, learned_at)
    VALUES (${phrase}, ${intent}, ${new Date().toISOString()})
    RETURNING id, phrase, intent, learned_at AS "learnedAt"
  `;
  res.writeHead(201, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(row));
}

export async function handleDeleteLearnedPhrase(
  req: IncomingMessage,
  res: ServerResponse,
  id: string,
): Promise<void> {
  if (!id) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'phrase id is required' }));
    return;
  }
  const sql = getSql();
  await sql`DELETE FROM learned_phrases WHERE id = ${parseInt(id, 10)}`;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}
