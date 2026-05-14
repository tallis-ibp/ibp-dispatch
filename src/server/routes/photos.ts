import type { IncomingMessage, ServerResponse } from 'http';
import { getSql } from '../../db/client.js';
import { getBot } from '../../telegram/grammy.js';

// GET /api/photos?date=YYYY-MM-DD&crewKey=&status=&limit=&offset=
// Returns photos joined with crew display_name as crewDisplay, ordered by received_at DESC
export async function handleGetPhotos(
  req: IncomingMessage,
  res: ServerResponse,
  date: string,
  filters: { crewKey?: string; status?: string; limit?: number; offset?: number } = {},
): Promise<void> {
  const sql = getSql();
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;
  const crewKey = filters.crewKey ?? null;
  const status = filters.status ?? null;

  const photos = await sql`
    SELECT
      p.id,
      p.date,
      p.received_at       AS "receivedAt",
      p.file_id           AS "fileId",
      p.local_path        AS "localPath",
      p.chat_id           AS "chatId",
      p.sender,
      p.caption,
      p.crew_key          AS "crewKey",
      p.job_number        AS "jobNumber",
      p.monday_item_id    AS "mondayItemId",
      p.ai_summary        AS "aiSummary",
      p.completion_status AS "completionStatus",
      p.monday_updated    AS "mondayUpdated",
      c.display_name      AS "crewDisplay"
    FROM photos p
    LEFT JOIN crews c ON c.key = p.crew_key
    WHERE p.date = ${date}
      AND (${crewKey}::text IS NULL OR p.crew_key = ${crewKey})
      AND (${status}::text IS NULL OR p.completion_status = ${status})
    ORDER BY p.received_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(photos));
}

// GET /api/photos/:id/image  → streams the photo bytes from Telegram on demand.
// We never persisted the binary (Vercel filesystem is read-only); we keep file_id
// and re-fetch through Telegram's getFile + file URL whenever the dashboard renders.
export async function handleGetPhotoImage(
  req: IncomingMessage,
  res: ServerResponse,
  id: string,
): Promise<void> {
  if (!id) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'photo id is required' }));
    return;
  }
  const sql = getSql();
  const [photo] = await sql<{ fileId: string }[]>`
    SELECT file_id AS "fileId" FROM photos WHERE id = ${id}
  `;
  if (!photo?.fileId) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Photo not found' }));
    return;
  }
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'TELEGRAM_BOT_TOKEN not set' }));
    return;
  }
  try {
    const bot = getBot();
    await bot.init();
    const file = await bot.api.getFile(photo.fileId);
    if (!file.file_path) throw new Error('Telegram returned no file_path');
    const upstream = await fetch(
      `https://api.telegram.org/file/bot${botToken}/${file.file_path}`,
    );
    if (!upstream.ok) throw new Error(`Telegram file HTTP ${upstream.status}`);
    const buf = Buffer.from(await upstream.arrayBuffer());
    // Telegram often returns application/octet-stream for photos.
    // Override using file extension since the dashboard always treats these as images.
    const ext = file.file_path.split('.').pop()?.toLowerCase();
    const extMime: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      webp: 'image/webp', gif: 'image/gif', heic: 'image/heic',
    };
    const upstreamCt = upstream.headers.get('content-type') ?? '';
    const contentType = (ext && extMime[ext])
      || (upstreamCt.startsWith('image/') ? upstreamCt : 'image/jpeg');
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': String(buf.length),
      'Cache-Control': 'private, max-age=3600',
    });
    res.end(buf);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[photo image] ${id} → ${msg}`);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: msg }));
  }
}
