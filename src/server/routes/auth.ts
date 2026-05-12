import { randomBytes } from 'crypto';
import { getDb } from '../../db/client.js';
import { signToken } from '../../middleware/auth.js';
import { getBot } from '../../telegram/grammy.js';
import type { IncomingMessage, ServerResponse } from 'http';

export function generateNonce(): string {
  return randomBytes(24).toString('hex');
}

export function storeNonce(nonce: string): void {
  const db = getDb();
  db.prepare('INSERT INTO login_nonces (nonce, created_at, used) VALUES (?, ?, 0)').run(
    nonce,
    new Date().toISOString()
  );
}

export function validateNonce(nonce: string): boolean {
  const db = getDb();
  const row = db.prepare(`
    SELECT nonce FROM login_nonces
    WHERE nonce = ? AND used = 0
      AND datetime(created_at) > datetime('now', '-10 minutes')
  `).get(nonce) as { nonce: string } | undefined;

  if (!row) return false;
  db.prepare('UPDATE login_nonces SET used = 1 WHERE nonce = ?').run(nonce);
  return true;
}

export async function handleInitLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const nonce = generateNonce();
  storeNonce(nonce);

  const botUsername = (await getBot().api.getMe()).username;
  const telegramUrl = `https://t.me/${botUsername}?start=login_${nonce}`;

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ telegramUrl }));
}

export function handleNonceExchange(req: IncomingMessage, res: ServerResponse, nonce: string): void {
  if (!validateNonce(nonce)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid or expired login link' }));
    return;
  }

  const db = getDb();
  const sessionToken = randomBytes(32).toString('hex');
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO sessions (token, role, label, created_at, expires_at, revoked)
    VALUES (?, 'scheduler', 'Scheduler', ?, ?, 0)
  `).run(sessionToken, now, expiresAt);

  const jwt = signToken({ role: 'scheduler', sessionToken }, '24h');
  const isProduction = process.env.NODE_ENV === 'production';

  res.writeHead(302, {
    'Set-Cookie': `ibp_token=${jwt}; HttpOnly; Path=/; SameSite=Strict${isProduction ? '; Secure' : ''}; Max-Age=86400`,
    Location: '/',
  });
  res.end();
}

export function handleGetShareLinks(req: IncomingMessage, res: ServerResponse): void {
  const db = getDb();
  const links = db
    .prepare("SELECT token, label, created_at, expires_at, revoked FROM sessions WHERE role = 'viewer'")
    .all();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(links));
}

export function handleCreateShareLink(
  req: IncomingMessage,
  res: ServerResponse,
  body: { label: string; expiresInDays: number | null }
): void {
  const db = getDb();
  const sessionToken = randomBytes(32).toString('hex');
  const now = new Date().toISOString();
  const expiresAt = body.expiresInDays
    ? new Date(Date.now() + body.expiresInDays * 86400 * 1000).toISOString()
    : null;

  db.prepare(`
    INSERT INTO sessions (token, role, label, created_at, expires_at, revoked)
    VALUES (?, 'viewer', ?, ?, ?, 0)
  `).run(sessionToken, body.label, now, expiresAt);

  const jwt = signToken({ role: 'viewer', sessionToken }, body.expiresInDays ? `${body.expiresInDays}d` : undefined);
  const publicUrl = process.env.PUBLIC_URL;
  const shareUrl = `${publicUrl}?token=${jwt}`;

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ url: shareUrl, expiresAt }));
}

export function handleRevokeShareLink(
  req: IncomingMessage,
  res: ServerResponse,
  sessionToken: string
): void {
  const db = getDb();
  db.prepare("UPDATE sessions SET revoked = 1 WHERE token = ? AND role = 'viewer'").run(sessionToken);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}
