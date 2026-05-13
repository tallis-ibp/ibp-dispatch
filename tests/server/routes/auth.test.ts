import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSql = Object.assign(
  vi.fn().mockResolvedValue([]),
  { begin: vi.fn() }
);

vi.mock('../../../src/db/client.js', () => ({
  getSql: () => mockSql,
}));

beforeEach(() => {
  mockSql.mockClear();
  mockSql.mockResolvedValue([]);
});

import { generateNonce, validateNonce } from '../../../src/server/routes/auth.js';

describe('generateNonce', () => {
  it('returns a non-empty string', () => {
    const nonce = generateNonce();
    expect(typeof nonce).toBe('string');
    expect(nonce.length).toBeGreaterThan(8);
  });

  it('returns unique values', () => {
    expect(generateNonce()).not.toBe(generateNonce());
  });
});

describe('validateNonce', () => {
  it('returns true when UPDATE affects 1 row (valid nonce)', async () => {
    mockSql.mockResolvedValueOnce({ count: 1 });
    expect(await validateNonce('abc123')).toBe(true);
  });

  it('returns false when UPDATE affects 0 rows (invalid/used/expired nonce)', async () => {
    mockSql.mockResolvedValueOnce({ count: 0 });
    expect(await validateNonce('expired-nonce')).toBe(false);
  });
});
