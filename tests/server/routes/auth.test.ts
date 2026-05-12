import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateNonce, validateNonce } from '../../../src/server/routes/auth.js';

vi.mock('../../../src/db/client.js', () => ({
  getDb: () => ({
    prepare: vi.fn().mockReturnValue({
      run: vi.fn(),
      get: vi.fn(),
    }),
  }),
}));

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
