import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import { runMigrations } from '../../src/db/migrations.js';
import { getDb, closeDb } from '../../src/db/client.js';

const TEST_DB = 'data/test.db';

describe('migrations', () => {
  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    process.env.DB_PATH = TEST_DB;
  });

  afterEach(() => {
    closeDb();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    delete process.env.DB_PATH;
  });

  it('creates all required tables', () => {
    runMigrations();
    const db = getDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    expect(names).toContain('jobs');
    expect(names).toContain('briefs');
    expect(names).toContain('brief_jobs');
    expect(names).toContain('crews');
    expect(names).toContain('photos');
    expect(names).toContain('flags');
    expect(names).toContain('logistics_runs');
    expect(names).toContain('schedule_proposals');
    expect(names).toContain('learned_phrases');
    expect(names).toContain('sessions');
    expect(names).toContain('login_nonces');
  });

  it('is idempotent — running twice does not throw', () => {
    expect(() => {
      runMigrations();
      runMigrations();
    }).not.toThrow();
  });
});
