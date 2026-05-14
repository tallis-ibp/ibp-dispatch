import type { IncomingMessage, ServerResponse } from 'http';
import { getSql } from '../../db/client.js';
import { getBot } from '../../telegram/grammy.js';

interface IntegrationStatus {
  ok: boolean;
  detail: Record<string, unknown>;
}

interface HealthSnapshot {
  fetchedAt: string;
  telegram: IntegrationStatus;
  monday: IntegrationStatus;
  anthropic: IntegrationStatus;
  supabase: IntegrationStatus;
}

let cache: { value: HealthSnapshot; expiresAt: number } | null = null;
const CACHE_MS = 60_000;

async function checkTelegram(): Promise<IntegrationStatus> {
  try {
    const bot = getBot();
    await bot.init();
    const info = await bot.api.getWebhookInfo();
    const lastUpdateAge = info.last_synchronization_error_date
      ? Math.max(0, Date.now() / 1000 - info.last_synchronization_error_date)
      : null;
    return {
      ok: !!info.url,
      detail: {
        webhookUrl: info.url
          ? info.url.replace(/^(https?:\/\/[^/]+).*/, '$1/…')
          : null,
        pendingUpdateCount: info.pending_update_count ?? 0,
        lastUpdateAgeSeconds: lastUpdateAge,
      },
    };
  } catch (err) {
    return { ok: false, detail: { error: (err as Error).message } };
  }
}

async function checkSupabase(): Promise<IntegrationStatus> {
  const sql = getSql();
  const start = Date.now();
  try {
    const counts = await sql<Array<{ table: string; n: string }>>`
      SELECT 'crews' AS "table", COUNT(*)::text AS n FROM crews
      UNION ALL SELECT 'jobs',           COUNT(*)::text FROM jobs
      UNION ALL SELECT 'brief_jobs',     COUNT(*)::text FROM brief_jobs
      UNION ALL SELECT 'photos',         COUNT(*)::text FROM photos
      UNION ALL SELECT 'flags',          COUNT(*)::text FROM flags
      UNION ALL SELECT 'learned_phrases',COUNT(*)::text FROM learned_phrases
    `;
    const rowCounts: Record<string, number> = {};
    for (const c of counts) rowCounts[c.table] = parseInt(c.n, 10);
    return {
      ok: true,
      detail: {
        connected: true,
        latencyMs: Date.now() - start,
        rowCounts,
      },
    };
  } catch (err) {
    return { ok: false, detail: { connected: false, error: (err as Error).message } };
  }
}

function checkMonday(): IntegrationStatus {
  const keyConfigured = !!process.env.MONDAY_API_KEY;
  return {
    ok: keyConfigured,
    detail: {
      keyConfigured,
      keyHint: keyConfigured ? '••• set' : 'not set',
    },
  };
}

function checkAnthropic(): IntegrationStatus {
  const keyConfigured = !!process.env.ANTHROPIC_API_KEY;
  return {
    ok: keyConfigured,
    detail: {
      keyConfigured,
      keyHint: keyConfigured ? '••• set' : 'not set',
    },
  };
}

export async function handleGetIntegrationsHealth(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (cache && cache.expiresAt > Date.now()) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(cache.value));
    return;
  }
  const [telegram, supabase] = await Promise.all([checkTelegram(), checkSupabase()]);
  const snapshot: HealthSnapshot = {
    fetchedAt: new Date().toISOString(),
    telegram,
    monday: checkMonday(),
    anthropic: checkAnthropic(),
    supabase,
  };
  cache = { value: snapshot, expiresAt: Date.now() + CACHE_MS };
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(snapshot));
}
