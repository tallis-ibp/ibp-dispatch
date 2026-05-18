import type { IncomingMessage, ServerResponse } from 'http';
import { getSql } from '../../db/client.js';
import { getBot } from '../../telegram/grammy.js';

// Admin endpoints accept either:
//   - DISABLE_AUTH=true (dev / personal project mode — already the user's setup)
//   - Authorization: Bearer ${CRON_SECRET} (for scripted access)
function checkAuth(req: IncomingMessage, res: ServerResponse): boolean {
  if (process.env.DISABLE_AUTH === 'true') return true;
  const auth = req.headers.authorization ?? '';
  const secret = process.env.CRON_SECRET ?? '';
  if (secret && auth === `Bearer ${secret}`) return true;
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized' }));
  return false;
}

/**
 * POST /api/admin/setup-webhook
 * Auth: Bearer ${CRON_SECRET}
 *
 * Re-registers the Telegram webhook with the right allowed_updates so the
 * bot also receives my_chat_member events (auto-registration when added to
 * groups). Idempotent — safe to call multiple times.
 */
export async function handleSetupWebhook(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!checkAuth(req, res)) return;
  const publicUrl = process.env.PUBLIC_URL ?? '';
  if (!publicUrl) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'PUBLIC_URL not set' }));
    return;
  }
  try {
    const bot = getBot();
    await bot.init();
    await bot.api.setWebhook(`${publicUrl}/webhook/telegram`, {
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',
      allowed_updates: ['message', 'edited_message', 'callback_query', 'my_chat_member'],
    });
    const info = await bot.api.getWebhookInfo();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      url: info.url,
      pendingUpdates: info.pending_update_count,
      allowedUpdates: info.allowed_updates ?? ['<default>'],
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: msg }));
  }
}

/**
 * POST /api/admin/reset-test-data
 * Auth: Bearer ${CRON_SECRET}
 *
 * Wipes operational test data so we can re-test Telegram end-to-end with real
 * crew groups. Keeps everything else.
 *
 * KEEPS:
 *   - crews (profiles + skills + cautions)
 *   - jobs (real Monday.com data)
 *   - Admin's telegram link (8991021140 stays so the user does NOT have to
 *     re-link their own DM)
 *   - learned_phrases, sessions, login_nonces
 *
 * WIPES:
 *   - photos, flags, brief_jobs, briefs, schedule_proposals
 *   - telegram_group_id for any crew OTHER than admin (clears the fake ones
 *     left by the previous developer)
 */
export async function handleResetTestData(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!checkAuth(req, res)) return;
  const sql = getSql();
  const counts: Record<string, number> = {};

  for (const table of ['photos', 'flags', 'brief_jobs', 'briefs', 'schedule_proposals']) {
    const result = await sql.unsafe(`DELETE FROM ${table}`);
    counts[table] = (result as unknown as { count: number }).count ?? 0;
  }

  // Clear fake Telegram links — keep Admin's real DM
  const cleared = await sql<{ key: string }[]>`
    UPDATE crews
    SET telegram_group_id = NULL
    WHERE telegram_group_id IS NOT NULL
      AND key != 'admin'
    RETURNING key
  `;
  counts['crews_unlinked'] = cleared.length;

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    ok: true,
    wiped: counts,
    unlinkedCrews: cleared.map((c) => c.key),
  }));
}
