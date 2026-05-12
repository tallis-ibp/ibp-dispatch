import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { existsSync, unlinkSync } from 'fs';

// Set JWT_SECRET BEFORE importing auth module
process.env.JWT_SECRET = 'test-secret-32-chars-long-xxxxxxxxxxx';

import {
  signToken,
  verifyToken,
  extractTokenFromRequest,
  validateSession,
  type TokenPayload,
} from '../../src/middleware/auth.js';
import { getDb, closeDb } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrations.js';

const TEST_DB = 'data/test-auth.db';

describe('auth middleware', () => {
  beforeAll(() => {
    // Set DB_PATH for tests
    process.env.DB_PATH = TEST_DB;

    // Clean up any existing test DB
    if (existsSync(TEST_DB)) {
      unlinkSync(TEST_DB);
    }

    // Initialize database with schema
    runMigrations();
  });

  afterAll(() => {
    closeDb();
    if (existsSync(TEST_DB)) {
      unlinkSync(TEST_DB);
    }
    delete process.env.DB_PATH;
  });

  describe('signToken + verifyToken round-trip', () => {
    it('signs and verifies a token with correct payload', () => {
      const payload: Omit<TokenPayload, 'iat' | 'exp'> = {
        role: 'scheduler',
        sessionToken: 'session-123',
      };

      const token = signToken(payload);
      const verified = verifyToken(token);

      expect(verified).not.toBeNull();
      expect(verified).toEqual(
        expect.objectContaining({
          role: 'scheduler',
          sessionToken: 'session-123',
        })
      );
      expect(verified?.iat).toBeDefined();
      expect(verified?.exp).not.toBeDefined();
    });

    it('includes expiresIn in token when specified', () => {
      const payload: Omit<TokenPayload, 'iat' | 'exp'> = {
        role: 'viewer',
        sessionToken: 'session-456',
      };

      const token = signToken(payload, '1h');
      const verified = verifyToken(token);

      expect(verified).not.toBeNull();
      expect(verified?.exp).toBeDefined();
      expect(verified?.role).toBe('viewer');
    });
  });

  describe('verifyToken invalid/tampered token', () => {
    it('returns null for invalid token', () => {
      const result = verifyToken('invalid.token.here');
      expect(result).toBeNull();
    });

    it('returns null for empty string', () => {
      const result = verifyToken('');
      expect(result).toBeNull();
    });

    it('returns null for tampered token', () => {
      const payload: Omit<TokenPayload, 'iat' | 'exp'> = {
        role: 'scheduler',
        sessionToken: 'session-789',
      };
      const token = signToken(payload);

      // Tamper with the token by changing the last character
      const tamperedToken = token.slice(0, -1) + (token[token.length - 1] === 'A' ? 'B' : 'A');
      const result = verifyToken(tamperedToken);

      expect(result).toBeNull();
    });
  });

  describe('extractTokenFromRequest from cookie', () => {
    it('extracts token from ibp_token cookie', () => {
      const cookies = 'session=abc123; ibp_token=my-jwt-token; other=xyz';
      const result = extractTokenFromRequest(cookies, undefined);

      expect(result).toBe('my-jwt-token');
    });

    it('extracts token from ibp_token cookie with spacing', () => {
      const cookies = 'session=abc123; ibp_token=token-value; path=/';
      const result = extractTokenFromRequest(cookies, undefined);

      expect(result).toBe('token-value');
    });

    it('extracts token from ibp_token cookie at the start', () => {
      const cookies = 'ibp_token=first-token; other=value';
      const result = extractTokenFromRequest(cookies, undefined);

      expect(result).toBe('first-token');
    });
  });

  describe('extractTokenFromRequest from Bearer header', () => {
    it('extracts token from Bearer authorization header', () => {
      const authHeader = 'Bearer eyJhbGciOiJIUzI1NiIs...';
      const result = extractTokenFromRequest(undefined, authHeader);

      expect(result).toBe('eyJhbGciOiJIUzI1NiIs...');
    });

    it('extracts token from Bearer header with multiple words', () => {
      const authHeader = 'Bearer some-long-jwt-token-with-many-parts';
      const result = extractTokenFromRequest(undefined, authHeader);

      expect(result).toBe('some-long-jwt-token-with-many-parts');
    });

    it('returns null for non-Bearer authorization header', () => {
      const authHeader = 'Basic dXNlcm5hbWU6cGFzc3dvcmQ=';
      const result = extractTokenFromRequest(undefined, authHeader);

      expect(result).toBeNull();
    });
  });

  describe('extractTokenFromRequest priority', () => {
    it('prefers cookie over Bearer header', () => {
      const cookies = 'ibp_token=cookie-token; other=value';
      const authHeader = 'Bearer header-token';
      const result = extractTokenFromRequest(cookies, authHeader);

      expect(result).toBe('cookie-token');
    });

    it('returns null when neither cookie nor header present', () => {
      const result = extractTokenFromRequest(undefined, undefined);
      expect(result).toBeNull();
    });

    it('returns null when cookies is empty string', () => {
      const result = extractTokenFromRequest('', undefined);
      expect(result).toBeNull();
    });

    it('returns null when authHeader is empty string', () => {
      const result = extractTokenFromRequest(undefined, '');
      expect(result).toBeNull();
    });
  });

  describe('validateSession valid session', () => {
    it('returns payload for a valid, non-revoked session', () => {
      const payload: Omit<TokenPayload, 'iat' | 'exp'> = {
        role: 'scheduler',
        sessionToken: 'valid-session-token',
      };

      const token = signToken(payload);

      // Insert a valid session into the DB
      const db = getDb();
      db.prepare(
        `INSERT INTO sessions (token, role, label, created_at, expires_at, last_used_at, revoked)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run('valid-session-token', 'scheduler', 'Test Session', new Date().toISOString(), null, null, 0);

      const result = validateSession(token);

      expect(result).not.toBeNull();
      expect(result?.role).toBe('scheduler');
      expect(result?.sessionToken).toBe('valid-session-token');
    });

    it('updates last_used_at on successful validation', () => {
      const payload: Omit<TokenPayload, 'iat' | 'exp'> = {
        role: 'viewer',
        sessionToken: 'session-with-timestamp',
      };

      const token = signToken(payload);
      const db = getDb();

      // Insert session with a past timestamp
      const pastTime = new Date(Date.now() - 60000).toISOString();
      db.prepare(
        `INSERT INTO sessions (token, role, label, created_at, expires_at, last_used_at, revoked)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run('session-with-timestamp', 'viewer', 'Timestamp Test', new Date().toISOString(), null, pastTime, 0);

      validateSession(token);

      // Check that last_used_at was updated
      const session = db
        .prepare('SELECT last_used_at FROM sessions WHERE token = ?')
        .get('session-with-timestamp') as { last_used_at: string };

      expect(new Date(session.last_used_at).getTime()).toBeGreaterThan(
        new Date(pastTime).getTime()
      );
    });
  });

  describe('validateSession revoked session', () => {
    it('returns null for a revoked session', () => {
      const payload: Omit<TokenPayload, 'iat' | 'exp'> = {
        role: 'scheduler',
        sessionToken: 'revoked-session-token',
      };

      const token = signToken(payload);
      const db = getDb();

      // Insert a revoked session into the DB
      db.prepare(
        `INSERT INTO sessions (token, role, label, created_at, expires_at, last_used_at, revoked)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run('revoked-session-token', 'scheduler', 'Revoked Test', new Date().toISOString(), null, null, 1);

      const result = validateSession(token);

      expect(result).toBeNull();
    });
  });

  describe('validateSession expired session', () => {
    it('returns null for an expired session', () => {
      const payload: Omit<TokenPayload, 'iat' | 'exp'> = {
        role: 'viewer',
        sessionToken: 'expired-session-token',
      };

      const token = signToken(payload);
      const db = getDb();

      // Insert an expired session into the DB
      const pastTime = new Date(Date.now() - 60000).toISOString();
      db.prepare(
        `INSERT INTO sessions (token, role, label, created_at, expires_at, last_used_at, revoked)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run('expired-session-token', 'viewer', 'Expired Test', new Date().toISOString(), pastTime, null, 0);

      const result = validateSession(token);

      expect(result).toBeNull();
    });
  });

  describe('validateSession invalid token', () => {
    it('returns null when JWT verification fails', () => {
      const result = validateSession('not.a.valid.jwt');
      expect(result).toBeNull();
    });

    it('returns null when session token not found in DB', () => {
      const payload: Omit<TokenPayload, 'iat' | 'exp'> = {
        role: 'scheduler',
        sessionToken: 'nonexistent-session',
      };

      const token = signToken(payload);
      const result = validateSession(token);

      expect(result).toBeNull();
    });
  });
});
