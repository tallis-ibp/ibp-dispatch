import type { IncomingMessage, ServerResponse } from 'http';
import { getSql } from '../../db/client.js';

export async function handleGetCrews(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const sql = getSql();
  const crews = await sql`SELECT * FROM crews ORDER BY key`;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(crews));
}

export async function handleUpdateCrew(
  req: IncomingMessage,
  res: ServerResponse,
  key: string,
  body: { telegramGroupId?: string; language?: string }
): Promise<void> {
  if (!key) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'crew key is required' }));
    return;
  }
  if (body.telegramGroupId === undefined && body.language === undefined) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'at least one of telegramGroupId or language is required' }));
    return;
  }
  const sql = getSql();
  if (body.telegramGroupId !== undefined && body.language !== undefined) {
    await sql`
      UPDATE crews
      SET telegram_group_id = ${body.telegramGroupId}, language = ${body.language}
      WHERE key = ${key}
    `;
  } else if (body.telegramGroupId !== undefined) {
    await sql`
      UPDATE crews
      SET telegram_group_id = ${body.telegramGroupId}
      WHERE key = ${key}
    `;
  } else {
    await sql`
      UPDATE crews
      SET language = ${body.language!}
      WHERE key = ${key}
    `;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}
