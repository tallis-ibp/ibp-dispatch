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
import { handleGetBrief, handleGenerateBrief, handleApproveBrief } from './routes/briefs.js';
import { handleGetProposals, handleGenerateProposals, handleUpdateProposal } from './routes/proposals.js';
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
