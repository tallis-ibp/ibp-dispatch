import { describe, it, expect, vi, beforeEach } from 'vitest';

const TEST_JWT_SECRET = 'test-secret-at-least-32-chars-long!!';

const mockSql = Object.assign(
  vi.fn().mockResolvedValue([]),
  { begin: vi.fn() }
);

vi.mock('../../src/db/client.js', () => ({
  getSql: () => mockSql,
}));

process.env.JWT_SECRET = TEST_JWT_SECRET;

import {
  signToken,
  verifyToken,
  extractTokenFromRequest,
  validateSession,
} from '../../src/middleware/auth.js';

describe('auth middleware', () => {
  beforeEach(() => {
    mockSql.mockClear();
    mockSql.mockResolvedValue([]);
    process.env.JWT_SECRET = TEST_JWT_SECRET;
  });

  describe('signToken / verifyToken', () => {
    it('round-trips a token with role and sessionToken', () => {
      const token = signToken({ role: 'scheduler', sessionToken: 'sess-abc' }, '1h');
      const payload = verifyToken(token);
      expect(payload?.role).toBe('scheduler');
      expect(payload?.sessionToken).toBe('sess-abc');
    });

    it('returns null for a tampered token', () => {
      const token = signToken({ role: 'scheduler', sessionToken: 'sess-abc' }, '1h');
      expect(verifyToken(token + 'x')).toBeNull();
    });

    it('returns null for an expired token', async () => {
      const token = signToken({ role: 'scheduler', sessionToken: 'sess-abc' }, '0s');
      await new Promise((r) => setTimeout(r, 10));
      expect(verifyToken(token)).toBeNull();
    });
  });

  describe('extractTokenFromRequest', () => {
    it('extracts token from ibp_token cookie', () => {
      expect(extractTokenFromRequest('ibp_token=mytoken', undefined)).toBe('mytoken');
    });

    it('extracts token from Authorization header', () => {
      expect(extractTokenFromRequest(undefined, 'Bearer mytoken')).toBe('mytoken');
    });

    it('prefers cookie over Authorization header', () => {
      expect(extractTokenFromRequest('ibp_token=from-cookie', 'Bearer from-header')).toBe('from-cookie');
    });

    it('returns null when neither present', () => {
      expect(extractTokenFromRequest(undefined, undefined)).toBeNull();
    });

    it('returns null when cookies is empty string', () => {
      expect(extractTokenFromRequest('', undefined)).toBeNull();
    });
  });

  describe('validateSession', () => {
    it('returns payload for a valid non-revoked session', async () => {
      const token = signToken({ role: 'scheduler', sessionToken: 'sess-valid' }, '1h');
      mockSql.mockResolvedValueOnce([{ revoked: 0, expires_at: null }]);
      mockSql.mockResolvedValueOnce([]);

      const result = await validateSession(token);
      expect(result?.role).toBe('scheduler');
      expect(result?.sessionToken).toBe('sess-valid');
    });

    it('returns null for a revoked session', async () => {
      const token = signToken({ role: 'scheduler', sessionToken: 'sess-revoked' }, '1h');
      mockSql.mockResolvedValueOnce([{ revoked: 1, expires_at: null }]);

      expect(await validateSession(token)).toBeNull();
    });

    it('returns null for an expired session (expires_at in past)', async () => {
      const token = signToken({ role: 'scheduler', sessionToken: 'sess-expired' }, '1h');
      mockSql.mockResolvedValueOnce([{ revoked: 0, expires_at: '2020-01-01T00:00:00Z' }]);

      expect(await validateSession(token)).toBeNull();
    });

    it('returns null when session token not found in DB', async () => {
      const token = signToken({ role: 'scheduler', sessionToken: 'sess-missing' }, '1h');
      mockSql.mockResolvedValueOnce([]);

      expect(await validateSession(token)).toBeNull();
    });

    it('returns null for an invalid JWT', async () => {
      expect(await validateSession('not.a.jwt')).toBeNull();
    });
  });
});
