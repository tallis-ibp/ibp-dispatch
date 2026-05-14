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
  const today    = new Date().toISOString().slice(0, 10);
  const weekAgoD = new Date();
  weekAgoD.setDate(weekAgoD.getDate() - 7);
  const weekAgo  = weekAgoD.toISOString().slice(0, 10);

  // Enrich each crew with operational aggregates so the Crews page can
  // render "Working today / On standby / Awaiting setup" without N+1 fetches.
  const crews = await sql`
    SELECT
      c.*,
      COALESCE((
        SELECT COUNT(*) FROM brief_jobs
        WHERE crew_key = c.key AND brief_date = ${today}
      ), 0)::int AS "jobsToday",
      COALESCE((
        SELECT COUNT(*) FROM brief_jobs
        WHERE crew_key = c.key AND brief_date >= ${weekAgo}
      ), 0)::int AS "jobsLast7Days",
      (
        SELECT MAX(last_check_in) FROM brief_jobs
        WHERE crew_key = c.key AND last_check_in IS NOT NULL
      ) AS "lastActivity",
      (
        SELECT json_build_object(
          'jobNumber', job_number,
          'jobName',   job_name,
          'briefDate', brief_date,
          'status',    check_in_status
        )
        FROM brief_jobs
        WHERE crew_key = c.key
        ORDER BY brief_date DESC
        LIMIT 1
      ) AS "lastJob"
    FROM crews c
    ORDER BY c.key
  `;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(crews));
}

// GET /api/crews/:key  → full detail incl. last 10 brief_jobs
export async function handleGetCrewDetail(
  req: IncomingMessage,
  res: ServerResponse,
  key: string,
): Promise<void> {
  if (!key) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'crew key is required' }));
    return;
  }
  const sql = getSql();
  const [crew] = await sql<Array<{
    key: string; displayName: string; telegramGroupId: string | null;
    language: string; reliability: string | null;
    strengths: string; cautions: string;
  }>>`
    SELECT
      key, display_name AS "displayName", telegram_group_id AS "telegramGroupId",
      language, reliability, strengths, cautions
    FROM crews WHERE key = ${key}
  `;
  if (!crew) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Crew not found' }));
    return;
  }
  const recentJobs = await sql`
    SELECT
      brief_date AS "briefDate", job_number AS "jobNumber",
      job_name   AS "jobName",   check_in_status AS "checkInStatus",
      sent_at    AS "sentAt"
    FROM brief_jobs
    WHERE crew_key = ${key}
    ORDER BY brief_date DESC, job_number
    LIMIT 10
  `;
  const safeParse = <T,>(s: unknown, fallback: T): T => {
    if (s == null) return fallback;
    try { return JSON.parse(s as string) as T; } catch { return fallback; }
  };
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    ...crew,
    strengths: safeParse(crew.strengths, [] as string[]),
    cautions:  safeParse(crew.cautions,  [] as string[]),
    recentJobs,
  }));
}

interface UpdateCrewBody {
  displayName?: string;
  telegramGroupId?: string | null;
  language?: string;
  reliability?: 'high' | 'medium' | 'low' | null;
  strengths?: string[];
  cautions?: string[];
}

export async function handleUpdateCrew(
  req: IncomingMessage,
  res: ServerResponse,
  key: string,
  body: UpdateCrewBody,
): Promise<void> {
  if (!key) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'crew key is required' }));
    return;
  }
  const fields = ['displayName', 'telegramGroupId', 'language', 'reliability', 'strengths', 'cautions'] as const;
  const provided = fields.filter((f) => body[f] !== undefined);
  if (provided.length === 0) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'at least one field is required' }));
    return;
  }
  if (body.reliability !== undefined && body.reliability !== null
      && !['high', 'medium', 'low'].includes(body.reliability)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'reliability must be high, medium, low, or null' }));
    return;
  }
  if (body.strengths !== undefined && !Array.isArray(body.strengths)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'strengths must be an array of strings' }));
    return;
  }
  if (body.cautions !== undefined && !Array.isArray(body.cautions)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'cautions must be an array of strings' }));
    return;
  }

  // Coalesce undefined → keep existing value via COALESCE(${value}::type, column).
  // Postgres tagged-template parameters need explicit casts when nullable.
  const sql = getSql();
  await sql`
    UPDATE crews SET
      display_name      = COALESCE(${body.displayName ?? null}::text, display_name),
      telegram_group_id = CASE WHEN ${body.telegramGroupId !== undefined}::boolean
                               THEN ${body.telegramGroupId ?? null}::text
                               ELSE telegram_group_id END,
      language          = COALESCE(${body.language ?? null}::text, language),
      reliability       = CASE WHEN ${body.reliability !== undefined}::boolean
                               THEN ${body.reliability ?? null}::text
                               ELSE reliability END,
      strengths         = COALESCE(${body.strengths ? JSON.stringify(body.strengths) : null}::text, strengths),
      cautions          = COALESCE(${body.cautions  ? JSON.stringify(body.cautions)  : null}::text, cautions)
    WHERE key = ${key}
  `;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}

export async function handleDeleteCrew(
  req: IncomingMessage,
  res: ServerResponse,
  key: string,
): Promise<void> {
  if (!key) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'crew key is required' }));
    return;
  }
  const sql = getSql();
  const [crew] = await sql`SELECT key FROM crews WHERE key = ${key}`;
  if (!crew) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Crew not found' }));
    return;
  }
  await sql`DELETE FROM crews WHERE key = ${key}`;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}

// GET /api/chats/recent
// Returns recent chat_ids the bot has actually received messages from
// (photos + flags). Used by the Connect modal so users can click instead of typing.
export async function handleGetRecentChats(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const sql = getSql();
  // Dedupe by chat_id (keep the most recent sender for each chat) and sort by recency.
  const rows = await sql<{ chatId: string; sender: string | null; lastSeen: string }[]>`
    SELECT "chatId", sender, "lastSeen" FROM (
      SELECT DISTINCT ON (chat_id)
        chat_id AS "chatId", sender, last_seen AS "lastSeen"
      FROM (
        SELECT chat_id, sender, received_at AS last_seen FROM photos WHERE chat_id IS NOT NULL
        UNION ALL
        SELECT chat_id, sender, timestamp     AS last_seen FROM flags  WHERE chat_id IS NOT NULL
      ) all_chats
      ORDER BY chat_id, last_seen DESC
    ) dedup
    ORDER BY "lastSeen" DESC
    LIMIT 20
  `;
  // Mark which chats are already linked to a crew so the UI can dim them
  const linked = await sql<{ telegram_group_id: string; display_name: string }[]>`
    SELECT telegram_group_id, display_name FROM crews WHERE telegram_group_id IS NOT NULL
  `;
  const linkedMap = new Map(linked.map((c) => [c.telegram_group_id, c.display_name]));
  const result = rows.map((r) => ({
    ...r,
    linkedTo: linkedMap.get(r.chatId) ?? null,
  }));
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result));
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
