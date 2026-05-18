import type { IncomingMessage, ServerResponse } from 'http';
import { getSql } from '../../db/client.js';
import { getBot } from '../../telegram/grammy.js';

// GET /api/telegram/chats
// Lists every chat the bot has interacted with, plus the crew it's linked to.
export async function handleListChats(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      t.chat_id        AS "chatId",
      t.type,
      t.title,
      t.joined_at      AS "joinedAt",
      t.last_seen      AS "lastSeen",
      t.status,
      t.linked_crew_key AS "linkedCrewKey",
      c.display_name   AS "linkedCrewName"
    FROM telegram_chats t
    LEFT JOIN crews c ON c.key = t.linked_crew_key
    ORDER BY (t.linked_crew_key IS NULL) DESC, t.last_seen DESC NULLS LAST
  `;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(rows));
}

// POST /api/telegram/chats/:chatId/link  body: { crewKey }
// Links a chat to a crew. Sets both crews.telegram_group_id and
// telegram_chats.linked_crew_key (kept in sync).
export async function handleLinkChat(
  req: IncomingMessage,
  res: ServerResponse,
  chatId: string,
  body: { crewKey?: string },
): Promise<void> {
  if (!chatId || !body.crewKey) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'chatId and crewKey required' }));
    return;
  }
  const sql = getSql();
  // Make sure the target crew exists
  const [crew] = await sql`SELECT key FROM crews WHERE key = ${body.crewKey}`;
  if (!crew) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Crew not found' }));
    return;
  }
  // First, unlink any other chat that was previously linked to this crew
  await sql`
    UPDATE telegram_chats SET linked_crew_key = NULL
    WHERE linked_crew_key = ${body.crewKey} AND chat_id != ${chatId}
  `;
  // And unlink this chat from any other crew it might be on
  await sql`
    UPDATE telegram_chats SET linked_crew_key = NULL
    WHERE chat_id = ${chatId}
  `;
  // Link
  await sql`
    UPDATE telegram_chats SET linked_crew_key = ${body.crewKey}
    WHERE chat_id = ${chatId}
  `;
  await sql`
    UPDATE crews SET telegram_group_id = ${chatId}
    WHERE key = ${body.crewKey}
  `;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}

// POST /api/telegram/chats/:chatId/unlink
export async function handleUnlinkChat(
  req: IncomingMessage,
  res: ServerResponse,
  chatId: string,
): Promise<void> {
  const sql = getSql();
  const [row] = await sql<{ linked_crew_key: string | null }[]>`
    SELECT linked_crew_key FROM telegram_chats WHERE chat_id = ${chatId}
  `;
  if (row?.linked_crew_key) {
    await sql`UPDATE crews SET telegram_group_id = NULL WHERE key = ${row.linked_crew_key}`;
  }
  await sql`UPDATE telegram_chats SET linked_crew_key = NULL WHERE chat_id = ${chatId}`;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}

// POST /api/telegram/send  body: { chatId, text }
// Quick test: send an arbitrary message to a known chat.
export async function handleQuickSend(
  req: IncomingMessage,
  res: ServerResponse,
  body: { chatId?: string; text?: string },
): Promise<void> {
  if (!body.chatId || !body.text) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'chatId and text required' }));
    return;
  }
  try {
    const bot = getBot();
    await bot.init();
    const sent = await bot.api.sendMessage(body.chatId, body.text);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, messageId: sent.message_id }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: msg }));
  }
}

// GET /api/telegram/activity?limit=50
// Returns a merged chronological feed of inbound + outbound events drawn
// from existing tables — no new schema needed.
// Inbound:  photos, flags, brief_jobs (when last_check_in moves)
// Outbound: brief_jobs.sent_at (brief dispatched to a crew)
export async function handleActivityFeed(
  req: IncomingMessage,
  res: ServerResponse,
  limit: number,
): Promise<void> {
  const sql = getSql();
  const lim = Math.min(Math.max(limit, 1), 200);
  const rows = await sql`
    SELECT
      'photo'    AS kind,
      'in'       AS direction,
      p.received_at AS at,
      p.chat_id     AS "chatId",
      p.sender,
      p.crew_key    AS "crewKey",
      c.display_name AS "crewName",
      p.ai_summary  AS text,
      NULL AS "jobNumber"
    FROM photos p
    LEFT JOIN crews c ON c.key = p.crew_key
    WHERE p.received_at IS NOT NULL

    UNION ALL

    SELECT
      'flag'     AS kind,
      'in'       AS direction,
      f.timestamp AS at,
      f.chat_id   AS "chatId",
      f.sender,
      f.crew_key  AS "crewKey",
      c.display_name AS "crewName",
      f.text,
      NULL AS "jobNumber"
    FROM flags f
    LEFT JOIN crews c ON c.key = f.crew_key

    UNION ALL

    SELECT
      'check-in' AS kind,
      'in'       AS direction,
      bj.last_check_in AS at,
      NULL  AS "chatId",
      NULL  AS sender,
      bj.crew_key      AS "crewKey",
      c.display_name   AS "crewName",
      bj.check_in_status AS text,
      bj.job_number    AS "jobNumber"
    FROM brief_jobs bj
    LEFT JOIN crews c ON c.key = bj.crew_key
    WHERE bj.last_check_in IS NOT NULL

    UNION ALL

    SELECT
      'dispatch' AS kind,
      'out'      AS direction,
      bj.sent_at AS at,
      c.telegram_group_id AS "chatId",
      NULL       AS sender,
      bj.crew_key AS "crewKey",
      c.display_name AS "crewName",
      bj.job_name AS text,
      bj.job_number AS "jobNumber"
    FROM brief_jobs bj
    LEFT JOIN crews c ON c.key = bj.crew_key
    WHERE bj.sent_at IS NOT NULL

    ORDER BY at DESC NULLS LAST
    LIMIT ${lim}
  `;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(rows));
}
