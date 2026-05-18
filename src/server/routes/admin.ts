import type { IncomingMessage, ServerResponse } from 'http';
import { getSql } from '../../db/client.js';

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
  const auth = req.headers.authorization ?? '';
  const secret = process.env.CRON_SECRET ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return;
  }
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
