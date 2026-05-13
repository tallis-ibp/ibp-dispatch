import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockUnsafe = vi.fn().mockResolvedValue([]);
vi.mock('../../src/db/client.js', () => ({
  getSql: () => ({ unsafe: mockUnsafe }),
}));

import { runMigrations } from '../../src/db/migrations.js';

describe('runMigrations', () => {
  beforeEach(() => mockUnsafe.mockClear());

  it('executes one statement per table (11 tables)', async () => {
    await runMigrations();
    expect(mockUnsafe.mock.calls.length).toBeGreaterThanOrEqual(11);
  });

  it('is idempotent — calling twice does not throw', async () => {
    await runMigrations();
    await expect(runMigrations()).resolves.toBeUndefined();
  });
});
