import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';
import type { Role } from '../types/index.js';
import { getSql } from '../db/client.js';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return secret;
}

export interface TokenPayload {
  role: Role;
  sessionToken: string;
  iat?: number;
  exp?: number;
}

export function signToken(payload: Omit<TokenPayload, 'iat' | 'exp'>, expiresIn?: string): string {
  const opts: SignOptions = expiresIn ? { expiresIn: expiresIn as SignOptions['expiresIn'] } : {};
  return jwt.sign(payload, getJwtSecret(), opts);
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as TokenPayload;
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

export async function validateSession(token: string): Promise<TokenPayload | null> {
  const payload = verifyToken(token);
  if (!payload) return null;

  const sql = getSql();
  const [session] = await sql<{ revoked: number; expires_at: string | null }[]>`
    SELECT revoked, expires_at FROM sessions WHERE token = ${payload.sessionToken}
  `;

  if (!session || session.revoked) return null;
  if (session.expires_at && new Date(session.expires_at) < new Date()) return null;

  await sql`UPDATE sessions SET last_used_at = ${new Date().toISOString()} WHERE token = ${payload.sessionToken}`;

  return payload;
}
