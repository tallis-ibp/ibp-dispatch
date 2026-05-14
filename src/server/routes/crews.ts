import type { IncomingMessage, ServerResponse } from 'http';
import { getSql } from '../../db/client.js';
import { getBot } from '../../telegram/grammy.js';

export async function handleCreateCrew(
  req: IncomingMessage,
  res: ServerResponse,
  body: { key: string; displayName: string; telegramGroupId?: string; language?: string }
): Promise<void> {
  const { key, displayName, telegramGroupId, language } = body;
  if (!key || !displayName) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'key and displayName are required' }));
    return;
  }
  const sql = getSql();
  await sql`
    INSERT INTO crews (key, display_name, telegram_group_id, language)
    VALUES (${key}, ${displayName}, ${telegramGroupId ?? null}, ${language ?? 'en'})
    ON CONFLICT (key) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      telegram_group_id = EXCLUDED.telegram_group_id,
      language = EXCLUDED.language
  `;
  res.writeHead(201, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}

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

export async function handleTestCrewMessage(
  req: IncomingMessage,
  res: ServerResponse,
  key: string
): Promise<void> {
  const sql = getSql();
  const [crew] = await sql`SELECT display_name, telegram_group_id FROM crews WHERE key = ${key}`;
  if (!crew) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Crew not found' }));
    return;
  }
  if (!crew.telegram_group_id) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No Telegram chat ID configured for this crew' }));
    return;
  }
  const bot = getBot();
  await bot.init();
  try {
    await bot.api.sendMessage(
      crew.telegram_group_id,
      `✅ IBP Dispatch connected\n\nBot is working for *${crew.display_name as string}*.\n\nJob briefs will arrive here.`,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[test] sendMessage failed for crew ${key} → ${crew.telegram_group_id}: ${msg}`);
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: msg }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}
