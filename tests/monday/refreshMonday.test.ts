import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync } from 'fs';
import { runMigrations } from '../../src/db/migrations.js';
import { getDb, closeDb } from '../../src/db/client.js';
import { upsertJobsToDb } from '../../src/monday/refreshMonday.js';
import type { Job } from '../../src/types/index.js';

const TEST_DB = 'data/test-monday.db';

const sampleJob: Job = {
  id: 'item-1',
  jobNumber: '600049',
  itemName: 'GILROY #600049',
  customerName: 'GILROY',
  address: '123 Main St',
  city: 'Orlando',
  clientType: 'builder',
  jobType: 'deck',
  status: 'NEED_TO_SCHEDULE',
  materialStatus: 'ready',
  materialReady: true,
  equipmentNeeded: [],
  trailerNeeded: ['flat'],
  driverNeeded: true,
  logisticsStatus: null,
  promisedDate: null,
  notes: null,
  syncedAt: '2026-05-12T06:00:00Z',
};

describe('upsertJobsToDb', () => {
  beforeEach(() => {
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    process.env.DB_PATH = TEST_DB;
    runMigrations();
  });

  afterEach(() => {
    closeDb();
    if (existsSync(TEST_DB)) unlinkSync(TEST_DB);
    delete process.env.DB_PATH;
  });

  it('inserts a job into the jobs table', () => {
    upsertJobsToDb([sampleJob]);
    const row = getDb().prepare('SELECT * FROM jobs WHERE id = ?').get('item-1') as Record<string, unknown>;
    expect(row).toBeTruthy();
    expect(row.job_number).toBe('600049');
    expect(row.material_ready).toBe(1);
    expect(row.driver_needed).toBe(1);
  });

  it('upserts (updates) an existing job', () => {
    upsertJobsToDb([sampleJob]);
    upsertJobsToDb([{ ...sampleJob, status: 'SCHEDULED_JOB' }]);
    const row = getDb().prepare('SELECT status FROM jobs WHERE id = ?').get('item-1') as { status: string };
    expect(row.status).toBe('SCHEDULED_JOB');
  });
});
