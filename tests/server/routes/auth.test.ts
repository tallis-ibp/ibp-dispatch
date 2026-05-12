import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateNonce, validateNonce } from '../../../src/server/routes/auth.js';

const mockRun = vi.fn().mockReturnValue({ changes: 1 });
const mockGet = vi.fn();

vi.mock('../../../src/db/client.js', () => ({
  getDb: () => ({
    prepare: vi.fn().mockReturnValue({
      run: mockRun,
      get: mockGet,
    }),
  }),
}));

beforeEach(() => {
  mockRun.mockReset();
  mockGet.mockReset();
});

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
  it('returns true when UPDATE affects 1 row (valid nonce)', () => {
    mockRun.mockReturnValue({ changes: 1 });
    expect(validateNonce('abc123')).toBe(true);
  });

  it('returns false when UPDATE affects 0 rows (invalid/used/expired nonce)', () => {
    mockRun.mockReturnValue({ changes: 0 });
    expect(validateNonce('expired-nonce')).toBe(false);
  });
});
