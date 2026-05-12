import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import type { Role } from '../types/index.js';
import { getDb } from '../db/client.js';

const JWT_SECRET = process.env.JWT_SECRET!;

export interface TokenPayload {
  role: Role;
  sessionToken: string;
  iat?: number;
  exp?: number;
}

export function signToken(payload: Omit<TokenPayload, 'iat' | 'exp'>, expiresIn?: string): string {
  const opts: SignOptions = expiresIn ? { expiresIn: expiresIn as SignOptions['expiresIn'] } : {};
  return jwt.sign(payload, JWT_SECRET, opts);
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export function extractTokenFromRequest(
  cookies: string | undefined,
  authHeader: string | undefined
): string | null {
  if (cookies) {
    const match = cookies.match(/(?:^|;\s*)ibp_token=([^;]+)/);
    if (match) return match[1];
  }
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
  return null;
}

export function validateSession(token: string): TokenPayload | null {
  const payload = verifyToken(token);
  if (!payload) return null;

  const db = getDb();
  const session = db
    .prepare('SELECT revoked, expires_at FROM sessions WHERE token = ?')
    .get(payload.sessionToken) as { revoked: number; expires_at: string | null } | undefined;

  if (!session || session.revoked) return null;
  if (session.expires_at && new Date(session.expires_at) < new Date()) return null;

  db.prepare('UPDATE sessions SET last_used_at = ? WHERE token = ?').run(
    new Date().toISOString(),
    payload.sessionToken
  );

  return payload;
}
