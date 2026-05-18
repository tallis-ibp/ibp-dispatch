import type { IncomingMessage, ServerResponse } from 'http';
import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { getBot } from '../telegram/grammy.js';
import {
  handleInitLogin,
  handleNonceExchange,
  handleGetShareLinks,
  handleCreateShareLink,
  handleRevokeShareLink,
} from './routes/auth.js';
import { handleGetBrief, handleGenerateBrief, handleApproveBrief, handleSendBriefToCrew } from './routes/briefs.js';
import { handleGetProposals, handleGenerateProposals, handleUpdateProposal } from './routes/proposals.js';
import { handleGetFlags, handleGetFlagDetail, handleResolveFlag, handleTeachPhrase } from './routes/flags.js';
import { handleGetPhotos, handleGetPhotoImage } from './routes/photos.js';
import {
  handleGetCrews, handleCreateCrew, handleUpdateCrew, handleTestCrewMessage,
  handleGetCrewDetail, handleGetRecentChats, handleDeleteCrew,
} from './routes/crews.js';
import { handleGetJob, handleGetMaterialStatus, handleSetMaterialStatus } from './routes/jobs.js';
import {
  handleGetLearnedPhrases, handleCreateLearnedPhrase, handleDeleteLearnedPhrase,
} from './routes/learnedPhrases.js';
import { handleGetIntegrationsHealth } from './routes/health.js';
import { handleResetTestData } from './routes/admin.js';
import { refreshMonday } from '../monday/refreshMonday.js';
import { validateSession, extractTokenFromRequest } from '../middleware/auth.js';
import { generalLimiter, loginLimiter } from '../middleware/rateLimit.js';

const DASHBOARD_DIR = resolve('public');
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET ?? '';

function getIp(req: IncomingMessage): string {
  return String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'unknown');
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
  });
}

function serveFile(res: ServerResponse, filePath: string): void {
  if (!existsSync(filePath)) { res.writeHead(404); res.end(); return; }
  const ext = filePath.split('.').pop();
  const mime: Record<string, string> = {
    html: 'text/html', css: 'text/css', js: 'application/javascript', json: 'application/json',
  };
  res.writeHead(200, { 'Content-Type': mime[ext ?? 'html'] ?? 'text/plain' });
  res.end(readFileSync(filePath));
}

async function requireAuth(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  if (process.env.DISABLE_AUTH === 'true') return true;
  const token = extractTokenFromRequest(req.headers.cookie, req.headers.authorization);
  if (!token) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return false;
  }
  const payload = await validateSession(token);
  if (!payload) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid or expired session' }));
    return false;
  }
  return true;
}

export async function requestHandler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const PORT = process.env.PORT ?? '3002';
  try {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    const path = url.pathname;
    const ip = getIp(req);

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');

    // Rate limiting
    if (path === '/api/auth/init' || path === '/api/auth/exchange') {
      if (!loginLimiter(ip)) { res.writeHead(429); res.end(JSON.stringify({ error: 'Too many requests' })); return; }
    } else if (!generalLimiter(ip)) {
      res.writeHead(429); res.end(JSON.stringify({ error: 'Too many requests' })); return;
    }

    // Telegram webhook
    if (path === '/webhook/telegram' && req.method === 'POST') {
      const secret = req.headers['x-telegram-bot-api-secret-token'];
      if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) { res.writeHead(403); res.end(); return; }
      const body = await readBody(req);
      try {
        const bot = getBot();
        await bot.init(); // Grammy requires botInfo before handleUpdate
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await bot.handleUpdate(body as any);
      } catch (err) {
        console.error('[webhook] handleUpdate error:', err);
      }
      res.writeHead(200); res.end();
      return;
    }

    // Admin reset (one-shot wipe of test data). Auth: Bearer ${CRON_SECRET}.
    if (path === '/api/admin/reset-test-data' && req.method === 'POST') {
      await handleResetTestData(req, res); return;
    }

    // Debug endpoint — check bot token works
    if (path === '/api/debug' && req.method === 'GET') {
      try {
        const me = await getBot().api.getMe();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, bot: me.username, id: me.id }));
      } catch (err) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(err) }));
      }
      return;
    }

    // Auth routes (no JWT required)
    if (path === '/api/auth/init' && req.method === 'POST') { await handleInitLogin(req, res); return; }
    if (path === '/api/auth/exchange' && req.method === 'GET') {
      await handleNonceExchange(req, res, url.searchParams.get('nonce') ?? ''); return;
    }

    // Protected API routes
    if (path.startsWith('/api/')) {
      if (!(await requireAuth(req, res))) return;

      if (path === '/api/sync' && req.method === 'POST') {
        await refreshMonday();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      if (path === '/api/crews' && req.method === 'GET') { await handleGetCrews(req, res); return; }
      if (path === '/api/crews' && req.method === 'POST') {
        const body = await readBody(req) as { key: string; displayName: string; telegramGroupId?: string; language?: string };
        await handleCreateCrew(req, res, body); return;
      }
      if (path === '/api/chats/recent' && req.method === 'GET') {
        await handleGetRecentChats(req, res); return;
      }
      if (path.startsWith('/api/crews/') && path.endsWith('/test') && req.method === 'POST') {
        const key = path.slice('/api/crews/'.length).replace('/test', '');
        await handleTestCrewMessage(req, res, key); return;
      }
      if (path.startsWith('/api/crews/') && req.method === 'GET') {
        const key = path.slice('/api/crews/'.length);
        await handleGetCrewDetail(req, res, key); return;
      }
      if (path.startsWith('/api/crews/') && req.method === 'PATCH') {
        const key = path.slice('/api/crews/'.length);
        const body = await readBody(req) as Parameters<typeof handleUpdateCrew>[3];
        await handleUpdateCrew(req, res, key, body); return;
      }
      if (path.startsWith('/api/crews/') && req.method === 'DELETE') {
        const key = path.slice('/api/crews/'.length);
        await handleDeleteCrew(req, res, key); return;
      }

      // Jobs
      if (path.startsWith('/api/jobs/') && path.endsWith('/material-status') && req.method === 'GET') {
        const jobNumber = path.slice('/api/jobs/'.length).replace('/material-status', '');
        await handleGetMaterialStatus(req, res, jobNumber); return;
      }
      if (path.startsWith('/api/jobs/') && path.endsWith('/material-status') && req.method === 'POST') {
        const jobNumber = path.slice('/api/jobs/'.length).replace('/material-status', '');
        const body = await readBody(req) as { confirmed?: boolean };
        await handleSetMaterialStatus(req, res, jobNumber, body); return;
      }
      if (path.startsWith('/api/jobs/') && req.method === 'GET') {
        const jobNumber = path.slice('/api/jobs/'.length);
        await handleGetJob(req, res, jobNumber); return;
      }

      // Learned phrases
      if (path === '/api/learned-phrases' && req.method === 'GET') {
        await handleGetLearnedPhrases(req, res); return;
      }
      if (path === '/api/learned-phrases' && req.method === 'POST') {
        const body = await readBody(req) as { phrase?: string; intent?: string };
        await handleCreateLearnedPhrase(req, res, body); return;
      }
      if (path.startsWith('/api/learned-phrases/') && req.method === 'DELETE') {
        await handleDeleteLearnedPhrase(req, res, path.slice('/api/learned-phrases/'.length)); return;
      }

      // Health
      if (path === '/api/health/integrations' && req.method === 'GET') {
        await handleGetIntegrationsHealth(req, res); return;
      }

      if (path === '/api/share' && req.method === 'GET') { await handleGetShareLinks(req, res); return; }
      if (path === '/api/share' && req.method === 'POST') {
        const body = await readBody(req) as { label: string; expiresInDays: number | null };
        await handleCreateShareLink(req, res, body); return;
      }
      if (path.startsWith('/api/share/') && req.method === 'DELETE') {
        await handleRevokeShareLink(req, res, path.slice('/api/share/'.length)); return;
      }
      if (path.startsWith('/api/briefs/') && !path.endsWith('/approve') && req.method === 'GET') {
        await handleGetBrief(req, res, path.slice('/api/briefs/'.length)); return;
      }
      if (path.startsWith('/api/briefs/') && path.endsWith('/approve') && req.method === 'POST') {
        const date = path.slice('/api/briefs/'.length).replace('/approve', '');
        await handleApproveBrief(req, res, date); return;
      }
      // /api/briefs/:date/crew/:crewKey — POST sends to single crew
      {
        const m = path.match(/^\/api\/briefs\/(\d{4}-\d{2}-\d{2})\/crew\/([^/]+)$/);
        if (m && req.method === 'POST') {
          await handleSendBriefToCrew(req, res, m[1], m[2]); return;
        }
      }
      if (path === '/api/generate' && req.method === 'POST') {
        const body = await readBody(req) as { date: string };
        await handleGenerateBrief(req, res, body.date); return;
      }
      if (path === '/api/proposals' && req.method === 'GET') {
        await handleGetProposals(req, res, url.searchParams.get('date') ?? ''); return;
      }
      if (path === '/api/proposals' && req.method === 'POST') {
        const body = await readBody(req) as { date: string };
        await handleGenerateProposals(req, res, body.date); return;
      }
      if (path.startsWith('/api/proposals/') && req.method === 'PATCH') {
        const id = path.slice('/api/proposals/'.length);
        const body = await readBody(req) as { status: unknown };
        await handleUpdateProposal(req, res, id, body.status); return;
      }

      // Flags
      if (path === '/api/flags/teach' && req.method === 'POST') {
        const body = await readBody(req) as { phrase: string; intent: string };
        await handleTeachPhrase(req, res, body); return;
      }
      if (path === '/api/flags' && req.method === 'GET') {
        const date = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
        await handleGetFlags(req, res, date); return;
      }
      if (path.startsWith('/api/flags/') && path.endsWith('/resolve') && req.method === 'POST') {
        const id = path.slice('/api/flags/'.length).replace('/resolve', '');
        const body = await readBody(req) as { note?: string };
        await handleResolveFlag(req, res, id, body); return;
      }
      if (path.startsWith('/api/flags/') && req.method === 'GET') {
        await handleGetFlagDetail(req, res, path.slice('/api/flags/'.length)); return;
      }

      // Photos
      if (path === '/api/photos' && req.method === 'GET') {
        const date = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
        const filters = {
          crewKey: url.searchParams.get('crewKey') ?? undefined,
          status:  url.searchParams.get('status')  ?? undefined,
          limit:   url.searchParams.get('limit')   ? parseInt(url.searchParams.get('limit')!, 10) : undefined,
          offset:  url.searchParams.get('offset')  ? parseInt(url.searchParams.get('offset')!, 10) : undefined,
        };
        await handleGetPhotos(req, res, date, filters); return;
      }
      if (path.startsWith('/api/photos/') && path.endsWith('/image') && req.method === 'GET') {
        const id = path.slice('/api/photos/'.length).replace('/image', '');
        await handleGetPhotoImage(req, res, id); return;
      }

      res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' })); return;
    }

    // Static dashboard files
    if (path === '/' || path === '/index.html') { serveFile(res, join(DASHBOARD_DIR, 'index.html')); return; }
    const staticPath = join(DASHBOARD_DIR, path.slice(1));
    if (!staticPath.startsWith(DASHBOARD_DIR)) { res.writeHead(400); res.end(); return; }
    serveFile(res, staticPath);
  } catch (err) {
    console.error('[server] Unhandled request error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }
}
