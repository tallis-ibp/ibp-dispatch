import { randomBytes } from 'crypto';
import { getSql } from '../../db/client.js';
import { signToken } from '../../middleware/auth.js';
import { getBot } from '../../telegram/grammy.js';
import type { IncomingMessage, ServerResponse } from 'http';

export function generateNonce(): string {
  return randomBytes(24).toString('hex');
}

export async function storeNonce(nonce: string): Promise<void> {
  const sql = getSql();
  await sql`INSERT INTO login_nonces (nonce, created_at, used) VALUES (${nonce}, ${new Date().toISOString()}, 0)`;
}

export async function validateNonce(nonce: string): Promise<boolean> {
  const sql = getSql();
  const result = await sql`
    UPDATE login_nonces SET used = 1
    WHERE nonce = ${nonce} AND used = 0
      AND created_at > NOW() - INTERVAL '10 minutes'
  `;
  return result.count === 1;
}

export async function handleInitLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const nonce = generateNonce();
  await storeNonce(nonce);

  const botUsername = (await getBot().api.getMe()).username;
  const telegramUrl = `https://t.me/${botUsername}?start=login_${nonce}`;

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ telegramUrl }));
}

export async function handleNonceExchange(req: IncomingMessage, res: ServerResponse, nonce: string): Promise<void> {
  if (!(await validateNonce(nonce))) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid or expired login link' }));
    return;
  }

  const sql = getSql();
  const sessionToken = randomBytes(32).toString('hex');
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await sql`
    INSERT INTO sessions (token, role, label, created_at, expires_at, revoked)
    VALUES (${sessionToken}, 'scheduler', 'Scheduler', ${now}, ${expiresAt}, 0)
  `;

  const jwt = signToken({ role: 'scheduler', sessionToken }, '24h');
  const isProduction = process.env.NODE_ENV === 'production';

  res.writeHead(302, {
    'Set-Cookie': `ibp_token=${jwt}; HttpOnly; Path=/; SameSite=Strict${isProduction ? '; Secure' : ''}; Max-Age=86400`,
    Location: '/',
  });
  res.end();
}

export async function handleGetShareLinks(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const sql = getSql();
  const links = await sql`SELECT token, label, created_at, expires_at, revoked FROM sessions WHERE role = 'viewer'`;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(links));
}

export async function handleCreateShareLink(
  req: IncomingMessage,
  res: ServerResponse,
  body: { label: string; expiresInDays: number | null }
): Promise<void> {
  const sql = getSql();
  const sessionToken = randomBytes(32).toString('hex');
  const now = new Date().toISOString();
  const expiresAt = body.expiresInDays
    ? new Date(Date.now() + body.expiresInDays * 86400 * 1000).toISOString()
    : null;

  await sql`
    INSERT INTO sessions (token, role, label, created_at, expires_at, revoked)
    VALUES (${sessionToken}, 'viewer', ${body.label}, ${now}, ${expiresAt}, 0)
  `;

  const jwt = signToken({ role: 'viewer', sessionToken }, body.expiresInDays ? `${body.expiresInDays}d` : undefined);
  const publicUrl = process.env.PUBLIC_URL;
  if (!publicUrl) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'PUBLIC_URL not configured' }));
    return;
  }
  const shareUrl = `${publicUrl}?token=${jwt}`;

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ url: shareUrl, expiresAt }));
}

export async function handleRevokeShareLink(
  req: IncomingMessage,
  res: ServerResponse,
  sessionToken: string
): Promise<void> {
  const sql = getSql();
  await sql`UPDATE sessions SET revoked = 1 WHERE token = ${sessionToken} AND role = 'viewer'`;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true }));
}
